// Local SQLite for the notifier. The file is created on startup.
// NOTIFIER_DB is a full path. NOTIFIER_DATA_DIR is a folder.
// On Railway, a volume's mount path is used when those are unset.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { normalizeRequiredNfts } from '../services/topicFilter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = process.env.NOTIFIER_DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(root, 'data');
export const dbPath = process.env.NOTIFIER_DB || path.join(dataDir, 'notifier.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    wallet_address TEXT UNIQUE NOT NULL,
    device_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topic_subscriptions (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    device_token TEXT,
    show_full_message INTEGER NOT NULL DEFAULT 1,
    filter_mode TEXT NOT NULL DEFAULT 'all',
    allowed_senders TEXT NOT NULL DEFAULT '[]',
    blocked_senders TEXT NOT NULL DEFAULT '[]',
    required_nfts TEXT NOT NULL DEFAULT '[]',
    via_account TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(wallet_address, topic_id)
  );

  CREATE TABLE IF NOT EXISTS user_messages (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    payer TEXT,
    sender TEXT,
    body TEXT NOT NULL,
    sequence_number INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS user_messages_wallet_created
    ON user_messages(wallet_address, created_at);

  CREATE TABLE IF NOT EXISTS topic_state (
    topic_id TEXT PRIMARY KEY,
    last_sequence_number INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    account_id TEXT PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    profile_pic TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  -- Session tokens prove a request belongs to a registered wallet + device
  -- pair. Only the SHA-256 hash is stored; the token itself is returned to
  -- the client once at register time.
  CREATE TABLE IF NOT EXISTS session_tokens (
    wallet_address TEXT NOT NULL,
    device_token TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(wallet_address, device_token)
  );
`);

export function ensureTopicSubscriptionColumns(database) {
  const names = new Set(
    database.prepare('PRAGMA table_info(topic_subscriptions)').all().map(column => column.name)
  );
  if (!names.has('required_nfts')) {
    database.exec(
      "ALTER TABLE topic_subscriptions ADD COLUMN required_nfts TEXT NOT NULL DEFAULT '[]'"
    );
  }
  if (!names.has('via_account')) {
    database.exec(
      "ALTER TABLE topic_subscriptions ADD COLUMN via_account TEXT NOT NULL DEFAULT ''"
    );
  }
}

ensureTopicSubscriptionColumns(db);

// The register grace period has ended: tokens minted before the deadline
// must not survive, but tokens issued after it (by signed registers) must
// survive restarts — so delete only the pre-deadline rows, once at startup.
// Deferred past module evaluation: registerChallenge.js (via globeCache.js)
// reads dbPath from this file at its top level, so a static import would
// crash the startup cycle. setImmediate still fires before any request.
setImmediate(async () => {
  try {
    const { unsignedRegisterAllowed, graceUntil } = await import(
      '../services/registerChallenge.js'
    );
    if (unsignedRegisterAllowed()) return;
    const result = db.prepare(
      'DELETE FROM session_tokens WHERE created_at < ?'
    ).run(new Date(graceUntil()).toISOString());
    if (result.changes > 0) {
      console.log(
        `cleared ${result.changes} session token(s) now that the register grace period has ended`
      );
    }
  } catch (error) {
    console.error('session token cleanup failed:', error.message);
  }
});

console.log(`SQLite ready at ${dbPath}`);

function now() {
  return new Date().toISOString();
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function subscriptionFromRow(row) {
  if (!row) return null;
  return {
    topic_id: row.topic_id,
    wallet_address: row.wallet_address,
    device_token: row.device_token,
    show_full_message: !!row.show_full_message,
    filter_mode: row.filter_mode || 'all',
    allowed_senders: parseList(row.allowed_senders),
    blocked_senders: parseList(row.blocked_senders),
    required_nfts: parseList(row.required_nfts),
    via_account: typeof row.via_account === 'string' ? row.via_account : '',
  };
}

export function upsertUser({ walletAddress, deviceToken, platform }) {
  db.prepare(`
    INSERT INTO user_subscriptions (id, wallet_address, device_token, platform, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      device_token = excluded.device_token,
      platform = excluded.platform
  `).run(randomUUID(), walletAddress, deviceToken, platform || 'android', now());
}

export function updateTopicDeviceTokens(walletAddress, deviceToken) {
  db.prepare(`
    UPDATE topic_subscriptions SET device_token = ? WHERE wallet_address = ?
  `).run(deviceToken, walletAddress);
}

export function saveSessionToken(walletAddress, deviceToken, tokenHash) {
  db.prepare(`
    INSERT INTO session_tokens (wallet_address, device_token, token_hash, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address, device_token) DO UPDATE SET
      token_hash = excluded.token_hash,
      created_at = excluded.created_at
  `).run(walletAddress, deviceToken, tokenHash, now());
}

// Hashes of every token issued for the wallet (one per device). A presented
// token is accepted when its hash matches any of them.
export function sessionTokenHashesForWallet(walletAddress) {
  return db.prepare(
    'SELECT token_hash FROM session_tokens WHERE wallet_address = ?'
  ).all(walletAddress).map((row) => row.token_hash);
}

export function upsertTopicSubscription({
  walletAddress,
  deviceToken,
  topicId,
  viaAccount,
}, database = db) {
  // A plain re-subscribe leaves a saved account in place. Adding through an account sets it.
  const account = typeof viaAccount === 'string' ? viaAccount.trim() : '';
  database.prepare(`
    INSERT INTO topic_subscriptions (
      id, wallet_address, topic_id, device_token, via_account, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address, topic_id) DO UPDATE SET
      device_token = excluded.device_token,
      via_account = CASE
        WHEN excluded.via_account <> '' THEN excluded.via_account
        ELSE topic_subscriptions.via_account
      END
  `).run(randomUUID(), walletAddress, topicId, deviceToken, account, now());
}

// Existing rows predate via_account. Set it only when one directory account links the topic.
export function backfillViaAccounts(accountsForTopic, database = db) {
  const rows = database.prepare(`
    SELECT wallet_address, topic_id
    FROM topic_subscriptions
    WHERE via_account = ''
  `).all();
  const update = database.prepare(`
    UPDATE topic_subscriptions
    SET via_account = ?
    WHERE wallet_address = ? AND topic_id = ? AND via_account = ''
  `);
  for (const row of rows) {
    const ids = accountsForTopic(row.topic_id);
    if (!Array.isArray(ids) || ids.length !== 1) continue;
    const accountId = ids[0];
    if (typeof accountId !== 'string' || accountId === '') continue;
    update.run(accountId, row.wallet_address, row.topic_id);
  }
}

export function deleteTopicSubscription(walletAddress, topicId) {
  db.prepare(`
    DELETE FROM topic_subscriptions WHERE wallet_address = ? AND topic_id = ?
  `).run(walletAddress, topicId);
}

export function clearMessages(walletAddress) {
  db.prepare('DELETE FROM user_messages WHERE wallet_address = ?').run(walletAddress);
}

export function deleteMessages({ walletAddress, ids, topicIds, payers }) {
  if (Array.isArray(ids) && ids.length > 0) {
    const marks = ids.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM user_messages WHERE wallet_address = ? AND id IN (${marks})
    `).run(walletAddress, ...ids);
    return;
  }
  if (Array.isArray(topicIds) && topicIds.length > 0) {
    const marks = topicIds.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM user_messages WHERE wallet_address = ? AND topic_id IN (${marks})
    `).run(walletAddress, ...topicIds);
    return;
  }
  if (Array.isArray(payers) && payers.length > 0) {
    const marks = payers.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM user_messages
      WHERE wallet_address = ? AND (payer IN (${marks}) OR sender IN (${marks}))
    `).run(walletAddress, ...payers, ...payers);
  }
}

export function updateTopicFilter({
  walletAddress,
  topicId,
  filterMode,
  allowedSenders,
  blockedSenders,
  requiredNfts,
}) {
  const sets = [];
  const params = [];
  if (filterMode !== undefined) {
    sets.push('filter_mode = ?');
    params.push(filterMode);
  }
  if (allowedSenders !== undefined) {
    sets.push('allowed_senders = ?');
    params.push(JSON.stringify(allowedSenders));
  }
  if (blockedSenders !== undefined) {
    sets.push('blocked_senders = ?');
    params.push(JSON.stringify(blockedSenders));
  }
  if (requiredNfts !== undefined) {
    const parsed = normalizeRequiredNfts(requiredNfts);
    if (!parsed.ok) {
      const error = new Error(parsed.error);
      error.status = 400;
      throw error;
    }
    sets.push('required_nfts = ?');
    params.push(JSON.stringify(parsed.ids));
  }
  if (sets.length === 0) return;
  params.push(walletAddress, topicId);
  db.prepare(`
    UPDATE topic_subscriptions SET ${sets.join(', ')}
    WHERE wallet_address = ? AND topic_id = ?
  `).run(...params);
}

export function listSubscriptions(walletAddress) {
  return db.prepare(`
    SELECT topic_id, show_full_message, filter_mode, allowed_senders, blocked_senders, required_nfts, via_account, wallet_address
    FROM topic_subscriptions
    WHERE wallet_address = ?
  `).all(walletAddress).map(subscriptionFromRow);
}

export function updateShowFullMessage({ walletAddress, topicId, showFullMessage }) {
  db.prepare(`
    UPDATE topic_subscriptions SET show_full_message = ?
    WHERE wallet_address = ? AND topic_id = ?
  `).run(showFullMessage ? 1 : 0, walletAddress, topicId);
}

export function listAllSubscriptions() {
  return db.prepare('SELECT * FROM topic_subscriptions').all().map(subscriptionFromRow);
}

export function listMessages(walletAddress, limit = 100) {
  return db.prepare(`
    SELECT id, topic_id, sender, body, created_at, payer
    FROM user_messages
    WHERE wallet_address = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(walletAddress, limit);
}

export function deleteMessagesOlderThan(cutoffIso) {
  const result = db.prepare('DELETE FROM user_messages WHERE created_at < ?').run(cutoffIso);
  return result.changes || 0;
}

export function listActiveTopicIds() {
  return db.prepare('SELECT DISTINCT topic_id FROM topic_subscriptions').all().map((row) => row.topic_id);
}

export function getTopicState(topicId) {
  return db.prepare(`
    SELECT last_sequence_number FROM topic_state WHERE topic_id = ?
  `).get(topicId) || null;
}

export function upsertTopicState(topicId, lastSequenceNumber) {
  db.prepare(`
    INSERT INTO topic_state (topic_id, last_sequence_number, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(topic_id) DO UPDATE SET
      last_sequence_number = excluded.last_sequence_number,
      updated_at = excluded.updated_at
  `).run(topicId, lastSequenceNumber, now());
}

export function listTopicSubscribers(topicId) {
  return db.prepare(`
    SELECT device_token, wallet_address, show_full_message, allowed_senders, blocked_senders, required_nfts, filter_mode
    FROM topic_subscriptions
    WHERE topic_id = ?
  `).all(topicId).map(subscriptionFromRow);
}

export function insertUserMessage({ walletAddress, topicId, payer, sender, body, sequenceNumber }) {
  db.prepare(`
    INSERT INTO user_messages (
      id, wallet_address, topic_id, payer, sender, body, sequence_number, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    walletAddress,
    topicId,
    payer,
    sender,
    body,
    sequenceNumber ?? null,
    now()
  );
}

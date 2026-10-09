// Local SQLite for the notifier. The file is created on startup.
// NOTIFIER_DB is a full path. NOTIFIER_DATA_DIR is a folder.
// On Railway, a volume's mount path is used when those are unset.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = process.env.NOTIFIER_DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(root, 'data');
const dbPath = process.env.NOTIFIER_DB || path.join(dataDir, 'notifier.db');

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
`);

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

export function upsertTopicSubscription({ walletAddress, deviceToken, topicId }) {
  db.prepare(`
    INSERT INTO topic_subscriptions (
      id, wallet_address, topic_id, device_token, created_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address, topic_id) DO UPDATE SET
      device_token = excluded.device_token
  `).run(randomUUID(), walletAddress, topicId, deviceToken, now());
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

export function updateTopicFilter({ walletAddress, topicId, filterMode, allowedSenders, blockedSenders }) {
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
  if (sets.length === 0) return;
  params.push(walletAddress, topicId);
  db.prepare(`
    UPDATE topic_subscriptions SET ${sets.join(', ')}
    WHERE wallet_address = ? AND topic_id = ?
  `).run(...params);
}

export function listSubscriptions(walletAddress) {
  return db.prepare(`
    SELECT topic_id, show_full_message, filter_mode, allowed_senders, blocked_senders, wallet_address
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
    SELECT device_token, wallet_address, show_full_message, allowed_senders, blocked_senders, filter_mode
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

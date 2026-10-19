import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { backfillViaAccounts, ensureTopicSubscriptionColumns, upsertTopicSubscription } from './db.js';

test('an existing subscription table gains an empty required_nfts column', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notifier-db-'));
  const database = new DatabaseSync(path.join(dir, 'old.db'));
  try {
    database.exec(`
      CREATE TABLE topic_subscriptions (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        device_token TEXT,
        show_full_message INTEGER NOT NULL DEFAULT 1,
        filter_mode TEXT NOT NULL DEFAULT 'all',
        allowed_senders TEXT NOT NULL DEFAULT '[]',
        blocked_senders TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
    `);
    database.prepare(`
      INSERT INTO topic_subscriptions (id, wallet_address, topic_id, created_at)
      VALUES ('1', '0.0.1', '0.0.2', 't')
    `).run();
    ensureTopicSubscriptionColumns(database);
    const row = database.prepare('SELECT required_nfts, via_account FROM topic_subscriptions').get();
    assert.equal(row.required_nfts, '[]');
    assert.equal(row.via_account, '');
    ensureTopicSubscriptionColumns(database);
    const again = database.prepare('SELECT required_nfts, via_account FROM topic_subscriptions').get();
    assert.equal(again.required_nfts, '[]');
    assert.equal(again.via_account, '');
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function openSubscriptions() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notifier-via-'));
  const database = new DatabaseSync(path.join(dir, 'subs.db'));
  database.exec(`
    CREATE TABLE topic_subscriptions (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      device_token TEXT,
      show_full_message INTEGER NOT NULL DEFAULT 1,
      filter_mode TEXT NOT NULL DEFAULT 'all',
      allowed_senders TEXT NOT NULL DEFAULT '[]',
      blocked_senders TEXT NOT NULL DEFAULT '[]',
      required_nfts TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(wallet_address, topic_id)
    );
  `);
  ensureTopicSubscriptionColumns(database);
  return { dir, database };
}

test('subscribe via an account saves via_account and a plain re-add keeps it', () => {
  const { dir, database } = openSubscriptions();
  try {
    upsertTopicSubscription({
      walletAddress: '0.0.10',
      deviceToken: 'phone',
      topicId: '0.0.100',
      viaAccount: '0.0.1',
    }, database);
    const saved = database.prepare('SELECT via_account FROM topic_subscriptions').get();
    assert.equal(saved.via_account, '0.0.1');

    upsertTopicSubscription({
      walletAddress: '0.0.10',
      deviceToken: 'phone',
      topicId: '0.0.100',
    }, database);
    const kept = database.prepare('SELECT via_account FROM topic_subscriptions').get();
    assert.equal(kept.via_account, '0.0.1');

    upsertTopicSubscription({
      walletAddress: '0.0.10',
      deviceToken: 'phone',
      topicId: '0.0.100',
      viaAccount: '0.0.4',
    }, database);
    const replaced = database.prepare('SELECT via_account FROM topic_subscriptions').get();
    assert.equal(replaced.via_account, '0.0.4');
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backfill sets via_account only for a unique directory match', () => {
  const { dir, database } = openSubscriptions();
  try {
    const insert = database.prepare(`
      INSERT INTO topic_subscriptions (id, wallet_address, topic_id, via_account, created_at)
      VALUES (?, ?, ?, ?, 't')
    `);
    insert.run('unique', '0.0.10', '0.0.100', '');
    insert.run('shared-blank', '0.0.10', '0.0.200', '');
    insert.run('shared-kept', '0.0.11', '0.0.200', '0.0.9');
    insert.run('none', '0.0.10', '0.0.300', '');

    const links = {
      '0.0.100': ['0.0.1'],
      '0.0.200': ['0.0.2', '0.0.3'],
    };
    backfillViaAccounts(topicId => links[topicId] || [], database);

    const rows = database.prepare(`
      SELECT topic_id, wallet_address, via_account
      FROM topic_subscriptions
      ORDER BY id
    `).all();
    const byId = Object.fromEntries(rows.map(row => [`${row.wallet_address}:${row.topic_id}`, row.via_account]));
    assert.equal(byId['0.0.10:0.0.100'], '0.0.1');
    assert.equal(byId['0.0.10:0.0.200'], '');
    assert.equal(byId['0.0.11:0.0.200'], '0.0.9');
    assert.equal(byId['0.0.10:0.0.300'], '');
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

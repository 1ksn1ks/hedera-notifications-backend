import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ensureTopicSubscriptionColumns } from './db.js';

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
    const row = database.prepare('SELECT required_nfts FROM topic_subscriptions').get();
    assert.equal(row.required_nfts, '[]');
    ensureTopicSubscriptionColumns(database);
    const again = database.prepare('SELECT required_nfts FROM topic_subscriptions').get();
    assert.equal(again.required_nfts, '[]');
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

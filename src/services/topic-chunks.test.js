import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipText } from './meritocracyFormat.js';
import {
  CHUNK_TTL_MS,
  acceptTopicMessage,
  createChunkBuffer,
  pushMessageText,
} from './topic-chunks.js';

const TOPIC = '0.0.4819200';
const NOW = 1_700_000_000_000;

function initialTransaction() {
  return {
    account_id: '0.0.100',
    nonce: 0,
    scheduled: false,
    transaction_valid_start: '1700000000.000000000',
  };
}

function chunk(number, total, text, extra = {}) {
  return {
    message: Buffer.from(text).toString('base64'),
    consensus_timestamp: extra.consensus_timestamp,
    payer_account_id: extra.payer_account_id,
    sequence_number: extra.sequence_number,
    chunk_info: {
      initial_transaction_id: initialTransaction(),
      number,
      total,
    },
  };
}

function take(buffer, row, now = NOW) {
  return acceptTopicMessage(buffer, TOPIC, row, now);
}

test('out-of-order chunks join once, using the first chunk payer and time', () => {
  const buffer = createChunkBuffer();
  const secret = '{"encryptedMessage":{"ciphertext":"aabbcc"}}';
  const head = secret.slice(0, 28);
  const tail = secret.slice(28);
  const seen = [];

  const second = take(buffer, chunk(2, 2, tail, {
    consensus_timestamp: '1700000002.000000000',
    payer_account_id: '0.0.222',
    sequence_number: 12,
  }));
  assert.equal(second, null);

  const message = take(buffer, chunk(1, 2, head, {
    consensus_timestamp: '1700000001.000000000',
    payer_account_id: '0.0.111',
    sequence_number: 11,
  }));
  if (message) seen.push(message);

  assert.equal(seen.length, 1);
  assert.equal(message.body, secret);
  assert.equal(message.payer, '0.0.111');
  assert.equal(message.consensusTimestamp, '1700000001.000000000');
  assert.equal(message.sequenceNumber, 11);
  assert.equal(message.chunked, true);
  assert.equal(Buffer.concat([Buffer.from(head), Buffer.from(tail)]).toString('utf8'), message.body);
});

test('a missing chunk never produces a message', () => {
  const buffer = createChunkBuffer();
  const seen = [];
  const first = chunk(1, 2, 'hello ', {
    consensus_timestamp: '1700000001.000000000',
    payer_account_id: '0.0.111',
    sequence_number: 11,
  });
  const late = chunk(2, 2, 'there', {
    consensus_timestamp: '1700000099.000000000',
    payer_account_id: '0.0.111',
    sequence_number: 12,
  });

  for (const now of [NOW, NOW + 1_000, NOW + CHUNK_TTL_MS - 1]) {
    const message = take(buffer, first, now);
    if (message) seen.push(message);
  }
  const expired = take(buffer, late, NOW + CHUNK_TTL_MS);
  if (expired) seen.push(expired);

  assert.equal(seen.length, 0);
  assert.equal(expired, null);
});

test('duplicate chunks and a repeated full message notify once', () => {
  const buffer = createChunkBuffer();
  const seen = [];
  const keep = (row) => {
    const message = take(buffer, row);
    if (message) seen.push(message);
    return message;
  };
  const first = chunk(1, 2, 'aa', {
    consensus_timestamp: '1700000001.000000000',
    payer_account_id: '0.0.111',
    sequence_number: 11,
  });
  const second = chunk(2, 2, 'bb', {
    consensus_timestamp: '1700000002.000000000',
    payer_account_id: '0.0.222',
    sequence_number: 12,
  });

  assert.equal(keep(first), null);
  assert.equal(keep(first), null);
  const message = keep(second);
  assert.equal(message.body, 'aabb');
  assert.equal(keep(first), null);
  assert.equal(keep(second), null);
  assert.equal(seen.length, 1);

  const single = {
    message: Buffer.from('once').toString('base64'),
    consensus_timestamp: '9.000000000',
    payer_account_id: '0.0.5',
    sequence_number: 3,
  };
  assert.equal(keep(single).body, 'once');
  assert.equal(keep(single), null);
  assert.equal(seen.length, 2);
});

test('a message without chunk_info is unchanged', () => {
  const buffer = createChunkBuffer();
  const text = 'hello from 0.0.5';
  const row = {
    message: Buffer.from(text).toString('base64'),
    consensus_timestamp: '42.000000001',
    payer_account_id: '0.0.5',
    sequence_number: 7,
  };
  const message = take(buffer, row);

  assert.equal(message.body, Buffer.from(row.message, 'base64').toString('utf8'));
  assert.equal(message.body, text);
  assert.equal(message.payer, row.payer_account_id);
  assert.equal(message.consensusTimestamp, row.consensus_timestamp);
  assert.equal(message.sequenceNumber, row.sequence_number);
  assert.equal(message.chunked, false);
  assert.equal(pushMessageText(message.body, message.chunked), text);
});

test('a long joined message is trimmed to the current preview length for the push', () => {
  const buffer = createChunkBuffer();
  const text = 'm'.repeat(180);
  const head = text.slice(0, 90);
  const tail = text.slice(90);
  assert.equal(take(buffer, chunk(2, 2, tail, {
    consensus_timestamp: '2.000000000',
    payer_account_id: '0.0.2',
    sequence_number: 2,
  })), null);
  const message = take(buffer, chunk(1, 2, head, {
    consensus_timestamp: '1.000000000',
    payer_account_id: '0.0.1',
    sequence_number: 1,
  }));

  assert.equal(message.body, text);
  assert.equal(pushMessageText(message.body, message.chunked), clipText(text));
  assert.ok(pushMessageText(message.body, true).length < text.length);
  assert.equal(pushMessageText(text, false), text);
});

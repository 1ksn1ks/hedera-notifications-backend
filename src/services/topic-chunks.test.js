import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyMeritocracy, clipText } from './meritocracyFormat.js';
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
    payer_account_id: '0.0.100',
    sequence_number: 12,
  }));
  assert.equal(second, null);

  const message = take(buffer, chunk(1, 2, head, {
    consensus_timestamp: '1700000001.000000000',
    payer_account_id: '0.0.100',
    sequence_number: 11,
  }));
  if (message) seen.push(message);

  assert.equal(seen.length, 1);
  assert.equal(message.body, secret);
  assert.equal(message.payer, '0.0.100');
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
    payer_account_id: '0.0.100',
    sequence_number: 11,
  });
  const late = chunk(2, 2, 'there', {
    consensus_timestamp: '1700000099.000000000',
    payer_account_id: '0.0.100',
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
    payer_account_id: '0.0.100',
    sequence_number: 11,
  });
  const second = chunk(2, 2, 'bb', {
    consensus_timestamp: '1700000002.000000000',
    payer_account_id: '0.0.100',
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

test('a chunk whose payer does not match the initial account is dropped', () => {
  const buffer = createChunkBuffer();
  const text = '{"userMessage":"hi there"}';
  const head = text.slice(0, 12);
  const tail = text.slice(12);
  const matching = {
    consensus_timestamp: '1700000001.000000000',
    payer_account_id: '0.0.100',
    sequence_number: 11,
  };
  const foreign = {
    consensus_timestamp: '1700000002.000000000',
    payer_account_id: '0.0.999',
    sequence_number: 12,
  };

  assert.equal(take(buffer, chunk(1, 2, head, matching)), null);
  assert.equal(take(buffer, chunk(2, 2, tail, foreign)), null);
  const message = take(buffer, chunk(2, 2, tail, {
    ...matching,
    sequence_number: 13,
    consensus_timestamp: '1700000003.000000000',
  }));
  assert.equal(message.body, text);
  assert.equal(message.payer, '0.0.100');
});

function joinedPush(original) {
  const text = JSON.stringify(original);
  const buffer = createChunkBuffer();
  const head = text.slice(0, Math.ceil(text.length / 2));
  const tail = text.slice(head.length);
  assert.equal(take(buffer, chunk(2, 2, tail, {
    consensus_timestamp: '2.000000000',
    payer_account_id: '0.0.100',
    sequence_number: 2,
  })), null);
  const message = take(buffer, chunk(1, 2, head, {
    consensus_timestamp: '1.000000000',
    payer_account_id: '0.0.100',
    sequence_number: 1,
  }));
  assert.equal(message.body, text);
  const pushed = pushMessageText(message.body, message.chunked);
  const parsed = JSON.parse(pushed);
  assert.equal(typeof parsed, 'object');
  assert.ok(parsed);
  assert.ok(Buffer.byteLength(pushed, 'utf8') < 3 * 1024);
  assert.equal(classifyMeritocracy(pushed).kind, classifyMeritocracy(text).kind);
  return pushed;
}

test('a chunked push is small JSON that classifies as the original kind', () => {
  const blob = 'data:image/png;base64,' + 'A'.repeat(4000);
  const long = 'm'.repeat(180);

  const chat = joinedPush({
    userMessage: long,
    image: blob,
  });
  assert.equal(JSON.parse(chat).userMessage, clipText(long));
  assert.equal(chat.includes(blob), false);

  const secret = 'c'.repeat(500);
  const encryptedChat = joinedPush({
    encryptedMessage: { ciphertext: secret, iv: 'abc' },
  });
  assert.equal(classifyMeritocracy(encryptedChat).kind, 'encrypted-chat');
  assert.equal(encryptedChat.includes(secret), false);
  assert.deepEqual(JSON.parse(encryptedChat), { encryptedMessage: { ciphertext: '' } });

  const sealed = joinedPush({ ciphertext: secret });
  assert.equal(classifyMeritocracy(sealed).kind, 'encrypted');
  assert.equal(sealed.includes(secret), false);
  assert.deepEqual(JSON.parse(sealed), { ciphertext: '' });

  const marker = joinedPush({
    marker: {
      data: {
        title: 'Cafe',
        msg: long,
        cord: '1.5,2.5',
        numberOfMarker: 9,
        image: blob,
        coverimage: 'https://example.test/pic.jpg',
      },
    },
  });
  assert.equal(classifyMeritocracy(marker).kind, 'marker');
  assert.equal(marker.includes(blob), false);
  assert.equal(JSON.parse(marker).marker.data.image, 'https://example.test/pic.jpg');
  assert.equal(JSON.parse(marker).marker.data.msg, clipText(long));

  joinedPush({
    polygon: {
      data: {
        title: 'Block',
        msg: 'ring',
        cord: '1,2,3,4,5,6',
        numberOfPolygon: 3,
        image: blob,
      },
    },
  });

  joinedPush({ marker: { data: { deleteMarkerNumber: 12 } } });
  joinedPush({ polygon: { data: { deletePolygonNumber: 4 } } });

  const share = joinedPush({
    share: {
      topic: '0.0.4819200',
      payer: '0.0.111',
      number: 7,
      kind: 'marker',
      coords: [[1, 2], [3, 4], [5, 6]],
      title: 'Park',
      msg: long,
      image: blob,
    },
  });
  assert.equal(classifyMeritocracy(share).kind, 'polygon');
  assert.equal(classifyMeritocracy(share).shared, true);
  assert.equal(share.includes(blob), false);
});

test('a chunked push that is not classifiable JSON is a small chat preview', () => {
  const text = 'm'.repeat(180);
  const pushed = pushMessageText(text, true);
  const view = classifyMeritocracy(pushed);
  assert.equal(view.kind, 'chat');
  assert.equal(view.text, clipText(text));
  assert.ok(Buffer.byteLength(pushed, 'utf8') < 3 * 1024);
  assert.equal(pushMessageText(text, false), text);

  const huge = JSON.stringify({
    marker: { data: { title: 'Big', msg: 'hi', cord: '1,2,'.repeat(2000), numberOfMarker: 1 } },
  });
  assert.equal(classifyMeritocracy(huge).kind, 'marker');
  const fallback = pushMessageText(huge, true);
  assert.equal(classifyMeritocracy(fallback).kind, 'chat');
  assert.ok(Buffer.byteLength(fallback, 'utf8') < 3 * 1024);
  JSON.parse(fallback);
});

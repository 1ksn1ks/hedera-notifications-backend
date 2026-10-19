// Joins Hedera consensus-topic chunks (mirror chunk_info) into one message.
// Bytes are concatenated only. Nothing here decrypts.

import { classifyMeritocracy, clipText, previewMeritocracy } from './meritocracyFormat.js';

export const CHUNK_TTL_MS = 10 * 60 * 1000;
const DONE_KEEP = 2000;
const PUSH_LIMIT = 3 * 1024;

export function createChunkBuffer() {
  return {
    pending: new Map(),
    done: new Map(),
  };
}

export function sweepChunkBuffer(buffer, now = Date.now()) {
  if (!buffer) return;
  for (const [key, group] of buffer.pending) {
    if (now - group.startedAt >= CHUNK_TTL_MS) {
      buffer.pending.delete(key);
      rememberDone(buffer, key, now);
    }
  }
}

function rememberDone(buffer, key, now) {
  if (!key) return;
  buffer.done.delete(key);
  buffer.done.set(key, now);
  if (buffer.done.size <= DONE_KEEP) return;
  const extra = buffer.done.size - DONE_KEEP;
  let removed = 0;
  for (const old of buffer.done.keys()) {
    buffer.done.delete(old);
    removed += 1;
    if (removed >= extra) break;
  }
}

function initialKey(topicId, info) {
  const id = info?.initial_transaction_id;
  if (typeof id === 'string') {
    const text = id.trim();
    return text ? `${topicId}\n${text}` : null;
  }
  if (!id || typeof id !== 'object') return null;
  const account = id.account_id == null ? '' : String(id.account_id);
  const start = id.transaction_valid_start == null ? '' : String(id.transaction_valid_start);
  if (account === '' && start === '') return null;
  const nonce = id.nonce == null ? '0' : String(id.nonce);
  const scheduled = id.scheduled === true || id.scheduled === 'true' ? '1' : '0';
  return `${topicId}\n${account}\n${start}\n${nonce}\n${scheduled}`;
}

function sequenceKey(topicId, sequenceNumber) {
  if (sequenceNumber == null || sequenceNumber === '') return null;
  return `${topicId}\nseq:${sequenceNumber}`;
}

function initialAccount(info) {
  const id = info?.initial_transaction_id;
  if (typeof id === 'string') {
    const match = id.trim().match(/^(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  if (id && typeof id === 'object' && id.account_id != null) {
    const account = String(id.account_id).trim();
    return account || null;
  }
  return null;
}

// A chunk paid by someone else is not part of this message.
function chunkPayerOk(row) {
  const account = initialAccount(row?.chunk_info);
  if (!account) return true;
  const payer = row.payer_account_id == null ? '' : String(row.payer_account_id).trim();
  return payer === account;
}

function messageBytes(message) {
  if (Buffer.isBuffer(message)) return Buffer.from(message);
  if (message instanceof Uint8Array) return Buffer.from(message);
  return Buffer.from(message, 'base64');
}

// Null means this row is one complete message. Invalid rows are not notified.
function chunkPlan(info) {
  if (info == null) return null;
  if (typeof info !== 'object') return { invalid: true };
  const hasTotal = info.total != null && info.total !== '';
  const hasNumber = info.number != null && info.number !== '';
  if (!hasTotal && !hasNumber) return null;
  const total = Number(info.total);
  const number = Number(info.number);
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(number) || number < 1 || number > total) {
    return { invalid: true };
  }
  if (total === 1) return null;
  return { total, number };
}

function finished(row, bytes, chunked) {
  return {
    body: Buffer.from(bytes).toString('utf8'),
    bytes: Buffer.from(bytes),
    consensusTimestamp: row.consensus_timestamp ?? null,
    payer: row.payer_account_id ?? null,
    sequenceNumber: row.sequence_number ?? null,
    chunked,
  };
}

// Returns the full message once every chunk is present, or null.
// nowMs lets a caller expire a group that is still incomplete after 10 minutes.
export function acceptTopicMessage(buffer, topicId, row, now = Date.now()) {
  if (!buffer || row == null || topicId == null) return null;
  sweepChunkBuffer(buffer, now);

  const plan = chunkPlan(row.chunk_info);
  if (plan?.invalid) return null;
  if (row.chunk_info && !chunkPayerOk(row)) return null;

  if (!plan) {
    const key = initialKey(topicId, row.chunk_info) || sequenceKey(topicId, row.sequence_number);
    if (key && buffer.done.has(key)) return null;
    const bytes = messageBytes(row.message);
    if (key) rememberDone(buffer, key, now);
    return finished(row, bytes, false);
  }

  const key = initialKey(topicId, row.chunk_info);
  if (!key || buffer.done.has(key)) return null;

  let group = buffer.pending.get(key);
  if (!group) {
    group = { total: plan.total, startedAt: now, chunks: new Map() };
    buffer.pending.set(key, group);
  }
  if (group.total !== plan.total || group.chunks.has(plan.number)) return null;

  group.chunks.set(plan.number, {
    bytes: messageBytes(row.message),
    consensusTimestamp: row.consensus_timestamp ?? null,
    payer: row.payer_account_id ?? null,
    sequenceNumber: row.sequence_number ?? null,
  });
  if (group.chunks.size !== plan.total) return null;

  const parts = [];
  for (let number = 1; number <= plan.total; number += 1) {
    const part = group.chunks.get(number);
    if (!part) return null;
    parts.push(part);
  }

  const bytes = Buffer.concat(parts.map((part) => part.bytes));
  const first = parts[0];
  buffer.pending.delete(key);
  rememberDone(buffer, key, now);
  return {
    body: bytes.toString('utf8'),
    bytes,
    consensusTimestamp: first.consensusTimestamp,
    payer: first.payer,
    sequenceNumber: first.sequenceNumber,
    chunked: true,
  };
}

function chatFallback(text) {
  return JSON.stringify({ userMessage: clipText(previewMeritocracy(text)) });
}

// Rebuild only the fields classifyMeritocracy reads, with long text clipped
// and inline image data already dropped by that reader.
function slimView(view) {
  if (view.kind === 'chat') {
    return { userMessage: clipText(view.text) };
  }
  if (view.kind === 'encrypted-chat') {
    return { encryptedMessage: { ciphertext: '' } };
  }
  if (view.kind === 'encrypted') {
    return { ciphertext: '' };
  }
  if (view.kind === 'marker-delete') {
    return { marker: { data: { deleteMarkerNumber: view.number } } };
  }
  if (view.kind === 'polygon-delete') {
    return { polygon: { data: { deletePolygonNumber: view.number } } };
  }
  if (view.shared) {
    const share = { kind: view.kind === 'polygon' ? 'polygon' : 'marker' };
    if (view.placeTopic) share.topic = view.placeTopic;
    if (view.placePayer) share.payer = view.placePayer;
    if (view.number) share.number = view.number;
    if (view.title) share.title = view.title;
    if (view.text) share.msg = clipText(view.text);
    if (view.cord) share.cord = view.cord;
    if (view.image) share.image = view.image;
    return { share };
  }
  const data = {};
  if (view.title) data.title = view.title;
  if (view.text) data.msg = clipText(view.text);
  if (view.cord) data.cord = view.cord;
  if (view.image) data.image = view.image;
  const numberKey = view.kind === 'polygon' ? 'numberOfPolygon' : 'numberOfMarker';
  if (view.number) data[numberKey] = view.number;
  const placeKey = view.kind === 'polygon' ? 'polygon' : 'marker';
  return { [placeKey]: { data } };
}

// Unchunked pushes stay the raw consensus text. A chunked push is a small
// JSON document the phone can still classify, never a clipped fragment.
export function pushMessageText(body, chunked) {
  const text = body == null ? '' : String(body);
  if (!chunked) return text;
  const view = classifyMeritocracy(text);
  if (!view) return chatFallback(text);
  const json = JSON.stringify(slimView(view));
  if (Buffer.byteLength(json, 'utf8') >= PUSH_LIMIT) return chatFallback(text);
  return json;
}

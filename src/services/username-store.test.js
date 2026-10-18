import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  loadAndStoreProfiles,
  readStoredProfiles,
  replaceProfiles,
  UsernameService,
  withTransaction,
} from './username-store.js';

const NAME_TOPIC = '0.0.9609904';
const PIC_TOPIC = '0.0.9609881';

function message(account, payload) {
  return {
    payer_account_id: account,
    message: Buffer.from(JSON.stringify(payload)).toString('base64'),
  };
}

function page(messages, next = '') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ messages, links: next ? { next } : {} }),
  };
}

function openDb() {
  const database = new DatabaseSync(':memory:');
  replaceProfiles(database, {
    '0.0.2': { username: 'kept', profilePic: 'https://example.test/old.png' },
  }, 't0');
  return database;
}

test('a failed later page does not replace stored usernames', async () => {
  const database = openDb();
  const fetchImpl = async (url) => {
    if (String(url).includes('page=2')) return { ok: false, status: 502, json: async () => ({}) };
    const topic = String(url).includes(PIC_TOPIC) ? PIC_TOPIC : NAME_TOPIC;
    const row = topic === NAME_TOPIC
      ? message('0.0.9', { data: { username: 'new' } })
      : message('0.0.9', { data: { urls: ['https://example.test/new.png'] } });
    return page([row], `/api/v1/topics/${topic}/messages?page=2`);
  };
  const result = await loadAndStoreProfiles(database, {
    mirrorUrl: 'https://mirror.test',
    fetchImpl,
    warn: () => {},
  });
  assert.equal(result.ok, false);
  const stored = readStoredProfiles(database);
  assert.equal(stored.names['0.0.2'], 'kept');
  assert.equal(stored.names['0.0.9'], undefined);
});

test('a slow profile request aborts and leaves the old rows', async () => {
  const database = openDb();
  let aborted = false;
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      aborted = true;
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
  const result = await Promise.race([
    loadAndStoreProfiles(database, {
      mirrorUrl: 'https://mirror.test',
      fetchImpl,
      timeoutMs: 40,
      warn: () => {},
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('hung')), 500)),
  ]);
  assert.equal(result.ok, false);
  assert.equal(aborted, true);
  assert.equal(readStoredProfiles(database).names['0.0.2'], 'kept');
});

test('a full fetch replaces profiles in one transaction', async () => {
  const database = openDb();
  const fetchImpl = async (url) => {
    if (String(url).includes(PIC_TOPIC)) {
      return page([message('0.0.3', { data: { urls: ['https://example.test/pic.png'] } })]);
    }
    return page([message('0.0.3', { data: { username: 'neo' } })]);
  };
  const service = new UsernameService({
    database,
    fetchImpl,
    timeoutMs: 1000,
    mirrorUrl: 'https://mirror.test',
    now: () => 't1',
  });
  assert.equal(service.accountUsernames['0.0.2'], 'kept');
  await service.loadProfiles();
  assert.equal(service.accountUsernames['0.0.3'], 'neo');
  assert.equal(service.accountUsernames['0.0.2'], undefined);
  assert.equal(service.accountPictures['0.0.3'], 'https://example.test/pic.png');
  const stored = readStoredProfiles(database);
  assert.equal(stored.names['0.0.3'], 'neo');
  assert.equal(stored.names['0.0.2'], undefined);
});

test('a cut-off topic and a rolled-back write keep the previous rows', async () => {
  const database = openDb();
  const fetchImpl = async (url) => {
    const topic = String(url).includes(PIC_TOPIC) ? PIC_TOPIC : NAME_TOPIC;
    return page([], `/api/v1/topics/${topic}/messages?page=2`);
  };
  const service = new UsernameService({
    database,
    fetchImpl,
    mirrorUrl: 'https://mirror.test',
  });
  await service.loadProfiles();
  assert.equal(service.accountUsernames['0.0.2'], 'kept');
  assert.equal(readStoredProfiles(database).names['0.0.2'], 'kept');

  assert.throws(() => withTransaction(database, () => {
    database.prepare('DELETE FROM profiles').run();
    throw new Error('boom');
  }));
  assert.equal(readStoredProfiles(database).names['0.0.2'], 'kept');
});

test('a failed topic aborts the other profile fetch', async () => {
  const database = openDb();
  let siblingAborted = false;
  const fetchImpl = (url, init) => {
    if (String(url).includes(PIC_TOPIC)) {
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    }
    return new Promise((_resolve, reject) => {
      const fail = () => {
        siblingAborted = true;
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      };
      if (init.signal.aborted) {
        fail();
        return;
      }
      init.signal.addEventListener('abort', fail);
    });
  };
  const result = await Promise.race([
    loadAndStoreProfiles(database, {
      mirrorUrl: 'https://mirror.test',
      fetchImpl,
      timeoutMs: 5000,
      warn: () => {},
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('hung')), 500)),
  ]);
  assert.equal(result.ok, false);
  assert.equal(siblingAborted, true);
  assert.equal(readStoredProfiles(database).names['0.0.2'], 'kept');
});

test('a failed load waits a minute before trying again', async () => {
  const database = openDb();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 503, json: async () => ({}) };
  };
  let now = 1_000_000;
  const service = new UsernameService({
    database,
    fetchImpl,
    mirrorUrl: 'https://mirror.test',
    clock: () => now,
  });
  await service.loadProfiles();
  const afterFail = calls;
  assert.ok(afterFail >= 1);
  await service.loadProfiles();
  assert.equal(calls, afterFail);
  now += 59_000;
  await service.loadProfiles();
  assert.equal(calls, afterFail);
  now += 2_000;
  await service.loadProfiles();
  assert.equal(calls, afterFail * 2);
});

test('an empty topic keeps old names and does not refetch immediately', async () => {
  const database = openDb();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return page([]);
  };
  const service = new UsernameService({
    database,
    fetchImpl,
    mirrorUrl: 'https://mirror.test',
  });
  await service.loadProfiles();
  await service.loadProfiles();
  assert.equal(calls, 2);
  assert.equal(service.accountUsernames['0.0.2'], 'kept');
  assert.equal(readStoredProfiles(database).names['0.0.2'], 'kept');
});

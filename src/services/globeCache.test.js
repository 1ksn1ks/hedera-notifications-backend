import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createGlobeCache, isAccountId, profileTopicAction, subscriptionOwner } from './globeCache.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function b64(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function bioMessage(account, data, seq = 1) {
  return {
    payer_account_id: account,
    sequence_number: seq,
    message: b64({ data }),
  };
}

function followMessage(account, body, seq) {
  return {
    payer_account_id: account,
    sequence_number: seq,
    message: b64(body),
  };
}

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'globe-cache-'));
  return { dir, file: path.join(dir, 'globe-cache.json') };
}

test('profile topic actions set, clear, and read legacy topic2pic', () => {
  assert.deepEqual(profileTopicAction({ profileTopic: ' 0.0.15 ' }), { action: 'set', topic: '0.0.15' });
  assert.deepEqual(profileTopicAction({ profileTopic: '' }), { action: 'clear' });
  assert.equal(profileTopicAction({ profileTopic: 'nope' }), null);
  assert.deepEqual(
    profileTopicAction({ clearProfileTopic: true, profileTopic: '0.0.1' }),
    { action: 'clear' }
  );
  assert.deepEqual(profileTopicAction({ topic2pic: '0.0.20' }), { action: 'set', topic: '0.0.20' });
  assert.deepEqual(
    profileTopicAction({ topic2pic: [' 0.0.21 ', '0.0.1'] }),
    { action: 'set', topic: '0.0.21' }
  );
  assert.deepEqual(profileTopicAction({ topic2pic: '' }), { action: 'clear' });
  assert.deepEqual(profileTopicAction({ topic2pic: [''] }), { action: 'clear' });
  assert.equal(profileTopicAction({ topic2pic: 'nope' }), null);
  assert.equal(profileTopicAction({ topic2pic: ['nope'] }), null);
  assert.equal(profileTopicAction(null), null);
  assert.equal(profileTopicAction('0.0.1'), null);
  assert.equal(profileTopicAction({ topic_bio: 'hello' }), null);
});

test('account ids are strict 0.0.N', () => {
  assert.equal(isAccountId('0.0.12'), true);
  assert.equal(isAccountId('0.0.0'), true);
  assert.equal(isAccountId('1.2.3'), false);
  assert.equal(isAccountId('0.0.12.3'), false);
  assert.equal(isAccountId('0.0.abc'), false);
  assert.equal(isAccountId(' 0.0.1'), false);
  assert.equal(isAccountId('0.0.1 '), false);
  assert.equal(isAccountId(''), false);
  assert.equal(isAccountId(null), false);
});

test('bio topic links set, clear, and keep a legacy topic2pic', async () => {
  const { dir, file } = tempFile();
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/user-settings')) return jsonResponse({}, 503);
    if (u.includes('0.0.9759201')) {
      return jsonResponse({
        messages: [
          bioMessage('0.0.1', { profileTopic: ' 0.0.100 ' }, 1),
          bioMessage('0.0.1', { profileTopic: 'nope' }, 2),
          bioMessage('0.0.1', { clearProfileTopic: true }, 3),
          bioMessage('0.0.2', { topic2pic: '0.0.200' }, 4),
          bioMessage('0.0.3', { topic2pic: ['0.0.300', '0.0.1'] }, 5),
          bioMessage('0.0.4', { topic2pic: '' }, 6),
          bioMessage('0.0.5', { topic2pic: 'not a topic' }, 7),
          bioMessage('0.0.6', { profileTopic: '0.0.600' }, 8),
          bioMessage('0.0.6', { clearProfileTopic: 1, profileTopic: '0.0.601' }, 9),
          bioMessage('0.0.7', { profileTopic: '' }, 10),
        ],
        links: {},
      });
    }
    return jsonResponse({ messages: [], links: {} });
  };
  try {
    const cache = createGlobeCache({
      fetchImpl,
      cacheFile: file,
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
      listProfiles: async () => ({
        '0.0.2': { username: 'two', profilePic: 'https://example.test/2.png' },
        '0.0.3': { username: 'three', profilePic: '' },
      }),
      warn: () => {},
      now: () => 'built',
    });
    await cache.refresh();
    assert.equal(cache.resolveAccountTopic('0.0.1'), '');
    assert.equal(cache.resolveAccountTopic('0.0.2'), '0.0.200');
    assert.equal(cache.resolveAccountTopic('0.0.3'), '0.0.300');
    assert.equal(cache.resolveAccountTopic('0.0.4'), '');
    assert.equal(cache.resolveAccountTopic('0.0.5'), '');
    assert.equal(cache.resolveAccountTopic('0.0.6'), '');
    assert.equal(cache.resolveAccountTopic('0.0.7'), '');
    const two = cache.directoryEntry('0.0.2');
    assert.equal(two.username, 'two');
    assert.equal(two.profilePic, 'https://example.test/2.png');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.version, 1);
    assert.equal(saved.directory.accounts['0.0.2'].topic, '0.0.200');
    assert.equal(saved.directory.accounts['0.0.1'], undefined);
    assert.equal(fs.existsSync(`${file}.tmp`), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a cut-off bio walk does not replace the directory', async () => {
  const { dir, file } = tempFile();
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/user-settings')) return jsonResponse({ ready: false });
    if (u.includes('0.0.9759201')) {
      return jsonResponse({
        messages: [bioMessage('0.0.2', { profileTopic: '0.0.200' })],
        links: { next: '/api/v1/topics/0.0.9759201/messages?page=2' },
      });
    }
    return jsonResponse({ messages: [], links: {} });
  };
  try {
    const cache = createGlobeCache({
      fetchImpl,
      cacheFile: file,
      pageCap: 1,
      listProfiles: async () => ({}),
      warn: () => {},
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
    });
    await cache.refresh();
    assert.equal(cache.resolveAccountTopic('0.0.2'), '');
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('user settings merge on the same generation and replace when it changes', async () => {
  const { dir, file } = tempFile();
  let generation = 'gen-a';
  let revision = 2;
  let ready = true;
  let settings = [
    { accountId: '0.0.1', username: 'one', profilePic: 'p1', topic: '0.0.10' },
    { accountId: '0.0.2', username: 'two', profilePic: 'p2', topic: 'not-a-topic' },
    { accountId: '1.2.3', username: 'skip', profilePic: '', topic: '0.0.99' },
  ];
  const settingsUrls = [];
  let bioCalls = 0;
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/user-settings')) {
      settingsUrls.push(u);
      return jsonResponse({ ready, generation, revision, settings });
    }
    if (u.includes('0.0.9759201')) {
      bioCalls += 1;
      return jsonResponse({
        messages: [bioMessage('0.0.8', { profileTopic: '0.0.8' })],
        links: {},
      });
    }
    return jsonResponse({ messages: [], links: {} });
  };
  try {
    const cache = createGlobeCache({
      fetchImpl,
      cacheFile: file,
      listProfiles: async () => {
        throw new Error('profiles are only for the mirror fallback');
      },
      warn: () => {},
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
    });
    await cache.refresh();
    assert.equal(cache.resolveAccountTopic('0.0.1'), '0.0.10');
    assert.equal(cache.resolveAccountTopic('0.0.2'), '');
    assert.equal(cache.directoryEntry('0.0.2').username, 'two');
    assert.equal(cache.directoryEntry('1.2.3'), null);
    assert.equal(bioCalls, 0);
    const first = new URL(settingsUrls[0]);
    assert.equal(first.searchParams.get('after_rev'), '0');
    assert.equal(first.searchParams.get('generation'), null);

    settings = [{ accountId: '0.0.2', username: 'two-b', profilePic: 'p2b', topic: '0.0.21' }];
    revision = 3;
    await cache.refresh();
    const second = new URL(settingsUrls[1]);
    assert.equal(second.searchParams.get('generation'), 'gen-a');
    assert.equal(second.searchParams.get('after_rev'), '2');
    assert.equal(cache.resolveAccountTopic('0.0.1'), '0.0.10');
    assert.equal(cache.directoryEntry('0.0.1').username, 'one');
    assert.equal(cache.resolveAccountTopic('0.0.2'), '0.0.21');
    assert.equal(cache.directoryEntry('0.0.2').profilePic, 'p2b');

    generation = 'gen-b';
    revision = 1;
    settings = [{ accountId: '0.0.9', username: 'nine', profilePic: 'p9', topic: '0.0.90' }];
    await cache.refresh();
    assert.equal(cache.resolveAccountTopic('0.0.1'), '');
    assert.equal(cache.directoryEntry('0.0.1'), null);
    assert.equal(cache.resolveAccountTopic('0.0.9'), '0.0.90');
    assert.equal(bioCalls, 0);

    ready = false;
    await cache.refresh();
    assert.equal(cache.resolveAccountTopic('0.0.9'), '0.0.90');
    assert.equal(bioCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('getFollowing uses memory, then Globe, then the saved copy, then mirror pairs', async () => {
  const { dir, file } = tempFile();
  let nowMs = 1_000_000;
  let followingStatus = 200;
  let followingBody = {
    ok: true,
    accounts: [{ id: '0.0.2', username: 'ann', avatar: 'pic' }],
    topics: [{ id: '0.0.9', name: 'Cafe' }],
  };
  let followingCalls = 0;
  const followUrls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/following')) {
      followingCalls += 1;
      if (followingStatus !== 200) return jsonResponse({}, followingStatus);
      return jsonResponse(followingBody);
    }
    if (u.includes('/api/user-settings')) {
      return jsonResponse({
        ready: true,
        generation: 'g',
        revision: 4,
        settings: [
          { accountId: '0.0.2', username: 'dir-ann', profilePic: 'dir-pic', topic: '0.0.50' },
          { accountId: '0.0.3', username: 'bee', profilePic: 'bee.png', topic: '0.0.70' },
        ],
      });
    }
    if (u.includes('0.0.10923187')) {
      followUrls.push(u);
      if (u.includes('sequencenumber=gt:0')) {
        return jsonResponse({
          messages: [
            followMessage('0.0.8', { follow: '0.0.3' }, 5),
            followMessage('0.0.8', { follow: '0.0.3' }, 6),
            followMessage('0.0.8', { follow: '1.2.3' }, 7),
            followMessage('0.0.8', { unfollow: '1.2.3' }, 8),
            followMessage('0.0.8', { unfollow: '0.0.3' }, 9),
            followMessage('0.0.8', { follow: '0.0.3' }, 10),
          ],
          links: {},
        });
      }
      return jsonResponse({ messages: [], links: {} });
    }
    return jsonResponse({ messages: [], links: {} });
  };
  try {
    const cache = createGlobeCache({
      fetchImpl,
      cacheFile: file,
      clock: () => nowMs,
      listProfiles: async () => ({}),
      warn: () => {},
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
    });
    await cache.refresh();
    assert.equal(followUrls[0].includes('sequencenumber=gt:0'), true);

    const globe = await cache.getFollowing('0.0.1');
    assert.equal(globe.source, 'globe');
    assert.equal(followingCalls, 1);
    assert.deepEqual(globe.accounts, [
      { id: '0.0.2', username: 'ann', avatar: 'pic', topic: '0.0.50' },
    ]);
    assert.deepEqual(globe.topics, [{ id: '0.0.9', name: 'Cafe' }]);

    const cached = await cache.getFollowing('0.0.1');
    assert.equal(cached.source, 'cache');
    assert.equal(followingCalls, 1);

    nowMs += 5 * 60 * 1000;
    followingBody = {
      ok: true,
      accounts: [{ id: '0.0.2', username: 'ann2', avatar: 'pic2' }],
      topics: [],
    };
    const again = await cache.getFollowing('0.0.1');
    assert.equal(again.source, 'globe');
    assert.equal(again.accounts[0].username, 'ann2');
    assert.equal(followingCalls, 2);
    const storedAt = nowMs;

    nowMs += 5 * 60 * 1000;
    followingStatus = 429;
    const stale = await cache.getFollowing('0.0.1');
    assert.equal(stale.source, 'cache');
    assert.equal(stale.accounts[0].username, 'ann2');
    assert.equal(stale.topics.length, 0);
    assert.equal(followingCalls, 3);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).following['0.0.1'].at, storedAt);

    const retried = await cache.getFollowing('0.0.1');
    assert.equal(retried.source, 'cache');
    assert.equal(followingCalls, 4);

    const mirror = await cache.getFollowing('0.0.8');
    assert.equal(mirror.source, 'mirror');
    assert.deepEqual(mirror.topics, []);
    assert.deepEqual(mirror.accounts, [{
      id: '0.0.3',
      username: 'bee',
      avatar: 'bee.png',
      topic: '0.0.70',
    }]);
    const mirrorAgain = await cache.getFollowing('0.0.8');
    assert.equal(mirrorAgain.source, 'mirror');
    assert.equal(followingCalls, 6);

    await cache.refresh();
    assert.equal(followUrls.at(-1).includes('sequencenumber=gt:10'), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a refresh does not overlap itself', async () => {
  const { dir, file } = tempFile();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let settingsCalls = 0;
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/user-settings')) {
      settingsCalls += 1;
      await gate;
      return jsonResponse({ ready: true, generation: 'g', revision: 1, settings: [] });
    }
    return jsonResponse({ messages: [], links: {} });
  };
  try {
    const cache = createGlobeCache({
      fetchImpl,
      cacheFile: file,
      warn: () => {},
      listProfiles: async () => ({}),
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
    });
    const first = cache.refresh();
    const second = cache.refresh();
    assert.equal(settingsCalls, 1);
    release();
    await first;
    await second;
    assert.equal(settingsCalls, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a linked directory topic returns its owner and an unlinked topic returns null', async () => {
  const { dir, file } = tempFile();
  let generation = 'g';
  let revision = 1;
  let settings = [
    { accountId: '0.0.1', username: 'alla', profilePic: 'https://example.test/a.png', topic: '0.0.100' },
    { accountId: '0.0.2', username: 'no-topic', profilePic: 'p2', topic: '' },
    { accountId: '0.0.3', username: 'later', profilePic: 'p3', topic: '0.0.100' },
  ];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/api/user-settings')) {
      return jsonResponse({ ready: true, generation, revision, settings });
    }
    return jsonResponse({ messages: [], links: {} });
  };
  try {
    const cache = createGlobeCache({
      fetchImpl,
      cacheFile: file,
      listProfiles: async () => ({}),
      warn: () => {},
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
    });
    assert.equal(cache.accountForTopic('0.0.100'), null);
    await cache.refresh();
    assert.deepEqual(cache.accountForTopic('0.0.100'), {
      accountId: '0.0.1',
      username: 'alla',
      profilePic: 'https://example.test/a.png',
    });
    assert.deepEqual(cache.accountsForTopic('0.0.100'), ['0.0.1', '0.0.3']);
    assert.equal(subscriptionOwner('', cache.directoryEntry('0.0.1')), null);
    assert.deepEqual(subscriptionOwner('0.0.9', null), {
      accountId: '0.0.9',
      username: '',
      profilePic: '',
    });
    assert.equal(cache.accountForTopic('0.0.200'), null);
    assert.deepEqual(cache.accountsForTopic('0.0.200'), []);
    assert.equal(cache.accountForTopic('0.0.2'), null);

    generation = 'g2';
    revision = 1;
    settings = [
      { accountId: '0.0.1', username: 'alla', profilePic: 'https://example.test/b.png', topic: '0.0.101' },
    ];
    await cache.refresh();
    assert.equal(cache.accountForTopic('0.0.100'), null);
    assert.deepEqual(cache.accountForTopic('0.0.101'), {
      accountId: '0.0.1',
      username: 'alla',
      profilePic: 'https://example.test/b.png',
    });
    assert.deepEqual(cache.accountsForTopic('0.0.101'), ['0.0.1']);
    assert.deepEqual(cache.accountsForTopic('0.0.100'), []);

    const loaded = createGlobeCache({
      fetchImpl: async () => {
        throw new Error('loaded cache must not fetch');
      },
      cacheFile: file,
      warn: () => {},
      mirrorUrl: 'https://mirror.test',
      globeUrl: 'https://globe.test',
    });
    assert.deepEqual(loaded.accountForTopic('0.0.101'), {
      accountId: '0.0.1',
      username: 'alla',
      profilePic: 'https://example.test/b.png',
    });
    assert.equal(loaded.accountForTopic('0.0.100'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

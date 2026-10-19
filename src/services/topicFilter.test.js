import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTopicFilter, normalizeRequiredNfts } from './topicFilter.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function filter(over = {}) {
  return {
    filter_mode: 'all',
    allowed_senders: [],
    blocked_senders: [],
    required_nfts: [],
    ...over,
  };
}

test('a blocked sender never notifies, even when they hold a required NFT', async () => {
  let calls = 0;
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ nfts: [{ token_id: '0.0.9' }] });
    },
    mirrorUrl: 'https://mirror.test',
  });
  const sender = { payer: '0.0.5', username: 'ada' };
  const subscription = filter({
    filter_mode: 'allowlist',
    allowed_senders: ['0.0.5'],
    blocked_senders: ['ada'],
    required_nfts: ['0.0.9'],
  });
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 0);
});

test('an allowed sender notifies even when the NFT is missing', async () => {
  let calls = 0;
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('mirror down');
    },
    mirrorUrl: 'https://mirror.test',
  });
  assert.equal(
    await passes(
      filter({
        filter_mode: 'blocklist',
        allowed_senders: ['ada'],
        required_nfts: ['0.0.9'],
      }),
      { payer: '0.0.5', username: 'ada' }
    ),
    true
  );
  assert.equal(calls, 0);
});

test('a holder of a required NFT notifies, including in allowlist mode', async () => {
  const urls = [];
  let now = 1_000_000;
  const { passes } = createTopicFilter({
    fetchImpl: async (url) => {
      urls.push(String(url));
      return jsonResponse({ nfts: [{ token_id: '0.0.9' }] });
    },
    mirrorUrl: 'https://mirror.test',
    clock: () => now,
  });
  const subscription = filter({
    filter_mode: 'allowlist',
    required_nfts: ['0.0.9', '0.0.8'],
  });
  const sender = { payer: '0.0.5', username: '' };
  assert.equal(await passes(subscription, sender), true);
  assert.deepEqual(urls, [
    'https://mirror.test/api/v1/accounts/0.0.5/nfts?token.id=0.0.9&limit=1',
  ]);
  assert.equal(await passes(subscription, sender), true);
  assert.equal(urls.length, 1);
  now += 10 * 60 * 1000;
  assert.equal(await passes(subscription, sender), true);
  assert.equal(urls.length, 2);
});

test('a sender without the NFT does not notify', async () => {
  let calls = 0;
  let now = 1_000_000;
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ nfts: [] });
    },
    mirrorUrl: 'https://mirror.test',
    clock: () => now,
  });
  const subscription = filter({ required_nfts: ['0.0.9', '0.0.8'] });
  const sender = { payer: '0.0.5' };
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 2);
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 2);
  now += 10 * 60 * 1000;
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 4);
});

test('an empty NFT list keeps the allow, block, and open behaviour', async () => {
  let calls = 0;
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ nfts: [{ token_id: '0.0.9' }] });
    },
  });
  const sender = { payer: '0.0.5', username: 'ada' };
  assert.equal(await passes(filter({ filter_mode: 'all' }), sender), true);
  assert.equal(
    await passes(filter({ filter_mode: 'allowlist', allowed_senders: ['ada'] }), sender),
    true
  );
  assert.equal(await passes(filter({ filter_mode: 'allowlist' }), sender), false);
  assert.equal(
    await passes(filter({ filter_mode: 'blocklist', blocked_senders: ['0.0.5'] }), sender),
    false
  );
  assert.equal(await passes(filter({ filter_mode: 'blocklist' }), sender), true);
  assert.equal(calls, 0);
});

test('a mirror error is a miss and is not refetched for a minute', async () => {
  let calls = 0;
  let now = 1_000_000;
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({}, 429);
    },
    mirrorUrl: 'https://mirror.test',
    clock: () => now,
  });
  const subscription = filter({ required_nfts: ['0.0.9', '0.0.8'] });
  const sender = { payer: '0.0.5' };
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 2);
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 2);
  now += 60 * 1000;
  assert.equal(await passes(subscription, sender), false);
  assert.equal(calls, 4);
});

test('two subscribers share one in-flight NFT lookup', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      await gate;
      return jsonResponse({ nfts: [{ token_id: '0.0.9' }] });
    },
    mirrorUrl: 'https://mirror.test',
  });
  const subscription = filter({ required_nfts: ['0.0.9'] });
  const sender = { payer: '0.0.5' };
  const first = passes(subscription, sender);
  const second = passes(subscription, sender);
  release();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(calls, 1);
});

test('a message stops after five lookups or ten seconds', async () => {
  let calls = 0;
  let now = 1_000_000;
  const { passes } = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ nfts: [] });
    },
    mirrorUrl: 'https://mirror.test',
    clock: () => now,
  });
  const tokens = ['0.0.1', '0.0.2', '0.0.3', '0.0.4', '0.0.5', '0.0.6'];
  assert.equal(await passes(filter({ required_nfts: tokens }), { payer: '0.0.5' }), false);
  assert.equal(calls, 5);
  calls = 0;
  assert.equal(await passes(filter({ required_nfts: tokens }), { payer: '0.0.5' }), false);
  assert.equal(calls, 1);

  calls = 0;
  now = 1_000_000;
  const slow = createTopicFilter({
    fetchImpl: async () => {
      calls += 1;
      now += 10_000;
      return jsonResponse({ nfts: [{ token_id: '0.0.1' }] });
    },
    mirrorUrl: 'https://mirror.test',
    clock: () => now,
  });
  assert.equal(
    await slow.passes(filter({ required_nfts: ['0.0.1', '0.0.2'] }), { payer: '0.0.5' }),
    false
  );
  assert.equal(calls, 1);
});

test('the holder cache keeps the newest sender and token pairs', async () => {
  const seen = [];
  let now = 0;
  const { passes, cacheSize } = createTopicFilter({
    fetchImpl: async (url) => {
      seen.push(String(url));
      return jsonResponse({ nfts: [] });
    },
    mirrorUrl: 'https://mirror.test',
    clock: () => {
      now += 1;
      return now;
    },
    cacheLimit: 2,
  });
  await passes(filter({ required_nfts: ['0.0.1'] }), { payer: '0.0.5' });
  await passes(filter({ required_nfts: ['0.0.2'] }), { payer: '0.0.5' });
  await passes(filter({ required_nfts: ['0.0.3'] }), { payer: '0.0.5' });
  assert.equal(cacheSize(), 2);
  const before = seen.length;
  await passes(filter({ required_nfts: ['0.0.3'] }), { payer: '0.0.5' });
  assert.equal(seen.length, before);
  await passes(filter({ required_nfts: ['0.0.1'] }), { payer: '0.0.5' });
  assert.equal(seen.length, before + 1);
});

test('required NFT ids are token ids, deduped, and capped at 20', () => {
  assert.deepEqual(normalizeRequiredNfts([' 0.0.2 ', '0.0.2', '0.0.3']), {
    ok: true,
    ids: ['0.0.2', '0.0.3'],
  });
  assert.equal(normalizeRequiredNfts([]).ok, true);
  assert.equal(normalizeRequiredNfts('0.0.2').ok, false);
  assert.equal(normalizeRequiredNfts(['1.2.3']).ok, false);
  assert.equal(normalizeRequiredNfts(['0.0.2', 'nope']).ok, false);
  assert.equal(normalizeRequiredNfts(Array.from({ length: 21 }, (_, i) => `0.0.${i}`)).ok, false);
  assert.equal(normalizeRequiredNfts(Array.from({ length: 20 }, (_, i) => `0.0.${i}`)).ok, true);
});

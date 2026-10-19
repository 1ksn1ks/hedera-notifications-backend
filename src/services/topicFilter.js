// Shared topic filter. The poller and the live listener both use this.
// 1. A blocked sender never notifies. 2. An allowed sender always notifies.
// 3. A required NFT list notifies only a holder of one of those tokens.
// 4. Otherwise filter_mode decides, so an empty NFT list keeps the old rule.
// In allowlist mode, holding a required NFT passes a sender who is not on the list.

const mirrorHost = process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443';
const isMainnet = mirrorHost.includes('mainnet');
const MIRROR_URL = isMainnet
  ? 'https://mainnet-public.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

const TOKEN_ID = /^0\.0\.\d+$/;
const MAX_REQUIRED_NFTS = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 20000;
const FETCH_TIMEOUT_MS = 8000;

export function normalizeRequiredNfts(value) {
  if (!Array.isArray(value)) return { ok: false, error: 'Invalid token id' };
  const ids = [];
  const seen = new Set();
  for (const item of value) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!TOKEN_ID.test(id)) return { ok: false, error: 'Invalid token id' };
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length > MAX_REQUIRED_NFTS) return { ok: false, error: 'At most 20 token ids' };
  }
  return { ok: true, ids };
}

function listed(list, payer, username) {
  if (!Array.isArray(list) || list.length === 0) return false;
  if (payer && list.includes(payer)) return true;
  if (username && list.includes(username)) return true;
  return false;
}

export function createTopicFilter({
  fetchImpl = globalThis.fetch,
  mirrorUrl = MIRROR_URL,
  clock = () => Date.now(),
  timeoutMs = FETCH_TIMEOUT_MS,
  cacheTtlMs = CACHE_TTL_MS,
  cacheLimit = CACHE_LIMIT,
} = {}) {
  const cache = new Map();

  function prune(nowMs) {
    for (const [key, entry] of cache) {
      if (nowMs - entry.at >= cacheTtlMs) cache.delete(key);
    }
    if (cache.size <= cacheLimit) return;
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [key] of oldest) {
      if (cache.size <= cacheLimit) break;
      cache.delete(key);
    }
  }

  async function fetchHolds(accountId, tokenId) {
    const controller = new AbortController();
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        controller.abort();
        reject(new Error('Timed out'));
      }, timeoutMs);
    });
    const url = `${mirrorUrl}/api/v1/accounts/${encodeURIComponent(accountId)}/nfts?token.id=${encodeURIComponent(tokenId)}&limit=1`;
    try {
      const res = await Promise.race([
        fetchImpl(url, { signal: controller.signal }),
        timeout,
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await Promise.race([res.json(), timeout]);
      if (!json || !Array.isArray(json.nfts)) throw new Error('Bad NFT response');
      return json.nfts.length > 0;
    } finally {
      clearTimeout(timerId);
    }
  }

  async function holdsToken(accountId, tokenId) {
    const nowMs = clock();
    const key = `${accountId}\n${tokenId}`;
    const cached = cache.get(key);
    if (cached) {
      if (nowMs - cached.at < cacheTtlMs) return cached.holds;
      cache.delete(key);
    }
    const holds = await fetchHolds(accountId, tokenId);
    cache.set(key, { holds, at: clock() });
    if (cache.size > cacheLimit) prune(clock());
    return holds;
  }

  async function holdsAny(accountId, tokenIds) {
    if (!TOKEN_ID.test(accountId)) return false;
    for (const tokenId of tokenIds) {
      if (!TOKEN_ID.test(tokenId)) continue;
      if (await holdsToken(accountId, tokenId)) return true;
    }
    return false;
  }

  async function passes(subscription, sender) {
    const payer = sender && typeof sender.payer === 'string' ? sender.payer : '';
    const username = sender && typeof sender.username === 'string' ? sender.username : '';
    const allowed = subscription?.allowed_senders || [];
    const blocked = subscription?.blocked_senders || [];
    const required = subscription?.required_nfts || [];
    const mode = subscription?.filter_mode || 'all';
    if (listed(blocked, payer, username)) return false;
    if (listed(allowed, payer, username)) return true;
    if (required.length > 0) {
      try {
        return await holdsAny(payer, required);
      } catch {
        return false;
      }
    }
    if (mode === 'allowlist') return false;
    return true;
  }

  return { passes, cacheSize: () => cache.size };
}

const topicFilter = createTopicFilter();

export function passesTopicFilter(subscription, sender) {
  return topicFilter.passes(subscription, sender);
}

// Cached public Hedera Globe data. The phone reads this process.
// A mirror walk refills an empty directory, and keeps follow pairs and
// profile topics for when Globe's following route is unavailable.
import fs from 'fs';
import path from 'path';
import { backfillViaAccounts, dbPath } from '../utils/db.js';

export const GLOBE_API_URL = process.env.GLOBE_API_URL || 'https://onlyonhbar.com';

const mirrorHost = process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443';
const isMainnet = mirrorHost.includes('mainnet');
export const MIRROR_URL = isMainnet
  ? 'https://mainnet-public.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

const BIO_TOPIC = '0.0.9759201';
const FOLLOW_TOPIC = '0.0.10923187';
const ACCOUNT_ID = /^0\.0\.\d+$/;
const TOPIC_ID = /^\d+\.\d+\.\d+$/;
const FOLLOWING_CAP = 5000;
const PAGE_CAP = 200;
const JOB_TIMEOUT_MS = 8000;
const FOLLOWING_TIMEOUT_MS = 4000;
const FOLLOWING_TTL_MS = 5 * 60 * 1000;
const REFRESH_MS = 10 * 60 * 1000;

export function isAccountId(id) {
  return ACCOUNT_ID.test(String(id ?? ''));
}

// keep in sync with step_by_step/server/profiletopic.js
export function profileTopicAction(data) {
  if (!data || typeof data !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(data, 'clearProfileTopic')) {
    return { action: 'clear' };
  }
  if (Object.prototype.hasOwnProperty.call(data, 'profileTopic')) {
    const topic = typeof data.profileTopic === 'string' ? data.profileTopic.trim() : '';
    if (TOPIC_ID.test(topic)) return { action: 'set', topic };
    if (!topic) return { action: 'clear' };
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'topic2pic')) {
    const raw = Array.isArray(data.topic2pic) ? data.topic2pic[0] : data.topic2pic;
    const topic = typeof raw === 'string' ? raw.trim() : '';
    if (TOPIC_ID.test(topic)) return { action: 'set', topic };
    if (!topic) return { action: 'clear' };
  }
  return null;
}

function objectMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function profileLinksFrom(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [id, row] of Object.entries(value)) {
    if (!ACCOUNT_ID.test(id) || !row || typeof row !== 'object') continue;
    const topic = typeof row.topic === 'string' ? row.topic.trim() : '';
    out[id] = {
      topic: TOPIC_ID.test(topic) ? topic : '',
      seq: Math.max(0, Math.floor(Number(row.seq) || 0)),
    };
  }
  return out;
}

function emptyState() {
  return {
    version: 1,
    builtAt: '',
    directory: { generation: '', revision: 0, accounts: {} },
    followSeq: 0,
    followPairs: {},
    profileSeq: 0,
    profileLinks: {},
    following: {},
  };
}

function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}

function defaultCacheFile() {
  return path.join(path.dirname(dbPath), 'globe-cache.json');
}

async function defaultListProfiles() {
  const { usernameService } = await import('./usernameService.js');
  return usernameService.listProfiles();
}

export function createGlobeCache({
  fetchImpl = globalThis.fetch,
  cacheFile = defaultCacheFile(),
  mirrorUrl = MIRROR_URL,
  globeUrl = GLOBE_API_URL,
  now = () => new Date().toISOString(),
  clock = () => Date.now(),
  listProfiles,
  pageCap = PAGE_CAP,
  warn = (message) => console.warn(message),
  intervalMs = REFRESH_MS,
  followingTtlMs = FOLLOWING_TTL_MS,
  jobTimeoutMs = JOB_TIMEOUT_MS,
  followingTimeoutMs = FOLLOWING_TIMEOUT_MS,
  backfillOwners = null,
} = {}) {
  const state = loadState();
  let ownersByTopic = new Map();
  let linksByTopic = new Map();
  let ownersBackfilled = false;
  let running = null;
  let timer = null;

  function loadState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (!parsed || parsed.version !== 1 || !parsed.directory) return emptyState();
      const directory = parsed.directory;
      return {
        version: 1,
        builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : '',
        directory: {
          generation: typeof directory.generation === 'string' ? directory.generation : '',
          revision: Math.max(0, Math.floor(Number(directory.revision) || 0)),
          accounts: objectMap(directory.accounts),
        },
        followSeq: Math.max(0, Math.floor(Number(parsed.followSeq) || 0)),
        followPairs: objectMap(parsed.followPairs),
        profileSeq: Math.max(0, Math.floor(Number(parsed.profileSeq) || 0)),
        profileLinks: profileLinksFrom(parsed.profileLinks),
        following: objectMap(parsed.following),
      };
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        warn(`Globe cache load failed; starting empty. ${errorText(err)}`);
      }
      return emptyState();
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      const tmp = `${cacheFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, cacheFile);
    } catch (err) {
      warn(`Globe cache save failed; keeping the previous file. ${errorText(err)}`);
    }
  }

  function capFollowing() {
    const entries = Object.entries(state.following);
    if (entries.length <= FOLLOWING_CAP) return;
    entries.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    for (const [id] of entries.slice(0, entries.length - FOLLOWING_CAP)) {
      delete state.following[id];
    }
  }

  async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      const res = await Promise.race([
        fetchImpl(url, { signal: controller.signal }),
        timeout,
      ]);
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return await Promise.race([res.json(), timeout]);
    } finally {
      clearTimeout(timerId);
    }
  }

  async function pullSettings() {
    const generation = state.directory.generation;
    const revision = state.directory.revision;
    const params = new URLSearchParams();
    if (generation && revision > 0) {
      params.set('generation', generation);
      params.set('after_rev', String(revision));
    } else {
      params.set('after_rev', '0');
    }
    let json;
    try {
      json = await fetchJson(`${globeUrl}/api/user-settings?${params}`, jobTimeoutMs);
    } catch (err) {
      warn(`Globe settings pull failed; keeping the previous directory. ${errorText(err)}`);
      return false;
    }
    if (!json || json.ready !== true) {
      warn('Globe user settings were not ready; keeping the previous directory.');
      return false;
    }
    const nextGeneration = json.generation == null ? '' : String(json.generation);
    const nextRevision = Math.max(0, Math.floor(Number(json.revision) || 0));
    // after_rev 0 and a generation change both return the full directory.
    const full = !generation || nextGeneration !== generation || !(revision > 0);
    const accounts = full ? {} : { ...state.directory.accounts };
    const rows = Array.isArray(json.settings) ? json.settings : [];
    for (const row of rows) {
      if (!row || typeof row.accountId !== 'string' || !ACCOUNT_ID.test(row.accountId)) continue;
      const topicRaw = typeof row.topic === 'string' ? row.topic.trim() : '';
      accounts[row.accountId] = {
        username: typeof row.username === 'string' ? row.username : '',
        profilePic: typeof row.profilePic === 'string' ? row.profilePic : '',
        topic: TOPIC_ID.test(topicRaw) ? topicRaw : '',
      };
    }
    state.directory = { generation: nextGeneration, revision: nextRevision, accounts };
    indexDirectory();
    state.builtAt = now();
    persist();
    return true;
  }

  async function readAllPages(firstPath) {
    let next = firstPath;
    const rows = [];
    for (let page = 0; page < pageCap; page += 1) {
      if (!next) return { rows, cutOff: false };
      const url = next.startsWith('http') ? next : `${mirrorUrl}${next}`;
      const json = await fetchJson(url, jobTimeoutMs);
      if (Array.isArray(json.messages)) rows.push(...json.messages);
      next = json.links && json.links.next ? String(json.links.next) : '';
    }
    return { rows, cutOff: Boolean(next) };
  }

  async function rebuildDirectory() {
    const { rows, cutOff } = await readAllPages(
      `/api/v1/topics/${BIO_TOPIC}/messages?limit=100&order=asc`
    );
    if (cutOff) throw new Error('Globe bio topic was cut off');
    const links = new Map();
    for (const msg of rows) {
      const payer = msg && msg.payer_account_id;
      if (typeof payer !== 'string' || !TOPIC_ID.test(payer)) continue;
      let parsed;
      try {
        parsed = JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'));
      } catch {
        continue;
      }
      const data = parsed && typeof parsed === 'object' ? parsed.data : null;
      const action = profileTopicAction(data);
      if (!action) continue;
      if (action.action === 'set') links.set(payer, action.topic);
      else if (action.action === 'clear') links.delete(payer);
    }
    const profiles = (listProfiles ? await listProfiles() : await defaultListProfiles()) || {};
    const accounts = {};
    for (const [id, topic] of links) {
      const profile = profiles[id] || {};
      accounts[id] = {
        username: typeof profile.username === 'string' ? profile.username : '',
        profilePic: typeof profile.profilePic === 'string' ? profile.profilePic : '',
        topic,
      };
    }
    state.directory = {
      generation: state.directory.generation,
      revision: state.directory.revision,
      accounts,
    };
    indexDirectory();
    state.builtAt = now();
    persist();
  }

  function applyFollow(msg) {
    if (!msg || typeof msg !== 'object') return false;
    let changed = false;
    const seq = Number(msg.sequence_number);
    if (Number.isFinite(seq) && seq > state.followSeq) {
      state.followSeq = seq;
      changed = true;
    }
    const payer = msg.payer_account_id;
    if (typeof payer !== 'string' || !TOPIC_ID.test(payer)) return changed;
    let data;
    try {
      data = JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'));
    } catch {
      return changed;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return changed;
    if (typeof data.follow === 'string' && TOPIC_ID.test(data.follow)) {
      const list = Array.isArray(state.followPairs[payer]) ? state.followPairs[payer].slice() : [];
      if (!list.includes(data.follow)) list.push(data.follow);
      state.followPairs[payer] = list;
      return true;
    }
    if (typeof data.unfollow === 'string' && TOPIC_ID.test(data.unfollow)) {
      const list = (state.followPairs[payer] || []).filter((id) => id !== data.unfollow);
      if (list.length === 0) delete state.followPairs[payer];
      else state.followPairs[payer] = list;
      return true;
    }
    return changed;
  }

  async function pullFollows() {
    let next = `/api/v1/topics/${FOLLOW_TOPIC}/messages?limit=100&order=asc&sequencenumber=gt:${state.followSeq}`;
    let pages = 0;
    let changed = false;
    try {
      while (next && pages < pageCap) {
        const url = next.startsWith('http') ? next : `${mirrorUrl}${next}`;
        const json = await fetchJson(url, jobTimeoutMs);
        for (const msg of json.messages || []) {
          if (applyFollow(msg)) changed = true;
        }
        next = json.links && json.links.next ? String(json.links.next) : '';
        pages += 1;
      }
    } catch (err) {
      if (changed) {
        state.builtAt = now();
        persist();
      }
      warn(`Globe follow mirror read stopped early; keeping the pairs already applied. ${errorText(err)}`);
      return;
    }
    if (next) {
      warn('Globe follow topic was cut off; the next refresh continues from the last sequence.');
    }
    if (changed) {
      state.builtAt = now();
      persist();
    }
  }

  // Profile topic 0.0.9759201. { data: { profileTopic } } sets,
  // { data: { clearProfileTopic: "1" } } clears. The newest message for
  // an account wins. The next read starts after the last sequence.
  function applyProfile(msg) {
    if (!msg || typeof msg !== 'object') return false;
    let changed = false;
    const seq = Number(msg.sequence_number);
    if (Number.isFinite(seq) && seq > state.profileSeq) {
      state.profileSeq = seq;
      changed = true;
    }
    const payer = msg.payer_account_id;
    if (typeof payer !== 'string' || !ACCOUNT_ID.test(payer)) return changed;
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'));
    } catch {
      return changed;
    }
    const data = parsed && typeof parsed === 'object' ? parsed.data : null;
    const action = profileTopicAction(data);
    if (!action || !Number.isFinite(seq)) return changed;
    const prev = state.profileLinks[payer];
    if (prev && seq < prev.seq) return changed;
    state.profileLinks[payer] = {
      topic: action.action === 'set' ? action.topic : '',
      seq,
    };
    return true;
  }

  async function pullProfiles() {
    let next = `/api/v1/topics/${BIO_TOPIC}/messages?limit=100&order=asc&sequencenumber=gt:${state.profileSeq}`;
    let pages = 0;
    let changed = false;
    try {
      while (next && pages < pageCap) {
        const url = next.startsWith('http') ? next : `${mirrorUrl}${next}`;
        const json = await fetchJson(url, jobTimeoutMs);
        for (const msg of json.messages || []) {
          if (applyProfile(msg)) changed = true;
        }
        next = json.links && json.links.next ? String(json.links.next) : '';
        pages += 1;
      }
    } catch (err) {
      if (changed) {
        state.builtAt = now();
        persist();
      }
      warn(`Globe profile mirror read stopped early; keeping the links already applied. ${errorText(err)}`);
      return;
    }
    if (next) {
      warn('Globe profile topic was cut off; the next refresh continues from the last sequence.');
    }
    if (changed) {
      state.builtAt = now();
      persist();
    }
  }

  async function doRefresh() {
    let settingsOk = false;
    try {
      settingsOk = await pullSettings();
    } catch (err) {
      warn(`Globe settings pull failed; keeping the previous directory. ${errorText(err)}`);
    }
    if (!settingsOk && Object.keys(state.directory.accounts).length === 0) {
      try {
        await rebuildDirectory();
      } catch (err) {
        warn(`Globe topic links were not rebuilt; keeping the previous directory. ${errorText(err)}`);
      }
    }
    try {
      await pullFollows();
    } catch (err) {
      warn(`Globe follow mirror read failed; keeping the previous pairs. ${errorText(err)}`);
    }
    try {
      await pullProfiles();
    } catch (err) {
      warn(`Globe profile mirror read failed; keeping the previous links. ${errorText(err)}`);
    }
    backfillOwnersOnce();
  }

  function refresh() {
    if (running) return running;
    running = doRefresh().finally(() => {
      running = null;
    });
    return running;
  }

  function start() {
    if (timer) return;
    void refresh();
    timer = setInterval(() => {
      void refresh();
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function topicFor(id) {
    const row = state.directory.accounts[id];
    const topic = row && typeof row.topic === 'string' ? row.topic : '';
    return TOPIC_ID.test(topic) ? topic : '';
  }

  // One displayed owner per topic. The first directory account keeps it.
  // linksByTopic keeps every account so a shared topic is not treated as unique.
  function indexDirectory() {
    const next = new Map();
    const links = new Map();
    for (const accountId of Object.keys(state.directory.accounts)) {
      const topic = topicFor(accountId);
      if (!topic) continue;
      const list = links.get(topic);
      if (list) list.push(accountId);
      else links.set(topic, [accountId]);
      if (next.has(topic)) continue;
      const row = state.directory.accounts[accountId] || {};
      next.set(topic, {
        accountId,
        username: typeof row.username === 'string' ? row.username : '',
        profilePic: typeof row.profilePic === 'string' ? row.profilePic : '',
      });
    }
    ownersByTopic = next;
    linksByTopic = links;
  }

  function accountForTopic(topicId) {
    if (typeof topicId !== 'string' || !TOPIC_ID.test(topicId)) return null;
    return ownersByTopic.get(topicId) || null;
  }

  function accountsForTopic(topicId) {
    if (typeof topicId !== 'string' || !TOPIC_ID.test(topicId)) return [];
    const list = linksByTopic.get(topicId);
    return list ? list.slice() : [];
  }

  function backfillOwnersOnce() {
    if (ownersBackfilled || typeof backfillOwners !== 'function') return;
    if (Object.keys(state.directory.accounts).length === 0) return;
    ownersBackfilled = true;
    try {
      backfillOwners(accountsForTopic);
    } catch (err) {
      ownersBackfilled = false;
      warn(`Subscription owner backfill failed. ${errorText(err)}`);
    }
  }

  indexDirectory();

  function profileTopicOf(accountId) {
    const row = state.profileLinks[accountId];
    if (!row) return null;
    return TOPIC_ID.test(row.topic) ? row.topic : '';
  }

  // The account whose newest profile link still points at this topic.
  function ownerOfTopic(topicId) {
    if (typeof topicId !== 'string' || !TOPIC_ID.test(topicId)) return '';
    let owner = '';
    let best = -1;
    for (const [accountId, row] of Object.entries(state.profileLinks)) {
      if (!row || row.topic !== topicId) continue;
      const seq = Number(row.seq) || 0;
      if (seq >= best) {
        best = seq;
        owner = accountId;
      }
    }
    return owner;
  }

  function present(accounts, topics, source) {
    return {
      accounts: (accounts || []).map((account) => ({
        id: String(account.id || ''),
        username: account.username || '',
        avatar: account.avatar || '',
        topic: typeof account.topic === 'string'
          ? (TOPIC_ID.test(account.topic) ? account.topic : '')
          : topicFor(account.id),
      })),
      topics: (topics || []).map((topic) => ({
        id: String(topic.id || ''),
        name: topic.name || '',
      })),
      source,
    };
  }

  function storedFollowing(account) {
    const entry = state.following[account];
    if (!entry || typeof entry.at !== 'number') return null;
    if (!Array.isArray(entry.accounts) || !Array.isArray(entry.topics)) return null;
    return entry;
  }

  function withCurrentTopic(accounts) {
    return (accounts || []).map((account) => {
      const topic = profileTopicOf(account.id);
      if (topic == null) return account;
      return { ...account, topic };
    });
  }

  function mirrorFollowing(account) {
    const ids = Array.isArray(state.followPairs[account]) ? state.followPairs[account] : [];
    const seen = new Set();
    const accounts = [];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      // An old follow of a topic becomes a follow of whoever holds it now.
      const owner = ownerOfTopic(id);
      const accountId = owner || id;
      if (seen.has(accountId)) continue;
      seen.add(accountId);
      const row = state.directory.accounts[accountId] || {};
      const topic = profileTopicOf(accountId);
      const item = {
        id: accountId,
        username: row.username || '',
        avatar: row.profilePic || '',
      };
      if (topic != null) item.topic = topic;
      accounts.push(item);
    }
    return accounts;
  }

  async function getFollowing(account) {
    const entry = storedFollowing(account);
    if (entry && clock() - entry.at < followingTtlMs) {
      return present(entry.accounts, entry.topics, 'cache');
    }
    try {
      const json = await fetchJson(
        `${globeUrl}/api/following?account=${encodeURIComponent(account)}`,
        followingTimeoutMs
      );
      if (json && json.ok === true) {
        const accounts = (Array.isArray(json.accounts) ? json.accounts : [])
          .map((row) => ({
            id: row && row.id != null ? String(row.id) : '',
            username: row && typeof row.username === 'string' ? row.username : '',
            avatar: row && typeof row.avatar === 'string' ? row.avatar : '',
          }))
          .filter((row) => row.id);
        const topics = (Array.isArray(json.topics) ? json.topics : [])
          .map((row) => ({
            id: row && row.id != null ? String(row.id) : '',
            name: row && typeof row.name === 'string' ? row.name : '',
          }))
          .filter((row) => row.id);
        state.following[account] = { at: clock(), accounts, topics };
        capFollowing();
        state.builtAt = now();
        persist();
        return present(accounts, topics, 'globe');
      }
      warn('Globe following lookup was not ok; serving the saved copy.');
    } catch (err) {
      warn(`Globe following lookup failed. ${errorText(err)}`);
    }
    if (entry) return present(withCurrentTopic(entry.accounts), entry.topics, 'cache');
    return present(mirrorFollowing(account), [], 'mirror');
  }

  function resolveAccountTopic(id) {
    return topicFor(id);
  }

  function directoryEntry(id) {
    const row = state.directory.accounts[id];
    if (!row) return null;
    return {
      username: typeof row.username === 'string' ? row.username : '',
      profilePic: typeof row.profilePic === 'string' ? row.profilePic : '',
      topic: topicFor(id),
    };
  }

  async function mirrorAccountExists(id) {
    try {
      const json = await fetchJson(`${mirrorUrl}/api/v1/accounts/${id}`, jobTimeoutMs);
      return Boolean(json && (json.account || json.account_id));
    } catch {
      return false;
    }
  }

  return {
    refresh,
    start,
    getFollowing,
    resolveAccountTopic,
    directoryEntry,
    mirrorAccountExists,
    accountForTopic,
    accountsForTopic,
  };
}

export function subscriptionOwner(viaAccount, entry) {
  const accountId = typeof viaAccount === 'string' ? viaAccount.trim() : '';
  if (!accountId) return null;
  const row = entry && typeof entry === 'object' ? entry : {};
  return {
    accountId,
    username: typeof row.username === 'string' ? row.username : '',
    profilePic: typeof row.profilePic === 'string' ? row.profilePic : '',
  };
}

const globe = createGlobeCache({ backfillOwners: backfillViaAccounts });

export function startGlobeCache() {
  globe.start();
}

export function getFollowing(account) {
  return globe.getFollowing(account);
}

export function resolveAccountTopic(id) {
  return globe.resolveAccountTopic(id);
}

export function directoryEntry(id) {
  return globe.directoryEntry(id);
}

export function accountForTopic(topicId) {
  return globe.accountForTopic(topicId);
}

export function accountsForTopic(topicId) {
  return globe.accountsForTopic(topicId);
}

export function mirrorAccountExists(id) {
  return globe.mirrorAccountExists(id);
}

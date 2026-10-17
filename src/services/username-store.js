// Profile reads time out, and SQLite is replaced only after both topics load.
// Tests pass their own database. This file does not open notifier.db.
export const FETCH_TIMEOUT_MS = 8000;
const PAGE_CAP = 200;

const USERNAME_TOPIC = '0.0.9609904';
const PICTURE_TOPIC = '0.0.9609881';

function dataOf(parsed) {
  if (!parsed || typeof parsed !== 'object') return {};
  const data = parsed.data;
  return data && typeof data === 'object' ? data : {};
}

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : '';
}

export function ensureProfileTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      account_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      profile_pic TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `);
}

export function withTransaction(database, run) {
  database.exec('BEGIN IMMEDIATE');
  try {
    run();
    database.exec('COMMIT');
  } catch (err) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // The transaction is already closed.
    }
    throw err;
  }
}

export function readStoredProfiles(database) {
  ensureProfileTable(database);
  const names = {};
  const pictures = {};
  const rows = database.prepare(
    'SELECT account_id, username, profile_pic FROM profiles'
  ).all();
  for (const row of rows) {
    if (row.username) names[row.account_id] = row.username;
    if (row.profile_pic) pictures[row.account_id] = row.profile_pic;
  }
  return { names, pictures };
}

export function replaceProfiles(database, profiles, nowIso) {
  ensureProfileTable(database);
  withTransaction(database, () => {
    database.prepare('DELETE FROM profiles').run();
    const insert = database.prepare(`
      INSERT INTO profiles (account_id, username, profile_pic, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const [accountId, profile] of Object.entries(profiles)) {
      insert.run(accountId, profile.username || '', profile.profilePic || '', nowIso);
    }
  });
}

function combinedProfiles(names, pictures) {
  const profiles = {};
  const ids = new Set([...Object.keys(names), ...Object.keys(pictures)]);
  for (const id of ids) {
    profiles[id] = {
      username: names[id] || '',
      profilePic: pictures[id] || '',
    };
  }
  return profiles;
}

export function profilesFromRows(nameRows, picRows) {
  const names = {};
  for (const msg of nameRows) {
    const payer = msg.payer_account_id;
    if (!payer || names[payer]) continue;
    try {
      const parsed = JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'));
      const username = dataOf(parsed).username;
      if (typeof username === 'string' && username.length > 0 && username.length < 20) {
        names[payer] = username;
      }
    } catch {
      // A profile topic also carries other payloads. Skip those.
    }
  }

  const pictures = {};
  for (const msg of picRows) {
    const payer = msg.payer_account_id;
    if (!payer || pictures[payer]) continue;
    try {
      const parsed = JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'));
      const urls = dataOf(parsed).urls;
      const url = Array.isArray(urls) ? httpUrl(urls[0]) : '';
      if (url) pictures[payer] = url;
    } catch {
      // Skip messages that are not a profile picture.
    }
  }
  return { names, pictures };
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
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
      throw new Error(`Profile request failed: ${res.status}`);
    }
    return await Promise.race([res.json(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readTopicPages(topicId, { mirrorUrl, fetchImpl, timeoutMs, pageCap = PAGE_CAP }) {
  let path = `/api/v1/topics/${topicId}/messages?limit=100&order=desc`;
  const rows = [];
  for (let page = 0; page < pageCap; page += 1) {
    if (!path) return rows;
    const url = path.startsWith('http') ? path : mirrorUrl + path;
    const json = await fetchJson(url, fetchImpl, timeoutMs);
    rows.push(...(json.messages || []));
    path = json.links?.next || '';
  }
  if (path) throw new Error(`Profile topic ${topicId} was cut off`);
  return rows;
}

/**
 * Fetch both profile topics, then replace SQLite in one transaction.
 * On any failure the previous rows stay and a warning is logged.
 */
export async function loadAndStoreProfiles(database, {
  mirrorUrl,
  fetchImpl,
  timeoutMs = FETCH_TIMEOUT_MS,
  pageCap = PAGE_CAP,
  nowIso = new Date().toISOString(),
  warn = (message) => console.warn(message),
} = {}) {
  let loaded;
  try {
    const [nameRows, picRows] = await Promise.all([
      readTopicPages(USERNAME_TOPIC, { mirrorUrl, fetchImpl, timeoutMs, pageCap }),
      readTopicPages(PICTURE_TOPIC, { mirrorUrl, fetchImpl, timeoutMs, pageCap }),
    ]);
    loaded = profilesFromRows(nameRows, picRows);
  } catch (err) {
    warn(`Profile load failed; keeping the previous usernames. ${err instanceof Error ? err.message : err}`);
    return { ok: false };
  }

  const empty = Object.keys(loaded.names).length === 0 && Object.keys(loaded.pictures).length === 0;
  let existing = { names: {}, pictures: {} };
  try {
    existing = readStoredProfiles(database);
  } catch (err) {
    warn(`Profile save failed; keeping the previous usernames. ${err instanceof Error ? err.message : err}`);
    return { ok: false };
  }
  const hadRows = Object.keys(existing.names).length > 0 || Object.keys(existing.pictures).length > 0;
  if (empty && hadRows) {
    warn('Profile topics returned nothing; keeping the previous usernames.');
    return { ok: false, kept: true };
  }

  try {
    replaceProfiles(database, combinedProfiles(loaded.names, loaded.pictures), nowIso);
  } catch (err) {
    warn(`Profile save failed; keeping the previous usernames. ${err instanceof Error ? err.message : err}`);
    return { ok: false };
  }
  return { ok: true, names: loaded.names, pictures: loaded.pictures };
}

export class UsernameService {
  constructor({ database, fetchImpl, timeoutMs = FETCH_TIMEOUT_MS, mirrorUrl, now = () => new Date().toISOString() }) {
    this.database = database;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.mirrorUrl = mirrorUrl;
    this.now = now;
    this.accountUsernames = {};
    this.accountPictures = {};
    this.lastLoaded = 0;
    this.CACHE_TTL = 5 * 60 * 1000;
    this.loading = null;
    try {
      const stored = readStoredProfiles(database);
      this.accountUsernames = stored.names;
      this.accountPictures = stored.pictures;
    } catch (err) {
      console.warn('Could not read stored profiles:', err instanceof Error ? err.message : err);
    }
  }

  cacheFresh() {
    return (
      Date.now() - this.lastLoaded < this.CACHE_TTL &&
      (Object.keys(this.accountUsernames).length > 0 ||
        Object.keys(this.accountPictures).length > 0)
    );
  }

  async loadProfiles() {
    if (this.cacheFresh()) return;
    if (!this.loading) {
      this.loading = this.fetchProfiles().finally(() => {
        this.loading = null;
      });
    }
    await this.loading;
  }

  async fetchProfiles() {
    const result = await loadAndStoreProfiles(this.database, {
      mirrorUrl: this.mirrorUrl,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      nowIso: this.now(),
    });
    if (!result.ok) {
      if (result.kept) this.lastLoaded = Date.now();
      return;
    }
    this.accountUsernames = result.names;
    this.accountPictures = result.pictures;
    this.lastLoaded = Date.now();
    console.log(
      `Loaded ${Object.keys(result.names).length} usernames and ${Object.keys(result.pictures).length} profile pictures`
    );
  }

  async loadUsernames() {
    await this.loadProfiles();
    return this.accountUsernames;
  }

  async getProfile(accountId) {
    await this.loadProfiles();
    if (!accountId) return { username: null, profilePic: null };
    return {
      username: this.accountUsernames[accountId] || null,
      profilePic: this.accountPictures[accountId] || null,
    };
  }

  async getUsername(accountId) {
    const profile = await this.getProfile(accountId);
    return profile.username;
  }

  async formatSender(accountId) {
    if (!accountId) return null;
    const username = await this.getUsername(accountId);
    return username ? `${username} (${accountId})` : accountId;
  }

  async listProfiles() {
    await this.loadProfiles();
    const ids = new Set([
      ...Object.keys(this.accountUsernames),
      ...Object.keys(this.accountPictures),
    ]);
    const profiles = {};
    for (const id of ids) {
      profiles[id] = {
        username: this.accountUsernames[id] || '',
        profilePic: this.accountPictures[id] || '',
      };
    }
    return profiles;
  }
}

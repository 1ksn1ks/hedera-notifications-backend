// Same profile topics Meritocracy uses. Latest valid message per account wins.
// Username topic 0.0.9609904 stores { data: { username } }, under 20 characters.
// Picture topic 0.0.9609881 stores { data: { urls: [image] } }.
const mirrorHost = process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443';
const isMainnet = mirrorHost.includes('mainnet');
const MIRROR_URL = isMainnet
  ? 'https://mainnet-public.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

const USERNAME_TOPIC = '0.0.9609904';
const PICTURE_TOPIC = '0.0.9609881';
export const DEFAULT_AVATAR =
  'https://kiloscribe.com/api/inscription-cdn/0.0.4819119';

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

async function readTopic(topicId) {
  let path = `/api/v1/topics/${topicId}/messages?limit=100&order=desc`;
  const rows = [];
  for (let page = 0; page < 200 && path; page += 1) {
    const url = path.startsWith('http') ? path : MIRROR_URL + path;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to load ${topicId}: ${res.status}`);
      break;
    }
    const json = await res.json();
    rows.push(...(json.messages || []));
    path = json.links?.next || '';
  }
  return rows;
}

class UsernameService {
  constructor() {
    this.accountUsernames = {};
    this.accountPictures = {};
    this.lastLoaded = 0;
    this.CACHE_TTL = 5 * 60 * 1000;
    this.loading = null;
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
    let nameRows = [];
    let picRows = [];
    try {
      [nameRows, picRows] = await Promise.all([
        readTopic(USERNAME_TOPIC),
        readTopic(PICTURE_TOPIC),
      ]);
    } catch (err) {
      console.error('Error loading profiles:', err.message);
      return;
    }

    if (
      nameRows.length === 0 &&
      picRows.length === 0 &&
      Object.keys(this.accountUsernames).length > 0
    ) {
      return;
    }

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

    this.accountUsernames = names;
    this.accountPictures = pictures;
    this.lastLoaded = Date.now();
    console.log(
      `Loaded ${Object.keys(names).length} usernames and ${Object.keys(pictures).length} profile pictures`
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

export const usernameService = new UsernameService();

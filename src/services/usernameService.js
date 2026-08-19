const isMainnet = process.env.MIRROR_NODE_URL?.includes('mainnet');
const MIRROR_URL = isMainnet
  ? 'https://mainnet-public.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

const USERNAME_TOPIC = '0.0.9609904';

class UsernameService {
  constructor() {
    this.accountUsernames = {}; // { "0.0.12345": "alice" }
    this.lastLoaded = 0;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this.isLoading = false;
  }

  async loadUsernames() {
    const now = Date.now();

    // Return cache if still fresh
    if (
      now - this.lastLoaded < this.CACHE_TTL &&
      Object.keys(this.accountUsernames).length > 0
    ) {
      return this.accountUsernames;
    }

    // Prevent multiple parallel loads
    if (this.isLoading) {
      return this.accountUsernames;
    }

    this.isLoading = true;

    try {
      const url = `${MIRROR_URL}/api/v1/topics/${USERNAME_TOPIC}/messages?order=desc&limit=100`;
      const res = await fetch(url);

      if (!res.ok) {
        console.error('Failed to load usernames:', res.status);
        return this.accountUsernames;
      }

      const json = await res.json();
      const messages = json.messages || [];

      const map = {};

      for (const msg of messages) {
        try {
          const content = Buffer.from(msg.message, 'base64').toString('utf8');
          const parsed = JSON.parse(content);

          const payer = msg.payer_account_id;
          const username =
            parsed.username ||
            parsed.data?.username ||
            parsed.name ||
            null;

          if (payer && username && typeof username === 'string' && username.length < 30) {
            // Because we load newest first, only set if not already present
            if (!map[payer]) {
              map[payer] = username;
            }
          }
        } catch (e) {
          // skip invalid messages
        }
      }

      this.accountUsernames = map;
      this.lastLoaded = Date.now();
      console.log(`✅ Loaded ${Object.keys(map).length} usernames`);
    } catch (err) {
      console.error('Error loading usernames:', err.message);
    } finally {
      this.isLoading = false;
    }

    return this.accountUsernames;
  }

  async getUsername(accountId) {
    if (!accountId) return null;

    const map = await this.loadUsernames();
    return map[accountId] || null;
  }

  // Optional helper – returns "username (0.0.xxx)" or just the accountId
  async formatSender(accountId) {
    if (!accountId) return null;

    const username = await this.getUsername(accountId);
    return username ? `${username} (${accountId})` : accountId;
  }
}

export const usernameService = new UsernameService();
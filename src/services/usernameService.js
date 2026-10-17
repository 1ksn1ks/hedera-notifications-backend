// Same profile topics Meritocracy uses. Latest valid message per account wins.
// Username topic 0.0.9609904 stores { data: { username } }, under 20 characters.
// Picture topic 0.0.9609881 stores { data: { urls: [image] } }.
import { db } from '../utils/db.js';
import { FETCH_TIMEOUT_MS, UsernameService } from './username-store.js';

const mirrorHost = process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443';
const isMainnet = mirrorHost.includes('mainnet');
const MIRROR_URL = isMainnet
  ? 'https://mainnet-public.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

export const DEFAULT_AVATAR =
  'https://kiloscribe.com/api/inscription-cdn/0.0.4819119';

export const usernameService = new UsernameService({
  database: db,
  fetchImpl: fetch,
  timeoutMs: FETCH_TIMEOUT_MS,
  mirrorUrl: MIRROR_URL,
});

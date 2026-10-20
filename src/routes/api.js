import express from 'express';
import crypto from 'crypto';
import {
  upsertUser,
  updateTopicDeviceTokens,
  upsertTopicSubscription,
  deleteTopicSubscription,
  clearMessages,
  deleteMessages,
  updateTopicFilter,
  listSubscriptions,
  updateShowFullMessage,
  listAllSubscriptions,
  listMessages,
  saveSessionToken,
  sessionTokenHashesForWallet,
} from '../utils/db.js';
import { hederaListener } from '../services/hederaListener.js';
import { usernameService } from '../services/usernameService.js'; // ← make sure the path is correct
import { domainForTopic, listDomains, resolveTopicInput } from '../services/domains.js';
import {
  directoryEntry,
  getFollowing,
  isAccountId,
  mirrorAccountExists,
  resolveAccountTopic,
  subscriptionOwner,
} from '../services/globeCache.js';
import { assertNftTokens, isNftTypeCached, normalizeRequiredNfts } from '../services/topicFilter.js';
import {
  issueChallenge,
  verifyWalletSignature,
  unsignedRegisterAllowed,
  graceUntil,
} from '../services/registerChallenge.js';

const router = express.Router();

// A /update-filter call may validate at most this many tokens that are not
// already in the token-type cache, to bound mirror-node load per request.
const MAX_NEW_TOKENS_PER_UPDATE = 5;

// Session tokens: issued at register, required on the wallet-owned writes.
// While the register grace period runs, requests without a token are still
// accepted so old clients keep working; a present-but-invalid token is
// always 401.
function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function sessionTokenProblem(req, walletAddress) {
  const presented = bearerToken(req);
  if (!presented) {
    return unsignedRegisterAllowed() ? null : 'Missing session token';
  }
  const presentedHash = crypto.createHash('sha256').update(presented).digest('hex');
  for (const stored of sessionTokenHashesForWallet(walletAddress)) {
    if (
      stored.length === presentedHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(stored, 'hex'),
        Buffer.from(presentedHash, 'hex')
      )
    ) {
      return null;
    }
  }
  return 'Invalid session token';
}

// A register must be preceded by a challenge the caller's wallet signed.
router.get('/register/challenge', (req, res) => {
  const account = String(req.query.account || '').trim();

  if (!isAccountId(account)) {
    return res.status(400).json({ error: 'Missing or invalid account' });
  }

  try {
    return res.json({ nonce: issueChallenge(account) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/register', async (req, res) => {
  const { deviceToken, platform, walletAddress, nonce, signature } = req.body;

  if (!deviceToken || !walletAddress) {
    return res.status(400).json({ error: 'Missing deviceToken or walletAddress' });
  }

  const unsigned = !nonce && !signature;
  if (unsigned) {
    // Grace period: old clients (no challenge flow) keep working until
    // GRACE_UNTIL. A present-but-invalid proof below is always rejected.
    if (!unsignedRegisterAllowed()) {
      return res.status(401).json({ error: 'Missing nonce or signature' });
    }
    console.warn(
      `unsigned register accepted during grace period (until ${new Date(
        graceUntil()
      ).toISOString()}): wallet=${walletAddress} token=${String(deviceToken).slice(0, 12)}...`
    );
  } else {
    try {
      await verifyWalletSignature({
        account: walletAddress,
        nonce: String(nonce),
        signature: String(signature),
      });
    } catch (error) {
      console.error('register verification failed:', error.message);
      return res.status(error.status || 401).json({ error: error.message });
    }
  }

  // Issued on every successful register (signed, or unsigned during grace):
  // the client keeps it and presents it on the wallet-owned writes.
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  try {
    upsertUser({ walletAddress, deviceToken, platform: platform || 'android' });
    updateTopicDeviceTokens(walletAddress, deviceToken);
    saveSessionToken(
      walletAddress,
      deviceToken,
      crypto.createHash('sha256').update(sessionToken).digest('hex')
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, token: sessionToken });
});

router.post('/subscribe', async (req, res) => {
  const { deviceToken, topicId, walletAddress } = req.body;

  if (!deviceToken || !topicId || !walletAddress) {
    return res.status(400).json({
      error: 'Missing deviceToken, topicId or walletAddress',
    });
  }

  const authProblem = sessionTokenProblem(req, walletAddress);
  if (authProblem) return res.status(401).json({ error: authProblem });

  let resolved;
  try {
    resolved = await resolveTopicInput(topicId);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'Domain registry unavailable' });
  }

  if (!resolved) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  const cleaned = resolved.topicId;

  if (!/^\d+\.\d+\.\d+$/.test(cleaned)) {
    return res.status(400).json({ error: 'Invalid topic format' });
  }

  // An account with a Globe profile topic subscribes to that topic.
  let topicToStore = cleaned;
  let viaAccount = '';
  if (isAccountId(cleaned)) {
    const linked = resolveAccountTopic(cleaned);
    if (linked) {
      topicToStore = linked;
      viaAccount = cleaned;
    }
  }

  const exists = await hederaListener.topicExists(topicToStore);
  if (!exists) {
    if (!viaAccount && isAccountId(cleaned) && await mirrorAccountExists(cleaned)) {
      return res.status(404).json({ error: `${cleaned} has no public topic connected` });
    }
    return res.status(404).json({ error: 'Topic does not exist' });
  }

  let domain = resolved.domain || null;
  if (viaAccount) {
    try {
      domain = domainForTopic(topicToStore, await listDomains()) || null;
    } catch (error) {
      console.error('Domain lookup skipped:', error.message);
      domain = null;
    }
  }

  try {
    upsertTopicSubscription({
      deviceToken,
      walletAddress,
      topicId: topicToStore,
      viaAccount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  const body = { success: true, topicId: topicToStore, domain };
  if (viaAccount) body.viaAccount = viaAccount;
  res.json(body);
});

const RESOLVE_TTL_MS = 5 * 60 * 1000;
const resolveCache = new Map();

router.get('/following/:walletAddress', async (req, res) => {
  const account = req.params.walletAddress;
  if (!isAccountId(account)) {
    return res.status(400).json({ error: 'Invalid account' });
  }

  try {
    const result = await getFollowing(account);
    res.json({
      success: true,
      accounts: (result.accounts || []).slice(0, 500),
      topics: (result.topics || []).slice(0, 500),
      source: result.source,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/resolve/:id', async (req, res) => {
  const id = req.params.id;
  if (!isAccountId(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const hit = resolveCache.get(id);
  if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) {
    return res.status(hit.status).json(hit.body);
  }

  const linked = resolveAccountTopic(id);
  let status;
  let body;
  if (linked) {
    const entry = directoryEntry(id) || {};
    status = 200;
    body = {
      success: true,
      kind: 'account',
      accountId: id,
      topicId: linked,
      username: entry.username || '',
      profilePic: entry.profilePic || '',
    };
  } else if (await hederaListener.topicExists(id)) {
    let domain = '';
    try {
      domain = domainForTopic(id, await listDomains()) || '';
    } catch (error) {
      console.error('Domain lookup skipped:', error.message);
    }
    status = 200;
    body = { success: true, kind: 'topic', topicId: id, domain };
  } else if (await mirrorAccountExists(id)) {
    status = 404;
    body = { success: false, kind: 'account', error: `${id} has no public topic connected` };
  } else {
    status = 404;
    body = { success: false, error: 'Not found' };
  }

  resolveCache.set(id, { at: Date.now(), status, body });
  res.status(status).json(body);
});

router.get('/domains', async (req, res) => {
  try {
    const domains = await listDomains();
    res.json({ domains });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: 'Domain registry unavailable' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const { walletAddress, topicId } = req.body;

  if (!walletAddress || !topicId) {
    return res.status(400).json({ error: 'Missing walletAddress or topicId' });
  }

  const authProblem = sessionTokenProblem(req, walletAddress);
  if (authProblem) return res.status(401).json({ error: authProblem });

  try {
    deleteTopicSubscription(walletAddress, topicId);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.post('/messages/clear', async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing walletAddress' });
  }

  const authProblem = sessionTokenProblem(req, walletAddress);
  if (authProblem) return res.status(401).json({ error: authProblem });

  try {
    clearMessages(walletAddress);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.post('/messages/delete', async (req, res) => {
  const { walletAddress, ids, topicIds, payers } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing walletAddress' });
  }

  const authProblem = sessionTokenProblem(req, walletAddress);
  if (authProblem) return res.status(401).json({ error: authProblem });

  if (Array.isArray(payers) && payers.some(payer => /[,()]/.test(String(payer)))) {
    return res.status(400).json({ error: 'Invalid payer' });
  }
  if (
    !(Array.isArray(ids) && ids.length > 0)
    && !(Array.isArray(topicIds) && topicIds.length > 0)
    && !(Array.isArray(payers) && payers.length > 0)
  ) {
    return res.status(400).json({ error: 'Missing ids, topicIds or payers' });
  }

  try {
    deleteMessages({ walletAddress, ids, topicIds, payers });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.post('/update-filter', async (req, res) => {
  const { walletAddress, topicId, filterMode, allowedSenders, blockedSenders, requiredNfts } = req.body;

  if (!walletAddress || !topicId) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const authProblem = sessionTokenProblem(req, walletAddress);
  if (authProblem) return res.status(401).json({ error: authProblem });

  try {
    if (Array.isArray(requiredNfts)) {
      const normalized = normalizeRequiredNfts(requiredNfts);
      if (!normalized.ok) return res.status(400).json({ error: normalized.error });
      // Confirm the subscription exists before spending any mirror-node lookups.
      const rows = listSubscriptions(walletAddress);
      const row = Array.isArray(rows) ? rows.find(item => item.topic_id === topicId) : null;
      if (!row) {
        return res.status(404).json({ error: 'No such subscription' });
      }
      const saved = Array.isArray(row.required_nfts) ? row.required_nfts : [];
      const known = new Set(saved);
      const toCheck = normalized.ids.filter(id => !known.has(id));
      const uncached = toCheck.filter(id => !isNftTypeCached(id));
      if (uncached.length > MAX_NEW_TOKENS_PER_UPDATE) {
        return res.status(400).json({
          error: `At most ${MAX_NEW_TOKENS_PER_UPDATE} new tokens per update (${uncached.length} requested)`,
        });
      }
      await assertNftTokens(toCheck);
    }
    updateTopicFilter({
      walletAddress,
      topicId,
      filterMode,
      allowedSenders,
      blockedSenders,
      requiredNfts,
    });
  } catch (error) {
    if (error.status === 400 || error.status === 503) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.get('/subscriptions/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  let data;
  try {
    data = listSubscriptions(walletAddress);
  } catch (error) {
    console.log('Error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    subscriptions: data.map((row) => ({
      ...row,
      owner: subscriptionOwner(
        row.via_account,
        row.via_account ? directoryEntry(row.via_account) : null,
      ),
    })),
  });
});

router.post('/update-preference', async (req, res) => {
  const { walletAddress, topicId, showFullMessage } = req.body;

  if (!walletAddress || !topicId) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const authProblem = sessionTokenProblem(req, walletAddress);
  if (authProblem) return res.status(401).json({ error: authProblem });

  try {
    updateShowFullMessage({ walletAddress, topicId, showFullMessage });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

// Debug aid: shows every subscription with its device token, so it is
// only answered when x-admin-token matches ADMIN_TOKEN. Anything else
// (including an unset ADMIN_TOKEN) looks like a plain 404.
router.get('/debug/topics', (req, res) => {
  const expected = process.env.ADMIN_TOKEN;
  const given = String(req.headers['x-admin-token'] || '');
  const authorized =
    !!expected &&
    given.length > 0 &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
  if (!authorized) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    res.json({ data: listAllSubscriptions(), error: null });
  } catch (error) {
    res.json({ data: null, error: error.message });
  }
});

router.get('/messages/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;

  let data;
  try {
    data = listMessages(walletAddress, 100);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  // Enrich each message with resolved username
  const messages = await Promise.all(
    (data || []).map(async (msg) => {
      // Prefer real payer account, fallback to sender
      const payer = msg.payer || msg.sender;

      const profile = await usernameService.getProfile(payer);

      return {
        id: msg.id,
        topic_id: msg.topic_id,
        payer: payer,
        username: profile.username,
        profile_pic: profile.profilePic,
        body: msg.body,
        created_at: msg.created_at,
      };
    })
  );

  res.json({ success: true, messages });
});

export default router;
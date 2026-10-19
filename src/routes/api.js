import express from 'express';
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

const router = express.Router();

router.post('/register', async (req, res) => {
  const { deviceToken, platform, walletAddress } = req.body;

  if (!deviceToken || !walletAddress) {
    return res.status(400).json({ error: 'Missing deviceToken or walletAddress' });
  }

  try {
    upsertUser({ walletAddress, deviceToken, platform: platform || 'android' });
    updateTopicDeviceTokens(walletAddress, deviceToken);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.post('/subscribe', async (req, res) => {
  const { deviceToken, topicId, walletAddress } = req.body;

  if (!deviceToken || !topicId || !walletAddress) {
    return res.status(400).json({
      error: 'Missing deviceToken, topicId or walletAddress',
    });
  }

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

  try {
    updateTopicFilter({
      walletAddress,
      topicId,
      filterMode,
      allowedSenders,
      blockedSenders,
      requiredNfts,
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
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

  try {
    updateShowFullMessage({ walletAddress, topicId, showFullMessage });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.get('/debug/topics', async (req, res) => {
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
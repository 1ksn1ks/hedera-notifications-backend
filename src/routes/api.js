import express from 'express';
import { supabase } from '../utils/db.js';
import { hederaListener } from '../services/hederaListener.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { deviceToken, platform, walletAddress } = req.body;

  if (!deviceToken || !walletAddress) {
    return res.status(400).json({ error: 'Missing deviceToken or walletAddress' });
  }

  // 1. Upsert user
  const { error: userError } = await supabase
    .from('user_subscriptions')
    .upsert(
      {
        device_token: deviceToken,
        platform: platform || 'android',
        wallet_address: walletAddress,
      },
      { onConflict: 'wallet_address' }
    );

  if (userError) {
    console.error(userError);
    return res.status(500).json({ error: userError.message });
  }

  // 2. Update device token on all existing topic subscriptions for this wallet
  const { error: topicError } = await supabase
    .from('topic_subscriptions')
    .update({ device_token: deviceToken })
    .eq('wallet_address', walletAddress);

  if (topicError) {
    console.error(topicError);
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

  let cleaned = topicId.trim();

  // Convert "12345" → "0.0.12345"
  if (/^\d+$/.test(cleaned)) {
    cleaned = `0.0.${cleaned}`;
  }

  // Basic format check
  if (!/^\d+\.\d+\.\d+$/.test(cleaned)) {
    return res.status(400).json({ error: 'Invalid topic format' });
  }

  // Check if topic exists
  const exists = await hederaListener.topicExists(cleaned);
  if (!exists) {
    return res.status(404).json({ error: 'Topic does not exist' });
  }

  // Save to database (keyed by wallet)
  const { error } = await supabase
    .from('topic_subscriptions')
    .upsert(
      {
        device_token: deviceToken,
        wallet_address: walletAddress,
        topic_id: cleaned,
      },
      { onConflict: 'wallet_address,topic_id' }
    );

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, topicId: cleaned });
});

router.post('/unsubscribe', async (req, res) => {
  const { walletAddress, topicId } = req.body;

  if (!walletAddress || !topicId) {
    return res.status(400).json({ error: 'Missing walletAddress or topicId' });
  }

  const { error } = await supabase
    .from('topic_subscriptions')
    .delete()
    .eq('wallet_address', walletAddress)
    .eq('topic_id', topicId);

  if (error) {
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

  const { error } = await supabase
    .from('user_messages')
    .delete()
    .eq('wallet_address', walletAddress);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.post('/update-filter', async (req, res) => {
  const { walletAddress, topicId, filterMode, allowedSenders, blockedSenders } = req.body;

  if (!walletAddress || !topicId) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const updates = {};
  if (filterMode !== undefined) updates.filter_mode = filterMode;
  if (allowedSenders !== undefined) updates.allowed_senders = allowedSenders;
  if (blockedSenders !== undefined) updates.blocked_senders = blockedSenders;

  const { error } = await supabase
    .from('topic_subscriptions')
    .update(updates)
    .eq('wallet_address', walletAddress)
    .eq('topic_id', topicId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.get('/subscriptions/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  console.log('PARAMS:', req.params);
  console.log('Looking up wallet:', walletAddress);

  const { data, error } = await supabase
    .from('topic_subscriptions')
    .select('topic_id, show_full_message, filter_mode, allowed_senders, blocked_senders, wallet_address')
    .eq('wallet_address', walletAddress);

  console.log('Result:', data);
  console.log('Error:', error);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    success: true,
    subscriptions: data || [],
  });
});

router.post('/update-preference', async (req, res) => {
  const { walletAddress, topicId, showFullMessage } = req.body;

  if (!walletAddress || !topicId) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const { error } = await supabase
    .from('topic_subscriptions')
    .update({ show_full_message: showFullMessage })
    .eq('wallet_address', walletAddress)
    .eq('topic_id', topicId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

router.get('/debug/topics', async (req, res) => {
  const { data, error } = await supabase
    .from('topic_subscriptions')
    .select('*');

  res.json({ data, error });
});

router.get('/messages/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;

  const { data, error } = await supabase
    .from('user_messages')
    .select('id, topic_id, sender, body, created_at')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, messages: data || [] });
});

export default router;
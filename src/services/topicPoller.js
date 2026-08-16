import { supabase } from '../utils/db.js';
import { sendPushNotification } from './notificationService.js';
import { usernameService } from './usernameService.js';

const isMainnet = process.env.MIRROR_NODE_URL?.includes('mainnet');
const MIRROR_URL = isMainnet
  ? 'https://mainnet-public.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

const BATCH_SIZE = 33;        // topics per batch
const BATCH_DELAY_MS = 1000;  // 1 second between batches
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class TopicPoller {
  constructor() {
    this.isRunning = false;
    this.currentIndex = 0;
    this.activeTopics = [];
    this.lastCleanup = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🔄 Topic poller started (33 topics / second)');
    this.loop();
  }

  async loop() {
    while (this.isRunning) {
      try {
        await this.maybeCleanup();
        await this.refreshActiveTopics();
        await this.pollNextBatch();
      } catch (err) {
        console.error('Poller error:', err.message);
      }
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  async maybeCleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;
  
    const cutoff = new Date(now - MESSAGE_RETENTION_MS).toISOString();
    const { error } = await supabase
      .from('user_messages')
      .delete()
      .lt('created_at', cutoff);
  
    if (error) {
      console.log('🧹 Cleanup error:', error.message);
    } else {
      console.log('🧹 Old user_messages cleaned (older than 7 days)');
    }
  }

  async refreshActiveTopics() {
    if (this.activeTopics.length === 0 || this.currentIndex === 0) {
      const { data: topics, error } = await supabase
        .from('topic_subscriptions')
        .select('topic_id');

      if (error || !topics) {
        this.activeTopics = [];
        return;
      }

      this.activeTopics = [...new Set(topics.map((t) => t.topic_id))];
      console.log(`📋 Tracking ${this.activeTopics.length} active topics`);
    }
  }

  async pollNextBatch() {
    if (this.activeTopics.length === 0) return;

    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      if (this.currentIndex >= this.activeTopics.length) {
        this.currentIndex = 0;
        break;
      }
      batch.push(this.activeTopics[this.currentIndex]);
      this.currentIndex++;
    }

    await Promise.all(batch.map((topicId) => this.pollTopic(topicId)));
  }

  async pollTopic(topicId) {
    try {
      const { data: state } = await supabase
        .from('topic_state')
        .select('last_sequence_number')
        .eq('topic_id', topicId)
        .single();

      const lastSeq = state?.last_sequence_number || 0;

      let url;
      if (lastSeq === 0) {
        url = `${MIRROR_URL}/api/v1/topics/${topicId}/messages?order=desc&limit=1`;
      } else {
        url = `${MIRROR_URL}/api/v1/topics/${topicId}/messages?sequencenumber=gt:${lastSeq}&order=asc&limit=25`;
      }

      const res = await fetch(url);

      console.log(`🔍 Checking ${topicId} | lastSeq: ${lastSeq} | status: ${res.status}`);

      if (!res.ok) {
        const text = await res.text();
        console.log(`   Response: ${text.substring(0, 200)}`);
        return;
      }

      const json = await res.json();
      const messages = json.messages || [];
      console.log(`   Found ${messages.length} messages`);

      if (messages.length === 0) return;

      if (lastSeq === 0) {
        const newestSeq = messages[0].sequence_number;
        await supabase.from('topic_state').upsert({
          topic_id: topicId,
          last_sequence_number: newestSeq,
          updated_at: new Date().toISOString(),
        });
        console.log(`   Initialized topic ${topicId} at sequence ${newestSeq}`);
        return;
      }

      for (const msg of messages) {
        await this.processMessage(topicId, msg);
      }

      const newestSeq = messages[messages.length - 1].sequence_number;
      await supabase.from('topic_state').upsert({
        topic_id: topicId,
        last_sequence_number: newestSeq,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`Error polling ${topicId}:`, err.message);
    }
  }

  async processMessage(topicId, msg) {
    const msgContent = Buffer.from(msg.message, 'base64').toString('utf8');
    const payer = msg.payer_account_id || 'Unknown';

    const username = await usernameService.getUsername(payer);
    const sender = username || payer;

    console.log(`📨 New message on ${topicId} from ${sender}: ${msgContent.substring(0, 80)}...`);

    let cleanMessage = msgContent;
    try {
      const parsed = JSON.parse(msgContent);
      if (parsed.userMessage) cleanMessage = parsed.userMessage;
    } catch (e) {}

    const { data: subscribers } = await supabase
      .from('topic_subscriptions')
      .select(
        'device_token, wallet_address, show_full_message, allowed_senders, blocked_senders, filter_mode'
      )
      .eq('topic_id', topicId);

    if (!subscribers || subscribers.length === 0) return;

    for (const sub of subscribers) {
      const mode = sub.filter_mode || 'all';
      const allowed = sub.allowed_senders || [];
      const blocked = sub.blocked_senders || [];

      if (mode === 'allowlist') {
        const isAllowed =
          allowed.includes(payer) ||
          (username && allowed.includes(username));

        if (!isAllowed) {
          console.log(`Skipping ${sub.device_token} - ${sender} not in allow list`);
          continue;
        }
      }

      if (mode === 'blocklist') {
        const isBlocked =
          blocked.includes(payer) ||
          (username && blocked.includes(username));

        if (isBlocked) {
          console.log(`Skipping ${sub.device_token} - ${sender} is blocked`);
          continue;
        }
      }

      // Personal feed (per wallet)
      if (sub.wallet_address) {
        const { error: insertError } = await supabase.from('user_messages').insert({
          wallet_address: sub.wallet_address,
          topic_id: topicId,
          sender: sender,
          body: cleanMessage,
          sequence_number: msg.sequence_number ?? null,
        });

        if (insertError) {
          console.log('user_messages insert error:', insertError.message);
        }
      }

      const body = sub.show_full_message
        ? `${sender}: ${cleanMessage.length > 100 ? cleanMessage.substring(0, 97) + '...' : cleanMessage}`
        : `New message from ${sender}`;

      if (sub.device_token) {
        await sendPushNotification(sub.device_token, topicId, body, topicId);
      }
    }
  }
}

export const topicPoller = new TopicPoller();
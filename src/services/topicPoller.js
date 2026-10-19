import {
  deleteMessagesOlderThan,
  listActiveTopicIds,
  getTopicState,
  upsertTopicState,
  listTopicSubscribers,
  insertUserMessage,
} from '../utils/db.js';
import { sendPushNotification } from './notificationService.js';
import { usernameService } from './usernameService.js';
import { previewMeritocracy, clipText } from './meritocracyFormat.js';
import { passesTopicFilter } from './topicFilter.js';
import {
  acceptTopicMessage,
  createChunkBuffer,
  pushMessageText,
  sweepChunkBuffer,
} from './topic-chunks.js';

const mirrorHost = process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443';
const isMainnet = mirrorHost.includes('mainnet');
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
    this.chunks = createChunkBuffer();
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
        sweepChunkBuffer(this.chunks);
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
    const removed = deleteMessagesOlderThan(cutoff);
    console.log(`🧹 Old user_messages cleaned (older than 7 days): ${removed}`);
  }

  async refreshActiveTopics() {
    if (this.activeTopics.length === 0 || this.currentIndex === 0) {
      this.activeTopics = listActiveTopicIds();
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
      const state = getTopicState(topicId);

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
        upsertTopicState(topicId, newestSeq);
        console.log(`   Initialized topic ${topicId} at sequence ${newestSeq}`);
        return;
      }

      // The sequence watermark still moves to the end of the page. An
      // unfinished chunk stays in memory so a later page can finish it.
      for (const msg of messages) {
        const assembled = acceptTopicMessage(this.chunks, topicId, msg);
        if (!assembled) continue;
        await this.processMessage(topicId, assembled);
      }

      const newestSeq = messages[messages.length - 1].sequence_number;
      upsertTopicState(topicId, newestSeq);
    } catch (err) {
      console.error(`Error polling ${topicId}:`, err.message);
    }
  }

  async processMessage(topicId, assembled) {
    const msgContent = assembled.body;
    const payer = assembled.payer || null;
  
    const profile = payer
      ? await usernameService.getProfile(payer)
      : { username: null, profilePic: null };
    const username = profile.username;
  
    // Nice display name for logs and notifications
    let displaySender;
    if (username && payer) {
      displaySender = `${username} (${payer})`;
    } else if (username) {
      displaySender = username;
    } else if (payer) {
      displaySender = payer;
    } else {
      displaySender = 'Unknown';
    }
  
    console.log(`📨 New message on ${topicId} from ${displaySender}: ${msgContent.substring(0, 80)}...`);

    // Store the consensus message unchanged. The banner uses a short
    // human line only when the payload is a Meritocracy post.
    const preview = clipText(previewMeritocracy(msgContent));
  
    const subscribers = listTopicSubscribers(topicId);
  
    if (!subscribers || subscribers.length === 0) return;
  
    for (const sub of subscribers) {
      const passes = await passesTopicFilter(sub, {
        payer: payer || '',
        username: username || '',
      });
      if (!passes) {
        console.log(`Skipping ${sub.device_token} - ${displaySender} filtered`);
        continue;
      }
  
      // Save to personal feed
      if (sub.wallet_address) {
        try {
          insertUserMessage({
            walletAddress: sub.wallet_address,
            topicId,
            payer,
            sender: username,
            body: msgContent,
            sequenceNumber: assembled.sequenceNumber ?? null,
          });
        } catch (insertError) {
          console.log('user_messages insert error:', insertError.message);
        }
      }
  
      // Build notification body
      const notificationBody = sub.show_full_message
        ? `${displaySender}: ${preview}`
        : `New message from ${displaySender}`;
  
      // Stored body is the full consensus text. A chunked push carries
      // a small JSON document the phone can still classify.
      if (sub.device_token) {
        await sendPushNotification(
          sub.device_token,
          topicId,                 // title
          notificationBody,        // body
          topicId,                 // topicId
          {
            payer: payer || '',
            username: username || '',
            profilePic: profile.profilePic || '',
            message: pushMessageText(msgContent, assembled.chunked),
          }
        );
      }
    }
  }
}

export const topicPoller = new TopicPoller();
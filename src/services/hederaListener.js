import { AccountId, Client, Timestamp, TopicId, TopicMessageQuery } from '@hashgraph/sdk';
import * as HieroProto from '@hiero-ledger/proto';
import { listTopicSubscribers } from '../utils/db.js';
import { sendPushNotification } from './notificationService.js';
import { previewMeritocracy, clipText } from './meritocracyFormat.js';
import {
  acceptTopicMessage,
  createChunkBuffer,
  pushMessageText,
} from './topic-chunks.js';

function asCount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value.toNumber === 'function') {
    const count = value.toNumber();
    return Number.isFinite(count) ? count : null;
  }
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function mirrorTimestamp(timestamp) {
  if (timestamp == null) return null;
  const seconds = timestamp.seconds == null ? '0' : String(timestamp.seconds);
  const nanos = asCount(timestamp.nanos) ?? 0;
  return `${seconds}.${String(Math.trunc(nanos)).padStart(9, '0')}`;
}

function accountString(accountID) {
  if (accountID == null) return '';
  try {
    return AccountId._fromProtobuf(accountID).toString();
  } catch {
    return '';
  }
}

// gRPC chunks use the same chunk_info shape as the mirror REST rows.
function rowFromStream(response) {
  const chunk = response.chunkInfo;
  let chunkInfo = null;
  let payer = null;
  if (chunk != null) {
    const tx = chunk.initialTransactionID;
    const account = tx?.accountID ? accountString(tx.accountID) : '';
    chunkInfo = {
      initial_transaction_id: {
        account_id: account,
        nonce: tx?.nonce == null ? 0 : asCount(tx.nonce) ?? 0,
        scheduled: Boolean(tx?.scheduled),
        transaction_valid_start: tx?.transactionValidStart
          ? mirrorTimestamp(tx.transactionValidStart)
          : '',
      },
      number: asCount(chunk.number),
      total: asCount(chunk.total),
    };
    payer = account || null;
  }
  return {
    message: response.message == null ? Buffer.alloc(0) : Buffer.from(response.message),
    consensus_timestamp: mirrorTimestamp(response.consensusTimestamp),
    payer_account_id: payer,
    sequence_number: asCount(response.sequenceNumber),
    chunk_info: chunkInfo,
  };
}

class HederaListener {
  constructor() {
    this.client = Client.forNetwork({}).setMirrorNetwork(
      process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443'
    );
    this.subscriptions = new Map();
    this.chunks = createChunkBuffer();
  }

  // Check if a topic actually exists on the Mirror Node
  async topicExists(topicId) {
    try {
      const isMainnet = (process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443').includes('mainnet');
      const mirrorUrl = isMainnet
        ? 'https://mainnet-public.mirrornode.hedera.com'
        : 'https://testnet.mirrornode.hedera.com';

      const res = await fetch(`${mirrorUrl}/api/v1/topics/${topicId}`);
      return res.status === 200;
    } catch (err) {
      console.error('Mirror node check failed:', err.message);
      return false;
    }
  }

  ingestStream(query, topicId, data) {
    let response;
    try {
      response = HieroProto.com.hedera.mirror.api.proto.ConsensusTopicResponse.decode(data);
    } catch (err) {
      console.error(`❌ Error on topic ${topicId}:`, err.message || err);
      return;
    }

    if (query._limit?.gt(0)) {
      query._limit = query._limit.sub(1);
    }
    if (response.consensusTimestamp != null) {
      query._startTime = Timestamp._fromProtobuf(response.consensusTimestamp).plusNanos(1);
    }

    let assembled;
    try {
      assembled = acceptTopicMessage(this.chunks, topicId, rowFromStream(response));
    } catch (err) {
      console.error(`❌ Error on topic ${topicId}:`, err.message || err);
      return;
    }
    if (!assembled) return;

    void this.deliver(topicId, assembled).catch((err) => {
      console.error(`❌ Error on topic ${topicId}:`, err.message || err);
    });
  }

  async deliver(topicId, assembled) {
    const msgContent = assembled.body;
    const sender = assembled.payer || 'Unknown';

    console.log(
      `📨 New message on ${topicId} from ${sender}: ${msgContent.substring(0, 80)}...`
    );

    const subscribers = listTopicSubscribers(topicId);

    if (!subscribers || subscribers.length === 0) {
      console.log('No subscribers');
      return;
    }

    const preview = clipText(previewMeritocracy(msgContent));

    for (const sub of subscribers) {
      if (sub.allowed_senders && sub.allowed_senders.length > 0) {
        if (!sub.allowed_senders.includes(sender)) {
          console.log(
            `Skipping ${sub.device_token} - sender ${sender} not allowed`
          );
          continue;
        }
      }

      const body = sub.show_full_message
        ? `${sender}: ${preview}`
        : `New message from ${sender}`;

      const result = await sendPushNotification(
        sub.device_token,
        topicId,
        body,
        topicId,
        {
          payer: sender,
          message: pushMessageText(msgContent, assembled.chunked),
        }
      );
      console.log('Push result:', result);
    }
  }

  async startListeningForTopic(topicId) {
    if (!topicId || typeof topicId !== 'string') return;

    let cleaned = topicId.trim();

    // Convert "12345" → "0.0.12345"
    if (/^\d+$/.test(cleaned)) {
      cleaned = `0.0.${cleaned}`;
    }

    // Must be in format number.number.number
    if (!/^\d+\.\d+\.\d+$/.test(cleaned)) {
      console.log(`⏭️  Invalid format: "${topicId}"`);
      return;
    }

    if (this.subscriptions.has(cleaned)) return;

    // Check if the topic really exists
    const exists = await this.topicExists(cleaned);
    if (!exists) {
      console.log(`⏭️  Topic does not exist: ${cleaned}`);
      return;
    }

    console.log(`🎧 Listening to topic: ${cleaned}`);

    try {
      const query = new TopicMessageQuery().setTopicId(TopicId.fromString(cleaned));
      // Read chunk_info off each gRPC frame. The SDK would otherwise join
      // chunks itself and keep the last chunk's timestamp.
      query._handleMessage = (data) => {
        this.ingestStream(query, cleaned, data);
      };
      const subscription = query.subscribe(
        this.client,
        (error) => {
          console.error(`❌ Error on topic ${cleaned}:`, error.message || error);
          this.subscriptions.delete(cleaned);
        },
        () => {}
      );

      this.subscriptions.set(cleaned, subscription);
    } catch (err) {
      console.error(`❌ Failed to start listener for ${cleaned}:`, err.message);
    }
  }

  stopListeningForTopic(topicId) {
    const cleaned = topicId?.trim();
    if (this.subscriptions.has(cleaned)) {
      this.subscriptions.delete(cleaned);
      console.log(`🛑 Stopped listening to topic: ${cleaned}`);
    }
  }
}

export const hederaListener = new HederaListener();

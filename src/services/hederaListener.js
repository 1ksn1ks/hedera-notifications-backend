import { Client, TopicMessageQuery, TopicId } from '@hashgraph/sdk';
import { supabase } from '../utils/db.js';
import { sendPushNotification } from './notificationService.js';

class HederaListener {
  constructor() {
    this.client = Client.forNetwork({}).setMirrorNetwork(
      process.env.MIRROR_NODE_URL || 'testnet.mirrornode.hedera.com:443'
    );
    this.subscriptions = new Map();
  }

  // Check if a topic actually exists on the Mirror Node
  async topicExists(topicId) {
    try {
      const isMainnet = process.env.MIRROR_NODE_URL?.includes('mainnet');
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
      const query = new TopicMessageQuery()
        .setTopicId(TopicId.fromString(cleaned))
        .subscribe(
          this.client,
          // Error handler
          (error) => {
            console.error(`❌ Error on topic ${cleaned}:`, error.message || error);
            this.subscriptions.delete(cleaned);
          },
          // Message handler
          async (message) => {
            const msgContent = Buffer.from(message.contents).toString();
            let sender =
              message.initialTransactionId?.accountId?.toString() || 'Unknown';

            console.log(
              `📨 New message on ${cleaned} from ${sender}: ${msgContent.substring(0, 80)}...`
            );

            // Get all subscribers for this topic
            const { data: subscribers, error } = await supabase
              .from('topic_subscriptions')
              .select('device_token, show_full_message, allowed_senders')
              .eq('topic_id', cleaned);

            if (error) {
              console.error(error);
              return;
            }

            if (!subscribers || subscribers.length === 0) {
              console.log('No subscribers');
              return;
            }

            // Extract clean message text
            let cleanMessage = msgContent;
            try {
              const parsed = JSON.parse(msgContent);
              if (parsed.userMessage) {
                cleanMessage = parsed.userMessage;
              }
            } catch (e) {
              // not JSON, keep original
            }

            for (const sub of subscribers) {
              // Filter by allowed senders if set
              if (sub.allowed_senders && sub.allowed_senders.length > 0) {
                if (!sub.allowed_senders.includes(sender)) {
                  console.log(
                    `Skipping ${sub.device_token} - sender ${sender} not allowed`
                  );
                  continue;
                }
              }

              const body = sub.show_full_message
                ? `${sender}: ${
                    cleanMessage.length > 100
                      ? cleanMessage.substring(0, 97) + '...'
                      : cleanMessage
                  }`
                : `New message from ${sender}`;

              const result = await sendPushNotification(
                sub.device_token,
                cleaned, // title = topicId
                body,
                cleaned  // data.topicId
              );
              console.log('Push result:', result);
            }
          }
        );

      this.subscriptions.set(cleaned, query);
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
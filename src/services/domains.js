// Same domain rules as step_by_step/loaddomains.js.
// Registry topic 0.0.9606779. A purchase is { topic, domain } and the mirror
// payer. The name stays with one payer for 28 days (2419200 seconds):
//   same payer before the window ends  -> extend
//   same payer after it ends           -> new window
//   another payer while it is live     -> ignored
//   another payer after it ends        -> takeover
// Names that contain "0.0." are dropped. Lookup is an exact match on the
// lowercased name, and the topic is lastMessage.topic.

export const DOMAIN_TOPIC = "0.0.9606779";
export const DOMAIN_WINDOW_SECONDS = 2419200;

const MIRROR = "https://mainnet.mirrornode.hedera.com";
const CACHE_MS = 60 * 1000;

let cached = null;
let pending = null;

function decodeBody(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function asPurchase(message) {
  if (!message || typeof message !== "object") return null;

  let domain = message.domain;
  let topic = message.topic;
  let payer = message.payer;
  let timestamp = message.consensus_timestamp ?? message.timestamp;
  let sequence = message.sequence_number;

  if ((!domain || !payer) && message.message && message.payer_account_id) {
    const parsed = decodeBody(message.message);
    if (!parsed || typeof parsed !== "object") return null;
    domain = parsed.domain;
    topic = parsed.topic;
    payer = message.payer_account_id;
    timestamp = message.consensus_timestamp;
    sequence = message.sequence_number;
  }

  if (!payer || domain == null || domain === "") return null;
  const time = parseFloat(timestamp);
  if (!Number.isFinite(time)) return null;
  return { domain, topic, payer, timestamp: time, sequence };
}

export function activeDomainsFromMessages(messages, nowSeconds = Date.now() / 1000) {
  const seen = new Set();
  const domainsMap = new Map();

  for (const message of messages || []) {
    const purchase = asPurchase(message);
    if (!purchase) continue;
    if (purchase.sequence != null) {
      const seq = String(purchase.sequence);
      if (seen.has(seq)) continue;
      seen.add(seq);
    }
    const rows = domainsMap.get(purchase.domain);
    if (rows) rows.push(purchase);
    else domainsMap.set(purchase.domain, [purchase]);
  }

  const domains = [];
  for (const [domain, rows] of domainsMap) {
    rows.sort((a, b) => a.timestamp - b.timestamp);
    let owner = rows[0].payer;
    let windowEnd = rows[0].timestamp + DOMAIN_WINDOW_SECONDS;
    let last = rows[0];

    for (let i = 1; i < rows.length; i++) {
      const msg = rows[i];
      const t = msg.timestamp;
      if (msg.payer === owner) {
        windowEnd = t < windowEnd ? windowEnd + DOMAIN_WINDOW_SECONDS : t + DOMAIN_WINDOW_SECONDS;
        last = msg;
      } else if (t >= windowEnd) {
        owner = msg.payer;
        windowEnd = t + DOMAIN_WINDOW_SECONDS;
        last = msg;
      }
    }

    if (!(windowEnd > nowSeconds)) continue;
    if (String(domain).includes("0.0.")) continue;
    const topicId = last.topic == null ? "" : String(last.topic).trim();
    if (!topicId) continue;
    domains.push({
      domain: String(domain),
      topicId: /^\d+$/.test(topicId) ? `0.0.${topicId}` : topicId,
      payer: String(last.payer),
      expiresAt: windowEnd,
    });
  }
  return domains;
}

export function domainForTopic(topicId, domains) {
  let best = null;
  for (const entry of domains || []) {
    if (String(entry.topicId) !== String(topicId)) continue;
    if (!best || entry.expiresAt > best.expiresAt) best = entry;
  }
  return best ? best.domain : "";
}

async function fetchDomainMessages() {
  const messages = [];
  let url = `${MIRROR}/api/v1/topics/${DOMAIN_TOPIC}/messages?limit=100`;
  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Domain registry HTTP ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data.messages)) messages.push(...data.messages);
    const link = data.links && data.links.next;
    if (!link) break;
    url = String(link).startsWith("http") ? String(link) : `${MIRROR}${link}`;
  }
  return messages;
}

export async function listDomains() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.domains;
  if (!pending) {
    pending = fetchDomainMessages()
      .then(messages => {
        const domains = activeDomainsFromMessages(messages);
        cached = { at: Date.now(), domains };
        return domains;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function resolveTopicInput(raw) {
  let cleaned = String(raw ?? "").trim();
  if (!cleaned) return null;

  if (/^\d+$/.test(cleaned)) cleaned = `0.0.${cleaned}`;
  if (/^\d+\.\d+\.\d+$/.test(cleaned)) {
    let domain = "";
    try {
      domain = domainForTopic(cleaned, await listDomains());
    } catch (error) {
      console.error("Domain lookup skipped:", error.message);
    }
    return { topicId: cleaned, domain };
  }

  const name = cleaned.toLowerCase();
  const entry = (await listDomains()).find(item => item.domain === name);
  if (!entry || !entry.topicId) return null;
  return { topicId: String(entry.topicId).trim(), domain: entry.domain };
}

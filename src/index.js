import express from 'express';
import { config } from './config.js';
import { db } from './utils/db.js';
import apiRoutes from './routes/api.js';
import { initFirebase } from './services/notificationService.js';
import { topicPoller } from './services/topicPoller.js';
import { startGlobeCache } from './services/globeCache.js';

const app = express();
// One reverse proxy in front (Railway): trust the closest hop so req.ip is
// the real client address and not a spoofable X-Forwarded-For value.
app.set('trust proxy', 1);
app.use(express.json());

// Simple in-memory per-IP rate limit: at most `limit` requests per
// `windowMs` per IP, 429 beyond that. No dependencies.
function createRateLimiter({ limit = 30, windowMs = 60 * 1000 } = {}) {
  const hits = new Map(); // ip -> { start, count } for the current window
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    let entry = hits.get(ip);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      return res.status(429).json({ error: 'Too many requests, slow down' });
    }
    // Prune expired entries so the map does not grow without bound.
    if (hits.size > 10000) {
      for (const [key, e] of hits) {
        if (now - e.start >= windowMs) hits.delete(key);
      }
    }
    next();
  };
}

const writeRateLimit = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });
const challengeRateLimit = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });
app.use('/api', (req, res, next) =>
  req.method === 'POST' ? writeRateLimit(req, res, next) : next(),
);
app.get('/api/register/challenge', challengeRateLimit);
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send('Hedera Topic Notifier Backend is running!');
});

app.get('/test-db', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM user_subscriptions').get();
    res.json({ status: 'connected', users: row.n });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize Firebase
initFirebase();

// Start server + poller
app.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  topicPoller.start();
  startGlobeCache();
});
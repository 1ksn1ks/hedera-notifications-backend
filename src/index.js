import express from 'express';
import { config } from './config.js';
import { db } from './utils/db.js';
import apiRoutes from './routes/api.js';
import { initFirebase } from './services/notificationService.js';
import { topicPoller } from './services/topicPoller.js';
import { startGlobeCache } from './services/globeCache.js';

const app = express();
app.use(express.json());

// Simple in-memory per-IP rate limit for the write (POST) endpoints: at most
// `limit` requests per `windowMs` per IP, 429 beyond that. No dependencies.
function createRateLimiter({ limit = 30, windowMs = 60 * 1000 } = {}) {
  const hits = new Map(); // ip -> { start, count } for the current window
  return (req, res, next) => {
    const now = Date.now();
    const fwd = req.headers['x-forwarded-for'];
    const ip = (fwd ? String(fwd).split(',')[0].trim() : '') || req.ip || 'unknown';
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
app.use('/api', (req, res, next) =>
  req.method === 'POST' ? writeRateLimit(req, res, next) : next(),
);
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
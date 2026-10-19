import express from 'express';
import { config } from './config.js';
import { db } from './utils/db.js';
import apiRoutes from './routes/api.js';
import { initFirebase } from './services/notificationService.js';
import { topicPoller } from './services/topicPoller.js';
import { startGlobeCache } from './services/globeCache.js';

const app = express();
app.use(express.json());

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
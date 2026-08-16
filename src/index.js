import express from 'express';
import { config } from './config.js';
import { supabase } from './utils/db.js';
import apiRoutes from './routes/api.js';
import { initFirebase } from './services/notificationService.js';
import { topicPoller } from './services/topicPoller.js';

const app = express();
app.use(express.json());

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send('Hedera Topic Notifier Backend is running!');
});

app.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('test').select('*').limit(1);
    if (error && error.code === '42P01') {
      res.json({ status: 'connected', message: 'Supabase connected successfully!' });
    } else {
      res.json({ status: 'connected' });
    }
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
});
import { supabase } from '../utils/db.js';

async function initDatabase() {
  console.log('Creating tables...');

  // Create user_subscriptions table
  const { error: userError } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT UNIQUE NOT NULL,
        device_token TEXT NOT NULL,
        platform TEXT CHECK (platform IN ('android', 'ios', 'web')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  });

  // Create topic_subscriptions table
  const { error: topicError } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS topic_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT REFERENCES user_subscriptions(wallet_address),
        topic_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(wallet_address, topic_id)
      );
    `
  });

  if (userError || topicError) {
    console.error('Error creating tables:', userError || topicError);
  } else {
    console.log('✅ Tables created successfully!');
  }
}

initDatabase();
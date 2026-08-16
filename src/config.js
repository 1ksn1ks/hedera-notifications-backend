import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  mirrorNodeUrl: process.env.MIRROR_NODE_URL || 'testnet.mirrornode.hedera.com:443',
  
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  
  // Firebase (for later)
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
};
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  mirrorNodeUrl: process.env.MIRROR_NODE_URL || 'mainnet.mirrornode.hedera.com:443',

  // Firebase (push only — the database is local SQLite)

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
};
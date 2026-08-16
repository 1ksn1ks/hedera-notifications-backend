import admin from 'firebase-admin';

let firebaseApp;

export const initFirebase = () => {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Firebase init failed:', error.message);
  }
};

export const sendPushNotification = async (deviceToken, title, body, topicId = '') => {
  if (!firebaseApp) return false;

  const message = {
    token: deviceToken,
    notification: {
      title,
      body,
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'hedera-messages',
        sound: 'default',
        priority: 'high',
      },
    },
    data: {
      topicId: String(topicId),
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('✅ Push sent:', response);
    return true;
  } catch (error) {
    console.error('Push failed:', error.message);
    return false;
  }
};
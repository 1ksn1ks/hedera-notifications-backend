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

export const sendPushNotification = async (deviceToken, title, body, topicId = '', extra = {}) => {
  if (!firebaseApp) return false;

  const message = {
    token: deviceToken,
    // No "notification" field → data-only
    data: {
      topicId: String(topicId),
      title: String(title),
      body: String(body),
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, String(v ?? '')])
      ),
    },
    android: {
      priority: 'high',
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('✅ Data push sent:', response);
    return true;
  } catch (error) {
    console.error('Push failed:', error.message);
    return false;
  }
};
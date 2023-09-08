import * as admin from 'firebase-admin';

const serviceAccount = require('../../firebase_config/mrweather-9ecc0-firebase-adminsdk-917e0-c3a11ab34b.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://mrweather-9ecc0-default-rtdb.asia-southeast1.firebasedatabase.app/', // Replace with your Firebase Realtime Database URL
  });

export const firebaseAdmin = admin;
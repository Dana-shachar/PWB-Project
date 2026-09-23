import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Config comes from app/.env.local (see .env.example), so it is not committed.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// Without a key getAuth throws on import; a placeholder keeps the app loading, minus sign-in and saving.
if (!firebaseConfig.apiKey) {
  console.warn('Firebase config missing: copy .env.example to .env.local. Sign-in and saving are off.');
  firebaseConfig.apiKey = 'missing-config';
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Public web config — safe to commit, not a secret; access control lives in
// Firestore's security rules, not in hiding this. See ROADMAP.md, 2026-09-16.
const firebaseConfig = {
  apiKey: 'REDACTED',
  authDomain: 'pwbdashboard.firebaseapp.com',
  projectId: 'pwbdashboard',
  storageBucket: 'pwbdashboard.firebasestorage.app',
  messagingSenderId: '1050590300084',
  appId: '1:1050590300084:web:2401d69531c9708f43d4e1',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

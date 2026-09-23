import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { auth } from './client';

// Signs in anonymously on first load, then tracks whoever's signed in — every
// other save/load call keys data off this user's stable ID. See ROADMAP.md,
// 2026-09-16, for why anonymous (not a manual login step) was chosen for now.
export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        signInAnonymously(auth);
      }
    });
    return unsubscribe;
  }, []);

  return user;
}

import { useCallback, useRef, useState } from 'react';

// Whether saves reach the cloud: the last good save's time, and a toast for a save Dana triggered or any failure.
export interface SaveNotice {
  id: number;
  kind: 'good' | 'error';
  message: string;
}

export function useSaveStatus() {
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const nextId = useRef(0);

  // Runs a save; `successMessage` null keeps a good save quiet (autosave), a failure always shows.
  const track = useCallback(async (save: Promise<void>, successMessage: string | null): Promise<boolean> => {
    try {
      await save;
      setLastSavedAt(Date.now());
      if (successMessage) setNotice({ id: nextId.current++, kind: 'good', message: successMessage });
      return true;
    } catch (err) {
      console.error('Save failed', err);
      const reason = err instanceof Error ? err.message : String(err);
      setNotice({ id: nextId.current++, kind: 'error', message: `Save failed: ${reason}` });
      return false;
    }
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  return { notice, lastSavedAt, track, dismiss };
}

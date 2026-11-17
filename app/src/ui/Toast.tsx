import { useEffect } from 'react';
import type { SaveNotice } from '../projectSettings/saveStatus';

const SHOW_MS = 3000; // a good notice fades after this; an error stays until closed

// A short message floating at the bottom of the view: a status dot, the text, and a close ×.
export function Toast({ notice, onDismiss }: { notice: SaveNotice | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const timeoutId = setTimeout(onDismiss, SHOW_MS);
    return () => clearTimeout(timeoutId);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return (
    <div key={notice.id} className={`toast toast--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span className="toast-dot" aria-hidden="true" />
      <span className="toast-message">{notice.message}</span>
      <button type="button" className="panel-text-btn toast-close" aria-label="Close" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

import type { DebugView } from './landChunk';

const OPTIONS: { value: DebugView; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'patches', label: 'Patches' },
];

// A debug draw mode for the chunk, under the view pill (Dana, 2026-11-11): a small header and a dropdown in the
// viewport's own select style. Patches colors each ground patch on its own, so a seam or a patch at the wrong height shows.
export function DebugViewControl({ debugView, onChange }: { debugView: DebugView; onChange: (view: DebugView) => void }) {
  return (
    <div className="debug-view-control">
      <span className="debug-view-title">Debug view</span>
      <select className="gumball-view-select debug-view-select" value={debugView} onChange={(event) => onChange(event.target.value as DebugView)}>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

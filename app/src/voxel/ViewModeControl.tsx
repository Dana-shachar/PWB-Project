import type { ViewMode } from './landChunk';

const OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'planet', label: 'Planet' },
  { value: 'landChunk', label: 'Land Chunk' },
  { value: 'split', label: 'Split' },
];

interface ViewModeControlProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

// Small floating control over the viewport itself, not buried in the left
// panel (Dana, 2026-09-23 — "add a small button to change view to a land
// chunk or split screen"), replacing the earlier plain on/off toggle.
// Mirrors the "Expand should replace, not overlay" idea already noted in
// ROADMAP.md, Stage 04 — switching to "Land Chunk" replaces the planet pane
// entirely rather than opening a dark overlay on top of it.
export function ViewModeControl({ viewMode, onChange }: ViewModeControlProps) {
  return (
    <div className="view-mode-control">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={'view-mode-btn' + (option.value === viewMode ? ' view-mode-btn--active' : '')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

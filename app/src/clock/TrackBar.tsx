import { useState } from 'react';
import { niceNumber, formatCompactYears } from './timeRuler';
import type { ClockTrack } from './worldClock';

interface TrackBarProps {
  track: ClockTrack;
  viewStart: number; // the first year the lane shows
  viewYears: number; // how many years the lane shows (the zoom)
  disabled?: boolean;
  onScrubDown: (event: React.MouseEvent) => void; // a press on the lane moves the playhead
  onWheel: (event: React.WheelEvent) => void;
  row: number; // its row in the timeline grid
}

// One system's row on the World Clock: its name, then a bar from its start to its end. Dragging the end changes its
// length, as Sequencer and Premiere trim a section; the exact number stays in the system's own section.
export function TrackBar({ track, viewStart, viewYears, disabled = false, onScrubDown, onWheel, row }: TrackBarProps) {
  const [dragLength, setDragLength] = useState<number | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number } | null>(null);
  const length = dragLength ?? track.length;
  const clampLength = (years: number) => Math.round(Math.min(track.maxLength, Math.max(track.minLength, years)));
  const share = (years: number) => `${(years / viewYears) * 100}%`;

  function handleEndDown(event: React.MouseEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation(); // the lane's own drag scrubs the year
    const lane = event.currentTarget.closest('.track-bar-lane') as HTMLElement | null;
    if (!lane) return;
    const lengthAt = (clientX: number) => {
      const rect = lane.getBoundingClientRect();
      return clampLength(viewStart + ((clientX - rect.left) / rect.width) * viewYears - track.start);
    };
    setDragLength(lengthAt(event.clientX));
    setReadout({ x: event.clientX + 12, y: event.clientY + 12 });
    function onMove(moveEvent: MouseEvent) {
      setDragLength(lengthAt(moveEvent.clientX));
      setReadout({ x: moveEvent.clientX + 12, y: moveEvent.clientY + 12 });
    }
    function onUp(upEvent: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragLength(null);
      setReadout(null);
      track.setLength(lengthAt(upEvent.clientX)); // committed on release: a new length reruns the system
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Arrows nudge by a round step of the length, Shift by a bigger one, as a slider's keyboard does.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    event.preventDefault();
    const step = niceNumber(track.length / (event.shiftKey ? 4 : 20));
    track.setLength(clampLength(track.length + (event.key === 'ArrowRight' ? step : -step)));
  }

  return (
    <div className={'track-bar' + (disabled ? ' track-bar--disabled' : '')}>
      <span className="track-bar-label" style={{ gridRow: row, gridColumn: 1 }}>{track.label}</span>
      <div className="track-bar-lane timeline-scrub" style={{ gridRow: row, gridColumn: 2 }} onMouseDown={onScrubDown} onWheel={onWheel}>
        <div
          className={'track-bar-fill' + (track.stale ? ' track-bar-fill--stale' : '') + (dragLength !== null ? ' track-bar-fill--dragging' : '')}
          style={{ left: share(track.start - viewStart), width: share(length) }}
        >
          {track.progress && (
            <span
              className="track-bar-progress"
              role="progressbar"
              aria-label={track.progress.label}
              aria-valuenow={Math.round(track.progress.share * 100)}
              style={{ width: `${((track.progress.toYear - track.start) * track.progress.share / length) * 100}%` }}
            />
          )}
          {track.cachedRanges.map((range, index) => (
            <span
              key={index}
              className="track-bar-cached"
              style={{ left: `${((range.from - track.start) / length) * 100}%`, width: `${((range.to - range.from) / length) * 100}%` }}
            />
          ))}
          <div
            className="track-bar-end ui-tooltip-anchor"
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${track.label} length`}
            aria-valuemin={track.minLength}
            aria-valuemax={track.maxLength}
            aria-valuenow={length}
            aria-disabled={disabled}
            onMouseDown={handleEndDown}
            onKeyDown={handleKeyDown}
          >
            {dragLength === null && <span className="ui-tooltip">Drag to change how long {track.label.toLowerCase()} runs</span>}
          </div>
        </div>
      </div>
      {readout && (
        <div className="area-size-label" style={{ left: readout.x, top: readout.y }}>
          {formatCompactYears(length)} years, ends at {formatCompactYears(track.start + length)}
        </div>
      )}
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { formatCompactYears, formatTickValue, rulerTicks, type TimelineUnit } from './timeRuler';
import { useTimelineView } from './timelineView';
import { trackEnd, type ClockTrack } from './worldClock';
import { TrackBar } from './TrackBar';
import { TimelineFooter } from './TimelineFooter';

interface WorldClockDockProps {
  tracks: ClockTrack[];
  year: number;
  onYearChange: (year: number) => void;
}

// Room past the last track's end, so its end can be dragged longer; the lane grows again after each release.
const SPAN_HEADROOM = 1.25;

// The World Clock's dock: a ruler, a row per living system under one playhead (Unreal's Sequencer tracks), the
// navigator, and the shared bottom row. The year is committed on release, as erosion's scrub is.
export function WorldClockDock({ tracks, year, onYearChange }: WorldClockDockProps) {
  const [unitOverride, setUnitOverride] = useState<TimelineUnit>('auto');
  const [dragYear, setDragYear] = useState<number | null>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const view = useTimelineView();
  const lastEnd = Math.max(1, ...tracks.map(trackEnd));
  const spanYears = lastEnd * SPAN_HEADROOM;
  const viewStart = view.startFraction * spanYears;
  const viewYears = view.spanFraction * spanYears;
  const shownYear = Math.min(dragYear ?? year, lastEnd);
  const clampYear = (value: number) => Math.round(Math.min(lastEnd, Math.max(0, value)));
  const { ticks, unit } = useMemo(() => rulerTicks(viewStart, viewYears, unitOverride), [viewStart, viewYears, unitOverride]);

  function yearAt(clientX: number): number {
    const rect = lanesRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clampYear(viewStart + ((clientX - rect.left) / rect.width) * viewYears);
  }

  function handleScrubDown(event: React.MouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragYear(yearAt(event.clientX));
    function onMove(moveEvent: MouseEvent) {
      setDragYear(yearAt(moveEvent.clientX));
    }
    function onUp(upEvent: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragYear(null);
      onYearChange(yearAt(upEvent.clientX));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const playheadShare = (shownYear - viewStart) / viewYears;
  // The first running track names what is happening and the time left, as the design system's Progress bar does.
  const running = tracks.find((track) => track.progress)?.progress;
  const status = running ? `${running.label}${running.secondsLeft !== null ? `, about ${running.secondsLeft} s left` : '…'}` : undefined;

  return (
    <div className="world-clock">
      <div className="timeline-grid" style={{ '--track-count': tracks.length } as React.CSSProperties}>
        <div className="erosion-timeline-ruler timeline-scrub" style={{ gridRow: 1, gridColumn: 2 }} onMouseDown={handleScrubDown} onWheel={view.handleWheel}>
          {ticks.map((tick) => (
            <span key={tick} className="erosion-timeline-tick" style={{ left: `${((tick - viewStart) / viewYears) * 100}%` }}>
              {formatTickValue(tick, unit)}
            </span>
          ))}
        </div>
        {tracks.map((track, index) => (
          <TrackBar key={track.id} row={index + 2} track={track} viewStart={viewStart} viewYears={viewYears} onScrubDown={handleScrubDown} onWheel={view.handleWheel} />
        ))}
        <div ref={lanesRef} className="world-clock-playhead-lane">
          {playheadShare >= 0 && playheadShare <= 1 && (
            <div className="erosion-timeline-playhead world-clock-playhead" style={{ left: `${playheadShare * 100}%` }} onMouseDown={handleScrubDown} />
          )}
        </div>
        <div ref={view.navigatorRef} className="erosion-timeline-navigator" style={{ gridRow: tracks.length + 2, gridColumn: 2 }} onWheel={view.handleWheel}>
          <div className="erosion-timeline-navigator-track" />
          <div
            className="erosion-timeline-navigator-handle"
            style={{ left: `${view.startFraction * 100}%`, width: `${view.spanFraction * 100}%` }}
            onMouseDown={view.handleNavigatorPan}
          >
            <div className="erosion-timeline-navigator-edge" onMouseDown={view.handleNavigatorEdge('start')} />
            <div className="erosion-timeline-navigator-edge erosion-timeline-navigator-edge--end" onMouseDown={view.handleNavigatorEdge('end')} />
          </div>
        </div>
      </div>
      <TimelineFooter
        readoutYear={shownYear}
        readoutTotal={`/ ${formatCompactYears(lastEnd)} years`}
        status={status}
        onReadoutCommit={(value) => onYearChange(clampYear(value))}
        playing={false}
        transportDisabled
        transportNote="Play needs stored eras, coming next"
        onPlayPause={() => {}}
        onStop={() => onYearChange(0)}
        unit={unitOverride}
        onUnitChange={setUnitOverride}
        zoomLevel={view.zoomLevel}
        onZoomTo={view.zoomTo}
        onZoomOut={view.zoomOut}
        onZoomIn={view.zoomIn}
      />
    </div>
  );
}

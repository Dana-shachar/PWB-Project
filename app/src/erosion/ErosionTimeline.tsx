import { useEffect, useMemo, useRef, useState } from 'react';
import { YEARS_PER_STEP } from './erosionEngine';
import type { ErosionResult } from './erosionControls';
import { formatCompactYears, formatTickValue, rulerTicks, type TimelineUnit } from '../clock/timeRuler';
import { useTimelineView } from '../clock/timelineView';
import { TimelineFooter } from '../clock/TimelineFooter';

interface ErosionTimelineProps {
  // null before the first Run — the dock still mounts and shows an empty,
  // disabled-reading strip rather than not existing at all (Dana, 2026-10-14:
  // "i want to see playhead at the start of the timeline when it's not active").
  result: ErosionResult | null;
  onScrub: (targetStep: number) => void;
  isStale: boolean;
  // Play/Pause (below) animate the playhead through this already-computed run. Erosion reruns by itself on any
  // change, so there is no Run or Reset (Dana, 2026-11-03).
}

// A full playthrough takes roughly this many ticks, whatever the run's own
// length — scrubbing already handles replaying from the nearest checkpoint,
// so playback is just "scrub repeatedly," not a separate simulation path.
const PLAYBACK_TICKS = 140;
const PLAYBACK_INTERVAL_MS = 70;
// How much of the visible window a cached band spans either side of a real
// checkpoint — a deliberate region, not a hairline, so "this is actually
// ready" reads as a filled area rather than a tick (Dana, 2026-10-14: "the
// secondary color should be used to show cached areas").
const CHECKPOINT_BAND_FRACTION = 0.012;

// [S26]'s scrubber for one erosion run: a ruler whose unit follows its zoom, a cache bar whose bands show which parts
// sit at a real checkpoint, the playhead, the navigator, and the bottom row shared with the World Clock (year field,
// Stop and Play/Pause, unit, After Effects' time zoom). Scrubbing loads the nearest checkpoint and replays forward
// [S27], through erosionControls' scrubTo.
export function ErosionTimeline({ result, onScrub, isStale }: ErosionTimelineProps) {
  const view = useTimelineView();
  const { spanFraction, startFraction } = view;
  const [unitOverride, setUnitOverride] = useState<TimelineUnit>('auto');
  // Visual-only position while dragging, committed to scrubTo() on release: a scrub can replay real steps.
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  // The latest committed step, read fresh by the playback interval so it never advances from a stale value.
  const scrubStepRef = useRef(result?.scrubStep ?? 0);
  useEffect(() => {
    scrubStepRef.current = result?.scrubStep ?? 0;
  }, [result?.scrubStep]);

  const hasResult = result !== null;
  const totalSteps = result?.outcome.steps ?? 0;
  const totalYears = totalSteps * YEARS_PER_STEP;
  const displayStep = dragStep ?? result?.scrubStep ?? 0;

  const { ticks, unit } = useMemo(() => {
    if (!hasResult) return { ticks: [] as number[], unit: 'years' as const };
    return rulerTicks(startFraction * totalYears, spanFraction * totalYears, unitOverride);
  }, [hasResult, spanFraction, startFraction, totalYears, unitOverride]);

  // A band around each sparse checkpoint, so the parts ready at once read as regions (Dana, 2026-10-14).
  const cachedBands = useMemo(() => {
    if (!result) return [] as { left: number; width: number }[];
    const halfBand = CHECKPOINT_BAND_FRACTION / 2;
    return result.outcome.checkpoints
      .map((checkpoint) => checkpoint.step / totalSteps)
      .filter((fraction) => fraction >= startFraction - halfBand && fraction <= startFraction + spanFraction + halfBand)
      .map((fraction) => ({
        left: ((fraction - halfBand - startFraction) / spanFraction) * 100,
        width: (CHECKPOINT_BAND_FRACTION / spanFraction) * 100,
      }));
  }, [result, totalSteps, startFraction, spanFraction]);

  function stepFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    const visibleFraction = rect && rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    return Math.round((startFraction + visibleFraction * spanFraction) * totalSteps);
  }

  function handlePointerDown(event: React.MouseEvent) {
    if (!hasResult || event.button !== 0) return;
    event.preventDefault();
    setIsPlaying(false);
    setDragStep(stepFromClientX(event.clientX));
    function onMove(moveEvent: MouseEvent) {
      setDragStep(stepFromClientX(moveEvent.clientX));
    }
    function onUp(upEvent: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragStep(null);
      onScrub(stepFromClientX(upEvent.clientX));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Play animates the playhead through steps already recorded; it never recomputes the simulation.
  useEffect(() => {
    if (!isPlaying || !hasResult) return;
    const stepsPerTick = Math.max(1, Math.round(totalSteps / PLAYBACK_TICKS));
    const id = window.setInterval(() => {
      const next = scrubStepRef.current + stepsPerTick;
      if (next >= totalSteps) {
        onScrub(totalSteps);
        setIsPlaying(false);
      } else {
        onScrub(next);
      }
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPlaying, hasResult, totalSteps, onScrub]);

  function togglePlay() {
    if (!hasResult) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (result.scrubStep >= totalSteps) onScrub(0);
    setIsPlaying(true);
  }

  // Stop ends play and returns to the start, as a media player's Stop does.
  function stop() {
    setIsPlaying(false);
    onScrub(0);
  }

  const playheadFraction = hasResult ? displayStep / totalSteps : 0;
  const playheadVisible = !hasResult || (playheadFraction >= startFraction && playheadFraction <= startFraction + spanFraction);
  const playheadLeft = hasResult ? ((playheadFraction - startFraction) / spanFraction) * 100 : 0;

  return (
    <div className="world-clock">
      <div className="timeline-grid timeline-grid--single">
        <div className="erosion-timeline-ruler" onWheel={hasResult ? view.handleWheel : undefined}>
          {ticks.map((year) => (
            <span key={year} className="erosion-timeline-tick" style={{ left: `${((year - startFraction * totalYears) / (spanFraction * totalYears)) * 100}%` }}>
              {formatTickValue(year, unit)}
            </span>
          ))}
        </div>
        <div
          ref={trackRef}
          className={'erosion-timeline-cache-bar' + (!hasResult ? ' erosion-timeline-cache-bar--empty' : '')}
          onMouseDown={handlePointerDown}
          onWheel={hasResult ? view.handleWheel : undefined}
        >
          {cachedBands.map((band, index) => (
            <span
              key={index}
              className={'erosion-timeline-cached-band' + (isStale ? ' erosion-timeline-cached-band--stale' : '')}
              style={{ left: `${band.left}%`, width: `${band.width}%` }}
            />
          ))}
          <div className="erosion-timeline-track" />
          {playheadVisible && <div className="erosion-timeline-playhead" style={{ left: `${playheadLeft}%` }} />}
        </div>
        <div ref={view.navigatorRef} className="erosion-timeline-navigator" onWheel={hasResult ? view.handleWheel : undefined}>
          <div className="erosion-timeline-navigator-track" />
          {hasResult && (
            <div
              className="erosion-timeline-navigator-handle"
              style={{ left: `${startFraction * 100}%`, width: `${spanFraction * 100}%` }}
              onMouseDown={view.handleNavigatorPan}
            >
              <div className="erosion-timeline-navigator-edge" onMouseDown={view.handleNavigatorEdge('start')} />
              <div className="erosion-timeline-navigator-edge erosion-timeline-navigator-edge--end" onMouseDown={view.handleNavigatorEdge('end')} />
            </div>
          )}
        </div>
      </div>
      <TimelineFooter
        readoutYear={displayStep * YEARS_PER_STEP}
        readoutTotal={hasResult ? `/ ${formatCompactYears(totalYears)} years` : 'Run to see progress'}
        onReadoutCommit={(years) => hasResult && onScrub(Math.round(years / YEARS_PER_STEP))}
        playing={isPlaying}
        transportDisabled={!hasResult}
        onPlayPause={togglePlay}
        onStop={stop}
        unit={unitOverride}
        onUnitChange={setUnitOverride}
        zoomLevel={view.zoomLevel}
        onZoomTo={view.zoomTo}
        onZoomOut={view.zoomOut}
        onZoomIn={view.zoomIn}
        disabled={!hasResult}
      />
    </div>
  );
}

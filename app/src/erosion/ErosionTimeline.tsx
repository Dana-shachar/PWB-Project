import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '../ui/UIElements';
import { PlayIcon, PauseIcon, RunIcon, ResetIcon } from '../ui/icons';
import { YEARS_PER_STEP } from './erosionEngine';
import type { ErosionResult } from './erosionControls';

interface ErosionTimelineProps {
  // null before the first Run — the dock still mounts and shows an empty,
  // disabled-reading strip rather than not existing at all (Dana, 2026-10-14:
  // "i want to see playhead at the start of the timeline when it's not active").
  result: ErosionResult | null;
  onScrub: (targetStep: number) => void;
  isStale: boolean;
  // Play/Pause (below) animate the playhead through this already-computed
  // run. Run/Reset are the real simulation actions, same as the right
  // panel's own buttons, just reachable from the dock too (Dana, 2026-10-14:
  // "it's fine to have a button on the right panel, but these should also
  // live on the timeline itself").
  onRun: () => void;
  onReset: () => void;
}

type TimelineUnit = 'auto' | 'years' | 'thousand' | 'million';

const UNIT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'years', label: 'Years' },
  { value: 'thousand', label: 'Thousand years' },
  { value: 'million', label: 'Million years' },
];

// How much of the full run the view can be zoomed into, as a fraction —
// 1/64th of the whole run at most, never a single point.
const MIN_SPAN_FRACTION = 1 / 64;
const ZOOM_STEP = 1.4;
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

// Standard nice-numbers tick spacing (Heckbert/Talbot): snaps to 1/2/5/10 × a
// power of ten rather than evenly dividing the strip's pixel width, so ticks
// land on readable values at any zoom level. See REFERENCES.md.
function niceNumber(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function unitForMagnitude(years: number): 'years' | 'thousand' | 'million' {
  if (years >= 1_000_000) return 'million';
  if (years >= 1_000) return 'thousand';
  return 'years';
}

function unitLabel(unit: 'years' | 'thousand' | 'million'): string {
  if (unit === 'million') return 'Million years';
  if (unit === 'thousand') return 'Thousand years';
  return 'Years';
}

// A tick's own value, in whatever unit the ruler has already resolved to —
// no "K"/"M" suffix (Dana, 2026-10-14: "0K reads to me as ok... use the
// current unit"), the unit itself is shown once, near the ruler, same idea
// as a real chart's axis label rather than repeating an abbreviation on
// every tick.
function formatTickValue(years: number, unit: 'years' | 'thousand' | 'million'): string {
  if (unit === 'million') return `${Math.round((years / 1_000_000) * 100) / 100}`;
  if (unit === 'thousand') return `${Math.round((years / 1_000) * 10) / 10}`;
  return `${Math.round(years)}`;
}

// The compact current/total readout next to the zoom buttons — a different
// element from formatTickValue above (that one deliberately dropped K/M to
// avoid "0K"-reads-as-"ok" ambiguity on the ruler). Here the pair is read
// together ("100 / 100,000 years"), so an "M" short form only kicks in once
// the full number would be unwieldy (Dana, 2026-10-14: "100 / 100,000 years
// or 100 / 100M years for short when needed").
function formatCompactYears(years: number): string {
  if (years >= 1_000_000) return `${Math.round((years / 1_000_000) * 10) / 10}M`;
  return Math.round(years).toLocaleString();
}

// [S26]'s bottom-strip scrubber for one erosion run's own recorded time: a
// ruler whose unit follows its zoom, a cache bar whose colored bands show
// which regions are actually at a real checkpoint versus need replaying
// from one, a playhead that stays legible against either, a navigator bar
// for the zoomed-in range itself (Dana, 2026-10-14: "like in ae... a
// horizontal scroll bar that changes size"), and transport controls that
// play back the already-computed run rather than recomputing it. Scrubbing
// (whether dragged, typed, or played) never runs the simulation backward —
// it loads the nearest checkpoint and replays forward [S27]. See
// erosion/erosionControls.ts's scrubTo(), which this drives via onScrub.
export function ErosionTimeline({ result, onScrub, isStale, onRun, onReset }: ErosionTimelineProps) {
  // The visible window, as fractions of the whole run — spanFraction=1,
  // startFraction=0 is fully zoomed out. An actual visible *range*, not just
  // a tick-density multiplier, is what gives the navigator bar something
  // real to show.
  const [spanFraction, setSpanFraction] = useState(1);
  const [startFraction, setStartFraction] = useState(0);
  const [unitOverride, setUnitOverride] = useState<TimelineUnit>('auto');
  // Visual-only position while dragging — committed to the real scrubTo()
  // only on release, since a scrub can mean replaying real simulation steps,
  // not a free operation (the same reasoning that made Run manual, not live).
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const navigatorRef = useRef<HTMLDivElement>(null);
  // Always holds the latest committed step, read fresh by the playback
  // interval below so it never advances from a stale closed-over value.
  const scrubStepRef = useRef(result?.scrubStep ?? 0);
  useEffect(() => {
    scrubStepRef.current = result?.scrubStep ?? 0;
  }, [result?.scrubStep]);

  const hasResult = result !== null;
  const totalSteps = result?.outcome.steps ?? 0;
  const totalYears = totalSteps * YEARS_PER_STEP;
  const displayStep = dragStep ?? result?.scrubStep ?? 0;

  function setView(nextSpan: number, centerFraction: number) {
    const clampedSpan = Math.min(1, Math.max(MIN_SPAN_FRACTION, nextSpan));
    const nextStart = Math.min(1 - clampedSpan, Math.max(0, centerFraction - clampedSpan / 2));
    setSpanFraction(clampedSpan);
    setStartFraction(nextStart);
  }

  function zoomBy(factor: number) {
    setView(spanFraction / factor, startFraction + spanFraction / 2);
  }

  const { ticks, unit } = useMemo(() => {
    if (!hasResult) return { ticks: [] as number[], unit: 'years' as const };
    const visibleYears = Math.max(1, spanFraction * totalYears);
    const spacing = niceNumber(visibleYears / 8);
    const resolvedUnit = unitOverride === 'auto' ? unitForMagnitude(visibleYears) : unitOverride;
    const startYear = startFraction * totalYears;
    const endYear = startYear + visibleYears;
    const firstTick = Math.floor(startYear / spacing) * spacing;
    const values: number[] = [];
    for (let year = firstTick; year <= endYear + spacing * 0.001; year += spacing) {
      if (year >= -spacing * 0.001) values.push(year);
    }
    return { ticks: values, unit: resolvedUnit };
  }, [hasResult, spanFraction, startFraction, totalYears, unitOverride]);

  // Checkpoints are sparse, periodic snapshots (a memory budget, not every
  // step, see ErosionCheckpoint in erosionEngine.ts) — everything between
  // two of them needs a replay to reach, it is not instantly available the
  // way a cached point is. A band around each one, not a hairline, is what
  // makes "this part is actually ready" read as a region rather than a tick
  // (Dana, 2026-10-14: "none cached areas should look disabled... rn it
  // looks active").
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

  function fractionFromClientX(element: HTMLDivElement | null, clientX: number): number {
    const rect = element?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function stepFromClientX(clientX: number): number {
    const visibleFraction = fractionFromClientX(trackRef.current, clientX);
    const absoluteFraction = startFraction + visibleFraction * spanFraction;
    return Math.round(absoluteFraction * totalSteps);
  }

  function stopPlayback() {
    setIsPlaying(false);
  }

  function handlePointerDown(event: React.MouseEvent) {
    if (!hasResult || event.button !== 0) return;
    event.preventDefault();
    stopPlayback();
    setDragStep(stepFromClientX(event.clientX));

    function onMove(moveEvent: MouseEvent) {
      setDragStep(stepFromClientX(moveEvent.clientX));
    }
    function onUp(upEvent: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const finalStep = stepFromClientX(upEvent.clientX);
      setDragStep(null);
      onScrub(finalStep);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Scroll/pinch over the strip, same convention a video editor's timeline
  // uses — the dedicated +/- buttons are the explicit, discoverable
  // fallback for the same control, and the navigator bar below is a third,
  // all three drive the same spanFraction/startFraction state so they can
  // never disagree (Dana, 2026-10-14: "both", not one or the other).
  function handleWheel(event: React.WheelEvent) {
    if (!hasResult) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }

  // Navigator bar: a miniature of the whole run, its handle's width is the
  // visible span, its position is the visible start — dragging the handle's
  // body pans, dragging either edge resizes it, which is the same zoom the
  // ruler/+-/scroll already drive (Dana, 2026-10-14, modeled on AE's
  // horizontal scrollbar-that-changes-size).
  function handleNavigatorPan(event: React.MouseEvent) {
    if (!hasResult || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startClientX = event.clientX;
    const startStart = startFraction;

    function onMove(moveEvent: MouseEvent) {
      const rect = navigatorRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const deltaFraction = (moveEvent.clientX - startClientX) / rect.width;
      setStartFraction(Math.min(1 - spanFraction, Math.max(0, startStart + deltaFraction)));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleNavigatorEdge(edge: 'start' | 'end') {
    return (event: React.MouseEvent) => {
      if (!hasResult || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      function onMove(moveEvent: MouseEvent) {
        const fraction = fractionFromClientX(navigatorRef.current, moveEvent.clientX);
        if (edge === 'start') {
          const end = startFraction + spanFraction;
          const nextStart = Math.min(end - MIN_SPAN_FRACTION, Math.max(0, fraction));
          setStartFraction(nextStart);
          setSpanFraction(end - nextStart);
        } else {
          setSpanFraction(Math.min(1 - startFraction, Math.max(MIN_SPAN_FRACTION, fraction - startFraction)));
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  function commitReadout(event: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) {
    if (!hasResult) return;
    const input = event.currentTarget as HTMLInputElement;
    const parsed = parseFloat(input.value.replace(/,/g, ''));
    if (!Number.isNaN(parsed)) onScrub(Math.round(parsed / YEARS_PER_STEP));
  }

  // Play/Pause animates the playhead through steps already recorded by a
  // run, it never recomputes the simulation (that's Run) — reads
  // scrubStepRef fresh each tick rather than closing over a render's own
  // result.scrubStep, which would otherwise go stale and advance from the
  // same starting point forever.
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
      stopPlayback();
      return;
    }
    if (result.scrubStep >= totalSteps) onScrub(0);
    setIsPlaying(true);
  }

  const playheadFraction = hasResult ? displayStep / totalSteps : 0;
  const playheadVisible = !hasResult || (playheadFraction >= startFraction && playheadFraction <= startFraction + spanFraction);
  const playheadLeft = hasResult ? ((playheadFraction - startFraction) / spanFraction) * 100 : 0;

  return (
    <div className="erosion-timeline">
      {/* Transport sits at the top, centered across the whole dock — the
          primary control of a timeline, same position and prominence a real
          media player gives it (Dana, 2026-10-14: "the media player buttons
          should sit on the top" / "centered across the whole dock's full
          width"). Each button carries a real styled tooltip, not the
          browser's native title-attribute delay (Dana, 2026-10-14: "for icon
          based buttons always include a tool tip on hover"). */}
      <div className="erosion-timeline-transport">
        <button type="button" className="erosion-timeline-transport-btn ui-tooltip-anchor" onClick={togglePlay} disabled={!hasResult}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
          <span className="ui-tooltip">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
        <button type="button" className="erosion-timeline-transport-btn ui-tooltip-anchor" onClick={onRun}>
          <RunIcon />
          <span className="ui-tooltip">Run</span>
        </button>
        <button type="button" className="erosion-timeline-transport-btn ui-tooltip-anchor" onClick={onReset} disabled={!hasResult}>
          <ResetIcon />
          <span className="ui-tooltip">Reset</span>
        </button>
      </div>

      <div className="erosion-timeline-header">
        <span className="erosion-timeline-unit-label">{hasResult ? unitLabel(unit) : 'No run yet'}</span>
        <Select label="Unit" value={unitOverride} onChange={(value) => setUnitOverride(value as TimelineUnit)} options={UNIT_OPTIONS} />
      </div>

      <div className="erosion-timeline-ruler" onWheel={handleWheel}>
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

      {/* The navigator — a miniature of the whole run; its handle's own
          width/position show and control the ruler/cache-bar's zoomed-in
          range, the AE-style "scrollbar that changes size" (Dana, 2026-10-14).
          Taller than the first pass and scrollable/zoomable directly, not
          only the ruler above it (Dana, 2026-10-14: "the nav bar should be
          taller and scrubbable"). The flanking labels from the previous pass
          are gone, the handle's own width/position already say this, they
          were redundant (Dana, 2026-10-14: "there's text here that should be
          removed on both sides"). */}
      <div ref={navigatorRef} className="erosion-timeline-navigator" onWheel={handleWheel}>
        <div className="erosion-timeline-navigator-track" />
        {hasResult && (
          <div
            className="erosion-timeline-navigator-handle"
            style={{ left: `${startFraction * 100}%`, width: `${spanFraction * 100}%` }}
            onMouseDown={handleNavigatorPan}
          >
            <div className="erosion-timeline-navigator-edge" onMouseDown={handleNavigatorEdge('start')} />
            <div className="erosion-timeline-navigator-edge erosion-timeline-navigator-edge--end" onMouseDown={handleNavigatorEdge('end')} />
          </div>
        )}
      </div>

      {/* Zoom buttons moved here, under the navigator, right-aligned, next to
          the current/total readout (Dana, 2026-10-14: "the -/+ need to be
          below it on the right" / "this belongs with the zoom controls").
          The readout stays a real editable field (typing still jumps to an
          exact position), the compact "current / total" format is just how
          it reads, formatCompactYears only abbreviates the total, the
          editable value itself always stays the precise, unambiguous number. */}
      <div className="erosion-timeline-zoom-row">
        <div className="erosion-timeline-readout">
          <input
            type="text"
            className="ui-slider-field"
            defaultValue={Math.round(displayStep * YEARS_PER_STEP).toLocaleString()}
            key={displayStep}
            disabled={!hasResult}
            onBlur={commitReadout}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <span className="erosion-timeline-readout-label">
            {hasResult ? `/ ${formatCompactYears(totalYears)} years` : 'Run to see progress'}
          </span>
        </div>
        <div className="erosion-timeline-zoom-buttons">
          <button type="button" className="erosion-timeline-zoom-btn ui-tooltip-anchor" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!hasResult}>
            −<span className="ui-tooltip">Zoom out</span>
          </button>
          <button type="button" className="erosion-timeline-zoom-btn ui-tooltip-anchor" onClick={() => zoomBy(ZOOM_STEP)} disabled={!hasResult}>
            +<span className="ui-tooltip">Zoom in</span>
          </button>
        </div>
      </div>
    </div>
  );
}

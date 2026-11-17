import { useEffect } from 'react';
import type { ClockTrack } from '../clock/worldClock';
import { MAX_DURATION_YEARS, type useErosion } from './erosionControls';
import { YEARS_PER_STEP } from './erosionEngine';

type Erosion = ReturnType<typeof useErosion>;

const CHECKPOINT_BAND_YEARS = YEARS_PER_STEP; // each saved checkpoint drawn as a band this wide on the track

// Erosion as a World Clock track (Dana, 2026-11-17): its length is Duration, its saved checkpoints the ready bands.
export function erosionTrack(erosion: Erosion): ClockTrack {
  const result = erosion.result;
  return {
    id: 'erosion',
    label: 'Erosion',
    start: 0,
    length: erosion.durationYears,
    minLength: YEARS_PER_STEP,
    maxLength: MAX_DURATION_YEARS,
    setLength: erosion.setDurationYears,
    cachedRanges: result
      ? result.outcome.checkpoints.map((checkpoint) => {
          const year = checkpoint.step * YEARS_PER_STEP;
          return { from: Math.max(0, year - CHECKPOINT_BAND_YEARS / 2), to: year + CHECKPOINT_BAND_YEARS / 2 };
        })
      : [],
    stale: erosion.isStale,
    progress: null,
  };
}

// Shows erosion at the playhead's year (its saved run, scrubbed as its own timeline did); no year means the run's end.
export function useErosionAtYear(erosion: Erosion, year: number | null): void {
  const result = erosion.result;
  const totalSteps = result?.outcome.steps ?? 0;
  const targetStep = year === null ? totalSteps : Math.min(totalSteps, Math.round(year / YEARS_PER_STEP));
  useEffect(() => {
    if (!result || result.scrubStep === targetStep) return;
    erosion.scrubTo(targetStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reruns only when the target or the run changes
  }, [targetStep, result?.outcome]);
}

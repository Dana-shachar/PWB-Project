import { useState } from 'react';

// One world year for every living system, each on its own track (Houdini's DOP networks: one global time, each
// simulation offset from it). Erosion is not on it: it builds the terrain life starts from, as in Gaea and World Machine.
export interface ClockTrack {
  id: string;
  label: string;
  start: number; // the world year the system starts at
  length: number; // years it runs
  minLength: number;
  maxLength: number;
  setLength: (years: number) => void;
  cachedRanges: { from: number; to: number }[]; // world years held ready to show, drawn as bands
  stale: boolean; // held results are out of date: a setting changed
  progress: TrackProgress | null; // a run in progress, drawn as it renders, as After Effects and Blender fill their timelines
}

export interface TrackProgress {
  toYear: number; // the year the run is heading for
  share: number; // 0 to 1 done
  secondsLeft: number | null;
  label: string; // what is happening, for the bottom row
}

// The playhead starts at the end, where a full run leaves the world; null keeps it there as tracks grow.
export function useWorldClock() {
  const [year, setYear] = useState<number | null>(null);
  return { year, setYear };
}

export const trackEnd = (track: ClockTrack) => track.start + track.length;

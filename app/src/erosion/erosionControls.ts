import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { DEFAULT_EROSION_FILTER_SHAPE, type ErosionFilterShape, type NoiseLayer } from '../map/heightmap';
import { clampPatchSamples, type TerrainPatch } from '../planet/patch';
import type { SavedErosionRun } from '../firebase/storage';
import { createDefaultErosionRates, type ErosionOutcome, type ErosionRates } from './erosionEngine';
import { liquidNamed } from '../rivers/riverClimate';

// How long one press of Run covers, in story time rather than in solver
// steps. The engine converts it (see YEARS_PER_STEP in erosionEngine.ts),
// which is the only place the two clocks meet.
const DEFAULT_DURATION_YEARS = 100_000;
export const MAX_DURATION_YEARS = 1_000_000;
// The planet's stream power passes for a Duration: its longest run at the longest Duration. Inferred, TUNABLE
const PLANET_PASSES_AT_MAX_DURATION = 1500;
export const planetErosionPasses = (years: number) => Math.round((years / MAX_DURATION_YEARS) * PLANET_PASSES_AT_MAX_DURATION);

// How finely the physics is computed. A third thing from the chunk's mesh
// detail and from which ground the patch covers, and the one that decides
// whether channels have anywhere to form: the first version inherited the
// mesh's 16 and ran on a 17 cell grid, where nothing visible can happen.
const DEFAULT_GRID_RESOLUTION = 257;

// Erosion runs on its own this long after the last change, so a slider drag runs once, when it settles.
const AUTO_RUN_DELAY_MS = 300;

// One finished run, kept with the patch it was run on. Carrying the patch is
// what lets the chunk tell whether the result still describes the ground it
// is showing: pick a different spot on the planet and the result stops
// applying, rather than being stretched over new terrain.
export interface ErosionResult {
  outcome: ErosionOutcome;
  patch: TerrainPatch;
  // What the run read from Ocean and Climate, so a saved project replays it exactly.
  seaLevel: number;
  rates: ErosionRates;
  // Where the scrub slider currently sits, 0..outcome.steps. outcome.steps
  // and outcome.years always describe the full run; this is the only thing
  // that moves while scrubbing. Starts at the end, the same place Run leaves it.
  scrubStep: number;
}

// The Erosion stage's own state: the rates, how long a run lasts, how finely
// it is computed, where the sea is, and what the last run produced. Its own
// hook in its own folder, per the standing rule that a feature owns its
// state from the first step rather than accumulating in App.tsx (see
// ISSUES.md, 2026-09-22).
export function useErosion(
  sceneHandleRef: RefObject<SceneCanvasHandle | null>,
  // Watched only to notice that the terrain feeding erosion has changed.
  layers: NoiseLayer[],
  paintVersion: number,
  // The one sea level (Ocean) and the engine's rain from the one Rainfall (Climate), never set here.
  seaLevel: number,
  rainfall: number,
) {
  const [rates, setRates] = useState<ErosionRates>(createDefaultErosionRates);
  const [durationYears, setDurationYears] = useState(DEFAULT_DURATION_YEARS);
  // One Strength for both erosions: it scales the chunk engine's Erosion Rate and the planet's k from their tuned defaults.
  const [strength, setStrength] = useState(1);
  const [enabled, setEnabled] = useState(false); // off on load (Dana, 2026-11-03); off means no carving anywhere
  // The erosion filter on the planet's surface follows the same switch and Strength (map/heightmap.ts).
  const [filterShape, setFilterShape] = useState<ErosionFilterShape>(DEFAULT_EROSION_FILTER_SHAPE); // the gullies' look
  const [filterRevision, setFilterRevision] = useState(0); // steps when the filter changes, so the land chunk re-bakes
  useEffect(() => {
    sceneHandleRef.current?.setErosionFilter(enabled ? strength : 0, filterShape);
    setFilterRevision((value) => value + 1);
  }, [sceneHandleRef, enabled, strength, filterShape]);
  const [gridResolution, setGridResolution] = useState(DEFAULT_GRID_RESOLUTION);
  const [result, setResult] = useState<ErosionResult | null>(null);
  const [isStale, setIsStale] = useState(false);

  // An edit upstream of erosion leaves the result no longer matching the
  // terrain it was computed from. It is marked rather than discarded, so a
  // run is not silently lost the moment a slider moves. Houdini does the
  // same, coloring such frames as cached but out of date. See REFERENCES.md.
  const hasResult = result !== null;
  useEffect(() => {
    if (hasResult) setIsStale(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasResult is read when this fires, not watched: the trigger is an upstream edit, not gaining a result
  }, [layers, paintVersion]);

  // Runs the whole simulation in one go and keeps both the eroded heights
  // and the measurements of what changed. The engine's four parameters are
  // filled in here: intensity and duration from the panel, location as plain
  // rainfall everywhere, and direction unused until wind and thermal exist.
  // Stage 13's disasters set other values of the same four rather than
  // needing their own code path.
  // Shared by run() and loadSavedRun() below — takes its four values as
  // plain arguments rather than reading them off hook state, since a
  // restored run has to use the exact saved values regardless of whatever
  // the panel currently shows, and setting state then immediately reading
  // it back in the same call would just read the old, pre-update values
  // (React state updates aren't synchronous).
  function runWithSettings(patch: TerrainPatch, runRates: ErosionRates, runDurationYears: number, runGridResolution: number, runSeaLevel: number) {
    const outcome = sceneHandleRef.current?.erodePatch(patch, clampPatchSamples(runGridResolution), {
      intensity: 1,
      durationYears: runDurationYears,
      location: { mode: 'everywhere', center: new THREE.Vector2(0.5, 0.5), radius: 0.25 },
      direction: new THREE.Vector2(0, 0),
      seaLevel: runSeaLevel,
      rates: runRates,
    });
    if (!outcome) return;
    setResult({ outcome, patch, seaLevel: runSeaLevel, rates: runRates, scrubStep: outcome.steps });
    setIsStale(false);
  }

  function run(patch: TerrainPatch) {
    runWithSettings(patch, { ...rates, rainfall, erosionRate: createDefaultErosionRates().erosionRate * strength }, durationYears, gridResolution, seaLevel);
  }

  // Restores a saved run on project load — reruns it rather than loading
  // stored simulation state, since erosion is deterministic and a run's
  // checkpoints alone are far past what Firestore can hold a single document
  // to. See firebase/storage.ts's SavedErosionRun for the real reason.
  // Updates the panel's own controls to match what's restored, same as any
  // other loaded setting.
  function loadSavedRun(saved: SavedErosionRun, patch: TerrainPatch) {
    setRates(saved.rates);
    setStrength(saved.rates.erosionRate / createDefaultErosionRates().erosionRate);
    setDurationYears(saved.durationYears);
    setGridResolution(saved.gridResolution);
    runWithSettings(patch, saved.rates, saved.durationYears, saved.gridResolution, saved.seaLevel);
  }

  // Back to the uneroded terrain, so a run can be compared against what it
  // started from rather than only against another run.
  function clear() {
    setResult(null);
    setIsStale(false);
  }

  // Moves the run to a different point in its own timeline — loads the
  // nearest checkpoint and replays the few steps between, never re-runs the
  // whole thing and never runs backward. Unstyled: a plain slider in
  // ErosionPanel.tsx drives this directly, before any real timeline strip
  // exists. See scene/SceneCanvas.tsx's scrubErosion().
  function scrubTo(targetStep: number) {
    if (!result) return;
    const elevation = sceneHandleRef.current?.scrubErosion(result.outcome, targetStep);
    if (!elevation) return;
    setResult({
      outcome: { ...result.outcome, elevation },
      patch: result.patch,
      seaLevel: result.seaLevel,
      rates: result.rates,
      scrubStep: Math.max(0, Math.min(result.outcome.steps, Math.round(targetStep))),
    });
  }

  function updateRates(changed: Partial<ErosionRates>) {
    setRates((previous) => ({ ...previous, ...changed }));
  }

  return {
    rates,
    updateRates,
    durationYears,
    setDurationYears,
    strength,
    setStrength,
    enabled,
    setEnabled,
    filterRevision,
    filterShape,
    updateFilterShape: (changed: Partial<ErosionFilterShape>) => setFilterShape((previous) => ({ ...previous, ...changed })),
    gridResolution,
    setGridResolution,
    result,
    isStale,
    run,
    clear,
    scrubTo,
    loadSavedRun,
  };
}

// Runs erosion on the chunk's piece by itself whenever anything it reads changes: its settings, the sea level, the
// rain, the terrain or the piece. Replaces the Run button (Dana, 2026-11-03).
export function useErosionAutoRun(erosion: ReturnType<typeof useErosion>, patch: TerrainPatch, seaLevel: number, rainfall: number, layers: NoiseLayer[], paintVersion: number) {
  const { rates, durationYears, gridResolution, strength, enabled } = erosion;
  const clearRef = useRef(erosion.clear);
  clearRef.current = erosion.clear;
  const runRef = useRef(erosion.run);
  runRef.current = erosion.run;
  useEffect(() => {
    if (!enabled) {
      clearRef.current();
      return;
    }
    const timer = window.setTimeout(() => runRef.current(patch), AUTO_RUN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [patch, rates, durationYears, gridResolution, strength, enabled, seaLevel, rainfall, layers, paintVersion]);
}

// The engine's rain per cell per step from Climate's Rainfall: its tuned default at the liquid's typical rainfall,
// scaled in proportion. Inferred, TUNABLE (the engine's step is 500 compressed years, so a literal conversion is meaningless).
export function engineRainfall(rainfallMm: number, liquid: string): number {
  const typical = liquidNamed(liquid).typicalRainfall;
  return typical > 0 ? (createDefaultErosionRates().rainfall * rainfallMm) / typical : 0;
}

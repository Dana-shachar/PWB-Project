import { useEffect, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { NoiseLayer } from '../map/heightmap';
import { clampPatchSamples, type TerrainPatch } from '../planet/patch';
import type { SavedErosionRun } from '../firebase/storage';
import { createDefaultErosionRates, type ErosionOutcome, type ErosionRates } from './erosionEngine';

// How long one press of Run covers, in story time rather than in solver
// steps. The engine converts it (see YEARS_PER_STEP in erosionEngine.ts),
// which is the only place the two clocks meet.
const DEFAULT_DURATION_YEARS = 100_000;
export const MAX_DURATION_YEARS = 1_000_000;

// How finely the physics is computed. A third thing from the chunk's mesh
// detail and from which ground the patch covers, and the one that decides
// whether channels have anywhere to form: the first version inherited the
// mesh's 16 and ran on a 17 cell grid, where nothing visible can happen.
const DEFAULT_GRID_RESOLUTION = 257;

// Where the sea sits, in the same elevation units the heightmap carries,
// which are centered on zero.
const DEFAULT_SEA_LEVEL = -0.1;

// One finished run, kept with the patch it was run on. Carrying the patch is
// what lets the chunk tell whether the result still describes the ground it
// is showing: pick a different spot on the planet and the result stops
// applying, rather than being stretched over new terrain.
export interface ErosionResult {
  outcome: ErosionOutcome;
  patch: TerrainPatch;
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
) {
  const [rates, setRates] = useState<ErosionRates>(createDefaultErosionRates);
  const [durationYears, setDurationYears] = useState(DEFAULT_DURATION_YEARS);
  const [gridResolution, setGridResolution] = useState(DEFAULT_GRID_RESOLUTION);
  const [seaLevel, setSeaLevel] = useState(DEFAULT_SEA_LEVEL);
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
    setResult({ outcome, patch, scrubStep: outcome.steps });
    setIsStale(false);
  }

  function run(patch: TerrainPatch) {
    runWithSettings(patch, rates, durationYears, gridResolution, seaLevel);
  }

  // Restores a saved run on project load — reruns it rather than loading
  // stored simulation state, since erosion is deterministic and a run's
  // checkpoints alone are far past what Firestore can hold a single document
  // to. See firebase/storage.ts's SavedErosionRun for the real reason.
  // Updates the panel's own controls to match what's restored, same as any
  // other loaded setting.
  function loadSavedRun(saved: SavedErosionRun, patch: TerrainPatch) {
    setRates(saved.rates);
    setDurationYears(saved.durationYears);
    setGridResolution(saved.gridResolution);
    setSeaLevel(saved.seaLevel);
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
    gridResolution,
    setGridResolution,
    seaLevel,
    setSeaLevel,
    result,
    isStale,
    run,
    clear,
    scrubTo,
    loadSavedRun,
  };
}

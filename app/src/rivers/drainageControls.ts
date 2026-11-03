import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { HeightDistribution } from '../planet/seaLevel';
import type { RiverClimate } from './riverClimate';
import type { DrainageResult } from './planetDrainage';

const DRAINAGE_DEBOUNCE_MS = 150;


export interface WaterProgress {
  label: string;
  share: number; // 0 to 1
  secondsLeft: number | null;
}

// The terrain's own content, not the object: every globe bake makes a new distribution, even when nothing changed.
function terrainKey(distribution: HeightDistribution | null): string {
  if (!distribution) return '';
  let weighted = 0;
  distribution.cumulative.forEach((value, idx) => { weighted += value * (idx + 1); });
  return `${distribution.min}:${distribution.max}:${distribution.binWidth}:${weighted}`;
}

// The planet's water from erosion: pit fill in a worker, stream power on the GPU, then lakes and rivers in the worker.
// A terrain or sea level change reruns it all; Duration and Strength only continue or restart the erosion (the delta).
// Returns the run's progress, and a revision that steps each time the planet's water map changes (the chunk re-bakes).
export function useDrainage(sceneHandleRef: RefObject<SceneCanvasHandle | null>, enabled: boolean, seaLevel: number, erosionPasses: number, erosionStrength: number, climate: RiverClimate, heightDistribution: HeightDistribution | null): { progress: WaterProgress | null; revision: number } {
  const terrainVersion = terrainKey(heightDistribution);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const readyRef = useRef(false); // a full run finished, so Erosion can build on it
  const erosionRef = useRef({ passes: erosionPasses, strength: erosionStrength });
  const usedRef = useRef(erosionRef.current); // what the last run was asked for
  const seaLevelRef = useRef(seaLevel);
  const climateRef = useRef(climate); // the lakes' water (Rainfall, Temperature, Liquid)
  const startMsRef = useRef(0);
  const fillMsRef = useRef(0);
  const [progress, setProgress] = useState<WaterProgress | null>(null);
  const [revision, setRevision] = useState(0);
  // Carving's progress, with the time left from the pace so far.
  const carving = useMemo(() => (share: number) => {
    const elapsed = (performance.now() - startMsRef.current) / 1000;
    const secondsLeft = share > 0.05 ? Math.max(1, Math.round((elapsed / share) * (1 - share))) : null;
    setProgress({ label: 'Carving rivers', share, secondsLeft });
  }, []);

  // A finished GPU run goes to the worker for lakes and rivers; if Erosion moved meanwhile, the erosion passes go first.
  const { handleResult, changeErosion } = useMemo(() => {
    function handleResult(result: DrainageResult | null, requestId: number): void {
      if (!result || requestId !== requestIdRef.current) return;
      readyRef.current = true;
      console.log('[TEMP water] gpu', { ms: Math.round(performance.now() - startMsRef.current), erosion: usedRef.current });
      if (erosionRef.current !== usedRef.current) {
        changeErosion(++requestIdRef.current);
        return;
      }
      const { eroded, drainage, width, height, cellDiagonal, metersPerUnit } = result;
      setProgress({ label: 'Finding lakes and rivers', share: 1, secondsLeft: null });
      workerRef.current?.postMessage({ type: 'analyze', eroded, drainage, width, height, seaLevel: seaLevelRef.current, cellDiagonal, metersPerUnit, climate: climateRef.current, requestId }, [eroded.buffer, drainage.buffer]);
    }
    function changeErosion(requestId: number): void {
      usedRef.current = erosionRef.current;
      startMsRef.current = performance.now();
      carving(0);
      void sceneHandleRef.current?.setPlanetErosionPasses(usedRef.current.passes, usedRef.current.strength, carving).then((result) => handleResult(result, requestId));
    }
    return { handleResult, changeErosion };
  }, [sceneHandleRef, carving]);

  useEffect(() => {
    const worker = new Worker(new URL('./drainage.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onerror = (event) => console.error('[TEMP water] worker error', event.message);
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.requestId !== requestIdRef.current) {
        console.log('[TEMP water] dropped an old answer', message.type);
        return;
      }
      if (message.type === 'filled') {
        fillMsRef.current = message.ms;
        const { filled, width, height } = message as { filled: Float32Array; width: number; height: number };
        usedRef.current = erosionRef.current;
        startMsRef.current = performance.now();
        void sceneHandleRef.current?.runPlanetDrainage(filled, width, height, seaLevelRef.current, usedRef.current.passes, usedRef.current.strength, carving).then((result) => handleResult(result, message.requestId));
        return;
      }
      if (message.type === 'analyzed') {
        setProgress(null);
        console.log('[TEMP water]', { pitFillMs: fillMsRef.current, analyzeMs: message.ms, riverCells: message.riverCells, deadEnds: message.deadEnds, lakeCells: message.lakeCells, lakesTouchingOcean: message.lakesTouchingOcean });
        sceneHandleRef.current?.setPlanetWaterMap(message.waterMap, message.width, message.height, message.totalRows, message.valleySpacing);
        setRevision((value) => value + 1);
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [sceneHandleRef, handleResult, carving]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    readyRef.current = false;
    seaLevelRef.current = seaLevel;
    if (!enabled || !terrainVersion) {
      setProgress(null);
      sceneHandleRef.current?.setPlanetWaterMap(null, 0, 0, 0, 0);
      setRevision((value) => value + 1);
      return;
    }
    const timer = window.setTimeout(() => {
      console.log('[TEMP water] run starts', { requestId });
      setProgress({ label: 'Reading the terrain', share: 0, secondsLeft: null });
      void sceneHandleRef.current?.getGlobeElevationAsync().then((elevation) => {
        if (!elevation || requestId !== requestIdRef.current) return;
        const { data, width, height } = elevation;
        workerRef.current?.postMessage({ type: 'fill', heights: data, width, height, seaLevel, requestId }, [data.buffer]);
      });
    }, DRAINAGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sceneHandleRef, enabled, seaLevel, terrainVersion]);

  useEffect(() => {
    erosionRef.current = { passes: erosionPasses, strength: erosionStrength };
    if (!readyRef.current) return; // a run in progress picks it up when it ends
    const timer = window.setTimeout(() => changeErosion(++requestIdRef.current), DRAINAGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [erosionPasses, erosionStrength, changeErosion]);

  // A climate change refills only the lakes, in the worker, from its cached run (the delta).
  const { rainfall, temperature, liquid } = climate;
  useEffect(() => {
    climateRef.current = { rainfall, temperature, liquid };
    const timer = window.setTimeout(() => {
      workerRef.current?.postMessage({ type: 'climate', climate: climateRef.current, requestId: requestIdRef.current });
    }, DRAINAGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [rainfall, temperature, liquid]);

  return { progress, revision };
}

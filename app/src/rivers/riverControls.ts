import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ElevationReadback } from '../map/heightmap';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { RiverClimate } from './riverClimate';
import { riverQueriesMatch, riverQueryForCamera, type RiverQuery } from './riverView';
import { VALLEY_MAP_WIDTH } from './valleyMap';

const RIVER_DEBOUNCE_MS = 150;
const VALLEY_SETTLE_MS = 300; // valleys re-bake the terrain, so only once a slider has stopped

// The planet's rivers, held by a worker: rebuilt when the terrain or the sea level settles, and rebalanced as the climate moves, and only the segments the
// camera can see come back. terrainVersion is anything that changes with each finished globe bake. Nothing river-sized
// goes through React: its dev timing copies props, which ran out of memory on the full tree.
export function useRivers(sceneHandleRef: RefObject<SceneCanvasHandle | null>, enabled: boolean, seaLevel: number, climate: RiverClimate, showDebug: boolean, erosion: number, terrainVersion: unknown) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const queryIdRef = useRef(0);
  const readyRef = useRef(false);
  const lastQueryRef = useRef<RiverQuery | null>(null);
  // A sea level change reuses the heights: only the terrain needs a new bake.
  const elevationRef = useRef<{ version: unknown; elevation: ElevationReadback } | null>(null);
  const startMsRef = useRef(0);
  const bakeMsRef = useRef(0);
  const climateRef = useRef(climate);
  const erosionRef = useRef(erosion); // river levels follow the land the planet shows, which Erosion mixes
  const treeReadyRef = useRef(false);
  const valleyTimerRef = useRef(0);
  const [valleyRevision, setValleyRevision] = useState(0);
  const [graphReady, setGraphReady] = useState(false); // the worker's one-time node neighbors (riverGraph.ts)
  const [building, setBuilding] = useState(false);
  const inFlightRef = useRef(0); // rivers asked for and not yet back: only the newest climate is ever sent

  const sendClimate = useCallback(() => {
    if (!treeReadyRef.current || inFlightRef.current > 0) return; // the reply in flight sends the latest
    startMsRef.current = performance.now();
    bakeMsRef.current = 0;
    inFlightRef.current++;
    setBuilding(true);
    workerRef.current?.postMessage({ type: 'climate', climate: climateRef.current, requestId: ++requestIdRef.current });
  }, []);

  // Waits for the worker to catch up, so the map comes from the climate on the sliders.
  const sendValleyWhenSettled = useCallback(() => {
    window.clearTimeout(valleyTimerRef.current);
    valleyTimerRef.current = window.setTimeout(() => {
      if (inFlightRef.current > 0) sendValleyWhenSettled();
      else workerRef.current?.postMessage({ type: 'valley', erosionStrength: erosionRef.current });
    }, VALLEY_SETTLE_MS);
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('./riverTree.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'graphReady') {
        console.log('[TEMP rivers] graph', { ms: message.ms });
        setGraphReady(true);
        return;
      }
      if (message.type === 'segments') {
        if (message.queryId === queryIdRef.current) sceneHandleRef.current?.setRiverSegments(message.segments);
        return;
      }
      if (message.type === 'valley') {
        console.log('[TEMP rivers] valleys', { ms: message.ms, maxBucketCount: message.maxBucketCount, overflowBuckets: message.overflowBuckets, rows: message.map.length / 4 / VALLEY_MAP_WIDTH });
        sceneHandleRef.current?.setValleyMap(message.map);
        setValleyRevision((revision) => revision + 1);
        return;
      }
      inFlightRef.current--;
      if (message.requestId !== requestIdRef.current) return;
      setBuilding(false);
      console.log('[TEMP rivers]', JSON.stringify({ climate: message.climate, lakeDots: message.lakeDots, bakeMs: bakeMsRef.current, totalMs: Math.round(performance.now() - startMsRef.current), nodes: message.nodes, mouths: message.mouths, pits: message.pits, closedLakes: message.closedLakes, spillingLakes: message.spillingLakes, lakeLandPercent: Math.round(message.lakeLandShare * 1000) / 10, largestLake: message.largestLake, storedMB: Math.round(message.storedBytes / 1e5) / 10, gridAlignedPercent: Math.round(message.alignedShare * 1000) / 10 }));
      sceneHandleRef.current?.setRiverLakes(message.lakeNodes);
      readyRef.current = true;
      treeReadyRef.current = true;
      lastQueryRef.current = null; // the next camera check asks again
      const latest = climateRef.current;
      if (latest.rainfall !== message.climate.rainfall || latest.temperature !== message.climate.temperature || latest.liquid !== message.climate.liquid) sendClimate();
      sendValleyWhenSettled();
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [sceneHandleRef, sendClimate, sendValleyWhenSettled]);

  const { rainfall, temperature, liquid } = climate;
  // Climate changes skip the debounce: each one waits only for the last, so the lakes follow the drag.
  useEffect(() => {
    climateRef.current = { rainfall, temperature, liquid };
    sendClimate();
  }, [rainfall, temperature, liquid, sendClimate]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    readyRef.current = false;
    treeReadyRef.current = false;
    if (!enabled || !terrainVersion) {
      sceneHandleRef.current?.setRiverSegments(null);
      sceneHandleRef.current?.setRiverLakes(null);
      sceneHandleRef.current?.setValleyMap(null);
      setValleyRevision((revision) => revision + 1);
      return;
    }
    const timer = window.setTimeout(() => {
      startMsRef.current = performance.now();
      const cached = elevationRef.current?.version === terrainVersion ? elevationRef.current.elevation : null;
      void (cached ? Promise.resolve(cached) : sceneHandleRef.current?.getGlobeElevationAsync())?.then((elevation) => {
        if (!elevation || requestId !== requestIdRef.current) return;
        elevationRef.current = { version: terrainVersion, elevation };
        bakeMsRef.current = Math.round(performance.now() - startMsRef.current);
        const heights = elevation.data.slice();
        inFlightRef.current++;
        setBuilding(true);
        workerRef.current?.postMessage({ type: 'build', heights, width: elevation.width, height: elevation.height, seaLevel, climate: climateRef.current, requestId }, [heights.buffer]);
      });
    }, RIVER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sceneHandleRef, enabled, seaLevel, terrainVersion]);

  // Asks for the rivers in view whenever the camera has moved enough to change them.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const view = sceneHandleRef.current?.getRiverView();
      if (!view || !readyRef.current) return;
      const query = riverQueryForCamera(view.x, view.y, view.z, view.radius);
      if (riverQueriesMatch(query, lastQueryRef.current) && (query || !lastQueryRef.current)) return;
      lastQueryRef.current = query;
      const queryId = ++queryIdRef.current;
      if (query) workerRef.current?.postMessage({ type: 'query', query, queryId });
      else sceneHandleRef.current?.setRiverSegments(null);
    }, RIVER_DEBOUNCE_MS);
    return () => window.clearInterval(timer);
  }, [sceneHandleRef, enabled]);

  // The blend changes the land, so the river levels taken from it are rebuilt too.
  useEffect(() => {
    erosionRef.current = erosion;
    const timer = window.setTimeout(() => {
      sceneHandleRef.current?.setErosionStrength(erosion);
      setValleyRevision((revision) => revision + 1);
      if (treeReadyRef.current) sendValleyWhenSettled();
    }, RIVER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sceneHandleRef, erosion, sendValleyWhenSettled]);

  useEffect(() => {
    sceneHandleRef.current?.setRiverDebugVisible(showDebug);
  }, [sceneHandleRef, showDebug]);

  return { valleyRevision, riversBusy: enabled && (!graphReady || building) };
}

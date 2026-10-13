import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { NoiseLayer } from '../map/heightmap';
import { buildChunkHeights } from './density';
import { buildSmoothChunkGeometry } from './smoothMesh';
import { DEFAULT_CHUNK_RESOLUTION, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_DEPTH, CHUNK_FACE, CHUNK_TARGET } from './chunkGrid';
import { clampPatchSamples, patchAtDepth, type TerrainPatch } from '../planet/patch';

export type ViewMode = 'planet' | 'landChunk' | 'split';

// Test-chunk voxel pipeline: reads the existing heightmap, builds a density
// grid, meshes it (cube/culled-face, in a Worker so the main thread/3D view
// never blocks), and exposes the resulting geometry, the view-mode control
// (Planet / Land Chunk / Split, Dana 2026-09-23 — replaces a plain on/off
// toggle, matches the earlier "Expand replaces, not overlays" idea), and the
// draggable planet/chunk split ratio. See ROADMAP.md, Stage 07, and
// ISSUES.md, 2026-09-23.
export function useLandChunk(
  sceneHandleRef: RefObject<SceneCanvasHandle | null>,
  layers: NoiseLayer[],
  renderStyle: string,
  // Shared directly with the planet's own terrain height, not this hook's
  // own state — see planet/planetControls.ts and ISSUES.md, 2026-09-23
  // ("the chunk is eventually a part of the planet we're viewing as a flat
  // piece" — one real height value, not two independently-scaled ones). A
  // percentage of context size (Dana, 2026-09-24), converted against
  // chunkSize below — same idea SceneCanvas.tsx applies against radius.
  heightScale: number,
) {
  const [viewMode, setViewMode] = useState<ViewMode>('planet'); // Dana, 2026-09-23 — planet is the default, not split
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  // Fraction of the combined viewport's width given to the planet pane when
  // split — draggable via the divider (startResize below). TODO(DS):
  // arbitrary default, matches the old fixed flex:2/flex:1 ratio.
  const [splitRatio, setSplitRatio] = useState(2 / 3);
  const isResizingRef = useRef(false);
  // Voxels/vertices per axis — detail only, doesn't affect the footprint's
  // physical size (see chunkSize below). ui/Panel.tsx's "Land Chunk"
  // section, see ISSUES.md, 2026-09-23.
  const [resolution, setResolution] = useState(DEFAULT_CHUNK_RESOLUTION);
  // World-space width/depth of the footprint — independent of resolution
  // (Dana, 2026-09-23: "the res should affect detail level, not size").
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE);
  // Which piece of the planet the chunk shows, and how far in. Separate from
  // resolution above, which is how finely that piece is measured: zooming in
  // and measuring finely are different things (Dana, 2026-10-13: "res and
  // zoom shouldnt be the same thing"). Set by clicking the planet.
  const [patch, setPatch] = useState<TerrainPatch>(() => patchAtDepth(CHUNK_FACE, CHUNK_TARGET, DEFAULT_CHUNK_DEPTH));
  const [chunkDepth, setChunkDepth] = useState(DEFAULT_CHUNK_DEPTH);

  // Regenerates whenever the noise layer stack or render style changes
  // (Dana, 2026-09-23 — "connect the chunk to the noise controls"; voxel is
  // a display-mode choice, not the chunk's only way to render), not just
  // when the chunk pane first becomes visible. SceneCanvas's own
  // layers-effect re-renders the composited heightmap texture first — it's
  // a child of whatever calls this hook, so its effect fires before this
  // one in the same commit (see ISSUES.md, 2026-09-22) — by the time this
  // runs, getElevationData() already reflects the latest layers.
  // Painting isn't wired in yet (only the noise stack) — that's
  // strokeHistory/paintVersion, a separate signal.
  useEffect(() => {
    if (viewMode === 'planet') return;
    // Real elevation (Height, per layer), not getPreviewImageData()'s
    // shape/paint composite — see map/heightmap.ts and ISSUES.md, 2026-09-24.
    //
    // The chunk is one terrain patch (planet/patch.ts) drawn flat: the same
    // unit the planet is made of, not a window sampled out of a shared map.
    //
    // Detail comes from the patch covering less ground while its heightmap
    // keeps the same number of samples, so each step up genuinely doubles
    // what you can see, with no ceiling and no growth in cost. The old
    // behavior grew one texture instead, which both ran out of detail and
    // stalled, since every sample had to be copied back from the GPU.
    const samples = clampPatchSamples(resolution + 1);
    const elevationData = sceneHandleRef.current?.getPatchElevationData(patch, samples);
    if (!elevationData) return;
    // The mesh never needs to be finer than the data behind it.
    const meshResolution = Math.min(resolution, samples - 1);

    // heightScale is a percentage of context size, not an absolute
    // scene-unit value (Dana, 2026-09-24) — chunkSize is this context's
    // size, same conversion SceneCanvas.tsx applies against radius for the
    // planet. Without this, the same Height value that looks reasonable
    // against the planet's much larger radius dwarfed the chunk's own much
    // smaller footprint. See ISSUES.md.
    const effectiveHeightScale = (heightScale / 100) * chunkSize;

    if (renderStyle !== 'voxel') {
      // Smooth patch — cheap enough to build directly, no Worker needed.
      setGeometry((previous) => {
        previous?.dispose();
        return buildSmoothChunkGeometry(elevationData, meshResolution, effectiveHeightScale, chunkSize);
      });
      return;
    }

    const worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ positions: Float32Array; normals: Float32Array }>) => {
      const nextGeometry = new THREE.BufferGeometry();
      nextGeometry.setAttribute('position', new THREE.BufferAttribute(event.data.positions, 3));
      nextGeometry.setAttribute('normal', new THREE.BufferAttribute(event.data.normals, 3));
      setGeometry((previous) => {
        previous?.dispose();
        return nextGeometry;
      });
    };

    const heights = buildChunkHeights(elevationData, meshResolution, effectiveHeightScale);
    worker.postMessage({ heights, resolution: meshResolution, size: chunkSize }, [heights.buffer]);

    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneHandleRef is a stable ref
  }, [viewMode, layers, renderStyle, resolution, heightScale, chunkSize, patch]);

  // Drag-to-resize the planet/land-chunk split — mirrors the Slider
  // scrubber's plain mousemove/mouseup pattern (ui/UIElements.tsx), against
  // the viewport container's own bounding box rather than movementX deltas,
  // since the divider should track the cursor directly, not accumulate.
  function startResize(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    isResizingRef.current = true;

    function onMove(moveEvent: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const ratio = (moveEvent.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(0.85, Math.max(0.15, ratio)));
    }
    function onUp() {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Clicking the planet sets which piece the chunk shows, at the current
  // depth. Replaces the hardcoded spot — see ROADMAP.md, Stage 07.
  function pickLocation(clientX: number, clientY: number) {
    const picked = sceneHandleRef.current?.pickPatchAt(clientX, clientY, chunkDepth);
    if (picked) setPatch(picked);
  }

  function changeDepth(depth: number) {
    setChunkDepth(depth);
    setPatch((current) => patchAtDepth(current.face, current.min.clone().add(current.max).multiplyScalar(0.5), depth));
  }

  return {
    viewMode,
    setViewMode,
    geometry,
    splitRatio,
    startResize,
    resolution,
    setResolution,
    chunkSize,
    setChunkSize,
    chunkDepth,
    setChunkDepth: changeDepth,
    pickLocation,
  };
}

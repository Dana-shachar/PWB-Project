import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { NoiseLayer } from '../map/heightmap';
import { buildChunkHeights } from './density';
import { DEFAULT_CHUNK_RESOLUTION, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_DEPTH, CHUNK_FACE, CHUNK_TARGET, type ElevationData } from './chunkGrid';
import { clampPatchSamples, patchAtDepth, type TerrainPatch } from '../planet/patch';
import type { ErosionResult } from '../erosion/erosionControls';

export type ViewMode = 'planet' | 'landChunk' | 'split';

// The whole-chunk texture's size, for the shadow march.
const CHUNK_SHADOW_SAMPLES = 1025;
// The CPU copy of the chunk's heights for camera picking and collision.
const GROUND_SAMPLES = 257;

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
  // The Erosion stage's last run, or null for untouched terrain. It carries
  // the patch and sample count it was computed at, which is what lets this
  // tell whether it still describes the ground on screen: pick a different
  // spot on the planet and the chunk falls back to the plain bake rather
  // than stretching an old run over new terrain. See erosion/
  // erosionControls.ts.
  erosionResult: ErosionResult | null,
  // Re-bakes the chunk when the planet's fine detail changes.
  detailAmount: number,
  // Re-bakes when the settled sea level Roughness fades toward changes (null with water off).
  shoreSeaLevel: number | null,
) {
  const [viewMode, setViewMode] = useState<ViewMode>('planet'); // Dana, 2026-09-23 — planet is the default, not split
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  // The chunk's own raw elevation, as a texture the shader can sample at an
  // arbitrary point — not just at a vertex. Shared by the elevation-color
  // ramp, the cast-shadow march (shaders/terrain/terrain.glsl), and, for the smooth
  // render style, the vertex displacement itself (chunk.vert.glsl), so it's
  // a real GPU render-region texture now (renderDisplayRegion's own target,
  // RGBA/G-channel, the same convention the planet's uHeightMap already
  // uses), not a texture built from a CPU readback — that CPU round-trip is
  // exactly what used to cap this patch's resolution. See ISSUES.md, [B32].
  const [heightMap, setHeightMap] = useState<THREE.Texture | null>(null);
  // heightMap's own resolution, for the fragment shader's gradient-based
  // normal to sample at the right texel spacing (see LandChunkCanvas.tsx's
  // uHeightMapTexelSize). No longer a fixed, known size now that it's a
  // per-patch GPU render target, so it has to travel alongside the texture
  // itself rather than being assumed.
  const [heightMapResolution, setHeightMapResolution] = useState(1);
  // Bumped whenever the smooth chunk's terrain changes, so its patches re-bake.
  const [bakeVersion, setBakeVersion] = useState(0);
  const [groundHeights, setGroundHeights] = useState<ElevationData | null>(null);
  // The world-unit height a raw elevation of 0.5 (this patch's maximum)
  // displaces to — the same `effectiveHeightScale` the geometry itself is
  // built with below, exposed so the shader's color ramp and shadow march
  // can convert between raw elevation and world units the same way the mesh
  // does. See shaders/terrain/terrain.glsl.
  const [maxHeight, setMaxHeight] = useState(0);
  // This patch's own real low and high, in the same raw elevation units the
  // heightmap stores — what the color ramp spans, read from the actual
  // data rather than guessed or anchored to a fixed value (Dana, 2026-10-13:
  // "it should encompass all terrain levels that exist in the planet").
  const [elevationMin, setElevationMin] = useState(-0.5);
  const [elevationMax, setElevationMax] = useState(0.5);
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
  // A dragged Resolution slider fires `resolution` changes many times a
  // second, and the effect below's own work (rebake, rebuild geometry,
  // rebuild the mesh/material downstream in LandChunkCanvas.tsx) is real,
  // synchronous, main-thread cost, doing it on every intermediate value
  // instead of once the value settles is what made dragging it flicker to
  // flat (Dana, 2026-10-18/19: "flicker to flat is still there while i drag
  // the slider"). Same 150ms setTimeout/clearTimeout debounce already used
  // for the planet's own resolution control (SceneCanvas.tsx) — only
  // `resolution` itself is debounced here, not the whole effect: a new
  // patch, a layer edit, a finished erosion run, or a render-style switch
  // all still run immediately, through the effect's own other dependencies
  // below, since none of those are continuous-drag situations.
  const [debouncedResolution, setDebouncedResolution] = useState(resolution);
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedResolution(resolution), 150);
    return () => clearTimeout(timeoutId);
  }, [resolution]);

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
    // An erosion run replaces the bake while it still describes this exact
    // patch. The patch is compared by identity, which is precise here:
    // picking a new spot creates a new patch object, so an old run can never
    // be mistaken for a current one.
    const erodedElevation = erosionResult && erosionResult.patch === patch ? erosionResult.outcome.elevation : null;

    // heightScale is a percentage of context size, not an absolute
    // scene-unit value (Dana, 2026-09-24) — chunkSize is this context's
    // size, same conversion SceneCanvas.tsx applies against radius for the
    // planet. Without this, the same Height value that looks reasonable
    // against the planet's much larger radius dwarfed the chunk's own much
    // smaller footprint. See ISSUES.md.
    const effectiveHeightScale = (heightScale / 100) * chunkSize;
    setMaxHeight(effectiveHeightScale);

    if (renderStyle !== 'voxel') {
      // The color ramp's own low/high — the planet's own global range, read
      // directly, not a range computed fresh from this one patch (whether
      // eroded or not): the same real elevation should read as the same
      // color whether you're looking at the whole planet or zoomed into one
      // patch of it, the GIS convention of a stretch computed once per
      // dataset rather than per tile (Dana, 2026-10-18: "it should use the
      // planet's values, only enhance the quality of them since they're
      // zoomed in on"). See SceneCanvas.tsx's getElevationRange(), REFERENCES.md
      // ("Whole-dataset vs. current-view color stretch"), and ISSUES.md, [B32].
      const globalRange = sceneHandleRef.current?.getElevationRange();
      if (globalRange) {
        setElevationMin(globalRange.min);
        setElevationMax(globalRange.max);
      }
      // Smooth/shaded style: chunk.vert.glsl samples this directly to
      // displace the top surface (the same vertex-texture-fetch technique
      // the planet's own vertex.glsl uses). A real GPU-only hand-off now,
      // not a CPU readback: the planet and the land chunk used to each own
      // a separate renderer, which is what made handing a GPU texture
      // across render as a flat, black, undisplaced chunk (confirmed the
      // hard way, Dana, 2026-10-17) — both panes share one renderer now
      // (scene/sharedViewportRenderer.ts), so that constraint no longer
      // applies. See ISSUES.md, [B32]. The returned texture belongs to the
      // heightmap pipeline's own reused render-target slot, not this
      // component — never disposed here, unlike voxel's own locally-built
      // DataTexture below.
      // The whole chunk at one fixed size, now only for the shadow march; the
      // patches (ChunkPatchRenderer.ts) carry the detail.
      const region = sceneHandleRef.current?.getPatchRegionTexture(patch, CHUNK_SHADOW_SAMPLES);
      if (!region) return;
      setHeightMap((previous) => {
        // Only a voxel-built DataTexture is locally owned and needs
        // disposing here — the GPU region texture belongs to the heightmap
        // pipeline's own reused render-target slot regardless of which
        // mode set it last, disposing it would break that reuse.
        if (previous instanceof THREE.DataTexture) previous.dispose();
        return region.texture;
      });
      setHeightMapResolution(region.resolution);
      // No single mesh: the patches draw the surface, so they re-bake too.
      setGeometry((previous) => {
        previous?.dispose();
        return null;
      });
      setBakeVersion((version) => version + 1);
      setGroundHeights(sceneHandleRef.current?.getPatchElevationData(patch, GROUND_SAMPLES) ?? null);
      return;
    }

    // Voxel style keeps its existing ceiling — its own mesh is genuinely
    // built from this CPU-side data (buildChunkHeights below), not just
    // shaded by it, a real constraint already accepted as [B05], not
    // something this pass changes. For its own color-ramp/shadow sampling
    // (chunk.frag.glsl) it reuses elevationData directly rather than baking
    // and reading back a second time, same patch, same resolution, no
    // reason to pay that cost twice. No effect from the vertex shader's own
    // displacement either way, since this geometry's `displace` attribute
    // is always 0.
    //
    // Unlike smooth style above, this stays a synchronous full readback —
    // the mesh itself (not just the color ramp) is genuinely built from
    // this CPU array, so there's no cheaper, texel-only path available here.
    const voxelSamples = clampPatchSamples(debouncedResolution + 1);
    const elevationData = erodedElevation ?? sceneHandleRef.current?.getPatchElevationData(patch, voxelSamples);
    if (!elevationData) return;
    // The planet's own global range, same as smooth/shaded style above —
    // voxel's own CPU elevationData stays needed for the mesh itself, just
    // no longer also used to compute the ramp's range. See ISSUES.md, [B32].
    const voxelRange = sceneHandleRef.current?.getElevationRange();
    if (voxelRange) {
      setElevationMin(voxelRange.min);
      setElevationMax(voxelRange.max);
    }

    setHeightMap((previous) => {
      // Same reasoning as the smooth-mode branch above, in reverse: only
      // dispose a previous *voxel* texture, never the GPU region texture
      // smooth mode may have left behind, that one belongs to the heightmap
      // pipeline's own reused slot.
      if (previous instanceof THREE.DataTexture) previous.dispose();
      const texture = new THREE.DataTexture(elevationData.data, elevationData.width, elevationData.height, THREE.RedFormat, THREE.FloatType);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    });
    setHeightMapResolution(elevationData.width);

    // The mesh never needs to be finer than the CPU data behind it.
    const meshResolution = Math.min(debouncedResolution, elevationData.width - 1);
    const worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      event: MessageEvent<{ positions: Float32Array; normals: Float32Array; uvs: Float32Array; isTopSurfaces: Float32Array }>,
    ) => {
      const nextGeometry = new THREE.BufferGeometry();
      nextGeometry.setAttribute('position', new THREE.BufferAttribute(event.data.positions, 3));
      nextGeometry.setAttribute('normal', new THREE.BufferAttribute(event.data.normals, 3));
      nextGeometry.setAttribute('uv', new THREE.BufferAttribute(event.data.uvs, 2));
      // Voxel's own mesh never displaces further in the shader — explicit
      // zeros rather than relying on an unset attribute defaulting to 0.
      nextGeometry.setAttribute('displace', new THREE.BufferAttribute(new Float32Array(event.data.positions.length / 3), 1));
      nextGeometry.setAttribute('isTopSurface', new THREE.BufferAttribute(event.data.isTopSurfaces, 1));
      setGeometry((previous) => {
        previous?.dispose();
        return nextGeometry;
      });
    };

    const heights = buildChunkHeights(elevationData, meshResolution, effectiveHeightScale);
    worker.postMessage({ heights, resolution: meshResolution, size: chunkSize }, [heights.buffer]);

    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneHandleRef is a stable ref
  }, [viewMode, layers, renderStyle, debouncedResolution, heightScale, chunkSize, patch, erosionResult, detailAmount, shoreSeaLevel]);

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
    // Which piece of ground is on screen, so the Erosion stage can run on
    // that same piece rather than keeping a second copy of the selection.
    patch,
    // The raw setter, not wrapped through pickLocation/changeDepth — for
    // restoring an exact saved patch on project load, where the point is to
    // reproduce precisely what was there before, not to pick or redepth
    // anything. See projectSettings/saveProject.ts.
    setPatch,
    heightMap,
    heightMapResolution,
    bakeVersion,
    groundHeights,
    maxHeight,
    elevationMin,
    elevationMax,
  };
}

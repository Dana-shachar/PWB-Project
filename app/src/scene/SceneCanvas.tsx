import { useEffect, useImperativeHandle, useRef, forwardRef, type RefObject } from 'react';
import * as THREE from 'three';
import { scene } from './scene';
import { camera, DEFAULT_CAMERA_DISTANCE } from './camera';
import { applyAltitudeRates, controls } from './controls';
import { grid } from './grid';
import type { SharedViewportRenderer } from './sharedViewportRenderer';
import { planet, planetGeometry } from '../planet/mesh';
import type { GumballTarget } from './Gumball';
import { HeightmapPipeline, type NoiseLayer, type StrokeRecord, type UV } from '../map/heightmap';
import { percentileRangeFromBins } from '../map/elevationRange';
import { buildHeightDistribution, type HeightDistribution } from '../planet/seaLevel';
import { waterDebugMode } from '../planet/waterDebug'; // TEMP debug
import { isRippleMapReady } from '../planet/rippleMap';
import { WATER_SHININESS, WATER_SKY_COLOR, type WaterSettings } from '../planet/planetControls';
import type { ElevationData } from '../voxel/chunkGrid';
import { clampPatchSamples, clampPatchTextureResolution, faceIndex, PATCH_BORDER_TEXELS, patchContaining, type TerrainPatch } from '../planet/patch';
import { PlanetPatchRenderer } from '../planet/PlanetPatchRenderer';
import type { PlanetSharedUniforms } from '../planet/planetPatchMesh';
import { buildRampUniformArrays, DEFAULT_COLOR_STOPS, MAX_COLOR_STOPS, type ColorStop } from '../planet/colorRamp';
import { AUTO_MAX_ERROR_PIXELS } from '../planet/patch';
import {
  ErosionEngine,
  stepsForYears,
  YEARS_PER_STEP,
  estimateCheckpointBytes,
  type ErosionCheckpoint,
  type ErosionOutcome,
  type ErosionRun,
} from '../erosion/erosionEngine';

// Exposed to sibling components (MapView, via App.tsx) that need to paint
// onto or read the shared heightmap pipeline this component owns — see
// ISSUES.md, 2026-09-15, for why the pipeline has to live with this
// component's renderer specifically, not a separate instance.
export interface SceneCanvasHandle {
  beginStroke(layerId: string, uv: UV): void;
  paintStroke(layerId: string, uv: UV, radius: number, brushValue?: number, feather?: number): void;
  endStroke(): StrokeRecord | null;
  // Rebuilds every current layer's paint texture from scratch by replaying
  // the given stroke history — for undo (re-deriving state from a
  // shortened history). See ROADMAP.md, Stage 06.
  applyStrokeHistory(strokeHistory: StrokeRecord[]): void;
  // Loads a saved project: creates paint targets for `layers` and replays
  // `strokeHistory` into them synchronously, before the caller touches React
  // state at all — so by the time `layers` reaches props and any child's own
  // layers-effect runs, the paint data is already correct. (The original
  // approach replayed from a React effect *after* setLayers(), which raced
  // SceneCanvas's/MapView's own layers-effects — they could fire first and
  // read stale, pre-replay data. See ISSUES.md, 2026-09-22.)
  loadProject(layers: NoiseLayer[], strokeHistory: StrokeRecord[]): void;
  getPreviewImageData(): ImageData | null;
  // Real elevation (Height, per layer, additive) — what the land chunk
  // samples for its own height, distinct from getPreviewImageData()'s
  // shape/paint composite. See map/heightmap.ts and ISSUES.md, 2026-09-24.
  getElevationData(): ElevationData | null;
  // Bakes one terrain patch and reads its heights back. A patch is the unit
  // everything showing terrain consumes, so the chunk is literally a piece
  // of the planet rather than a separate sampling of a shared map. Always
  // `samples` is how finely the patch is measured; the patch itself is which
  // ground is measured. Independent on purpose. See planet/patch.ts.
  getPatchElevationData(patch: TerrainPatch, samples: number): ElevationData | null;
  // The patch's real min/max, without the full synchronous readback
  // getPatchElevationData above pays for — a GPU reduction pyramid instead
  // (map/heightmap.ts's getRegionMinMaxAsync()), reading back one texel
  // instead of the whole buffer. Built for the smooth/shaded land chunk's
  // color-ramp range specifically, which used to trigger that full readback
  // on every Resolution-slider change purely to find two numbers (Dana,
  // 2026-10-17: "it's really slow... gets stuck"). See ISSUES.md, [B32].
  getPatchRegionMinMaxAsync(patch: TerrainPatch, samples: number): Promise<{ min: number; max: number }> | null;
  // What the smooth/shaded land chunk's color ramp actually calls: the same
  // bake as getPatchRegionMinMaxAsync, Percent Clipped on the GPU (a 256-bin
  // histogram, same convention map/elevationRange.ts's own CPU version
  // uses) instead of left at literal min/max — a single outlier spike was
  // pulling the whole ramp's range wide and squeezing real terrain into a
  // narrow slice of it, reading as repeating color bands (Dana, 2026-10-18).
  // See map/heightmap.ts's getRegionPercentileRangeAsync() and ISSUES.md, [B32].
  getPatchRegionPercentileAsync(patch: TerrainPatch, samples: number): Promise<{ min: number; max: number }> | null;
  // The planet's own global elevation range, already computed once whenever
  // its heightmap changes (updateElevationRange() below) and kept live in
  // sharedUniformsRef for every planet patch to read — the land chunk reads
  // the same value instead of computing its own local one, so a given real
  // elevation reads as the same color whether you're looking at the whole
  // planet or one patch of it zoomed in, the GIS convention of a stretch
  // computed once per dataset rather than per tile (see REFERENCES.md,
  // "Whole-dataset vs. current-view color stretch"). This project's own
  // earlier decision already called for this ("it should encompass all
  // terrain levels that exist in the planet"); the chunk's own per-patch
  // range work (including getPatchRegionPercentileAsync above) was a drift
  // from that, not a deliberate redesign. See ISSUES.md, [B32].
  getElevationRange(): { min: number; max: number } | null;
  // Bakes one patch's heightmap at this patch's own resolution and hands
  // back the GPU texture directly, for the land chunk's display (smooth
  // mode's vertex-texture-fetch displacement, and both styles' color-ramp/
  // shadow sampling). A real, free GPU hand-off, not a CPU readback: the
  // planet and the land chunk used to each own a separate WebGLRenderer on
  // a separate canvas, and a WebGLRenderTarget's texture belongs to
  // whichever one created it, so handing it across directly used to read as
  // a flat, black, undisplaced chunk (Dana, 2026-10-17: "the chunk isnt
  // showing the planet"). Now that both panes render through one shared
  // renderer (scene/sharedViewportRenderer.ts), that constraint no longer
  // applies — this is the fix that was reverted to a CPU readback that
  // night, now reinstated for real. See ISSUES.md, [B32].
  getPatchRegionTexture(patch: TerrainPatch, resolution: number): { texture: THREE.Texture; resolution: number } | null;
  // Bakes a patch into a target the caller owns, for the chunk's patches
  // (voxel/ChunkPatchRenderer.ts). False if the pipeline isn't ready.
  bakePatchInto(patch: TerrainPatch, target: THREE.WebGLRenderTarget): boolean;
  // Bakes one patch, runs the erosion simulation over it, and hands back the
  // eroded heights in the same shape getPatchElevationData returns, so
  // whatever shows terrain cannot tell which of the two it was given, plus
  // measurements of what the run actually changed. Lives here rather than in
  // the erosion feature because the simulation's textures have to belong to
  // this component's renderer, the same constraint the heightmap pipeline
  // has. See erosion/erosionEngine.ts.
  //
  // `gridResolution` is how finely the physics is computed, which is a third
  // thing again from the chunk's mesh detail and from which ground the patch
  // covers. Tying it to the mesh is what made the first version run on a 17
  // cell grid and change nothing visible.
  erodePatch(patch: TerrainPatch, gridResolution: number, run: ErosionRun): ErosionOutcome | null;
  // Moves a finished run's result to a different point in its own timeline —
  // loads the nearest checkpoint at or before targetStep and runs forward
  // the few steps between, never backward, per [S27] in SPEC.md. Returns
  // null if targetStep is outside what outcome actually covers.
  scrubErosion(outcome: ErosionOutcome, targetStep: number): ElevationData | null;
  // Which patch sits under a point on screen, for picking the chunk's
  // location by clicking the planet. Null if the click missed the planet.
  pickPatchAt(clientX: number, clientY: number, depth: number): TerrainPatch | null;
  // For the single shared gumball (scene/sharedGumball.ts) to target this
  // view's camera — this component no longer owns its own Gumball instance,
  // see ISSUES.md, 2026-09-23.
  getGumballTarget(): GumballTarget | null;
}

// TODO(DS): arbitrary placeholder line color, not borrowed from anywhere.
// NOTE: built from the sphere's plain (undisplaced) geometry — displacement
// happens only in the GPU vertex shader, so this overlay won't track the
// actual bumpy noise-displaced surface. Fine for now (surface is flat),
// revisit once real terrain height makes this mismatch visible.
function buildWireframeOverlay(geometry: THREE.BufferGeometry): THREE.LineSegments {
  const wireframeGeometry = new THREE.WireframeGeometry(geometry);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
  return new THREE.LineSegments(wireframeGeometry, material);
}

// [B28]'s fix, active by default: the planet renders as patches that
// subdivide near the camera (planet/PlanetPatchRenderer.ts) instead of one
// mesh sampling a single shared, permanently detail-capped map. The old
// single-mesh path is kept fully built either way (cheap — it's just not
// the one rendered) rather than ripped out, so flipping this back to false
// is a real, working fallback, not a half-removed code path. Wireframe
// display mode is a known, flagged scope cut: patches don't have their own
// wireframe overlay in this pass, so selecting Wireframe falls back to
// showing the old single mesh regardless of this flag (see the displayMode
// effect below).
const USE_PLANET_PATCHES = true;

// Scratch objects for the planet patches' per-frame view of the camera.
const patchViewMatrix = new THREE.Matrix4();
const patchFrustum = new THREE.Frustum();
const patchViewDirection = new THREE.Vector3();

// The old single whole-globe mesh (only shown in Wireframe) has its own
// fixed density now that the Resolution slider is a detail bias.
const OLD_MESH_SEGMENTS = 64;

// The planet's height statistics (ramp range, % land) wait for a slider to pause this long, as the chunk does.
const ELEVATION_STATS_DEBOUNCE_MS = 150;

interface SceneCanvasProps {
  radius: number; // planet radius, in scene units (already converted from km by the caller)
  maxErrorPixels: number; // the Resolution slider: the largest screen error in pixels before a patch splits, lower is sharper (see planet/planetPatches.ts)
  baseColor: string; // hex string, e.g. "#3a7bd5"
  ambientLight: number;
  lightDirX: number;
  lightDirY: number;
  lightDirZ: number;
  lightIntensity: number;
  specularStrength: number;
  shininess: number;
  diffuseWrap: number;
  colorByElevation: boolean;
  colorStops: ColorStop[];
  displayMode: string; // 'shaded' | 'wireframe' | 'voxel'
  gridSpacing: number; // minor grid cell size, in world units
  gridVisible: boolean;
  layers: NoiseLayer[];
  // Shared directly with the land chunk's own height — see
  // planet/planetControls.ts and ISSUES.md, 2026-09-23.
  heightScale: number;
  // Fine detail strength for patch bakes (planet/planetControls.ts).
  detailAmount: number;
  // This pane's own element (App.tsx's .planet-viewport div) — its rect is
  // this view's viewport/scissor rectangle in the shared renderer, and the
  // DOM element OrbitControls listens on, since this component no longer
  // owns a <canvas> of its own. See scene/sharedViewportRenderer.ts.
  viewportRef: RefObject<HTMLDivElement | null>;
  sharedRenderer: SharedViewportRenderer;
  // Reports the terrain's real elevation range up to the UI each time it's
  // recomputed, so the color ramp can show its stops in meters.
  onElevationRangeChange?: (range: { min: number; max: number }) => void;
  // The planet's area-weighted height distribution, for the land share readout (planet/seaLevel.ts).
  onHeightDistributionChange?: (distribution: HeightDistribution | null) => void;
  water: WaterSettings;
  // The settled sea level Roughness fades toward, or null with water off (planet/planetControls.ts).
  shoreSeaLevel: number | null;
}

// Renders nothing of its own — App.tsx's .planet-viewport div is both this
// pane's layout box and its viewport rect, and the single shared <canvas>
// (scene/sharedViewportRenderer.ts) is what actually draws pixels. Every
// Three.js object still lives in local variables/refs inside effects (never
// React state), per the class's
// own React <-> Three.js convention: React owns layout, Three.js owns the stage.
export const SceneCanvas = forwardRef<SceneCanvasHandle, SceneCanvasProps>(function SceneCanvas(
  {
    radius,
    maxErrorPixels,
    baseColor,
    ambientLight,
    lightDirX,
    lightDirY,
    lightDirZ,
    lightIntensity,
    specularStrength,
    shininess,
    diffuseWrap,
    colorByElevation,
    colorStops,
    displayMode,
    gridSpacing,
    gridVisible,
    layers,
    heightScale,
    detailAmount,
    viewportRef,
    sharedRenderer,
    onElevationRangeChange,
    onHeightDistributionChange,
    water,
    shoreSeaLevel,
  },
  handleRef,
) {
  const planetMeshRef = useRef<THREE.Mesh | null>(null);
  const wireframeOverlayRef = useRef<THREE.LineSegments | null>(null);
  // True whenever the sphere geometry has changed since the wireframe
  // overlay was last rebuilt from it (radius effect skips that
  // rebuild while wireframe mode isn't even visible, see [B32]) — the
  // displayMode effect checks this and rebuilds lazily the moment wireframe
  // mode is actually selected, rather than ever showing a stale overlay.
  const wireframeStaleRef = useRef(false);
  const planetPatchRendererRef = useRef<PlanetPatchRenderer | null>(null);
  // One shared copy of every uniform value both the old single mesh and the
  // new per-patch meshes need the same values for (lighting, color ramp,
  // elevation range, camera position) — every effect below that used to set
  // `planetMesh.material.uniforms.X.value = Y` now also mirrors the same
  // value in here, then pushes it to every current patch material in one
  // call, rather than each patch tracking these independently.
  const sharedUniformsRef = useRef<PlanetSharedUniforms>({
    baseColor: new THREE.Color(0x3a7bd5),
    lightDirection: new THREE.Vector3(1, 1, 1),
    ambient: 0.15,
    lightIntensity: 1,
    specularStrength: 0.3,
    shininess: 24,
    diffuseWrap: 0.5,
    cameraPosition: new THREE.Vector3(),
    colorByElevation: 0,
    colorStops: DEFAULT_COLOR_STOPS,
    elevationMin: -0.5,
    elevationMax: 0.5,
    displacementAmplitude: 0,
    radius: 20,
    waterEnabled: 0,
    seaLevel: 0,
    waterStops: DEFAULT_COLOR_STOPS,
    waterClarity: 0.4,
    skyColor: new THREE.Color(WATER_SKY_COLOR),
    waterShininess: WATER_SHININESS,
    foamWidth: 0,
    time: 0,
    rippleEnabled: 0,
    viewWidthPixels: 1000,
    waveDetail: 5,
    waveScale: 4,
    maxErrorPixels: AUTO_MAX_ERROR_PIXELS,
    viewHeightPixels: 800,
    fieldOfViewRadians: Math.PI / 4,
  });
  const gridMeshRef = useRef<THREE.Mesh | null>(null);
  const webglRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const heightmapPipelineRef = useRef<HeightmapPipeline | null>(null);
  const erosionEngineRef = useRef<ErosionEngine | null>(null);
  const gumballTargetRef = useRef<GumballTarget | null>(null);
  const layersRef = useRef<NoiseLayer[]>(layers); // lets the imperative handle read the current layers without re-creating itself
  layersRef.current = layers;
  // Same reason as layersRef: erodePatch() needs the current height
  // percentage to work out the terrain's real slope, without the handle
  // being rebuilt every time the slider moves.
  const heightScaleRef = useRef(heightScale);
  heightScaleRef.current = heightScale;
  // Same "latest prop" pattern, since updateElevationRange runs from effects.
  const onElevationRangeChangeRef = useRef(onElevationRangeChange);
  onElevationRangeChangeRef.current = onElevationRangeChange;
  const onHeightDistributionChangeRef = useRef(onHeightDistributionChange);
  onHeightDistributionChangeRef.current = onHeightDistributionChange;
  const elevationRequestIdRef = useRef(0);
  const elevationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared by applyStrokeHistory() and loadProject() below: replays each of
  // `layers`' stroke history (grouped by layer) and recomposites. Callers
  // pass `layers` explicitly rather than reading layersRef — loadProject
  // needs to run before that ref is updated (see its own comment).
  function replayAndRecomposite(layers: NoiseLayer[], strokeHistory: StrokeRecord[]) {
    const webglRenderer = webglRendererRef.current;
    const heightmapPipeline = heightmapPipelineRef.current;
    const planetMesh = planetMeshRef.current;
    if (!webglRenderer || !heightmapPipeline || !planetMesh) return;
    const recordsByLayer = new Map<string, StrokeRecord[]>();
    for (const record of strokeHistory) {
      const existing = recordsByLayer.get(record.layerId) ?? [];
      existing.push(record);
      recordsByLayer.set(record.layerId, existing);
    }
    // Every layer, not just ones with remaining history — a layer whose
    // only stroke was just undone still needs clearing.
    layers.forEach((layer) => {
      heightmapPipeline.replayLayerHistory(webglRenderer, layer.id, recordsByLayer.get(layer.id) ?? []);
    });
    const heightmapTexture = heightmapPipeline.render(webglRenderer, { layers });
    (planetMesh.material as THREE.ShaderMaterial).uniforms.uHeightMap.value = heightmapTexture;
    updateElevationRange(webglRenderer, heightmapPipeline, planetMesh);
  }

  // The color ramp spans this terrain's own real low to high, not a guessed
  // or fixed-anchor range — per-layer Height stacks additively with no fixed
  // bound, and clamping everything below 0 to one flat color read as a
  // solid painted-on shape rather than terrain (Dana, 2026-10-13: "it should
  // encompass all terrain levels that exist in the planet"). Percent Clip,
  // not the literal min/max — those are each reached at only a handful of
  // isolated pixels on skewed noise like Voronoi, which crushed the ramp
  // toward one end (Dana: "i added the tiniest elevation and the base color
  // disappears"). See map/elevationRange.ts. Runs only where the heightmap
  // itself was just rebuilt, not every frame.
  function updateElevationRange(renderer: THREE.WebGLRenderer, heightmapPipeline: HeightmapPipeline, planetMesh: THREE.Mesh): void {
    // Debounced, then read from a GPU histogram asynchronously (the land chunk's method, [B22]); a slower, older
    // answer arriving after a newer request is dropped.
    if (elevationDebounceRef.current !== null) clearTimeout(elevationDebounceRef.current);
    elevationDebounceRef.current = setTimeout(() => {
      elevationDebounceRef.current = null;
      const requestId = ++elevationRequestIdRef.current;
      void heightmapPipeline.getRegionHistogramAsync(renderer, heightmapPipeline.getGlobeTarget(), true).then((histogram) => {
        if (requestId !== elevationRequestIdRef.current || !histogram) return;
        const range = percentileRangeFromBins(histogram.bins, histogram.min, histogram.max);
        const material = planetMesh.material as THREE.ShaderMaterial;
        material.uniforms.uElevationMin.value = range.min;
        material.uniforms.uElevationMax.value = range.max;
        sharedUniformsRef.current.elevationMin = range.min;
        sharedUniformsRef.current.elevationMax = range.max;
        planetPatchRendererRef.current?.applyShared(sharedUniformsRef.current);
        onElevationRangeChangeRef.current?.({ min: range.min, max: range.max });
        onHeightDistributionChangeRef.current?.(buildHeightDistribution(histogram));
      });
    }, ELEVATION_STATS_DEBOUNCE_MS);
  }

  useImperativeHandle(
    handleRef,
    () => ({
      beginStroke(layerId, uv) {
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRendererRef.current || !heightmapPipeline) return;
        heightmapPipeline.beginStroke(layerId, uv);
      },
      paintStroke(layerId, uv, radius, brushValue = 1, feather = 1) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        const planetMesh = planetMeshRef.current;
        if (!webglRenderer || !heightmapPipeline || !planetMesh) return;
        heightmapPipeline.paintStroke(webglRenderer, layerId, uv, radius, brushValue, feather);
        // Re-composite so the planet's displacement reflects the new stroke immediately.
        const heightmapTexture = heightmapPipeline.render(webglRenderer, { layers: layersRef.current });
        (planetMesh.material as THREE.ShaderMaterial).uniforms.uHeightMap.value = heightmapTexture;
        // Deliberately not updateElevationRange() here — this fires on every
        // dab of a live drag, and that readback is a full GPU→CPU sync over
        // the whole map. The color ramp's peak goes stale mid-stroke as a
        // result, until the next layer edit or stroke-complete catches up
        // (endStroke doesn't re-render); noted rather than silently costly.
      },
      endStroke() {
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!heightmapPipeline) return null;
        return heightmapPipeline.endStroke();
      },
      applyStrokeHistory(strokeHistory) {
        replayAndRecomposite(layersRef.current, strokeHistory);
      },
      loadProject(layers, strokeHistory) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return;
        // Create paint targets for these layers before replaying into them
        // — a fresh load has none yet; render()'s normal sync step creates
        // any that are missing. Uses the explicit `layers` param, not
        // layersRef — this runs before the caller has called setLayers(),
        // so the ref (updated during this component's own render) hasn't
        // caught up yet.
        heightmapPipeline.render(webglRenderer, { layers });
        replayAndRecomposite(layers, strokeHistory);
      },
      getPreviewImageData() {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        return heightmapPipeline.getCompositeImageData(webglRenderer);
      },
      getElevationData() {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        return heightmapPipeline.getElevationData(webglRenderer);
      },
      getPatchElevationData(patch, samples) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        const target = heightmapPipeline.renderRegion(webglRenderer, {
          layers: layersRef.current,
          face: faceIndex(patch.face),
          min: patch.min,
          max: patch.max,
          resolution: clampPatchSamples(samples),
        });
        return heightmapPipeline.getRegionElevationData(webglRenderer, target);
      },
      getPatchRegionMinMaxAsync(patch, samples) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        // Same small, cheap slot getPatchElevationData's own bake uses —
        // this reduces that exact bake, not a separate, bigger one.
        const target = heightmapPipeline.renderRegion(webglRenderer, {
          layers: layersRef.current,
          face: faceIndex(patch.face),
          min: patch.min,
          max: patch.max,
          resolution: clampPatchSamples(samples),
        });
        return heightmapPipeline.getRegionMinMaxAsync(webglRenderer, target);
      },
      getPatchRegionPercentileAsync(patch, samples) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        // Same small, cheap slot the two methods above already share.
        const target = heightmapPipeline.renderRegion(webglRenderer, {
          layers: layersRef.current,
          face: faceIndex(patch.face),
          min: patch.min,
          max: patch.max,
          resolution: clampPatchSamples(samples),
        });
        return heightmapPipeline.getRegionPercentileRangeAsync(webglRenderer, target);
      },
      getElevationRange() {
        return { min: sharedUniformsRef.current.elevationMin, max: sharedUniformsRef.current.elevationMax };
      },
      bakePatchInto(patch, target) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return false;
        heightmapPipeline.bakeRegionToTarget(webglRenderer, {
          layers: layersRef.current,
          face: faceIndex(patch.face),
          min: patch.min,
          max: patch.max,
          resolution: target.width,
          borderTexels: PATCH_BORDER_TEXELS,
        }, target);
        return true;
      },
      getPatchRegionTexture(patch, resolution) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        // Never read back to the CPU — this texture is handed straight to
        // the land chunk's own material, valid now that both panes share one
        // renderer/context. A real GPU-only resolution budget, not the CPU
        // readback-cost ceiling getPatchElevationData above still needs.
        const clampedResolution = clampPatchTextureResolution(resolution);
        const target = heightmapPipeline.renderDisplayRegion(webglRenderer, {
          layers: layersRef.current,
          face: faceIndex(patch.face),
          min: patch.min,
          max: patch.max,
          resolution: clampedResolution,
        });
        return { texture: target.texture, resolution: clampedResolution };
      },
      erodePatch(patch, gridResolution, run) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        const erosionEngine = erosionEngineRef.current;
        if (!webglRenderer || !heightmapPipeline || !erosionEngine) return null;
        const resolution = clampPatchSamples(gridResolution);
        const target = heightmapPipeline.renderRegion(webglRenderer, {
          layers: layersRef.current,
          face: faceIndex(patch.face),
          min: patch.min,
          max: patch.max,
          resolution,
        });
        // Read before the simulation touches it, so what the run changed can
        // be measured rather than asserted.
        const before = heightmapPipeline.getRegionElevationData(webglRenderer, target);
        // The simulation needs the terrain's real vertical-to-horizontal
        // aspect, and height here is a percentage of its context rather than
        // a physical value (see [S15] in SPEC.md). Taking the aspect from
        // that same percentage is what makes the slope the water runs down
        // the slope that is actually on screen. The floor keeps a height of
        // zero from dividing by zero on the way back out.
        const heightToCells = Math.max(1e-3, (heightScaleRef.current / 100) * resolution);
        const steps = stepsForYears(run.durationYears);
        const startedAt = performance.now();
        erosionEngine.seed(webglRenderer, target, heightToCells, run.seaLevel);

        // Periodic checkpoints for scrubbing, bounded by a byte budget
        // rather than a fixed count — [S27]'s rolling window. Always keeps
        // the very start (step 0) and spreads the rest evenly across the
        // run, so a short run and a long one both get reasonable coverage.
        // TODO(DS): CHECKPOINT_BUDGET_BYTES chosen by eye, not derived.
        const CHECKPOINT_BUDGET_BYTES = 64 * 1024 * 1024;
        const maxCheckpoints = Math.max(1, Math.floor(CHECKPOINT_BUDGET_BYTES / estimateCheckpointBytes(resolution)));
        const checkpointInterval = Math.max(1, Math.ceil(steps / maxCheckpoints));
        const checkpoints: ErosionCheckpoint[] = [];
        const firstCheckpoint = erosionEngine.captureCheckpoint(webglRenderer, 0);
        if (firstCheckpoint) checkpoints.push(firstCheckpoint);
        for (let i = 0; i < steps; i++) {
          erosionEngine.step(webglRenderer, run);
          const stepNumber = i + 1;
          if (stepNumber % checkpointInterval === 0 || stepNumber === steps) {
            const checkpoint = erosionEngine.captureCheckpoint(webglRenderer, stepNumber);
            if (checkpoint) checkpoints.push(checkpoint);
          }
        }
        const elevation = erosionEngine.readElevation(webglRenderer, heightToCells);
        const elapsedMs = performance.now() - startedAt;
        if (!elevation) return null;

        let totalChange = 0;
        let maxChange = 0;
        for (let i = 0; i < elevation.data.length; i++) {
          const change = Math.abs(elevation.data[i] - before.data[i]);
          totalChange += change;
          if (change > maxChange) maxChange = change;
        }
        return {
          elevation,
          steps,
          years: steps * YEARS_PER_STEP,
          gridResolution: resolution,
          meanChange: totalChange / elevation.data.length,
          maxChange,
          elapsedMs,
          checkpoints,
          run,
          heightToCells,
        };
      },
      scrubErosion(outcome, targetStep) {
        const webglRenderer = webglRendererRef.current;
        const erosionEngine = erosionEngineRef.current;
        if (!webglRenderer || !erosionEngine || outcome.checkpoints.length === 0) return null;
        const clampedTarget = Math.max(0, Math.min(outcome.steps, Math.round(targetStep)));
        // Nearest checkpoint at or before the target — checkpoints are kept
        // in the order they were captured, so this is the last one that
        // doesn't overshoot.
        let nearest = outcome.checkpoints[0];
        for (const checkpoint of outcome.checkpoints) {
          if (checkpoint.step <= clampedTarget) nearest = checkpoint;
        }
        erosionEngine.loadCheckpoint(webglRenderer, nearest);
        for (let step = nearest.step; step < clampedTarget; step++) {
          erosionEngine.step(webglRenderer, outcome.run);
        }
        return erosionEngine.readElevation(webglRenderer, outcome.heightToCells);
      },
      pickPatchAt(clientX, clientY, depth) {
        const viewportElement = viewportRef.current;
        const planetMesh = planetMeshRef.current;
        const target = gumballTargetRef.current;
        if (!viewportElement || !planetMesh || !target) return null;
        // Standard Three.js picking: screen point to normalized device
        // coordinates, raycast, take the first hit on the planet. Against
        // this pane's own element now, not a canvas — this component no
        // longer owns one, see scene/sharedViewportRenderer.ts.
        const bounds = viewportElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, target.camera);
        // The planet is a group of patch meshes now, not one mesh, when the
        // patches path is active (planetMesh itself still exists either
        // way, just hidden, see the mount effect below) — intersect
        // whichever is actually visible.
        const hit =
          USE_PLANET_PATCHES && planetPatchRendererRef.current
            ? planetPatchRendererRef.current.raycast(raycaster)
            : raycaster.intersectObject(planetMesh, false)[0];
        if (!hit) return null;
        // The hit is in world space and the planet sits at the origin, so the
        // point doubles as the direction from the planet's center. Height
        // displacement happens on the GPU and isn't in this mesh, so the hit
        // is against the undisplaced sphere — fine for choosing an area.
        return patchContaining(hit.point.clone(), depth);
      },
      getGumballTarget() {
        return gumballTargetRef.current;
      },
    }),
    [],
  );

  // Keeps webglRendererRef pointed at the one shared renderer, as it exists
  // right now — every method below already reads webglRendererRef.current
  // rather than the sharedRenderer prop directly, the same "ref mirrors the
  // latest prop" pattern layersRef/heightScaleRef already use, so a closure
  // captured once (the imperative handle, onFrame below) still sees the
  // real renderer once it exists instead of whatever was true when that
  // closure was first created. See scene/sharedViewportRenderer.ts.
  useEffect(() => {
    webglRendererRef.current = sharedRenderer.renderer;
  }, [sharedRenderer.renderer]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const perspectiveCamera = camera((viewportElement.clientWidth || 1) / (viewportElement.clientHeight || 1));
    // Listens on this pane's own element, not a canvas — there's no canvas
    // here anymore, the shared one (scene/sharedViewportRenderer.ts) has no
    // pointer handling of its own, each pane's camera controls attach to
    // whatever DOM element represents that pane's own screen region.
    const orbitControls = controls(perspectiveCamera, viewportElement);
    const gridMesh = grid(gridSpacing);
    const planetMesh = planet(radius, OLD_MESH_SEGMENTS);
    // Centered at the origin (matches the camera/orbit-controls target) so
    // changing the radius grows/shrinks the planet symmetrically in place,
    // rather than anchoring one edge and letting the center drift.
    const wireframeOverlay = buildWireframeOverlay(planetMesh.geometry);
    wireframeOverlay.visible = displayMode === 'wireframe';
    planetMesh.add(wireframeOverlay); // child of the mesh — inherits its position/scale
    planetMeshRef.current = planetMesh;
    wireframeOverlayRef.current = wireframeOverlay;
    gridMeshRef.current = gridMesh;
    heightmapPipelineRef.current = new HeightmapPipeline();
    // Beside the heightmap pipeline for the same reason it sits here: its
    // render targets belong to this renderer and cannot be shared with
    // another one. See erosion/erosionEngine.ts.
    erosionEngineRef.current = new ErosionEngine();
    // Exposed via getGumballTarget() — the single shared gumball
    // (scene/sharedGumball.ts) drives this camera/controls pair when the
    // planet pane is selected, rather than this component owning its own
    // Gumball instance. See ISSUES.md, 2026-09-23.
    // The planet's radius and its radius plus the highest terrain, for the
    // altitude-scaled camera ([B51]).
    const planetSurface = () => {
      const shared = sharedUniformsRef.current;
      const margin = shared.displacementAmplitude * Math.max(Math.abs(shared.elevationMin), Math.abs(shared.elevationMax));
      return { planetRadius: shared.radius, surfaceRadius: shared.radius + margin };
    };
    gumballTargetRef.current = { camera: perspectiveCamera, cameraControls: orbitControls, referenceDistance: DEFAULT_CAMERA_DISTANCE, surface: planetSurface };

    sharedUniformsRef.current.radius = radius;
    const planetPatches = new PlanetPatchRenderer();
    planetPatchRendererRef.current = planetPatches;
    scene.add(planetPatches.group);
    // The old single mesh stays fully built and in the scene graph either
    // way (cheap — geometry/material, no per-frame cost beyond what it
    // already had), just hidden, so it's a real fallback (flip
    // USE_PLANET_PATCHES to false) rather than scaffolding, and so
    // Wireframe mode (not reimplemented for patches this pass) has
    // something real to show instead of a blank viewport.
    planetMesh.visible = !USE_PLANET_PATCHES || displayMode === 'wireframe';
    planetPatches.group.visible = !planetMesh.visible;

    scene.add(gridMesh);
    scene.add(planetMesh);

    // Runs right before this view renders, every frame it's actually drawn —
    // the shared renderer (scene/sharedViewportRenderer.ts) already handles
    // sizing/resize and the render() call itself, and already updates this
    // camera's aspect from this pane's own current rect every frame, so
    // neither is this effect's job anymore.
    function onFrame() {
      const { planetRadius, surfaceRadius } = planetSurface();
      applyAltitudeRates(orbitControls, perspectiveCamera, planetRadius, surfaceRadius);
      orbitControls.update(); // required every frame — damping is enabled, see controls.ts
      // The specular term needs the eye position and the camera moves every
      // frame via orbit controls, so this is read fresh rather than set once.
      const planetMesh = planetMeshRef.current;
      if (planetMesh) {
        (planetMesh.material as THREE.ShaderMaterial).uniforms.uCameraPosition.value.copy(perspectiveCamera.position);
      }
      const planetPatches = planetPatchRendererRef.current;
      const heightmapPipeline = heightmapPipelineRef.current;
      const webglRenderer = webglRendererRef.current;
      if (planetPatches && heightmapPipeline && webglRenderer && USE_PLANET_PATCHES) {
        sharedUniformsRef.current.cameraPosition.copy(perspectiveCamera.position);
        sharedUniformsRef.current.viewHeightPixels = Math.max(1, viewportElement?.clientHeight ?? 1);
        sharedUniformsRef.current.fieldOfViewRadians = THREE.MathUtils.degToRad(perspectiveCamera.fov);
        // What the camera sees, so close-ups build only what is in view.
        perspectiveCamera.updateMatrixWorld();
        patchViewMatrix.multiplyMatrices(perspectiveCamera.projectionMatrix, perspectiveCamera.matrixWorldInverse);
        patchFrustum.setFromProjectionMatrix(patchViewMatrix);
        sharedUniformsRef.current.frustum = patchFrustum;
        perspectiveCamera.getWorldDirection(patchViewDirection);
        sharedUniformsRef.current.viewDirection = patchViewDirection;
        sharedUniformsRef.current.waterDebug = waterDebugMode; // TEMP debug
        sharedUniformsRef.current.time = performance.now() / 1000;
        sharedUniformsRef.current.rippleEnabled = isRippleMapReady() ? 1 : 0;
        sharedUniformsRef.current.viewWidthPixels = Math.max(1, (viewportElement?.clientWidth ?? 1) * window.devicePixelRatio);
        planetPatches.applyFrame(sharedUniformsRef.current);
        // Internally throttled by how far the camera's actually moved — see
        // PlanetPatchRenderer.updatePatches — cheap to call every frame.
        planetPatches.updatePatches(perspectiveCamera.position, webglRenderer, heightmapPipeline, layersRef.current, sharedUniformsRef.current);
      }
    }
    sharedRenderer.registerView('planet', { scene, camera: perspectiveCamera, elementRef: viewportRef, onFrame });

    return () => {
      sharedRenderer.unregisterView('planet');
      orbitControls.dispose();

      heightmapPipelineRef.current?.dispose();
      heightmapPipelineRef.current = null;
      erosionEngineRef.current?.dispose();
      erosionEngineRef.current = null;
      // webglRendererRef itself is owned by the sync effect above, not this
      // one — it mirrors sharedRenderer.renderer for as long as that effect
      // stays mounted, which outlives a single registration cycle here.
      gumballTargetRef.current = null;

      // Remove/dispose whatever the refs *currently* point to, not the
      // `gridMesh`/`planetMesh` this specific effect run created — the grid
      // spacing effect below can have since replaced gridMeshRef.current
      // with a newer object. Cleaning up the stale closure variable instead of
      // the ref's current value leaked the old object under React StrictMode's
      // mount->cleanup->mount dev cycle, which duplicated the grid on screen.
      const currentGrid = gridMeshRef.current;
      if (currentGrid) {
        scene.remove(currentGrid);
        currentGrid.geometry.dispose();
        (currentGrid.material as THREE.Material).dispose();
      }
      gridMeshRef.current = null;

      const currentOverlay = wireframeOverlayRef.current;
      if (currentOverlay) {
        currentOverlay.geometry.dispose();
        (currentOverlay.material as THREE.Material).dispose();
      }
      wireframeOverlayRef.current = null;

      const currentPlanet = planetMeshRef.current;
      if (currentPlanet) {
        scene.remove(currentPlanet); // also removes the overlay, added as its child
        currentPlanet.geometry.dispose();
        (currentPlanet.material as THREE.Material).dispose();
      }
      planetMeshRef.current = null;

      const currentPatches = planetPatchRendererRef.current;
      if (currentPatches) {
        scene.remove(currentPatches.group);
        currentPatches.dispose();
      }
      planetPatchRendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every prop here
    // has its own reactive effect below (rebuilding just the affected piece is
    // cheaper than tearing down the whole scene/renderer/controls on every
    // slider drag); this effect only handles first-mount setup and teardown.
    // viewportRef is a stable ref object; sharedRenderer.registerView/
    // unregisterView get new identities every parent render but this only
    // needs to call whichever one exists at mount/unmount time, not react to
    // them changing in between.
  }, []);

  // Radius: rebuilds the old whole-globe mesh and (while wireframe mode is
  // actually visible) the wireframe overlay with it, since WireframeGeometry
  // is a one-time snapshot, not dynamically linked to the source geometry.
  //
  // Debounced (same setTimeout/clearTimeout pattern as the project's own
  // autosave, projectSettings/saveProject.ts) — a dragged slider fires many
  // rapid changes, and both rebuilds are real, synchronous, main-thread
  // work; doing them on every tick instead of once the value settles is
  // what made this near-freeze while dragging (Dana, 2026-10-18: "very
  // choppy performance, nearly freezing"). 150ms, short enough to still
  // feel immediate once you stop moving the slider, long enough to skip
  // every intermediate value while you're still dragging it.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const planetMesh = planetMeshRef.current;
      if (!planetMesh) return; // not mounted yet — the effect above uses the current values on first build
      planetMesh.geometry.dispose();
      planetMesh.geometry = planetGeometry(radius, OLD_MESH_SEGMENTS);

      // Keep this in sync with the new radius too, not just the geometry —
      // uDisplacementAmplitude is set in the lighting effect below now, it's
      // a user-controlled value (heightScale), not derived from radius.
      const material = planetMesh.material as THREE.ShaderMaterial;
      material.uniforms.uRadius.value = radius;

      // The wireframe overlay is real geometry to rebuild too, skip it
      // while nothing's actually showing it rather than pay that cost on
      // every change regardless — the displayMode effect below rebuilds it
      // lazily, from whatever planetMesh.geometry is by then, the moment
      // wireframe mode is actually selected.
      if (displayMode === 'wireframe') {
        const wireframeOverlay = wireframeOverlayRef.current;
        if (wireframeOverlay) {
          wireframeOverlay.geometry.dispose();
          wireframeOverlay.geometry = new THREE.WireframeGeometry(planetMesh.geometry);
        }
      } else {
        wireframeStaleRef.current = true;
      }

      // updatePatches picks the radius up on the next animate() frame; materials no longer refresh every frame.
      sharedUniformsRef.current.radius = radius;
      planetPatchRendererRef.current?.applyShared(sharedUniformsRef.current);
    }, 150);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayMode is read fresh when the timeout fires (same debounce pattern saveProject.ts already uses), not a reason to restart this effect's own debounce
  }, [radius]);

  // The Resolution slider: only adds or merges patches on the next frame
  // (selection is cheap, builds are budgeted), so no debounce is needed.
  useEffect(() => {
    sharedUniformsRef.current.maxErrorPixels = maxErrorPixels;
  }, [maxErrorPixels]);

  // Grid spacing: rebuilds the grid mesh (its cell size is baked into a
  // shader uniform at construction, simplest to just rebuild it).
  useEffect(() => {
    const oldGrid = gridMeshRef.current;
    if (!oldGrid) return;
    scene.remove(oldGrid);
    oldGrid.geometry.dispose();
    (oldGrid.material as THREE.Material).dispose();

    const newGrid = grid(gridSpacing);
    newGrid.visible = gridVisible;
    scene.add(newGrid);
    gridMeshRef.current = newGrid;
  }, [gridSpacing, gridVisible]);

  // Lighting + base color + height: no rebuild needed, just mutate the
  // shader's uniforms. heightScale (shared directly with the land chunk's
  // own height — see planet/planetControls.ts and ISSUES.md, 2026-09-23) is
  // a percentage of radius, not an absolute scene-unit value (Dana,
  // 2026-09-24) — converted to an actual displacement amount here, same
  // conversion voxel/landChunk.ts does against chunkSize instead.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    if (!planetMesh) return;
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uBaseColor.value.set(baseColor);
    material.uniforms.uAmbient.value = ambientLight;
    material.uniforms.uLightIntensity.value = lightIntensity;
    material.uniforms.uSpecularStrength.value = specularStrength;
    material.uniforms.uShininess.value = shininess;
    material.uniforms.uLightDirection.value.set(lightDirX, lightDirY, lightDirZ);
    material.uniforms.uDisplacementAmplitude.value = (heightScale / 100) * radius;
    material.uniforms.uColorByElevation.value = colorByElevation ? 1 : 0;
    const ramp = buildRampUniformArrays(colorStops);
    const materialRampColors = material.uniforms.uRampColors.value as THREE.Color[];
    for (let i = 0; i < MAX_COLOR_STOPS; i++) materialRampColors[i].copy(ramp.colors[i]);
    (material.uniforms.uRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
    material.uniforms.uRampCount.value = ramp.count;

    const shared = sharedUniformsRef.current;
    shared.baseColor.set(baseColor);
    shared.ambient = ambientLight;
    shared.lightIntensity = lightIntensity;
    shared.specularStrength = specularStrength;
    shared.shininess = shininess;
    shared.diffuseWrap = diffuseWrap;
    shared.lightDirection.set(lightDirX, lightDirY, lightDirZ);
    shared.displacementAmplitude = (heightScale / 100) * radius;
    shared.colorByElevation = colorByElevation ? 1 : 0;
    shared.colorStops = colorStops;
    planetPatchRendererRef.current?.applyShared(shared);
  }, [
    baseColor,
    ambientLight,
    lightIntensity,
    specularStrength,
    shininess,
    diffuseWrap,
    lightDirX,
    lightDirY,
    lightDirZ,
    heightScale,
    radius,
    colorByElevation,
    colorStops,
  ]);

  // Sea level and water look, on the patches and on the old single mesh's vertex shader.
  useEffect(() => {
    const shared = sharedUniformsRef.current;
    shared.waterEnabled = water.enabled ? 1 : 0;
    shared.seaLevel = water.seaLevel;
    shared.waterStops = water.colorStops;
    shared.waterClarity = water.clarity;
    shared.foamWidth = water.foamWidth;
    shared.waveDetail = water.waveDetail;
    shared.waveScale = water.waveScale;
    planetPatchRendererRef.current?.applyShared(shared);
  }, [water]);

  // Roughness fades toward the sea level (heightmap.frag.glsl), so a settled sea level change re-bakes the shown patches.
  useEffect(() => {
    const webglRenderer = webglRendererRef.current;
    const heightmapPipeline = heightmapPipelineRef.current;
    if (!webglRenderer || !heightmapPipeline) return;
    heightmapPipeline.setShoreSeaLevel(shoreSeaLevel);
    if (detailAmount > 0) planetPatchRendererRef.current?.rebakeAll(webglRenderer, heightmapPipeline, layersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detailAmount and layers changes re-bake through the layers effect
  }, [shoreSeaLevel]);

  // Display mode: toggles the wireframe overlay's visibility (it renders
  // alongside the shaded surface, doesn't replace it). Also switches which
  // planet renderer is actually visible — patches don't have their own
  // wireframe overlay this pass (flagged scope cut, see ISSUES.md), so
  // Wireframe falls back to the old single mesh regardless of
  // USE_PLANET_PATCHES.
  useEffect(() => {
    const wireframeOverlay = wireframeOverlayRef.current;
    if (!wireframeOverlay) return;
    wireframeOverlay.visible = displayMode === 'wireframe';

    const planetMesh = planetMeshRef.current;
    const planetPatches = planetPatchRendererRef.current;
    if (!planetMesh) return;

    // The radius effect skips rebuilding this overlay while
    // wireframe mode isn't visible, to avoid paying that cost on every
    // change regardless (see [B32]) — catch up now, the one moment it
    // actually matters, rather than show whatever stale geometry it was
    // last built from.
    if (displayMode === 'wireframe' && wireframeStaleRef.current) {
      wireframeOverlay.geometry.dispose();
      wireframeOverlay.geometry = new THREE.WireframeGeometry(planetMesh.geometry);
      wireframeStaleRef.current = false;
    }

    const showOldMesh = !USE_PLANET_PATCHES || displayMode === 'wireframe';
    planetMesh.visible = showOldMesh;
    if (planetPatches) planetPatches.group.visible = !showOldMesh;
  }, [displayMode]);

  // Layers: regenerates the heightmap texture on demand (not every frame —
  // only when the layer stack actually changes), then points the planet's
  // uHeightMap at it. The planet's vertex shader samples this same texture
  // reference every frame regardless, so the sphere updates live with no
  // extra wiring needed here beyond assigning the uniform once.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    const webglRenderer = webglRendererRef.current;
    const heightmapPipeline = heightmapPipelineRef.current;
    if (!planetMesh || !webglRenderer || !heightmapPipeline) return;

    heightmapPipeline.setDetailAmount(detailAmount);
    const heightmapTexture = heightmapPipeline.render(webglRenderer, { layers });
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uHeightMap.value = heightmapTexture;
    updateElevationRange(webglRenderer, heightmapPipeline, planetMesh);
    // The terrain itself changed, so every currently-visible patch's own
    // bake is now stale — re-bake each one in place rather than wait for
    // the camera to move enough to trigger a fresh selection.
    planetPatchRendererRef.current?.rebakeAll(webglRenderer, heightmapPipeline, layers);
    // sharedRenderer.renderer is read via the ref (consistent with every
    // other method in this file) but still belongs in this effect's own
    // deps: on first mount the renderer doesn't exist yet (see the sync
    // effect above), so without this, the guard above would return once and
    // never automatically retry once it's actually ready.
  }, [layers, detailAmount, sharedRenderer.renderer]);

  return null;
});

import * as THREE from 'three';
import { NOISE_RANGES } from './noiseRanges';
import noiseGlsl from '../shaders/noise.glsl?raw';
// Shared by both passes below — a plain full-screen-quad pass-through, identical
// either way since both render the same quad geometry through the same ortho
// camera; only the fragment shader differs per feature. See heightmap.ts's
// HeightmapPipeline constructor.
import heightmapBrushVertexGlsl from '../shaders/heightmapBrush.vert.glsl?raw';
import heightmapFragmentGlsl from '../shaders/heightmap.frag.glsl?raw'; // noise compositing (the "Noise" tab)
import strokePathFragmentGlsl from '../shaders/strokePath.frag.glsl?raw'; // brush stroke rendering, see beginStroke()/paintStroke()
import minMaxReduceFragmentGlsl from '../shaders/minMaxReduce.frag.glsl?raw'; // elevation-range reduction pyramid, see getRegionMinMaxAsync()
import elevationHistogramVertexGlsl from '../shaders/elevationHistogram.vert.glsl?raw'; // see getRegionPercentileRangeAsync()
import elevationHistogramFragmentGlsl from '../shaders/elevationHistogram.frag.glsl?raw';
import { HISTOGRAM_BINS, CLIP_PERCENT } from './elevationRange';

// TODO(DS): arbitrary placeholder resolution — detail/generation-cost
// tradeoff (see Dana's question 2026-09-14); lower this first if
// live-editing ever feels sluggish.
// Exported so brush radius (MapView.tsx) can convert px to a UV fraction
// relative to the actual texture, not however big the canvas is displayed.
export const HEIGHTMAP_WIDTH = 1024;
export const HEIGHTMAP_HEIGHT = 512; // exported for MapView.tsx's aspect-ratio sizing

// Matches strokePath.frag.glsl's MAX_STROKE_POINTS.
const MAX_STROKE_POINTS = 64;

// Matches heightmap.frag.glsl's MAX_LAYERS.
export const MAX_LAYERS = 16;

// Narrowed to real base generators + 'none' (Dana, 2026-09-30: "Modifiers as
// toggles, not types" — Ridged/Octaves/Terrace/Domain warp used to be
// separate, mutually-exclusive types, each secretly hardcoded to Perlin
// underneath. They're independent boolean modifiers now (below), composable
// on any base generator, matching Gaea's actual structure (fixed order:
// Domain warp → generator/Octaves → Ridged → Terrace). See ISSUES.md.
export type NoiseType = 'none' | 'random' | 'perlin' | 'simplex' | 'voronoi';

// Matches heightmap.frag.glsl's evalBaseGenerator if/else chain (0-3) plus
// 'none' (4). Exported so the UI (NoisePanel.tsx) can build its dropdown
// from the same list instead of a separately-maintained copy.
export const NOISE_TYPE_OPTIONS: { value: NoiseType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'random', label: 'Random' },
  { value: 'perlin', label: 'Perlin' },
  { value: 'simplex', label: 'Simplex' },
  { value: 'voronoi', label: 'Voronoi' },
];

// Voronoi's distance function (Blender and Gaea both offer these).
export type VoronoiDistance = 'euclidean' | 'manhattan' | 'chebychev';

export const VORONOI_DISTANCE_OPTIONS: { value: VoronoiDistance; label: string }[] = [
  { value: 'euclidean', label: 'Euclidean' },
  { value: 'manhattan', label: 'Manhattan' },
  { value: 'chebychev', label: 'Chebychev' },
];

// How a layer's octaves combine (Musgrave's fractal types, as Blender
// implements them). A setting of the Octaves modifier, so any base noise can
// use it; fBm is the plain sum every layer used before this existed.
export type FractalType = 'fbm' | 'multifractal' | 'hybrid' | 'hetero' | 'ridgedMulti';

export const FRACTAL_TYPE_OPTIONS: { value: FractalType; label: string }[] = [
  { value: 'fbm', label: 'fBm' },
  { value: 'multifractal', label: 'Multifractal' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'hetero', label: 'Hetero terrain' },
  { value: 'ridgedMulti', label: 'Ridged multifractal' },
];

// Matches heightmap.frag.glsl's uLayerFractalType.
const FRACTAL_TYPE_INDEX: Record<FractalType, number> = { fbm: 0, multifractal: 1, hybrid: 2, hetero: 3, ridgedMulti: 4 };

// Matches heightmap.frag.glsl's uLayerVoronoiDistance.
const VORONOI_DISTANCE_INDEX: Record<VoronoiDistance, number> = { euclidean: 0, manhattan: 1, chebychev: 2 };

const NOISE_TYPE_INDEX: Record<NoiseType, number> = {
  random: 0,
  perlin: 1,
  simplex: 2,
  voronoi: 3,
  none: 4,
};

// Per Gaea's Combine node conventions (verified against
// docs.quadspinner.com, 2026-09-15) plus 'normal' — a plain opacity
// crossfade, not a math operator.
export type BlendMode = 'normal' | 'add' | 'subtract' | 'multiply' | 'max' | 'min' | 'screen';

export const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'add', label: 'Add' },
  { value: 'subtract', label: 'Subtract' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'max', label: 'Max' },
  { value: 'min', label: 'Min' },
  { value: 'screen', label: 'Screen' },
];

const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  normal: 0,
  add: 1,
  subtract: 2,
  multiply: 3,
  max: 4,
  min: 5,
  screen: 6,
};

// One layer in the stack — a Photoshop-style mental model (Dana, 2026-09-15):
// bottom of the array is the base, applied first; each layer above composites
// onto the running result using its own blendMode + opacity.
export interface NoiseLayer {
  id: string;
  // Auto-assigned "Layer 01"/"Layer 02" (an ever-incrementing counter, see
  // map/noiseLayers.ts — never reused after a delete) plus a rename option
  // (double-click to edit inline, ui/NoisePanel.tsx). Requested 2026-09-22,
  // built 2026-09-30 — was previously just the noise-type label shown as
  // the row's name, with no real identity of its own.
  name: string;
  noiseType: NoiseType; // the base generator
  seed: number;
  frequency: number;
  // Modifiers — independent toggles layered onto the base generator, in
  // this fixed order (Gaea): Domain warp → generator/Octaves → Ridged →
  // Terrace. Each toggle gates its own params below, which exist
  // regardless of whether the toggle is on (so a disabled modifier's
  // values aren't lost when re-enabled). See ISSUES.md, 2026-09-30.
  domainWarpEnabled: boolean;
  warpStrength: number;
  octavesEnabled: boolean;
  octaves: number;
  persistence: number;
  lacunarity: number;
  ridgedEnabled: boolean;
  // 0..1 — blends between the un-ridged and fully-ridged value (`mix(raw,
  // ridge(raw), ridgeAmount)`), not a plain on/off the way the other 3
  // modifiers' *Enabled flags are — ridge() itself has no natural
  // continuous parameter of its own to gate, unlike warp strength/octave
  // count/terrace steps (Dana, 2026-09-30: "how would you control the
  // amount of it?").
  ridgeAmount: number;
  terraceEnabled: boolean;
  terraceSteps: number;
  // Transform: translate the noise (in lattice cells, separate from seed) and
  // stretch it per axis, as Unity/Blender/Terragen/Gaea offer.
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  stretchX: number;
  stretchY: number;
  stretchZ: number;
  // Domain warp's own scale and octave count (its strength is warpStrength).
  warpScale: number;
  warpOctaves: number;
  // Voronoi only: how far each cell's point strays from its center (0-1) and
  // the distance function.
  voronoiJitter: number;
  voronoiDistance: VoronoiDistance;
  // Ridged only, after Blender's Ridged Multifractal: the fold's Offset and
  // the Gain on the feedback between octaves. 1 and 1 are the old look.
  ridgeOffset: number;
  ridgeGain: number;
  // Octaves modifier only: how the octaves combine, plus the Offset and Gain
  // the hybrid, hetero and ridged types use.
  fractalType: FractalType;
  fractalOffset: number;
  fractalGain: number;
  opacity: number; // 0-1
  // Amplitude, distinct from opacity: scales how much this layer's noise
  // deviates from neutral (flat) before blending, not how much it overrides
  // what's beneath it — a layer at 0.5 contributes half its usual bumpiness,
  // at 2 twice as much, independent of coverage/crossfade (Dana, 2026-09-23:
  // "justified to have per layer height... big base layer + subtle detail
  // layer scaled independently"). Defaults to 1 (unscaled).
  heightScale: number;
  blendMode: BlendMode;
  // Photoshop-style hide/unhide (Dana, 2026-09-23) — a hidden layer is
  // genuinely skipped in the shader's compositing loop, not just zeroed via
  // opacity: at opacity 0 the layer's noise would still be evaluated (and
  // discarded) every pixel; visible=false skips that work entirely, and
  // keeps the concept separate from the user's actual opacity setting.
  visible: boolean;
  // Mask (Gaea's convention: bright = fully affected, dark = untouched): this
  // layer's contribution is multiplied by the layer's own mask pattern, a
  // plain base generator with its own seed and frequency. 'none' = unmasked.
  maskNoiseType: NoiseType;
  maskSeed: number;
  maskFrequency: number;
  maskInvert: boolean;
  // Percent of the planet the mask lets this layer through (0-100), and the
  // width of the edge fade as a percent of the planet's area (0 = sharp).
  maskCoverage: number;
  maskSoftness: number;
}

// A mask is on once it has a pattern to draw.
export function hasMask(layer: NoiseLayer): boolean {
  return layer.maskNoiseType !== 'none';
}

// Fields an older save may still carry: masks used to point at another layer
// and, before that, held a raw brightness band.
interface LegacyMaskFields {
  maskLayerId?: string | null;
  maskMin?: number;
  maskMax?: number;
}

// What a layer saved before these controls existed is filled in with: the
// values that reproduce its old look.
export const DEFAULT_NOISE_EXTRA_FIELDS = {
  offsetX: NOISE_RANGES.offset.default,
  offsetY: NOISE_RANGES.offset.default,
  offsetZ: NOISE_RANGES.offset.default,
  stretchX: NOISE_RANGES.stretch.default,
  stretchY: NOISE_RANGES.stretch.default,
  stretchZ: NOISE_RANGES.stretch.default,
  warpScale: NOISE_RANGES.warpScale.default,
  warpOctaves: NOISE_RANGES.warpOctaves.default,
  voronoiJitter: NOISE_RANGES.voronoiJitter.default,
  voronoiDistance: 'euclidean' as VoronoiDistance,
  ridgeOffset: NOISE_RANGES.ridgeOffset.default,
  ridgeGain: NOISE_RANGES.ridgeGain.default,
  fractalType: 'fbm' as FractalType,
  fractalOffset: NOISE_RANGES.fractalOffset.default,
  fractalGain: NOISE_RANGES.fractalGain.default,
};

export const DEFAULT_MASK_FIELDS = {
  maskNoiseType: 'none' as NoiseType,
  maskSeed: NOISE_RANGES.seed.default,
  maskFrequency: NOISE_RANGES.frequency.default,
  maskInvert: false,
  maskCoverage: 50,
  maskSoftness: 20,
};

// Per-face sample grid used to measure a mask pattern's value distribution.
const MASK_SAMPLE_SIZE = 64;
// How many distinct mask patterns stay measured before the cache resets.
const MASK_CACHE_LIMIT = 32;

// Value at percentile `fraction` (0-1) of a sorted sample; with no sample
// (a paint-only source) the value scale itself stands in, i.e. uniform.
function quantileOf(sorted: Float32Array | null, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  if (!sorted) return clamped;
  return sorted[Math.min(sorted.length - 1, Math.floor(clamped * (sorted.length - 1)))];
}

export function createDefaultLayer(id: string, name: string): NoiseLayer {
  return {
    id,
    name,
    noiseType: 'none',
    seed: NOISE_RANGES.seed.default,
    frequency: NOISE_RANGES.frequency.default,
    domainWarpEnabled: false,
    warpStrength: NOISE_RANGES.warpStrength.default,
    octavesEnabled: false,
    octaves: NOISE_RANGES.octaves.default,
    persistence: NOISE_RANGES.persistence.default,
    lacunarity: NOISE_RANGES.lacunarity.default,
    ridgedEnabled: false,
    ridgeAmount: NOISE_RANGES.ridgeAmount.default, // fully ridged once enabled, matching the old dedicated 'ridged' type's look
    terraceEnabled: false,
    terraceSteps: NOISE_RANGES.terraceSteps.default,
    ...DEFAULT_NOISE_EXTRA_FIELDS,
    opacity: NOISE_RANGES.opacity.default,
    heightScale: NOISE_RANGES.layerHeight.default,
    blendMode: 'normal',
    visible: true,
    ...DEFAULT_MASK_FIELDS,
  };
}

// Old saves may have `noiseType` as one of the now-retired modifier values
// ('ridged'/'octaves'/'terrace'/'domainWarp') — these were always secretly
// Perlin-based underneath (see ISSUES.md, 2026-09-30). Converts them into
// the current shape (a real base generator + the matching modifier
// toggle); layers already in the current shape pass through untouched.
// Applied wherever saved layers are loaded (projectSettings/saveProject.ts).
const LEGACY_MODIFIER_TYPE_TO_FIELD: Record<string, 'ridgedEnabled' | 'octavesEnabled' | 'terraceEnabled' | 'domainWarpEnabled'> = {
  ridged: 'ridgedEnabled',
  octaves: 'octavesEnabled',
  terrace: 'terraceEnabled',
  domainWarp: 'domainWarpEnabled',
};

export function migrateLegacyLayers(layers: NoiseLayer[]): NoiseLayer[] {
  return layers.map((saved) => {
    const layer = { ...DEFAULT_NOISE_EXTRA_FIELDS, ...DEFAULT_MASK_FIELDS, ...saved };
    const legacyField = LEGACY_MODIFIER_TYPE_TO_FIELD[layer.noiseType as string];
    return legacyField ? { ...layer, noiseType: 'perlin' as const, [legacyField]: true } : layer;
  }).map((layer, _index, all) => {
    // A mask that pointed at another layer becomes that layer's pattern (type,
    // seed, frequency) as the mask's own; a missing or paint-only source means
    // no mask. The look may shift, since the layer's modifiers are not copied.
    const { maskLayerId, maskMin: _maskMin, maskMax: _maskMax, ...current } = layer as NoiseLayer & LegacyMaskFields;
    if (!maskLayerId) return current;
    const source = all.find((other) => other.id === maskLayerId);
    if (!source || source.noiseType === 'none') return { ...current, maskNoiseType: 'none' as NoiseType };
    return { ...current, maskNoiseType: source.noiseType, maskSeed: source.seed, maskFrequency: source.frequency };
  });
}

export interface HeightmapParams {
  layers: NoiseLayer[];
}

// One area of the planet to bake on its own: a cube face plus a rectangle on
// it, in that face's own coordinates (each axis in [-1, 1]). Deliberately
// the same way a subdividing patch is described, so per-patch terrain can
// reuse this untouched. `face` indexes CUBE_FACES in planet/mesh.ts, and
// `resolution` is the baked texture's size per axis.
export interface RegionParams {
  layers: NoiseLayer[];
  face: number;
  min: THREE.Vector2;
  max: THREE.Vector2;
  resolution: number;
}

// Raw single-channel elevation, real unclamped height rather than a display
// color — the shape both getElevationData() and getRegionElevationData()
// return, and what voxel/chunkGrid.ts samples.
export interface ElevationReadback {
  data: Float32Array;
  width: number;
  height: number;
}

// A UV coordinate, e.g. where a paint stroke lands.
export interface UV {
  x: number;
  y: number;
}

// One completed stroke's full path + the brush settings it was painted
// with — enough to exactly reproduce it via replayLayerHistory() below, so
// painting is retraceable rather than just a baked raster. See ROADMAP.md,
// Stage 06.
export interface StrokeRecord {
  layerId: string;
  points: UV[];
  radius: number; // UV units, same as paintStroke()'s radius param
  feather: number;
  brushValue: number; // -1 (black) .. 1 (white), same as paintStroke()'s brushValue param
}

function blackPaintPlaceholder(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

// Matches heightmap.frag.glsl's uLayerPaintTexture0..7 — 8 separately-named
// uniforms instead of a real array, since GLSL ES 1.00 (this material's
// default) requires constant indices for sampler arrays.
function paintTextureUniformName(index: number): string {
  return `uLayerPaintTexture${index}`;
}

// The render-to-texture pipeline for the 2D heightmap: an orthographic
// camera + a full-screen quad + a WebGLRenderTarget, plus one persistent
// paint texture per layer (painted strokes accumulate there, unlike the
// procedural noise which is recomputed fresh every render()).
//
// This is the single shared instance for the whole app (Dana, 2026-09-15:
// "have the threejs be the manager for the system") — created once alongside
// SceneCanvas's renderer, not duplicated per-component. That's required, not
// just simpler: the planet's uHeightMap sampling happens inside SceneCanvas's
// renderer's own draw call, so the render target it reads from must have
// been created by that exact renderer — WebGL textures aren't shareable
// across separate renderer/context instances. See ISSUES.md, 2026-09-15,
// and active-geometry's main.js (one renderer, used for both the main scene
// render and an off-screen picking pass + readRenderTargetPixels) for the
// same pattern already established there.
export class HeightmapPipeline {
  readonly renderTarget: THREE.WebGLRenderTarget;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  // Ping-pong pair per layer, not GPU blending — see paintStroke() below.
  private paintTargets = new Map<string, [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]>();
  // Reused across region bakes while the requested size is unchanged.
  private regionTarget: THREE.WebGLRenderTarget | null = null;
  // The smooth land chunk's own persistent display texture — see
  // renderDisplayRegion's own comment for why this needs a separate slot.
  private displayRegionTarget: THREE.WebGLRenderTarget | null = null;
  // Measures a mask source's value distribution, see resolveMaskBand().
  private maskSampleTarget: THREE.WebGLRenderTarget | null = null;
  private maskSampleCache = new Map<string, Float32Array>();
  private paintActiveIndex = new Map<string, number>();
  private paintPlaceholder: THREE.DataTexture;
  // The stroke currently being drawn, if any — its whole point path is kept
  // here (not GPU-accumulated) and re-rendered fresh each dab by
  // strokePathScene, against the layer's frozen pre-stroke base (baseIndex).
  // See beginStroke()/paintStroke() below and ISSUES.md, 2026-09-22.
  private strokePathScene: THREE.Scene;
  private strokePathCamera: THREE.OrthographicCamera;
  private strokePathMaterial: THREE.ShaderMaterial;
  private activeStroke: { layerId: string; baseIndex: number; points: UV[]; radius: number; feather: number; brushValue: number } | null;
  // One level of the min/max reduction pyramid — reused every pass/every
  // call, only its uniforms change. See getRegionMinMaxAsync().
  private reduceScene: THREE.Scene;
  private reduceCamera: THREE.OrthographicCamera;
  private reduceMaterial: THREE.ShaderMaterial;
  // Percent Clip, computed on the GPU — see getRegionPercentileRangeAsync().
  // A fixed, reused point cloud (one point per sample position), not
  // resized per call: it's a dense enough sampling grid to estimate a
  // percentile regardless of the actual source bake's own resolution,
  // oversampling a smaller source just means some texels get sampled more
  // than once, harmless for a distribution estimate.
  private histogramScene: THREE.Scene;
  private histogramCamera: THREE.Camera;
  private histogramMaterial: THREE.ShaderMaterial;
  private readonly histogramSampleCount: number;

  constructor() {
    // FloatType, not the default byte texture — G now carries real,
    // unclamped elevation (can exceed 1 or go negative), not a 0..255
    // color value; R (shape) still only ever holds 0..1, same precision as
    // before, just stored as a float instead of a byte. FloatType (not
    // HalfFloatType) specifically because it reads back cleanly into a
    // Float32Array via readRenderTargetPixels — the standard Three.js
    // GPGPU-style compute-in-shader/read-on-CPU pattern. See ISSUES.md,
    // 2026-09-24.
    this.renderTarget = new THREE.WebGLRenderTarget(HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT, { type: THREE.FloatType });
    // Repeat U so u=1.0 samples the same texel as u=0.0 — avoids a seam
    // crack at the sphere's duplicated-vertex UV wrap.
    this.renderTarget.texture.wrapS = THREE.RepeatWrapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.paintPlaceholder = blackPaintPlaceholder();
    const paintTextureUniforms: Record<string, { value: THREE.Texture }> = {};
    for (let i = 0; i < MAX_LAYERS; i++) {
      paintTextureUniforms[paintTextureUniformName(i)] = { value: this.paintPlaceholder };
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader: heightmapBrushVertexGlsl,
      fragmentShader: noiseGlsl + heightmapFragmentGlsl,
      uniforms: {
        uLayerCount: { value: 0 },
        uLayerNoiseType: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerSeed: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerFrequency: { value: new Array(MAX_LAYERS).fill(4) },
        // Modifiers — independent toggles (0/1, matching this shader's
        // established float-uniform convention, e.g. uLayerBlendMode) layered
        // onto the base generator above, not separate noiseType values.
        // See NoiseLayer's own comment, map/heightmap.ts.
        uLayerDomainWarpOn: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerWarpStrength: { value: new Array(MAX_LAYERS).fill(1.0) },
        uLayerOctavesOn: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerOctaves: { value: new Array(MAX_LAYERS).fill(4) },
        uLayerPersistence: { value: new Array(MAX_LAYERS).fill(0.5) },
        uLayerLacunarity: { value: new Array(MAX_LAYERS).fill(2.0) },
        uLayerRidgedOn: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerRidgeAmount: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerTerraceOn: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerTerraceSteps: { value: new Array(MAX_LAYERS).fill(8) },
        uLayerOffset: { value: new Array(MAX_LAYERS).fill(null).map(() => new THREE.Vector3(0, 0, 0)) },
        uLayerStretch: { value: new Array(MAX_LAYERS).fill(null).map(() => new THREE.Vector3(1, 1, 1)) },
        uLayerWarpScale: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerWarpOctaves: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerVoronoiJitter: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerVoronoiDistance: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerRidgeOffset: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerRidgeGain: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerFractalType: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerFractalOffset: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerFractalGain: { value: new Array(MAX_LAYERS).fill(1) },
        // Spacing between baked samples in face coordinates, 0 = no octave
        // fade. Only a region (patch) bake sets it, see bakeRegionInto().
        uSampleSpacing: { value: 0 },
        uLayerOpacity: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerHeightScale: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerBlendMode: { value: new Array(MAX_LAYERS).fill(0) },
        // Masks: packed index of each layer's mask source (-1 = none), and
        // whether a packed layer adds terrain (a hidden mask source doesn't).
        uLayerMaskType: { value: new Array(MAX_LAYERS).fill(-1) },
        uLayerMaskSeed: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerMaskFrequency: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerMaskInvert: { value: new Array(MAX_LAYERS).fill(0) },
        uLayerMaskMin: { value: new Array(MAX_LAYERS).fill(0.3) },
        uLayerMaskMax: { value: new Array(MAX_LAYERS).fill(0.7) },
        // Region bake — off unless renderRegion() turns it on. See
        // heightmap.frag.glsl and renderRegion() below.
        uRegionMode: { value: 0 },
        uRegionFace: { value: 0 },
        uRegionMin: { value: new THREE.Vector2(-1, -1) },
        uRegionMax: { value: new THREE.Vector2(1, 1) },
        // The bake target's own resolution — lets the fragment shader
        // correct for sampling each texel at its center rather than its
        // edge, see heightmap.frag.glsl and bakeRegionInto() below, [B28].
        uRegionSamples: { value: 65 },
        ...paintTextureUniforms,
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);

    this.strokePathScene = new THREE.Scene();
    this.strokePathCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.strokePathMaterial = new THREE.ShaderMaterial({
      vertexShader: heightmapBrushVertexGlsl,
      fragmentShader: strokePathFragmentGlsl,
      uniforms: {
        uLayerBase: { value: null },
        uPoints: { value: new Array(MAX_STROKE_POINTS).fill(null).map(() => new THREE.Vector2()) },
        uPointCount: { value: 0 },
        uRadius: { value: 0.05 },
        uFeather: { value: 1 },
        uTargetValue: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const strokePathQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.strokePathMaterial);
    this.strokePathScene.add(strokePathQuad);

    this.activeStroke = null;

    this.reduceScene = new THREE.Scene();
    this.reduceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.reduceMaterial = new THREE.ShaderMaterial({
      vertexShader: heightmapBrushVertexGlsl,
      fragmentShader: minMaxReduceFragmentGlsl,
      uniforms: {
        uSource: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uFirstPass: { value: 1 },
      },
    });
    const reduceQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.reduceMaterial);
    this.reduceScene.add(reduceQuad);

    // A fixed 256x256 grid of sample positions (65536 points) — dense enough
    // for a stable percentile estimate, built once since it never depends on
    // which patch/resolution a given call is for (see the sample-UV comment
    // on the field declaration above).
    const HISTOGRAM_SAMPLE_GRID = 256;
    this.histogramSampleCount = HISTOGRAM_SAMPLE_GRID * HISTOGRAM_SAMPLE_GRID;
    const histogramPositions = new Float32Array(this.histogramSampleCount * 3); // required by THREE.Points/BufferGeometry, unused by the shader itself — gl_Position is set directly from aSampleUV
    const histogramSampleUVs = new Float32Array(this.histogramSampleCount * 2);
    let sampleIndex = 0;
    for (let row = 0; row < HISTOGRAM_SAMPLE_GRID; row++) {
      for (let col = 0; col < HISTOGRAM_SAMPLE_GRID; col++) {
        histogramSampleUVs[sampleIndex * 2] = (col + 0.5) / HISTOGRAM_SAMPLE_GRID;
        histogramSampleUVs[sampleIndex * 2 + 1] = (row + 0.5) / HISTOGRAM_SAMPLE_GRID;
        sampleIndex++;
      }
    }
    const histogramGeometry = new THREE.BufferGeometry();
    histogramGeometry.setAttribute('position', new THREE.BufferAttribute(histogramPositions, 3));
    histogramGeometry.setAttribute('aSampleUV', new THREE.BufferAttribute(histogramSampleUVs, 2));

    this.histogramScene = new THREE.Scene();
    // No projection/view matrices are read by elevationHistogram.vert.glsl
    // (it writes gl_Position directly from the bin index), so a plain,
    // untouched THREE.Camera is enough, Three.js still needs some camera
    // object to call render() with.
    this.histogramCamera = new THREE.Camera();
    this.histogramMaterial = new THREE.ShaderMaterial({
      vertexShader: elevationHistogramVertexGlsl,
      fragmentShader: elevationHistogramFragmentGlsl,
      uniforms: {
        uSource: { value: null },
        uRangeMin: { value: 0 },
        uRangeMax: { value: 1 },
        uBinCount: { value: HISTOGRAM_BINS },
      },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const histogramPoints = new THREE.Points(histogramGeometry, this.histogramMaterial);
    this.histogramScene.add(histogramPoints);
  }

  // Call at the start of a stroke (pointerdown, with its first point) —
  // starts the point path and freezes which of the layer's ping-pong pair
  // counts as "before this stroke" for the rest of it (paintStroke() below
  // never writes there until the stroke ends, and always reads from it
  // fresh, re-rendering the whole path each dab).
  beginStroke(layerId: string, uv: UV): void {
    if (!this.paintTargets.has(layerId)) return;
    this.activeStroke = {
      layerId,
      baseIndex: this.paintActiveIndex.get(layerId) ?? 0,
      points: [uv],
      radius: 0.05,
      feather: 1,
      brushValue: 1,
    };
  }

  // Call at the end of a stroke (pointerup/pointercancel). Nothing to commit
  // visually — the last dab's result is already sitting in the layer's
  // active paint target — but returns the completed stroke's full record
  // (for the caller to persist/log, see ROADMAP.md Stage 06) before
  // clearing the "a stroke is in progress" state.
  endStroke(): StrokeRecord | null {
    const stroke = this.activeStroke;
    this.activeStroke = null;
    if (!stroke) return null;
    return {
      layerId: stroke.layerId,
      points: stroke.points,
      radius: stroke.radius,
      feather: stroke.feather,
      brushValue: stroke.brushValue,
    };
  }

  // Adds a point to the currently-active stroke (see beginStroke()) and
  // re-renders the whole path's distance field fresh against the stroke's
  // frozen pre-stroke base — so overlapping/repeated coverage along one
  // drag never stacks opacity, and the shape stays a smooth capsule chain
  // rather than a union of separate circles (see ISSUES.md, 2026-09-22, and
  // shaders/strokePath.frag.glsl). brushValue: -1 (black) .. 1 (white) — an
  // absolute target height, not a delta; it's read fresh on every dab, so it
  // must stay constant for the duration of one stroke (the UI doesn't let it
  // change mid-drag).
  paintStroke(
    renderer: THREE.WebGLRenderer,
    layerId: string,
    uv: UV,
    radius: number,
    brushValue = 1,
    feather = 1,
  ): void {
    const pair = this.paintTargets.get(layerId);
    if (!pair || !this.activeStroke || this.activeStroke.layerId !== layerId) return;

    if (this.activeStroke.points.length < MAX_STROKE_POINTS) {
      this.activeStroke.points.push(uv);
    }
    // Remembered so endStroke() can report the full record — a stroke's
    // radius/feather/brushValue don't change mid-drag (the UI doesn't
    // expose that), so the latest values are the whole stroke's values.
    this.activeStroke.radius = radius;
    this.activeStroke.feather = feather;
    this.activeStroke.brushValue = brushValue;

    const baseIndex = this.activeStroke.baseIndex;
    const previewIndex = 1 - baseIndex; // never the frozen base — always safe to overwrite every dab
    const uniforms = this.strokePathMaterial.uniforms;
    uniforms.uLayerBase.value = pair[baseIndex].texture;
    this.activeStroke.points.forEach((point, i) => {
      (uniforms.uPoints.value[i] as THREE.Vector2).set(point.x, point.y);
    });
    uniforms.uPointCount.value = this.activeStroke.points.length;
    uniforms.uRadius.value = radius;
    uniforms.uFeather.value = feather;
    uniforms.uTargetValue.value = brushValue * 0.5 + 0.5;
    renderer.setRenderTarget(pair[previewIndex]);
    renderer.render(this.strokePathScene, this.strokePathCamera);
    renderer.setRenderTarget(null);
    this.paintActiveIndex.set(layerId, previewIndex);
  }

  // Clears a layer's paint texture back to blank (no paint at all), then
  // replays each of the given stroke records in order via the normal
  // beginStroke/paintStroke/endStroke sequence — reconstructing the exact
  // same result live painting would have produced. Used both for loading a
  // saved project and for undo (re-deriving state from a shortened history,
  // see App.tsx's undo()) — always recomputing from the full desired
  // history rather than trying to incrementally patch it, so there's one
  // code path instead of two to keep correct. See ROADMAP.md, Stage 06.
  replayLayerHistory(renderer: THREE.WebGLRenderer, layerId: string, records: StrokeRecord[]): void {
    const pair = this.paintTargets.get(layerId);
    if (!pair) return;
    pair.forEach((target) => {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.setRenderTarget(null);
    });
    this.paintActiveIndex.set(layerId, 0);

    for (const record of records) {
      if (record.points.length === 0) continue;
      this.beginStroke(layerId, record.points[0]);
      for (const point of record.points) {
        this.paintStroke(renderer, layerId, point, record.radius, record.brushValue, record.feather);
      }
      this.endStroke();
    }
  }

  private getActivePaintTexture(layerId: string): THREE.Texture {
    const pair = this.paintTargets.get(layerId)!;
    return pair[this.paintActiveIndex.get(layerId) ?? 0].texture;
  }

  // Reads the current composite texture back as ImageData, for MapView's
  // plain 2D <canvas> to display via ctx.putImageData() — MapView has no
  // WebGL context of its own, see ISSUES.md, 2026-09-15. Only the shape
  // channel (R) — the canvas shows the layer stack's Opacity/Blend Mode
  // composite exactly as before; Height/elevation (G) never touches this,
  // per Dana, 2026-09-24 ("i never said height belongs in the 2d").
  getCompositeImageData(renderer: THREE.WebGLRenderer): ImageData {
    const floatBuffer = new Float32Array(HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT * 4);
    renderer.readRenderTargetPixels(this.renderTarget, 0, 0, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT, floatBuffer);
    // readRenderTargetPixels returns rows bottom-to-top (GL convention);
    // ImageData expects top-to-bottom — flip rows. Also converts R (0..1
    // float, already clamped by the shader) into the 0..255 byte format
    // Canvas's ImageData requires — G/B/A aren't used for display.
    const bytes = new Uint8ClampedArray(HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT * 4);
    const rowFloats = HEIGHTMAP_WIDTH * 4;
    for (let row = 0; row < HEIGHTMAP_HEIGHT; row++) {
      const srcRowStart = row * rowFloats;
      const destRowStart = (HEIGHTMAP_HEIGHT - 1 - row) * rowFloats;
      for (let col = 0; col < HEIGHTMAP_WIDTH; col++) {
        const shape = floatBuffer[srcRowStart + col * 4]; // R
        const destIndex = destRowStart + col * 4;
        bytes[destIndex] = bytes[destIndex + 1] = bytes[destIndex + 2] = shape * 255;
        bytes[destIndex + 3] = 255;
      }
    }
    return new ImageData(bytes, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT);
  }

  // Reads the elevation channel (G) back as a raw float buffer — real,
  // unclamped height, not a display color — for the land chunk's CPU-side
  // sampling (voxel/chunkGrid.ts's sampleChunkElevation()). The planet
  // reads this same channel directly on the GPU instead (vertex.glsl
  // samples uHeightMap.g), no CPU round-trip needed there.
  getElevationData(renderer: THREE.WebGLRenderer): { data: Float32Array; width: number; height: number } {
    const floatBuffer = new Float32Array(HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT * 4);
    renderer.readRenderTargetPixels(this.renderTarget, 0, 0, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT, floatBuffer);
    // Same bottom-to-top → top-to-bottom row flip as getCompositeImageData,
    // but a single float per pixel (G channel only), not an RGBA byte image.
    const elevation = new Float32Array(HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT);
    for (let row = 0; row < HEIGHTMAP_HEIGHT; row++) {
      const srcRowStart = row * HEIGHTMAP_WIDTH * 4;
      const destRowStart = (HEIGHTMAP_HEIGHT - 1 - row) * HEIGHTMAP_WIDTH;
      for (let col = 0; col < HEIGHTMAP_WIDTH; col++) {
        elevation[destRowStart + col] = floatBuffer[srcRowStart + col * 4 + 1]; // G
      }
    }
    return { data: elevation, width: HEIGHTMAP_WIDTH, height: HEIGHTMAP_HEIGHT };
  }

  render(renderer: THREE.WebGLRenderer, params: HeightmapParams): THREE.Texture {
    const { layers } = params;
    const uniforms = this.material.uniforms;
    this.syncPaintTargets(renderer, layers);

    // Hidden layers (Dana, 2026-09-23) are filtered out here, before any
    // uniform is set — simpler than sending them through and having the
    // shader skip them: uLayerCount only ever counts visible layers, so a
    // hidden one's noise is never evaluated at all. Paint data for hidden
    // layers is untouched above (paint targets sync against the full
    // `layers` list) — hiding is a display toggle, not a delete.
    // !== false, not truthy — layers saved before this field existed have
    // visible === undefined, and should default to visible (Dana, 2026-09-23).
    this.syncLayerUniforms(renderer, layers);
    uniforms.uRegionMode.value = 0;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    return this.renderTarget.texture;
  }

  // Bakes one area of the planet at its own resolution, instead of the whole
  // globe at the shared map's fixed size. A region is a cube face plus a
  // rectangle on it — the same way a subdividing patch is described, so this
  // carries over to per-patch terrain without rework.
  //
  // This is what lifts the detail ceiling: the shared map is 1024x512 for
  // the entire planet, so anything reading it back cannot resolve more than
  // that however fine its own grid is. See ISSUES.md, "Planet mesh and
  // adaptive resolution".
  renderRegion(renderer: THREE.WebGLRenderer, params: RegionParams): THREE.WebGLRenderTarget {
    return this.renderRegionToSlot(renderer, params, 'regionTarget');
  }

  // The smooth land chunk's own display texture needs its own persistent
  // slot, separate from the one getPatchElevationData/erodePatch share: it
  // stays bound to a material across renders at a much higher resolution,
  // while the other slot keeps serving the small, cheap CPU readback (color-
  // ramp min/max, voxel meshing) at its own, unrelated resolution. One
  // shared slot would otherwise dispose whichever texture wasn't requested
  // most recently out from under the other's material binding. See
  // ISSUES.md, [B32].
  renderDisplayRegion(renderer: THREE.WebGLRenderer, params: RegionParams): THREE.WebGLRenderTarget {
    return this.renderRegionToSlot(renderer, params, 'displayRegionTarget');
  }

  private renderRegionToSlot(
    renderer: THREE.WebGLRenderer,
    params: RegionParams,
    slot: 'regionTarget' | 'displayRegionTarget',
  ): THREE.WebGLRenderTarget {
    const target = this.acquireRegionTarget(params.resolution, slot);
    this.bakeRegionInto(renderer, params, target);
    return target;
  }

  // The planet-patches renderer ([B28], planet/PlanetPatchRenderer.ts) needs
  // a different shape of persistence than either existing slot: not one
  // shared texture (regionTarget) and not one fixed display texture
  // (displayRegionTarget), but potentially dozens of simultaneous textures,
  // one per currently-visible patch, each outliving many other patches'
  // own bakes in between. Neither named slot can serve that without patches
  // overwriting each other's textures out from under their own materials, so
  // this bakes into a target the caller creates and owns, rather than one
  // this class tracks itself. The caller is responsible for disposing it
  // when that patch is no longer visible.
  bakeRegionToTarget(renderer: THREE.WebGLRenderer, params: RegionParams, target: THREE.WebGLRenderTarget): void {
    this.bakeRegionInto(renderer, params, target);
  }

  private bakeRegionInto(renderer: THREE.WebGLRenderer, params: RegionParams, target: THREE.WebGLRenderTarget): void {
    const { layers, face, min, max } = params;
    this.syncPaintTargets(renderer, layers);
    this.syncLayerUniforms(renderer, layers);

    const uniforms = this.material.uniforms;
    uniforms.uRegionMode.value = 1;
    uniforms.uRegionFace.value = face;
    (uniforms.uRegionMin.value as THREE.Vector2).set(min.x, min.y);
    (uniforms.uRegionMax.value as THREE.Vector2).set(max.x, max.y);
    uniforms.uRegionSamples.value = target.width;
    // Octaves finer than this grid can show are faded out (heightmap.frag.glsl).
    uniforms.uSampleSpacing.value = (max.x - min.x) / Math.max(1, target.width - 1);

    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    // Left off so the next whole-globe render() isn't silently still in
    // region mode (or fading octaves) if it forgets to reset them.
    uniforms.uRegionMode.value = 0;
    uniforms.uSampleSpacing.value = 0;
  }

  // Reused while the size matches, so panning or re-meshing doesn't
  // allocate a new target every time. Each slot owns its own target, see
  // renderDisplayRegion's own comment for why there are two.
  private acquireRegionTarget(resolution: number, slot: 'regionTarget' | 'displayRegionTarget'): THREE.WebGLRenderTarget {
    const current = this[slot];
    if (current && current.width === resolution && current.height === resolution) {
      return current;
    }
    current?.dispose();
    // FloatType to match the shared map: elevation is real height, which can
    // exceed 1 or go negative. See ISSUES.md, 2026-09-24.
    const target = new THREE.WebGLRenderTarget(resolution, resolution, { type: THREE.FloatType });
    this[slot] = target;
    return target;
  }

  // Elevation only (the G channel), as a raw Float32Array — same shape and
  // meaning as getElevationData(), but for a region bake.
  getRegionElevationData(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): ElevationReadback {
    const size = target.width;
    const rgba = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, rgba);
    // Same bottom-to-top → top-to-bottom row flip getElevationData does, so
    // both readbacks hand callers the same orientation.
    const elevation = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
      const srcRowStart = row * size * 4;
      const destRowStart = (size - 1 - row) * size;
      for (let col = 0; col < size; col++) {
        elevation[destRowStart + col] = rgba[srcRowStart + col * 4 + 1]; // G
      }
    }
    return { data: elevation, width: size, height: size };
  }

  // Same result as getRegionElevationData, but without the pipeline stall:
  // renderer.readRenderTargetPixels (and raw gl.readPixels under it) blocks
  // the CPU until the GPU catches up, which is what actually reads as a
  // freeze on a bigger readback, not the byte count itself. This copies into
  // a PIXEL_PACK_BUFFER instead and awaits a fence, so the GPU keeps working
  // while the copy happens, then reads the already-ready buffer back with no
  // stall. Self-contained, correct, and not yet called by anything — wiring
  // it in means every caller (SceneCanvas.tsx's handle methods, landChunk.ts's
  // effect, the erosion engine's erodePatch flow) becomes async too, a real
  // change to how those effects are sequenced, not a drop-in swap, left for
  // its own separate pass. See ISSUES.md, [B32].
  async getRegionElevationDataAsync(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): Promise<ElevationReadback> {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const size = target.width;
    const rgba = new Float32Array(size * size * 4);

    renderer.setRenderTarget(target);
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, rgba.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    renderer.setRenderTarget(null);

    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    await new Promise<void>((resolve, reject) => {
      function poll() {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.WAIT_FAILED) {
          reject(new Error('getRegionElevationDataAsync: fenceSync wait failed'));
        } else if (status === gl.TIMEOUT_EXPIRED) {
          requestAnimationFrame(poll);
        } else {
          resolve();
        }
      }
      poll();
    });
    gl.deleteSync(sync);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteBuffer(pbo);

    // Same bottom-to-top → top-to-bottom row flip and G-channel extraction
    // as the synchronous version, so the two are interchangeable to a caller.
    const elevation = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
      const srcRowStart = row * size * 4;
      const destRowStart = (size - 1 - row) * size;
      for (let col = 0; col < size; col++) {
        elevation[destRowStart + col] = rgba[srcRowStart + col * 4 + 1]; // G
      }
    }
    return { data: elevation, width: size, height: size };
  }

  // The patch's real low/high, without ever reading back its full-resolution
  // buffer: a min/max reduction pyramid (Tevs/Ihrke/Seidel 2008, "Maximum
  // Mipmaps," see REFERENCES.md and shaders/minMaxReduce.frag.glsl) halves
  // the source over and over, each pass keeping the true min/max of every
  // 2x2 block rather than blurring it away, until one texel holds the exact
  // min/max of the whole region. Only that one texel (16 bytes) is ever read
  // back, via the same async PBO+fence pattern getRegionElevationDataAsync
  // already uses, so even a large source never costs more than a tiny one
  // does. Replaces the synchronous full-buffer readback landChunk.ts used to
  // do purely to find two numbers. See ISSUES.md, [B32].
  //
  // Note for whoever next touches this: this returns the patch's literal
  // min/max, not the Percent Clip range computeElevationRange() (map/
  // elevationRange.ts) computes from a full CPU buffer today. A reduction
  // pyramid gives an exact extremum cheaply; it cannot give a percentile
  // (the 1st/99th-percentile clip that guards against a single outlier
  // pixel crushing the ramp) without effectively building a histogram on
  // the GPU too, a different, larger piece of work than what was asked for
  // here. Worth Dana's own look before this is called fully settled: a
  // single extreme pixel could once again pull the color ramp toward one
  // end, the exact failure Percent Clip was originally added to fix.
  async getRegionMinMaxAsync(renderer: THREE.WebGLRenderer, sourceTarget: THREE.WebGLRenderTarget): Promise<{ min: number; max: number }> {
    const uniforms = this.reduceMaterial.uniforms;
    let currentSource: THREE.Texture = sourceTarget.texture;
    let size = sourceTarget.width;
    let firstPass = true;
    let previousLevel: THREE.WebGLRenderTarget | null = null;

    while (size > 1) {
      const nextSize = Math.max(1, Math.floor(size / 2));
      const level = new THREE.WebGLRenderTarget(nextSize, nextSize, { type: THREE.FloatType });
      uniforms.uSource.value = currentSource;
      (uniforms.uTexelSize.value as THREE.Vector2).set(1 / size, 1 / size);
      uniforms.uFirstPass.value = firstPass ? 1 : 0;
      renderer.setRenderTarget(level);
      renderer.render(this.reduceScene, this.reduceCamera);
      renderer.setRenderTarget(null);

      previousLevel?.dispose();
      previousLevel = level;
      currentSource = level.texture;
      size = nextSize;
      firstPass = false;
    }

    // sourceTarget was already 1x1 — nothing to reduce, read its elevation
    // (G) directly as both min and max, same convention a first pass would
    // have used.
    if (!previousLevel) {
      const only = new Float32Array(4);
      renderer.readRenderTargetPixels(sourceTarget, 0, 0, 1, 1, only);
      return { min: only[1], max: only[1] };
    }

    const gl = renderer.getContext() as WebGL2RenderingContext;
    const rgba = new Float32Array(4);
    renderer.setRenderTarget(previousLevel);
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, rgba.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    renderer.setRenderTarget(null);

    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    await new Promise<void>((resolve, reject) => {
      function poll() {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.WAIT_FAILED) {
          reject(new Error('getRegionMinMaxAsync: fenceSync wait failed'));
        } else if (status === gl.TIMEOUT_EXPIRED) {
          requestAnimationFrame(poll);
        } else {
          resolve();
        }
      }
      poll();
    });
    gl.deleteSync(sync);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteBuffer(pbo);
    previousLevel.dispose();

    return { min: rgba[0], max: rgba[1] };
  }

  // What the smooth/shaded land chunk's color ramp should actually use:
  // getRegionMinMaxAsync()'s own literal extremes, Percent Clipped — its own
  // comment already flagged this gap (a single outlier pixel, which this
  // terrain's spiky noise reliably produces, can pull the ramp's range far
  // wider than the terrain's real bulk variation, squeezing everything else
  // into a narrow slice of it — Dana, 2026-10-18, saw this as repeating
  // color bands, not a smooth gradient). Real-time auto-exposure solves the
  // identical problem (one bright pixel shouldn't set a whole frame's
  // exposure) with a GPU-built histogram instead of raw min/max — see
  // REFERENCES.md, "GPU histogram". This ports that technique, and walks
  // the result with the exact same bin-count/clip-percent/cumulative-count
  // logic elevationRange.ts's own CPU version already uses (imported, not
  // duplicated), so the two can't drift apart.
  async getRegionPercentileRangeAsync(renderer: THREE.WebGLRenderer, sourceTarget: THREE.WebGLRenderTarget): Promise<{ min: number; max: number }> {
    // The literal extremes aren't the answer, they're the histogram's own
    // bucketing bounds — a real value has to be known before it can be
    // binned, the same chicken-and-egg a real auto-exposure histogram also
    // has to resolve, against a known full range first.
    const { min: trueMin, max: trueMax } = await this.getRegionMinMaxAsync(renderer, sourceTarget);
    if (!Number.isFinite(trueMin) || !Number.isFinite(trueMax) || trueMax <= trueMin) {
      return { min: trueMin, max: trueMax };
    }

    const histogramTarget = new THREE.WebGLRenderTarget(HISTOGRAM_BINS, 1, { type: THREE.FloatType });
    const uniforms = this.histogramMaterial.uniforms;
    uniforms.uSource.value = sourceTarget.texture;
    uniforms.uRangeMin.value = trueMin;
    uniforms.uRangeMax.value = trueMax;

    // A freshly created render target's own contents are undefined until
    // cleared — unlike the min/max pyramid's full-screen quad (which
    // overwrites every pixel every pass regardless), this pass only touches
    // the handful of pixels its points land on, so every other bin has to
    // start at a real, known zero. Saved/restored explicitly: renderer.clear()
    // always uses the renderer's own current clear color, whatever any other
    // part of the app last set it to, not necessarily black.
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(histogramTarget);
    renderer.clear();
    renderer.render(this.histogramScene, this.histogramCamera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(previousClearColor, previousClearAlpha);

    const gl = renderer.getContext() as WebGL2RenderingContext;
    const rgba = new Float32Array(HISTOGRAM_BINS * 4);
    renderer.setRenderTarget(histogramTarget);
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, rgba.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, HISTOGRAM_BINS, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    renderer.setRenderTarget(null);

    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    await new Promise<void>((resolve, reject) => {
      function poll() {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.WAIT_FAILED) {
          reject(new Error('getRegionPercentileRangeAsync: fenceSync wait failed'));
        } else if (status === gl.TIMEOUT_EXPIRED) {
          requestAnimationFrame(poll);
        } else {
          resolve();
        }
      }
      poll();
    });
    gl.deleteSync(sync);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteBuffer(pbo);
    histogramTarget.dispose();

    // Same cumulative-count walk as elevationRange.ts's computeElevationRange,
    // just fed from a GPU-built histogram (float counts, additive-blended)
    // instead of one built by counting a CPU array directly — the total
    // sample count is fixed and known (the point cloud's own size), not
    // derived from the data, since every point always lands in exactly one
    // bin regardless of the source's real content.
    const clipCount = this.histogramSampleCount * CLIP_PERCENT;
    const binWidth = (trueMax - trueMin) / HISTOGRAM_BINS;
    let cumulative = 0;
    let lowBin = 0;
    for (; lowBin < HISTOGRAM_BINS; lowBin++) {
      cumulative += rgba[lowBin * 4]; // R — the only channel the fragment shader writes
      if (cumulative >= clipCount) break;
    }
    cumulative = 0;
    let highBin = HISTOGRAM_BINS - 1;
    for (; highBin >= 0; highBin--) {
      cumulative += rgba[highBin * 4];
      if (cumulative >= clipCount) break;
    }
    const clippedMin = trueMin + lowBin * binWidth;
    const clippedMax = trueMin + (highBin + 1) * binWidth;
    if (clippedMin >= clippedMax) return { min: trueMin, max: trueMax };
    return { min: clippedMin, max: clippedMax };
  }

  // Creates a paint target for every current layer and disposes orphans.
  // Shared by the whole-globe and region paths.
  private syncPaintTargets(renderer: THREE.WebGLRenderer, layers: NoiseLayer[]): void {
    const currentIds = new Set(layers.map((layer) => layer.id));
    for (const [id, pair] of this.paintTargets) {
      if (!currentIds.has(id)) {
        pair[0].dispose();
        pair[1].dispose();
        this.paintTargets.delete(id);
        this.paintActiveIndex.delete(id);
      }
    }
    for (const layer of layers) {
      if (this.paintTargets.has(layer.id)) continue;
      // HalfFloatType so the accumulator can go negative, see ISSUES.md, 2026-09-16.
      const makeTarget = () => {
        const target = new THREE.WebGLRenderTarget(HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT, { type: THREE.HalfFloatType });
        target.texture.wrapS = THREE.RepeatWrapping;
        renderer.setRenderTarget(target);
        renderer.clear(); // starts at 0 — no paint yet
        renderer.setRenderTarget(null);
        return target;
      };
      this.paintTargets.set(layer.id, [makeTarget(), makeTarget()]);
      this.paintActiveIndex.set(layer.id, 0);
    }
  }

  // A mask pattern's values over the whole planet, sorted. The pattern is
  // rendered alone, as a plain layer of the same type, seed and frequency
  // (every real layer hidden, Height 1, no mask) on a coarse grid per cube
  // face, so a value read back is exactly the mask's brightness. Cached by
  // pattern, so layers sharing one pattern share one measurement.
  private maskSortedValues(renderer: THREE.WebGLRenderer, layers: NoiseLayer[], layer: NoiseLayer): Float32Array {
    const signature = JSON.stringify([layer.maskNoiseType, layer.maskSeed, layer.maskFrequency]);
    const cached = this.maskSampleCache.get(signature);
    if (cached) return cached;

    if (!this.maskSampleTarget) this.maskSampleTarget = new THREE.WebGLRenderTarget(MASK_SAMPLE_SIZE, MASK_SAMPLE_SIZE, { type: THREE.FloatType });
    // Real layers stay in the list, hidden, so their paint targets survive the sync.
    const probe: NoiseLayer = {
      ...createDefaultLayer('mask-probe', 'mask-probe'),
      noiseType: layer.maskNoiseType,
      seed: layer.maskSeed,
      frequency: layer.maskFrequency,
      heightScale: 1,
    };
    const probeLayers = [...layers.map((other) => ({ ...other, visible: false, maskNoiseType: 'none' as NoiseType })), probe];
    const faceTexels = MASK_SAMPLE_SIZE * MASK_SAMPLE_SIZE;
    const values = new Float32Array(6 * faceTexels);
    const rgba = new Float32Array(faceTexels * 4);
    for (let face = 0; face < 6; face++) {
      this.bakeRegionInto(
        renderer,
        { layers: probeLayers, face, min: new THREE.Vector2(-1, -1), max: new THREE.Vector2(1, 1), resolution: MASK_SAMPLE_SIZE },
        this.maskSampleTarget,
      );
      renderer.readRenderTargetPixels(this.maskSampleTarget, 0, 0, MASK_SAMPLE_SIZE, MASK_SAMPLE_SIZE, rgba);
      // Elevation (G) is Height 1 times (brightness - 0.5), so add 0.5 back.
      for (let texel = 0; texel < faceTexels; texel++) values[face * faceTexels + texel] = rgba[texel * 4 + 1] + 0.5;
    }
    values.sort();
    if (this.maskSampleCache.size >= MASK_CACHE_LIMIT) this.maskSampleCache.clear();
    this.maskSampleCache.set(signature, values);
    return values;
  }

  // The brightness band the shader's smoothstep needs for a layer's mask,
  // from Coverage and Softness measured against the pattern's real value
  // distribution: Coverage = share of the planet shown, Softness = share of
  // the planet's area spanned by the fade.
  private resolveMaskBand(renderer: THREE.WebGLRenderer, layers: NoiseLayer[], layer: NoiseLayer): { min: number; max: number } {
    const coverage = Math.min(1, Math.max(0, layer.maskCoverage / 100));
    const softness = Math.min(1, Math.max(0, layer.maskSoftness / 100));
    // Share of the planet where the mask amount is high (Invert flips which side shows).
    const passFraction = layer.maskInvert ? 1 - coverage : coverage;
    if (passFraction <= 0) return { min: 2, max: 2.0001 };
    if (passFraction >= 1) return { min: -2, max: -1.9999 };
    const sorted = this.maskSortedValues(renderer, layers, layer);
    const cut = 1 - passFraction;
    return { min: quantileOf(sorted, cut - softness / 2), max: quantileOf(sorted, cut + softness / 2) };
  }

  // Shared by the whole-globe and region paths so the two can't drift apart.
  private syncLayerUniforms(renderer: THREE.WebGLRenderer, layers: NoiseLayer[]): void {
    // Resolved first: measuring a mask pattern renders, which overwrites uniforms.
    const maskBands = new Map<string, { min: number; max: number }>();
    for (const layer of layers) {
      if (layer.visible !== false && hasMask(layer)) {
        maskBands.set(layer.id, this.resolveMaskBand(renderer, layers, layer));
      }
    }
    const uniforms = this.material.uniforms;
    const visibleLayers = layers.filter((layer) => layer.visible !== false);
    uniforms.uLayerCount.value = visibleLayers.length;
    visibleLayers.forEach((layer, i) => {
      // -1 = unmasked, else the mask pattern's generator type.
      uniforms.uLayerMaskType.value[i] = hasMask(layer) ? NOISE_TYPE_INDEX[layer.maskNoiseType] : -1;
      uniforms.uLayerMaskSeed.value[i] = layer.maskSeed;
      uniforms.uLayerMaskFrequency.value[i] = layer.maskFrequency;
      uniforms.uLayerMaskInvert.value[i] = layer.maskInvert ? 1 : 0;
      const maskBand = maskBands.get(layer.id);
      uniforms.uLayerMaskMin.value[i] = maskBand?.min ?? 0.3;
      uniforms.uLayerMaskMax.value[i] = maskBand?.max ?? 0.7;
      // ?? perlin — a safety net, not the expected path: noiseType should
      // already be current-shape by the time render() runs (migrated at
      // the load boundary, projectSettings/saveProject.ts), but an
      // unrecognized value would otherwise set the uniform to undefined.
      uniforms.uLayerNoiseType.value[i] = NOISE_TYPE_INDEX[layer.noiseType] ?? NOISE_TYPE_INDEX.perlin;
      uniforms.uLayerSeed.value[i] = layer.seed;
      uniforms.uLayerFrequency.value[i] = layer.frequency;
      // ?? false / ?? 1, not the fields directly — layers saved before
      // modifiers became toggles don't have these fields at all, same
      // old-data reasoning as heightScale/visible above.
      uniforms.uLayerDomainWarpOn.value[i] = layer.domainWarpEnabled ? 1 : 0;
      uniforms.uLayerWarpStrength.value[i] = layer.warpStrength;
      uniforms.uLayerOctavesOn.value[i] = layer.octavesEnabled ? 1 : 0;
      uniforms.uLayerOctaves.value[i] = layer.octaves;
      uniforms.uLayerPersistence.value[i] = layer.persistence;
      uniforms.uLayerLacunarity.value[i] = layer.lacunarity;
      uniforms.uLayerRidgedOn.value[i] = layer.ridgedEnabled ? 1 : 0;
      uniforms.uLayerRidgeAmount.value[i] = layer.ridgeAmount ?? 1;
      uniforms.uLayerTerraceOn.value[i] = layer.terraceEnabled ? 1 : 0;
      uniforms.uLayerTerraceSteps.value[i] = layer.terraceSteps;
      // ?? defaults, same old-data reasoning as heightScale below.
      const extras = DEFAULT_NOISE_EXTRA_FIELDS;
      (uniforms.uLayerOffset.value[i] as THREE.Vector3).set(
        layer.offsetX ?? extras.offsetX,
        layer.offsetY ?? extras.offsetY,
        layer.offsetZ ?? extras.offsetZ,
      );
      (uniforms.uLayerStretch.value[i] as THREE.Vector3).set(
        layer.stretchX ?? extras.stretchX,
        layer.stretchY ?? extras.stretchY,
        layer.stretchZ ?? extras.stretchZ,
      );
      uniforms.uLayerWarpScale.value[i] = layer.warpScale ?? extras.warpScale;
      uniforms.uLayerWarpOctaves.value[i] = layer.warpOctaves ?? extras.warpOctaves;
      uniforms.uLayerVoronoiJitter.value[i] = layer.voronoiJitter ?? extras.voronoiJitter;
      uniforms.uLayerVoronoiDistance.value[i] = VORONOI_DISTANCE_INDEX[layer.voronoiDistance ?? extras.voronoiDistance];
      uniforms.uLayerRidgeOffset.value[i] = layer.ridgeOffset ?? extras.ridgeOffset;
      uniforms.uLayerRidgeGain.value[i] = layer.ridgeGain ?? extras.ridgeGain;
      uniforms.uLayerFractalType.value[i] = FRACTAL_TYPE_INDEX[layer.fractalType ?? extras.fractalType] ?? 0;
      uniforms.uLayerFractalOffset.value[i] = layer.fractalOffset ?? extras.fractalOffset;
      uniforms.uLayerFractalGain.value[i] = layer.fractalGain ?? extras.fractalGain;
      uniforms.uLayerOpacity.value[i] = layer.opacity;
      // ?? 1, not layer.heightScale directly — layers saved before this
      // field existed have heightScale === undefined, and should default to
      // unscaled (1), same reasoning as visible's !== false fix above.
      uniforms.uLayerHeightScale.value[i] = layer.heightScale ?? 1;
      uniforms.uLayerBlendMode.value[i] = BLEND_MODE_INDEX[layer.blendMode];
      uniforms[paintTextureUniformName(i)].value = this.getActivePaintTexture(layer.id);
    });
    // Layers past the visible count keep whatever texture they last held,
    // which would be a disposed target after a delete. Point them at the
    // placeholder so an unused sampler never references freed memory.
    for (let i = visibleLayers.length; i < MAX_LAYERS; i++) {
      uniforms[paintTextureUniformName(i)].value = this.paintPlaceholder;
    }
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.regionTarget?.dispose();
    this.displayRegionTarget?.dispose();
    this.maskSampleTarget?.dispose();
    this.material.dispose();
    this.scene.remove(this.scene.children[0]);
    this.paintTargets.forEach((pair) => pair.forEach((target) => target.dispose()));
    this.paintTargets.clear();
    this.paintActiveIndex.clear();
    this.paintPlaceholder.dispose();
    this.strokePathMaterial.dispose();
    this.strokePathScene.remove(this.strokePathScene.children[0]);
    this.reduceMaterial.dispose();
    this.reduceScene.remove(this.reduceScene.children[0]);
    this.histogramMaterial.dispose();
    (this.histogramScene.children[0] as THREE.Points).geometry.dispose();
    this.histogramScene.remove(this.histogramScene.children[0]);
  }
}

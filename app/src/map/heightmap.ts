import * as THREE from 'three';
import noiseGlsl from '../shaders/noise.glsl?raw';
// Shared by both passes below — a plain full-screen-quad pass-through, identical
// either way since both render the same quad geometry through the same ortho
// camera; only the fragment shader differs per feature. See heightmap.ts's
// HeightmapPipeline constructor.
import heightmapBrushVertexGlsl from '../shaders/heightmapBrush.vert.glsl?raw';
import heightmapFragmentGlsl from '../shaders/heightmap.frag.glsl?raw'; // noise compositing (the "Noise" tab)
import strokePathFragmentGlsl from '../shaders/strokePath.frag.glsl?raw'; // brush stroke rendering, see beginStroke()/paintStroke()

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
}

export function createDefaultLayer(id: string, name: string): NoiseLayer {
  return {
    id,
    name,
    noiseType: 'none',
    seed: 0,
    frequency: 4,
    domainWarpEnabled: false,
    warpStrength: 1.0,
    octavesEnabled: false,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    ridgedEnabled: false,
    ridgeAmount: 1, // fully ridged once enabled, matching the old dedicated 'ridged' type's look
    terraceEnabled: false,
    terraceSteps: 8,
    opacity: 1,
    heightScale: 1,
    blendMode: 'normal',
    visible: true,
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
  return layers.map((layer) => {
    const legacyField = LEGACY_MODIFIER_TYPE_TO_FIELD[layer.noiseType as string];
    if (!legacyField) return layer;
    return { ...layer, noiseType: 'perlin', [legacyField]: true };
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
        uLayerOpacity: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerHeightScale: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerBlendMode: { value: new Array(MAX_LAYERS).fill(0) },
        // Region bake — off unless renderRegion() turns it on. See
        // heightmap.frag.glsl and renderRegion() below.
        uRegionMode: { value: 0 },
        uRegionFace: { value: 0 },
        uRegionMin: { value: new THREE.Vector2(-1, -1) },
        uRegionMax: { value: new THREE.Vector2(1, 1) },
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
    this.syncLayerUniforms(layers);
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
    const { layers, face, min, max, resolution } = params;
    this.syncPaintTargets(renderer, layers);
    this.syncLayerUniforms(layers);

    const uniforms = this.material.uniforms;
    uniforms.uRegionMode.value = 1;
    uniforms.uRegionFace.value = face;
    (uniforms.uRegionMin.value as THREE.Vector2).set(min.x, min.y);
    (uniforms.uRegionMax.value as THREE.Vector2).set(max.x, max.y);

    const target = this.acquireRegionTarget(resolution);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    // Left off so the next whole-globe render() isn't silently still in
    // region mode if it forgets to reset it.
    uniforms.uRegionMode.value = 0;
    return target;
  }

  // Reused while the size matches, so panning or re-meshing doesn't
  // allocate a new target every time.
  private acquireRegionTarget(resolution: number): THREE.WebGLRenderTarget {
    if (this.regionTarget && this.regionTarget.width === resolution && this.regionTarget.height === resolution) {
      return this.regionTarget;
    }
    this.regionTarget?.dispose();
    // FloatType to match the shared map: elevation is real height, which can
    // exceed 1 or go negative. See ISSUES.md, 2026-09-24.
    this.regionTarget = new THREE.WebGLRenderTarget(resolution, resolution, { type: THREE.FloatType });
    return this.regionTarget;
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

  // Shared by the whole-globe and region paths so the two can't drift apart.
  private syncLayerUniforms(layers: NoiseLayer[]): void {
    const uniforms = this.material.uniforms;
    const visibleLayers = layers.filter((layer) => layer.visible !== false);
    uniforms.uLayerCount.value = visibleLayers.length;
    visibleLayers.forEach((layer, i) => {
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
    this.material.dispose();
    this.scene.remove(this.scene.children[0]);
    this.paintTargets.forEach((pair) => pair.forEach((target) => target.dispose()));
    this.paintTargets.clear();
    this.paintActiveIndex.clear();
    this.paintPlaceholder.dispose();
    this.strokePathMaterial.dispose();
    this.strokePathScene.remove(this.strokePathScene.children[0]);
  }
}

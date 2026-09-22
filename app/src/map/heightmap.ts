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
const HEIGHTMAP_HEIGHT = 512;

// Matches strokePath.frag.glsl's MAX_STROKE_POINTS.
const MAX_STROKE_POINTS = 64;

// Matches heightmap.frag.glsl's MAX_LAYERS.
export const MAX_LAYERS = 16;

export type NoiseType =
  | 'none'
  | 'random'
  | 'perlin'
  | 'simplex'
  | 'voronoi'
  | 'ridged'
  | 'octaves'
  | 'terrace'
  | 'domainWarp';

// Matches heightmap.frag.glsl's evalLayerNoise if/else chain (0-8). Exported
// so the UI (NoisePanel.tsx) can build its dropdown from the same list
// instead of a separately-maintained copy.
export const NOISE_TYPE_OPTIONS: { value: NoiseType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'random', label: 'Random' },
  { value: 'perlin', label: 'Perlin' },
  { value: 'simplex', label: 'Simplex' },
  { value: 'voronoi', label: 'Voronoi' },
  { value: 'ridged', label: 'Ridged' },
  { value: 'octaves', label: 'Octaves (fBm)' },
  { value: 'terrace', label: 'Terrace' },
  { value: 'domainWarp', label: 'Domain warp' },
];

const NOISE_TYPE_INDEX: Record<NoiseType, number> = {
  random: 0,
  perlin: 1,
  simplex: 2,
  voronoi: 3,
  ridged: 4,
  none: 5,
  octaves: 6,
  terrace: 7,
  domainWarp: 8,
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
  noiseType: NoiseType;
  seed: number;
  frequency: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  terraceSteps: number;
  warpStrength: number;
  opacity: number; // 0-1
  blendMode: BlendMode;
}

export function createDefaultLayer(id: string): NoiseLayer {
  return {
    id,
    noiseType: 'none',
    seed: 0,
    frequency: 4,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    terraceSteps: 8,
    warpStrength: 1.0,
    opacity: 1,
    blendMode: 'normal',
  };
}

export interface HeightmapParams {
  layers: NoiseLayer[];
}

// A UV coordinate, e.g. where a paint stroke lands.
export interface UV {
  x: number;
  y: number;
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
  private paintActiveIndex = new Map<string, number>();
  private paintPlaceholder: THREE.DataTexture;
  // The stroke currently being drawn, if any — its whole point path is kept
  // here (not GPU-accumulated) and re-rendered fresh each dab by
  // strokePathScene, against the layer's frozen pre-stroke base (baseIndex).
  // See beginStroke()/paintStroke() below and ISSUES.md, 2026-09-22.
  private strokePathScene: THREE.Scene;
  private strokePathCamera: THREE.OrthographicCamera;
  private strokePathMaterial: THREE.ShaderMaterial;
  private activeStroke: { layerId: string; baseIndex: number; points: UV[] } | null;

  constructor() {
    this.renderTarget = new THREE.WebGLRenderTarget(HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT);
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
        uLayerOctaves: { value: new Array(MAX_LAYERS).fill(4) },
        uLayerPersistence: { value: new Array(MAX_LAYERS).fill(0.5) },
        uLayerLacunarity: { value: new Array(MAX_LAYERS).fill(2.0) },
        uLayerTerraceSteps: { value: new Array(MAX_LAYERS).fill(8) },
        uLayerWarpStrength: { value: new Array(MAX_LAYERS).fill(1.0) },
        uLayerOpacity: { value: new Array(MAX_LAYERS).fill(1) },
        uLayerBlendMode: { value: new Array(MAX_LAYERS).fill(0) },
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
    this.activeStroke = { layerId, baseIndex: this.paintActiveIndex.get(layerId) ?? 0, points: [uv] };
  }

  // Call at the end of a stroke (pointerup/pointercancel) — nothing to
  // commit, the last dab's result is already sitting in the layer's active
  // paint target; this just clears the "a stroke is in progress" state so
  // the next beginStroke() re-freezes a fresh base.
  endStroke(): void {
    this.activeStroke = null;
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

  private getActivePaintTexture(layerId: string): THREE.Texture {
    const pair = this.paintTargets.get(layerId)!;
    return pair[this.paintActiveIndex.get(layerId) ?? 0].texture;
  }

  // Reads the current composite texture back as ImageData, for MapView's
  // plain 2D <canvas> to display via ctx.putImageData() — MapView has no
  // WebGL context of its own, see ISSUES.md, 2026-09-15.
  getCompositeImageData(renderer: THREE.WebGLRenderer): ImageData {
    const buffer = new Uint8ClampedArray(HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT * 4);
    renderer.readRenderTargetPixels(this.renderTarget, 0, 0, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT, buffer);
    // readRenderTargetPixels returns rows bottom-to-top (GL convention);
    // ImageData expects top-to-bottom — flip rows.
    const flipped = new Uint8ClampedArray(buffer.length);
    const rowBytes = HEIGHTMAP_WIDTH * 4;
    for (let row = 0; row < HEIGHTMAP_HEIGHT; row++) {
      const srcStart = row * rowBytes;
      const destStart = (HEIGHTMAP_HEIGHT - 1 - row) * rowBytes;
      flipped.set(buffer.subarray(srcStart, srcStart + rowBytes), destStart);
    }
    return new ImageData(flipped, HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT);
  }

  render(renderer: THREE.WebGLRenderer, params: HeightmapParams): THREE.Texture {
    const { layers } = params;
    const uniforms = this.material.uniforms;

    // Sync paint targets to the current layer list — create missing, dispose orphaned.
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

    uniforms.uLayerCount.value = layers.length;
    layers.forEach((layer, i) => {
      uniforms.uLayerNoiseType.value[i] = NOISE_TYPE_INDEX[layer.noiseType];
      uniforms.uLayerSeed.value[i] = layer.seed;
      uniforms.uLayerFrequency.value[i] = layer.frequency;
      uniforms.uLayerOctaves.value[i] = layer.octaves;
      uniforms.uLayerPersistence.value[i] = layer.persistence;
      uniforms.uLayerLacunarity.value[i] = layer.lacunarity;
      uniforms.uLayerTerraceSteps.value[i] = layer.terraceSteps;
      uniforms.uLayerWarpStrength.value[i] = layer.warpStrength;
      uniforms.uLayerOpacity.value[i] = layer.opacity;
      uniforms.uLayerBlendMode.value[i] = BLEND_MODE_INDEX[layer.blendMode];
      uniforms[paintTextureUniformName(i)].value = this.getActivePaintTexture(layer.id);
    });
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    return this.renderTarget.texture;
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

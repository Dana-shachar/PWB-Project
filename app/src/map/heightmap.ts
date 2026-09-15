import * as THREE from 'three';
import noiseGlsl from '../shaders/noise.glsl?raw';
import heightmapVertexGlsl from '../shaders/heightmap.vert.glsl?raw';
import heightmapFragmentGlsl from '../shaders/heightmap.frag.glsl?raw';

// TODO(DS): arbitrary placeholder resolution — detail/generation-cost
// tradeoff (see Dana's question 2026-09-14); lower this first if
// live-editing ever feels sluggish.
const HEIGHTMAP_WIDTH = 1024;
const HEIGHTMAP_HEIGHT = 512;

export type NoiseType =
  | 'none'
  | 'random'
  | 'perlin'
  | 'simplex'
  | 'voronoi'
  | 'ridged'
  | 'octaves'
  | 'terrace';

// Matches heightmap.frag.glsl's uNoiseType if/else chain (0-7). Exported so
// the UI (Panel.tsx) can build its dropdown from the same list instead of a
// separately-maintained copy.
export const NOISE_TYPE_OPTIONS: { value: NoiseType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'random', label: 'Random' },
  { value: 'perlin', label: 'Perlin' },
  { value: 'simplex', label: 'Simplex' },
  { value: 'voronoi', label: 'Voronoi' },
  { value: 'ridged', label: 'Ridged' },
  { value: 'octaves', label: 'Octaves (fBm)' },
  { value: 'terrace', label: 'Terrace' },
];

// 'none'/'octaves'/'terrace' are indices 5/6/7, not renumbered in — keeps
// the already-verified 0-4 mapping for the other types unchanged.
const NOISE_TYPE_INDEX: Record<NoiseType, number> = {
  random: 0,
  perlin: 1,
  simplex: 2,
  voronoi: 3,
  ridged: 4,
  none: 5,
  octaves: 6,
  terrace: 7,
};

// Octaves/persistence/lacunarity only affect the 'octaves' type, terraceSteps
// only the 'terrace' type — all still always passed through, harmless when
// unused, simpler than conditionally wiring them up per type.
export interface HeightmapParams {
  seed: number;
  frequency: number;
  noiseType: NoiseType;
  octaves: number;
  persistence: number;
  lacunarity: number;
  terraceSteps: number;
}

// The render-to-texture pipeline for the 2D heightmap: an orthographic
// camera + a full-screen quad + a WebGLRenderTarget. This is separate
// machinery from SceneCanvas's 3D scene — it exists purely to compute a
// texture (the "2D map"), not to display anything on its own. render()
// regenerates the texture's contents on demand (only when parameters
// actually change, not every frame — that's the caller's job to decide).
export class HeightmapPipeline {
  readonly renderTarget: THREE.WebGLRenderTarget;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;

  constructor() {
    this.renderTarget = new THREE.WebGLRenderTarget(HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT);
    // Repeat U so u=1.0 samples the same texel as u=0.0 — avoids a seam
    // crack at the sphere's duplicated-vertex UV wrap.
    this.renderTarget.texture.wrapS = THREE.RepeatWrapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      vertexShader: heightmapVertexGlsl,
      fragmentShader: noiseGlsl + heightmapFragmentGlsl,
      uniforms: {
        uSeed: { value: 0 },
        uFrequency: { value: 4 },
        uNoiseType: { value: 1 }, // 1 = perlin
        // Standard fBm defaults (persistence 0.5, lacunarity 2.0) — halve
        // amplitude and double frequency each octave, not derived from
        // anything project-specific.
        uOctaves: { value: 4 },
        uPersistence: { value: 0.5 },
        uLacunarity: { value: 2.0 },
        uTerraceSteps: { value: 8 }, // TODO(DS): arbitrary placeholder step count
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);
  }

  render(renderer: THREE.WebGLRenderer, params: HeightmapParams): THREE.Texture {
    this.material.uniforms.uSeed.value = params.seed;
    this.material.uniforms.uFrequency.value = params.frequency;
    this.material.uniforms.uNoiseType.value = NOISE_TYPE_INDEX[params.noiseType];
    this.material.uniforms.uOctaves.value = params.octaves;
    this.material.uniforms.uPersistence.value = params.persistence;
    this.material.uniforms.uLacunarity.value = params.lacunarity;
    this.material.uniforms.uTerraceSteps.value = params.terraceSteps;
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    return this.renderTarget.texture;
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.material.dispose();
    this.scene.remove(this.scene.children[0]);
  }
}

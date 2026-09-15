import * as THREE from 'three';
import noiseGlsl from '../shaders/noise.glsl?raw';
import heightmapVertexGlsl from '../shaders/heightmap.vert.glsl?raw';
import heightmapFragmentGlsl from '../shaders/heightmap.frag.glsl?raw';

// TODO(DS): arbitrary placeholder resolution — detail/generation-cost
// tradeoff (see Dana's question 2026-09-14); lower this first if
// live-editing ever feels sluggish.
const HEIGHTMAP_WIDTH = 1024;
const HEIGHTMAP_HEIGHT = 512;

export interface HeightmapParams {
  seed: number;
  frequency: number;
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
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);
  }

  render(renderer: THREE.WebGLRenderer, params: HeightmapParams): THREE.Texture {
    this.material.uniforms.uSeed.value = params.seed;
    this.material.uniforms.uFrequency.value = params.frequency;
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

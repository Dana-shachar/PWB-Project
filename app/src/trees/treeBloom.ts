import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Selective bloom for the trees' glow, after three.js's webgl_postprocessing_unreal_bloom_selective: objects on the
// bloom layer draw alone (every other mesh black), the image is blurred by UnrealBloomPass, then added over the view.
export const BLOOM_LAYER = 1; // the leaves and fireflies
const BLOOM_STRENGTH = 0.3; // bloom strength at Glow 1 on a full-grown tree; more clips the glow to white. TUNABLE
const BLOOM_SCALE = 0.5; // the glow image's resolution against the view's; a halo is soft, so half is enough. TUNABLE
const BLOOM_RADIUS = 0.5; // how far the halo spreads, 0 to 1. TUNABLE

const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

export class TreeBloom {
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private pass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, BLOOM_RADIUS, 0);
  private layer = new THREE.Layers();
  private saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private quad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tBloom: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'uniform sampler2D tBloom; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tBloom, vUv).rgb, 1.0); \n#include <colorspace_fragment>\n}',
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  private strength = 0;

  constructor() {
    this.layer.set(BLOOM_LAYER);
  }

  // The strongest glow among the shown trees (their leaf uGlow, already Glow times growth); 0 skips the pass.
  setStrength(glow: number) {
    this.strength = glow * BLOOM_STRENGTH;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, left: number, bottom: number, width: number, height: number) {
    if (this.strength <= 0) return;
    const ratio = renderer.getPixelRatio() * BLOOM_SCALE;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.target.width !== pixelWidth || this.target.height !== pixelHeight) {
      this.target.setSize(pixelWidth, pixelHeight);
      this.pass.setSize(pixelWidth, pixelHeight);
    }
    this.pass.strength = this.strength;

    // Glow-only image: meshes off the layer turn black (they still hide what's behind them), leaves draw emission only.
    const background = scene.background;
    scene.background = null;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.layers.test(this.layer)) {
        const uniforms = (object.material as THREE.ShaderMaterial).uniforms;
        if (uniforms?.uBloomPass) uniforms.uBloomPass.value = 1;
      } else {
        this.saved.set(object, object.material);
        object.material = blackMaterial;
      }
    });
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this.target);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, camera);
    this.saved.forEach((material, mesh) => (mesh.material = material));
    this.saved.clear();
    scene.traverse((object) => {
      const uniforms = object instanceof THREE.Mesh ? (object.material as THREE.ShaderMaterial).uniforms : undefined;
      if (uniforms?.uBloomPass) uniforms.uBloomPass.value = 0;
    });
    scene.background = background;
    renderer.setClearColor(clearColor, clearAlpha);

    // Blur. The pass then adds its halo onto the input as well, but the view already has the sharp glow, so only the
    // halo (the pass's composite, left in renderTargetsHorizontal[0]) goes over the view's rectangle.
    this.pass.render(renderer, this.target, this.target, 0, false);
    (this.quad.material as THREE.ShaderMaterial).uniforms.tBloom.value = this.pass.renderTargetsHorizontal[0].texture;
    renderer.setRenderTarget(null);
    renderer.setViewport(left, bottom, width, height);
    renderer.setScissor(left, bottom, width, height);
    renderer.setScissorTest(true);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.pass.dispose();
    this.quad.material.dispose();
    this.quad.dispose();
  }
}

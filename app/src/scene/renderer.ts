import * as THREE from 'three';

// Builds the WebGL renderer that draws the scene onto a given canvas element.
// Antialiasing matches your active-geometry-project setup. Sizing and resize
// handling are SceneCanvas's job, not this file's — it just builds the renderer.
export function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // Reversed depth keeps far ground apart from what sits just behind it (skirts showed through at 40 to 70 km in walk
  // mode, [B171]); no per-pixel cost, unlike the logarithmic depth buffer ([B157]). Needs EXT_clip_control.
  const webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: true });
  webglRenderer.setPixelRatio(window.devicePixelRatio);
  return webglRenderer;
}

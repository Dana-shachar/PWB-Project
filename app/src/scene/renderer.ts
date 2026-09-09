import * as THREE from 'three';

// Builds the WebGL renderer that draws the scene onto a given canvas element.
// Antialiasing matches your active-geometry-project setup. Sizing and resize
// handling are SceneCanvas's job, not this file's — it just builds the renderer.
export function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  webglRenderer.setPixelRatio(window.devicePixelRatio);
  return webglRenderer;
}

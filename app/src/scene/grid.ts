import * as THREE from 'three';

// Builds the ground-plane grid helper. Unlike scene.ts, this is a function
// (not a plain exported value) because size/divisions are real, tunable
// parameters — defaults are sized to be clearly visible at the camera's
// default framing (see camera.ts) without being too dense.
export function grid(size = 200, divisions = 50): THREE.GridHelper {
  return new THREE.GridHelper(size, divisions);
}

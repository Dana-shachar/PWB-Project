import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Builds orbit controls for the camera, configured per your active-geometry-project defaults.
// Note: because damping is enabled, orbitControls.update() must be called every frame —
// that's SceneCanvas's animation loop's job, not this file's.
export function controls(camera: THREE.Camera, domElement: HTMLElement): OrbitControls {
  const orbitControls = new OrbitControls(camera, domElement);
  orbitControls.enableDamping = true; // smooths deceleration on release
  orbitControls.dampingFactor = 0.05;
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  return orbitControls;
}

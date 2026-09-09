import * as THREE from 'three';

// Default distance from the origin — matches active-geometry-project's camera setup.
const DEFAULT_CAMERA_DISTANCE = 80;
// Equal x/y/z offset that keeps the camera DEFAULT_CAMERA_DISTANCE away overall
// (distance / sqrt(3) on each axis gives that isometric-ish default view).
const DEFAULT_PERSPECTIVE_DISTANCE = DEFAULT_CAMERA_DISTANCE / Math.sqrt(3);

// Builds the perspective camera, positioned per your active-geometry-project defaults.
export function camera(aspect: number): THREE.PerspectiveCamera {
  const perspectiveCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 10000);
  perspectiveCamera.position.set(
    DEFAULT_PERSPECTIVE_DISTANCE,
    DEFAULT_PERSPECTIVE_DISTANCE,
    DEFAULT_PERSPECTIVE_DISTANCE,
  );
  perspectiveCamera.lookAt(0, 0, 0);
  return perspectiveCamera;
}

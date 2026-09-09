import * as THREE from 'three';

// Default distance from the origin. active-geometry-project uses 80 here, but
// that number was calibrated for its small CAD-primitive shapes — it doesn't
// transfer to a planet with a default radius of 20 scene units, which made
// the planet fill most of the screen on load. Bumped to 200 (~2.5x farther)
// as a starting point — TODO(DS): still arbitrary, not derived from anything;
// adjustable live via the gumball's zoom slider once wired.
// Exported so Gumball.tsx can share this exact baseline for its zoom-percent
// calibration, rather than a second hardcoded copy.
export const DEFAULT_CAMERA_DISTANCE = 200;
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

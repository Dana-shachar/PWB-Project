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

// Elevation angle above the horizontal plane. A true isometric view (equal
// x/y/z) sits at ~35.26deg. Since the camera always looks directly at the
// origin (which sits on the grid/horizon), a SHALLOWER angle than that is
// what pushes the horizon down toward the lower third of the frame (more
// sky/space above, less ground below) — a steeper angle does the opposite,
// tilting toward a top-down view (this was backwards in an earlier pass).
// TODO(DS): arbitrary placeholder — adjust to taste.
export const DEFAULT_ELEVATION_DEGREES = 15;

// The default camera position — shared by camera() below and Gumball's
// resetScene(), so there's one formula for "the default view" instead of two
// separately-hardcoded copies that could drift out of sync.
export function defaultCameraPosition(distance = DEFAULT_CAMERA_DISTANCE): THREE.Vector3 {
  const elevationRad = (DEFAULT_ELEVATION_DEGREES * Math.PI) / 180;
  const horizontalDistance = distance * Math.cos(elevationRad);
  const y = distance * Math.sin(elevationRad);
  const x = horizontalDistance / Math.sqrt(2);
  const z = horizontalDistance / Math.sqrt(2);
  return new THREE.Vector3(x, y, z);
}

// The closest the planet camera may get above the highest terrain, as a
// share of the radius (3 km at 6000 km). Inferred from the patch depth cap,
// TUNABLE ([B51]).
export const MIN_CAMERA_ALTITUDE = 0.0005;
// The near and far planes used while far from the surface.
export const DEFAULT_NEAR = 0.1;
export const DEFAULT_FAR = 10000;

// Builds the perspective camera, positioned per the default view above.
export function camera(aspect: number): THREE.PerspectiveCamera {
  const perspectiveCamera = new THREE.PerspectiveCamera(50, aspect, DEFAULT_NEAR, DEFAULT_FAR);
  perspectiveCamera.position.copy(defaultCameraPosition());
  perspectiveCamera.lookAt(0, 0, 0);
  return perspectiveCamera;
}

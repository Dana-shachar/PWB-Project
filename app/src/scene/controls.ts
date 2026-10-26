import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_FAR, DEFAULT_NEAR, MIN_CAMERA_ALTITUDE } from './camera';

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

// OrbitControls' own zoom step per wheel click (0.95 of the distance).
const WHEEL_STEP = 0.95;

// Speeds scaled by height above the surface, as globe viewers do (Google Earth,
// Cesium for Unity, A-Terrain): moves shrink near the ground ([B51]).
// `surfaceRadius` is the planet radius plus its highest terrain.
export function applyAltitudeRates(
  orbitControls: OrbitControls,
  perspectiveCamera: THREE.PerspectiveCamera,
  planetRadius: number,
  surfaceRadius: number,
): void {
  const minAltitude = planetRadius * MIN_CAMERA_ALTITUDE;
  const distance = perspectiveCamera.position.distanceTo(orbitControls.target);
  const altitude = Math.max(minAltitude, distance - surfaceRadius);
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2);
  // A drag across the view moves the ground about one view-width, not one turn.
  orbitControls.rotateSpeed = Math.min(1, (altitude * tanHalfFov) / (Math.PI * surfaceRadius));
  orbitControls.panSpeed = Math.min(1, altitude / distance);
  // Each wheel click changes the height by the default 5%, not the distance to the center.
  const zoomScale = (surfaceRadius + altitude * WHEEL_STEP) / (surfaceRadius + altitude);
  orbitControls.zoomSpeed = Math.log(zoomScale) / Math.log(WHEEL_STEP);
  orbitControls.minDistance = surfaceRadius + minAltitude;

  // Near the ground the near plane follows the height so terrain isn't clipped,
  // and the far plane stops at the horizon to keep depth precision.
  let near = DEFAULT_NEAR;
  let far = DEFAULT_FAR;
  if (altitude < planetRadius) {
    near = Math.min(DEFAULT_NEAR, altitude * 0.25);
    const horizon = Math.sqrt(Math.max(0, distance * distance - planetRadius * planetRadius));
    const beyond = Math.sqrt(Math.max(0, surfaceRadius * surfaceRadius - planetRadius * planetRadius));
    far = Math.min(DEFAULT_FAR, (horizon + beyond) * 1.5);
  }
  if (perspectiveCamera.near !== near || perspectiveCamera.far !== far) {
    perspectiveCamera.near = near;
    perspectiveCamera.far = far;
    perspectiveCamera.updateProjectionMatrix();
  }
}

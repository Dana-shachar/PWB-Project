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
  // Shift + drag already pans (OrbitControls' own default); Space + drag does too, as in Figma and Photoshop.
  const removeSpacePan = holdSpaceToPan(orbitControls, domElement);
  const baseDispose = orbitControls.dispose.bind(orbitControls);
  orbitControls.dispose = () => {
    removeSpacePan();
    baseDispose();
  };
  return orbitControls;
}

// While Space is held, a left drag pans instead of orbiting, with a hand cursor (Dana, 2026-10-30). Ignored while
// typing or on a focused button, and released if the window loses focus. Returns the cleanup.
function holdSpaceToPan(orbitControls: OrbitControls, domElement: HTMLElement): () => void {
  let isHeld = false;
  const release = () => {
    if (!isHeld) return;
    isHeld = false;
    orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    domElement.style.cursor = '';
  };
  const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || isTyping(event.target)) return;
    event.preventDefault(); // no page scroll
    if (isHeld) return;
    isHeld = true;
    orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    domElement.style.cursor = 'grab';
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') release();
  };
  const onPointerDown = () => {
    if (isHeld) domElement.style.cursor = 'grabbing';
  };
  const onPointerUp = () => {
    if (isHeld) domElement.style.cursor = 'grab';
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', release);
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', release);
    domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
  };
}

// OrbitControls' own zoom step per wheel click (0.95 of the distance).
const WHEEL_STEP = 0.95;

// Speeds scaled by height above the surface, as globe viewers do (Google Earth,
// Cesium for Unity, A-Terrain): moves shrink near the ground ([B51]).
// `surfaceRadius` is the planet radius plus its highest terrain; `outerRadius` the farthest-reaching layer around it
// (the atmosphere's glow), which the far limit must contain.
export function applyAltitudeRates(
  orbitControls: OrbitControls,
  perspectiveCamera: THREE.PerspectiveCamera,
  planetRadius: number,
  surfaceRadius: number,
  outerRadius: number,
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
    // Measured from the planet's center (the origin), not the orbit target: after a pan they differ, and a far limit
    // short of the glow cut it off-center (Dana, 2026-10-30).
    const centerDistance = perspectiveCamera.position.length();
    const horizon = Math.sqrt(Math.max(0, centerDistance * centerDistance - planetRadius * planetRadius));
    const beyond = Math.sqrt(Math.max(0, surfaceRadius * surfaceRadius - planetRadius * planetRadius));
    far = Math.min(DEFAULT_FAR, Math.max((horizon + beyond) * 1.5, centerDistance + outerRadius));
  }
  if (perspectiveCamera.near !== near || perspectiveCamera.far !== far) {
    perspectiveCamera.near = near;
    perspectiveCamera.far = far;
    perspectiveCamera.updateProjectionMatrix();
  }
}

// The flat land chunk's version ([B56]), run after the controls update: the
// camera stays above the ground under it (Cesium's terrain collision), and the
// near plane follows that height. The closest height scales with the chunk.
export function keepAboveFlatGround(
  orbitControls: OrbitControls,
  perspectiveCamera: THREE.PerspectiveCamera,
  groundHeight: number,
  chunkSize: number,
): void {
  const minAltitude = chunkSize * MIN_CAMERA_ALTITUDE;
  orbitControls.minDistance = minAltitude;
  if (perspectiveCamera.position.y < groundHeight + minAltitude) {
    perspectiveCamera.position.y = groundHeight + minAltitude;
    perspectiveCamera.lookAt(orbitControls.target);
  }
  const altitude = Math.max(minAltitude, perspectiveCamera.position.y - groundHeight);
  const near = Math.min(DEFAULT_NEAR, altitude * 0.25);
  if (perspectiveCamera.near !== near) {
    perspectiveCamera.near = near;
    perspectiveCamera.updateProjectionMatrix();
  }
}

import * as THREE from 'three';

// The planet turning on its own when left alone (Dana, 2026-11-01): the planet's group (surface, clouds, air) is leaned
// onto the spin axis and turned about it, the standard Object3D rotation, so camera, grid, sun and controls stay as they
// are. Systems that measure in world space turn into the planet's frame first (uPlanetFrame, worldToLocal). A press on
// the planet pauses it.
export interface SpinSettings {
  speed: number; // degrees per second; 0 is still
  tilt: number; // degrees the axis leans from straight up, 0 to 180
  direction: number; // which way it leans, compass degrees
}

export const DEFAULT_SPIN: SpinSettings = { speed: 4, tilt: 23, direction: 0 }; // Earth's tilt, about 90 s a turn
const SPIN_EASE_SECONDS = 1; // after a drag, the spin ramps from still to full speed over this long
// Planets spin at any tilt (Dana, 2026-11-01): Earth leans 23 degrees, Uranus 98 (on its side), Venus 177 (upside
// down), so Randomize rolls the whole 0 to 180 and any direction. Speed range inferred, TUNABLE.
const SPIN_SPEED: [number, number] = [2, 12];
export function randomSpin(): SpinSettings {
  return {
    speed: Math.round((SPIN_SPEED[0] + Math.random() * (SPIN_SPEED[1] - SPIN_SPEED[0])) * 2) / 2,
    tilt: Math.round(Math.random() * 180),
    direction: Math.round(Math.random() * 360),
  };
}

export function spinAxis(settings: SpinSettings): THREE.Vector3 {
  const tilt = THREE.MathUtils.degToRad(settings.tilt);
  const direction = THREE.MathUtils.degToRad(settings.direction);
  return new THREE.Vector3(Math.sin(tilt) * Math.cos(direction), Math.cos(tilt), Math.sin(tilt) * Math.sin(direction));
}

export interface PlanetSpin {
  update: (deltaSeconds: number, settings: SpinSettings) => void;
  dispose: () => void;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function createPlanetSpin(planet: THREE.Object3D, element: HTMLElement): PlanetSpin {
  // Only a press on the planet pauses the spin, not scrolling or zooming (a trackpad's two-finger scroll reports every
  // step as its own start and end). On release it eases back to full speed instead of waiting.
  let touching = false;
  let releasedAt = -Infinity;
  const onDown = () => (touching = true);
  const onUp = () => {
    if (!touching) return;
    touching = false;
    releasedAt = performance.now();
  };
  element.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  let turn = 0;
  const lean = new THREE.Quaternion();
  const around = new THREE.Quaternion();
  return {
    update(deltaSeconds, settings) {
      if (!touching) {
        const ease = Math.min(1, (performance.now() - releasedAt) / 1000 / SPIN_EASE_SECONDS);
        turn += THREE.MathUtils.degToRad(settings.speed) * ease * deltaSeconds;
      }
      // The tilt and direction apply even while paused, so the sliders answer at once.
      lean.setFromUnitVectors(WORLD_UP, spinAxis(settings));
      around.setFromAxisAngle(WORLD_UP, turn);
      planet.quaternion.copy(lean).multiply(around);
      planet.updateMatrixWorld();
    },
    dispose() {
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    },
  };
}

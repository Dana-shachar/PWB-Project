import * as THREE from 'three';

// The planet haze's settings, shared by the sky shell (planetHaze.ts) and every surface patch (planetPatchMesh.ts), so
// one update reaches both. Each surface pixel hazes the air between the eye and itself; the shell only the sky around
// the planet (Lague's "Coding Adventure: Atmosphere", done per surface as iTwin.js does). The air's ground lives here
// too (airGround.ts), so patches built before it exists still read it.
export const planetAirUniforms = {
  uHazeColor: { value: new THREE.Color() },
  uHazeDensity: { value: 0 }, // 0 when the atmosphere or haze is off
  uHazeScaleHeight: { value: 0.01 },
  uHazeCenter: { value: new THREE.Vector3() },
  uHazeSeaRadius: { value: 1 }, // the lowest visible ground: rays that miss every surface stop here
  uHazePlanetRadius: { value: 1 },
  uHazeAirRadius: { value: 1 },
  uAirGround: { value: null as THREE.CubeTexture | null },
  uAirAmplitude: { value: 0 },
};

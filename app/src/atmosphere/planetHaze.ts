import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/planetHaze.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/planetHaze.frag.glsl?raw';
import airGroundGlsl from '../shaders/atmosphere/airGround.glsl?raw';
import planetAirGlsl from '../shaders/atmosphere/planetAir.glsl?raw';
import { planetAirUniforms } from './planetAir';
import type { AtmosphereSettings } from './atmosphereSettings';

// The haze over the planet: air thinning with height drawn over the ground in the horizon color, as thick as the air each
// view ray crosses (planetHaze.frag.glsl). Haze 1 is about 5% looking straight down. Scale height inferred, TUNABLE.
// Share of the radius: deep and soft rather than Earth-thin, so the rim reads as a glow, not a stripe (Dana, 2026-10-30).
const HAZE_SCALE_HEIGHT = 0.03;
const HAZE_SHELL_HEIGHTS = 5; // the shell reaches this many scale heights up, where the air is nearly gone
const HAZE_DENSITY_PER_UNIT = 0.05;
const PEAK_CLEARANCE = 1.02; // the shell's top above the highest peak, as a share of its radius

export interface PlanetHaze {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createPlanetHaze(): PlanetHaze {
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: airGroundGlsl + planetAirGlsl + fragmentShader,
    side: THREE.BackSide, // the far side, hidden by any surface in front: only the sky shows the shell
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...planetAirUniforms,
      uCameraPosition: { value: new THREE.Vector3() },
      uLightDirection: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: 0.2 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3; // over the clouds: the air is in front of them too
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// Every frame: size, color and density, the camera and the planet's center, and the sun. `radius` is the lowest visible
// ground, `planetRadius` the planet's own, `peakRadius` the highest terrain's distance from the center: the air's shell
// always reaches past it. The values go to planetAirUniforms, so the surfaces' haze follows too.
export function updatePlanetHaze(haze: PlanetHaze, settings: AtmosphereSettings, radius: number, planetRadius: number, peakRadius: number, cameraPosition: THREE.Vector3, lightDirection: THREE.Vector3, ambient: number): void {
  const on = settings.enabled && settings.haze > 0;
  haze.mesh.visible = on;
  const airRadius = Math.max(radius * (1 + HAZE_SCALE_HEIGHT * HAZE_SHELL_HEIGHTS), peakRadius * PEAK_CLEARANCE);
  haze.mesh.scale.setScalar(airRadius);
  planetAirUniforms.uHazeScaleHeight.value = radius * HAZE_SCALE_HEIGHT;
  planetAirUniforms.uHazeCenter.value.copy(haze.mesh.position);
  planetAirUniforms.uHazeSeaRadius.value = radius;
  planetAirUniforms.uHazePlanetRadius.value = planetRadius;
  planetAirUniforms.uHazeAirRadius.value = airRadius;
  planetAirUniforms.uHazeColor.value.set(settings.horizonColor);
  planetAirUniforms.uHazeDensity.value = on ? settings.haze * HAZE_DENSITY_PER_UNIT : 0;
  const uniforms = haze.mesh.material.uniforms;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  (uniforms.uLightDirection.value as THREE.Vector3).copy(lightDirection);
  uniforms.uAmbient.value = ambient;
}

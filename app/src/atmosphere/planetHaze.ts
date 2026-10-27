import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/planetHaze.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/planetHaze.frag.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The haze over the planet: a thin air layer drawn over the ground in the horizon color, as thick as the air each view
// ray crosses (planetHaze.frag.glsl). Haze 1 is about 5% looking straight down; layer height inferred, TUNABLE.
const HAZE_AIR_HEIGHT = 0.02; // share of the radius
const HAZE_DENSITY_PER_UNIT = 0.05;

export interface PlanetHaze {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createPlanetHaze(): PlanetHaze {
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      hazeColor: { value: new THREE.Color() },
      uDensity: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
      uAirRadius: { value: 1 },
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

// Every frame: size, color and density, the camera and the planet's center, and the sun.
export function updatePlanetHaze(haze: PlanetHaze, settings: AtmosphereSettings, radius: number, cameraPosition: THREE.Vector3, lightDirection: THREE.Vector3, ambient: number): void {
  haze.mesh.visible = settings.enabled && settings.haze > 0;
  const airRadius = radius * (1 + HAZE_AIR_HEIGHT);
  haze.mesh.scale.setScalar(airRadius);
  const uniforms = haze.mesh.material.uniforms;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  (uniforms.uCenter.value as THREE.Vector3).copy(haze.mesh.position);
  uniforms.uRadius.value = radius;
  uniforms.uAirRadius.value = airRadius;
  (uniforms.hazeColor.value as THREE.Color).set(settings.horizonColor);
  uniforms.uDensity.value = settings.haze * HAZE_DENSITY_PER_UNIT;
  (uniforms.uLightDirection.value as THREE.Vector3).copy(lightDirection);
  uniforms.uAmbient.value = ambient;
}

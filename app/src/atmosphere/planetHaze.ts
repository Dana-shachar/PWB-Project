import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/planetHaze.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/planetHaze.frag.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The haze over the planet: a shell just above the ground with Stemkoski's "shell" preset (c 1, p 2, front side),
// blended over the planet in the horizon color, strongest toward the edges. Shell gap inferred, TUNABLE.
const HAZE_SHELL_SCALE = 1.004;

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
      viewVector: { value: new THREE.Vector3() },
      c: { value: 1.0 },
      p: { value: 2.0 },
      hazeColor: { value: new THREE.Color() },
      uStrength: { value: 0.3 },
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

// Every frame: size, color and strength, the view vector (camera relative to the planet) and the sun.
export function updatePlanetHaze(haze: PlanetHaze, settings: AtmosphereSettings, radius: number, cameraPosition: THREE.Vector3, lightDirection: THREE.Vector3, ambient: number): void {
  haze.mesh.visible = settings.enabled && settings.haze > 0;
  haze.mesh.scale.setScalar(radius * HAZE_SHELL_SCALE);
  const uniforms = haze.mesh.material.uniforms;
  (uniforms.viewVector.value as THREE.Vector3).copy(cameraPosition).sub(haze.mesh.position);
  (uniforms.hazeColor.value as THREE.Color).set(settings.horizonColor);
  uniforms.uStrength.value = settings.haze;
  (uniforms.uLightDirection.value as THREE.Vector3).copy(lightDirection);
  uniforms.uAmbient.value = ambient;
}

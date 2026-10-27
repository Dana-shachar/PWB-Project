import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/planetGlow.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/planetGlow.frag.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The planet's rim glow: a slightly larger sphere drawn from inside and added on top, with Stemkoski's "halo" preset
// (c 0.6, p 6, back side, additive). Glow sets both how wide the shell reaches past the planet and how bright it is,
// since brightness alone only re-tints a thin ring. Widths inferred, TUNABLE.
const GLOW_MIN_SCALE = 1.02;
const GLOW_SCALE_PER_UNIT = 0.12;

export interface PlanetGlow {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createPlanetGlow(): PlanetGlow {
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: {
      viewVector: { value: new THREE.Vector3() },
      c: { value: 0.6 },
      p: { value: 6.0 },
      glowColor: { value: new THREE.Color() },
      uStrength: { value: 0.5 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function updatePlanetGlow(glow: PlanetGlow, settings: AtmosphereSettings, radius: number): void {
  glow.mesh.visible = settings.enabled && settings.glow > 0;
  glow.mesh.scale.setScalar(radius * (GLOW_MIN_SCALE + settings.glow * GLOW_SCALE_PER_UNIT));
  const uniforms = glow.mesh.material.uniforms;
  (uniforms.glowColor.value as THREE.Color).set(settings.zenithColor);
  uniforms.uStrength.value = Math.min(2, settings.glow);
}

// Every frame: the view vector is the camera's position relative to the planet, as in the demo.
export function updatePlanetGlowFrame(glow: PlanetGlow, cameraPosition: THREE.Vector3): void {
  (glow.mesh.material.uniforms.viewVector.value as THREE.Vector3).copy(cameraPosition).sub(glow.mesh.position);
}

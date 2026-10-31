import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/planetGlow.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/planetGlow.frag.glsl?raw';
import airGroundGlsl from '../shaders/atmosphere/airGround.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The planet's glow: a sphere around the planet drawn from inside and added on top; its shader fades the glow out from
// the planet's edge like Photoshop's outer glow (planetGlow.frag.glsl). Glow sets the fade's size. Inferred, TUNABLE.
const GLOW_MIN_WIDTH = 0.03; // share of the radius
const GLOW_WIDTH_PER_UNIT = 0.06;
const GLOW_STRENGTH = 1.2;
// The shell reaches this many widths past the edge, where the fade is nearly done.
// The space between the visible surface and where the glow starts, as a share of the radius, the same on every planet
// (Dana, 2026-10-30: about what a smooth planet showed). Inferred, TUNABLE.
const GLOW_GAP = 0.018;
const GLOW_SHELL_WIDTHS = 5;

export interface PlanetGlow {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createPlanetGlow(): PlanetGlow {
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: airGroundGlsl + fragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: {
      glowColor: { value: new THREE.Color() },
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
      uWidth: { value: 0.1 },
      uStrength: { value: GLOW_STRENGTH },
      uCameraPosition: { value: new THREE.Vector3() },
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

// `radius` is the planet's own; the glow starts at the air's ground above it (airGround.ts), and the shell reaches past
// the highest peak (`terrainReach` above the radius).
// `jaggedGap` is the extra space on a jagged planet, in world units.
export function updatePlanetGlow(glow: PlanetGlow, settings: AtmosphereSettings, radius: number, terrainReach: number, jaggedGap: number): void {
  glow.mesh.visible = settings.enabled && settings.glow > 0;
  const width = radius * (GLOW_MIN_WIDTH + settings.glow * GLOW_WIDTH_PER_UNIT);
  glow.mesh.scale.setScalar(radius + terrainReach + jaggedGap + width * GLOW_SHELL_WIDTHS);
  const uniforms = glow.mesh.material.uniforms;
  (uniforms.glowColor.value as THREE.Color).set(settings.zenithColor);
  uniforms.uRadius.value = radius * (1 + GLOW_GAP) + jaggedGap;
  uniforms.uWidth.value = width;
}

// How far the glow's sphere reaches from the center, 0 when hidden: the camera's far limit must contain it.
export function glowOuterRadius(glow: PlanetGlow): number {
  return glow.mesh.visible ? glow.mesh.scale.x : 0;
}

// Every frame: the camera and the planet's center, for the view rays.
export function updatePlanetGlowFrame(glow: PlanetGlow, cameraPosition: THREE.Vector3): void {
  const uniforms = glow.mesh.material.uniforms;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  (uniforms.uCenter.value as THREE.Vector3).copy(glow.mesh.position);
}

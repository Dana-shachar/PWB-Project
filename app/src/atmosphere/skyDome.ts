import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/skyDome.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/skyDome.frag.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The chunk's sky: three.js's hemisphere-lights sky dome (MIT; offset 33 and exponent 0.6 on a 4000-radius sphere),
// drawn from inside, following the camera, behind everything else, sized just inside the camera's far plane.
const EXAMPLE_RADIUS = 4000;
const EXAMPLE_OFFSET = 33;
// The moon's compass direction (its height comes from the Moon Height setting). Inferred, TUNABLE.
const MOON_AZIMUTH = Math.atan2(-0.7, -0.6);
// How fast the clouds drift at force 4, in noise units per second (Dana, 2026-10-27: 3x, was too slow). Inferred, TUNABLE.
const CLOUD_DRIFT = 0.12;

export interface SkyDome {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createSkyDome(): SkyDome {
  const geometry = new THREE.SphereGeometry(1, 32, 15);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color() },
      bottomColor: { value: new THREE.Color() },
      offset: { value: EXAMPLE_OFFSET / EXAMPLE_RADIUS },
      exponent: { value: 0.6 },
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: 0.2 },
      uLightIntensity: { value: 1 },
      uDiffuseWrap: { value: 0 },
      uMoonEnabled: { value: 0 },
      uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
      uMoonColor: { value: new THREE.Color() },
      uMoonSize: { value: 0.1 },
      uCloudCoverage: { value: 0 },
      uCloudColor: { value: new THREE.Color() },
      uCloudColor2: { value: new THREE.Color() },
      uCloudSoftness: { value: 0.5 },
      uCloudOffset: { value: new THREE.Vector2() },
      uGlow: { value: 0.5 },
      uCloudScale: { value: 1 },
      uCloudDetail: { value: 4 },
      uCloudFeather: { value: 0.4 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function updateSkyDome(sky: SkyDome, settings: AtmosphereSettings): void {
  const uniforms = sky.mesh.material.uniforms;
  sky.mesh.visible = settings.enabled;
  (uniforms.topColor.value as THREE.Color).set(settings.zenithColor);
  (uniforms.bottomColor.value as THREE.Color).set(settings.horizonColor);
  uniforms.uMoonEnabled.value = settings.moon ? 1 : 0;
  (uniforms.uMoonColor.value as THREE.Color).set(settings.moonColor);
  uniforms.uMoonSize.value = THREE.MathUtils.degToRad(settings.moonSize);
  const elevation = THREE.MathUtils.degToRad(settings.moonHeight);
  (uniforms.uMoonDirection.value as THREE.Vector3).set(Math.cos(elevation) * Math.cos(MOON_AZIMUTH), Math.sin(elevation), Math.cos(elevation) * Math.sin(MOON_AZIMUTH));
  uniforms.uGlow.value = settings.glow;
  uniforms.uCloudCoverage.value = settings.cloudCoverage;
  (uniforms.uCloudColor.value as THREE.Color).set(settings.cloudColor);
  (uniforms.uCloudColor2.value as THREE.Color).set(settings.cloudColor2);
  uniforms.uCloudSoftness.value = settings.cloudSoftness;
  uniforms.uCloudScale.value = settings.cloudScale;
  uniforms.uCloudDetail.value = settings.cloudDetail;
  uniforms.uCloudFeather.value = settings.cloudFeather;
}

// The Scene lighting, so the moon is lit as the land is.
export function setSkyDomeLight(sky: SkyDome, ambient: number, intensity: number, wrap: number): void {
  const uniforms = sky.mesh.material.uniforms;
  uniforms.uAmbient.value = ambient;
  uniforms.uLightIntensity.value = intensity;
  uniforms.uDiffuseWrap.value = wrap;
}

// Every frame: the dome follows the camera and stays inside its far plane, and the clouds drift with the wind.
export function updateSkyDomeFrame(sky: SkyDome, camera: THREE.PerspectiveCamera, sunDirection: THREE.Vector3, wind: number, deltaSeconds: number): void {
  const uniforms = sky.mesh.material.uniforms;
  const cameraPosition = camera.position;
  const radius = camera.far * 0.9;
  sky.mesh.position.copy(cameraPosition);
  sky.mesh.scale.setScalar(radius);
  uniforms.uRadius.value = radius;
  uniforms.offset.value = (EXAMPLE_OFFSET * radius) / EXAMPLE_RADIUS;
  (uniforms.uCenter.value as THREE.Vector3).copy(cameraPosition);
  (uniforms.uSunDirection.value as THREE.Vector3).copy(sunDirection);
  (uniforms.uCloudOffset.value as THREE.Vector2).x += deltaSeconds * CLOUD_DRIFT * (wind / 4);
}

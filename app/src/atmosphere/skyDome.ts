import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/skyDome.vert.glsl?raw';
import fragmentShader from '../shaders/atmosphere/skyDome.frag.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';
import { MAX_MOONS } from './moonTexture';

// The chunk's sky: three.js's hemisphere-lights sky dome (MIT; offset 33 and exponent 0.6 on a 4000-radius sphere),
// drawn from inside, following the camera, behind everything else, sized just inside the camera's far plane.
const EXAMPLE_RADIUS = 4000;
const EXAMPLE_OFFSET = 33;
// How fast the clouds drift at force 4, in noise units per second (Dana, 2026-10-27: 3x, was too slow). Inferred, TUNABLE.
const CLOUD_DRIFT = 0.12;

export interface SkyDome {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  // Each moon's baked surface by its index in the settings, and the draw order (smallest first, so larger moons,
  // read as closer, are drawn in front): slot i of the shader's arrays holds moon moonOrder[i].
  moonTextures: (THREE.Texture | null)[];
  moonOrder: number[];
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
      uMoonCount: { value: 0 },
      uMoonDirections: { value: Array.from({ length: MAX_MOONS }, () => new THREE.Vector3(0, 1, 0)) },
      uMoonSizes: { value: new Array(MAX_MOONS).fill(0.1) },
      uMoonColors: { value: Array.from({ length: MAX_MOONS }, () => new THREE.Color()) },
      uMoonColors2: { value: Array.from({ length: MAX_MOONS }, () => new THREE.Color()) },
      uMoonHasTexture: { value: new Array(MAX_MOONS).fill(0) },
      uMoonCrescentAngles: { value: new Array(MAX_MOONS).fill(0) },
      ...Object.fromEntries(Array.from({ length: MAX_MOONS }, (_, i) => [`uMoonTexture${i}`, { value: null }])),
      uMoonTextureAmounts: { value: new Array(MAX_MOONS).fill(1) },
      uMoonHalos: { value: new Array(MAX_MOONS).fill(0) },
      uMoonGlows: { value: new Array(MAX_MOONS).fill(0) },
      uMoonCrescents: { value: new Array(MAX_MOONS).fill(0.5) },
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
    moonTextures: new Array(MAX_MOONS).fill(null),
    moonOrder: Array.from({ length: MAX_MOONS }, (_, i) => i),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// A moon's surface, baked from its noise layers (moonTexture.ts) by the chunk's own pipelines; null draws it flat.
export function setSkyDomeMoonTexture(sky: SkyDome, moonIndex: number, texture: THREE.Texture | null): void {
  sky.moonTextures[moonIndex] = texture;
  applyMoonTextures(sky);
}
function applyMoonTextures(sky: SkyDome): void {
  const uniforms = sky.mesh.material.uniforms;
  sky.moonOrder.forEach((moonIndex, slot) => {
    const texture = sky.moonTextures[moonIndex];
    uniforms[`uMoonTexture${slot}`].value = texture;
    (uniforms.uMoonHasTexture.value as number[])[slot] = texture ? 1 : 0;
  });
}

export function updateSkyDome(sky: SkyDome, settings: AtmosphereSettings): void {
  const uniforms = sky.mesh.material.uniforms;
  sky.mesh.visible = settings.enabled;
  (uniforms.topColor.value as THREE.Color).set(settings.zenithColor);
  (uniforms.bottomColor.value as THREE.Color).set(settings.horizonColor);
  uniforms.uMoonEnabled.value = settings.moon ? 1 : 0;
  const count = Math.min(settings.moonCount, settings.moons.length);
  uniforms.uMoonCount.value = count;
  // Smallest first, so the larger moons are drawn over them; the hidden ones keep their places after.
  const shown = Array.from({ length: count }, (_, i) => i).sort((a, b) => settings.moons[a].size - settings.moons[b].size);
  sky.moonOrder = [...shown, ...Array.from({ length: MAX_MOONS }, (_, i) => i).filter((i) => !shown.includes(i))];
  sky.moonOrder.forEach((moonIndex, slot) => {
    const moon = settings.moons[moonIndex];
    if (!moon) return;
    (uniforms.uMoonSizes.value as number[])[slot] = THREE.MathUtils.degToRad(moon.size);
    const elevation = THREE.MathUtils.degToRad(moon.height);
    const azimuth = THREE.MathUtils.degToRad(moon.azimuth);
    (uniforms.uMoonDirections.value as THREE.Vector3[])[slot].set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
    (uniforms.uMoonColors.value as THREE.Color[])[slot].set(moon.color);
    (uniforms.uMoonColors2.value as THREE.Color[])[slot].set(moon.color2);
    (uniforms.uMoonCrescentAngles.value as number[])[slot] = THREE.MathUtils.degToRad(moon.crescentAngle ?? 0);
    (uniforms.uMoonCrescents.value as number[])[slot] = moon.crescent / 100;
    (uniforms.uMoonTextureAmounts.value as number[])[slot] = moon.texture;
    (uniforms.uMoonHalos.value as number[])[slot] = moon.halo;
    (uniforms.uMoonGlows.value as number[])[slot] = moon.glow;
  });
  applyMoonTextures(sky);
  uniforms.uGlow.value = settings.glow;
  uniforms.uCloudCoverage.value = settings.clouds ? settings.cloudCoverage : 0;
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
// Where the chunk's camera last looked, so Randomize can place the moon inside the visible sky (moonTexture.ts).
export interface SkyView {
  azimuth: number; // degrees, the same compass convention as the moon's Direction
  pitch: number; // degrees above the horizon
  halfHeight: number; // half the vertical field of view, degrees
  halfWidth: number; // half the horizontal field of view, degrees
}
const lastView: SkyView = { azimuth: 229, pitch: 0, halfHeight: 30, halfWidth: 45 };
const viewDirection = new THREE.Vector3();
export function getSkyView(): SkyView {
  return lastView;
}

export function updateSkyDomeFrame(sky: SkyDome, camera: THREE.PerspectiveCamera, sunDirection: THREE.Vector3, wind: number, deltaSeconds: number): void {
  const uniforms = sky.mesh.material.uniforms;
  camera.getWorldDirection(viewDirection);
  lastView.azimuth = (THREE.MathUtils.radToDeg(Math.atan2(viewDirection.z, viewDirection.x)) + 360) % 360;
  lastView.pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(viewDirection.y, -1, 1)));
  lastView.halfHeight = camera.fov / 2;
  lastView.halfWidth = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
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

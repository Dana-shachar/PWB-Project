import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/clouds.vert.glsl?raw';
import airGroundGlsl from '../shaders/atmosphere/airGround.glsl?raw';
import cloudsFragment from '../shaders/atmosphere/clouds.frag.glsl?raw';
import noiseGlsl from '../shaders/heightmap/noise.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The planet's clouds: a transparent shell just above the highest ground, shaded by shaders/atmosphere/clouds.frag.glsl.
// How far above the ground, as a share of the radius on top of the terrain's own reach. Inferred, TUNABLE.
const CLOUD_GAP = 0.01;
const CLOUD_SHELLS = 3;
const CLOUD_SHELL_SPACING = 0.004; // share of the radius between stacked shells
// The extra lift on a jagged planet, per unit of its jaggedness (airGround.ts), so peaks stay under the clouds. TUNABLE.
export const GAP_PER_JAGGEDNESS = 2;

export interface CloudLayer {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createCloudLayer(): CloudLayer {
  const geometry = new THREE.SphereGeometry(1, 128, 64);
  const material = new THREE.ShaderMaterial({
    vertexShader: airGroundGlsl + vertexShader,
    fragmentShader: noiseGlsl + cloudsFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCloudLayer: { value: 0 },
      uCloudLayerSpacing: { value: 0 },
      uCloudBase: { value: 1 },
      uShellScale: { value: 1 },
      uCloudCoverage: { value: 0 },
      uCloudColor: { value: new THREE.Color() },
      uCloudColor2: { value: new THREE.Color() },
      uCloudSoftness: { value: 0.5 },
      uCloudTime: { value: 0 },
      uLightDirection: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: 0.2 },
      uCameraPosition: { value: new THREE.Vector3() },
      uCloudScale: { value: 1 },
      uCloudDetail: { value: 4 },
      uCloudFeather: { value: 0.4 },
      uCloudSwirl: { value: 0 },
      uCloudBanding: { value: 0.2 },
      uCloudEquator: { value: 0.8 },
      uCloudMidLatitudes: { value: 1 },
      uCloudPoles: { value: 0.5 },
      uCloudDistributionStrength: { value: 0.6 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  // Stacked shells (stacked-planes clouds): each higher shell shares every uniform but its index, showing only the
  // thicker cores, so the clouds read as rounded volumes. Children, so they share the base shell's scale and visibility.
  const shells = [material];
  for (let layer = 1; layer < CLOUD_SHELLS; layer++) {
    const shellMaterial = material.clone();
    shellMaterial.uniforms = { ...material.uniforms, uCloudLayer: { value: layer } };
    const shell = new THREE.Mesh(geometry, shellMaterial);
    shell.renderOrder = 2 + layer;
    mesh.add(shell);
    shells.push(shellMaterial);
  }
  return {
    mesh,
    dispose() {
      geometry.dispose();
      shells.forEach((shell) => shell.dispose());
    },
  };
}

// terrainReach is the highest the ground can rise above the radius, in scene units.
// `jaggedGap` is the extra lift on a jagged planet, in world units.
export function updateCloudLayer(clouds: CloudLayer, settings: AtmosphereSettings, radius: number, terrainReach: number, jaggedGap: number): void {
  clouds.mesh.visible = settings.enabled && settings.clouds && settings.cloudCoverage > 0;
  // The sphere stays sized past the highest peak (for culling); its vertex shader pulls each point down to the air's ground.
  clouds.mesh.scale.setScalar(radius * (1 + CLOUD_GAP + CLOUD_SHELL_SPACING * CLOUD_SHELLS) + terrainReach + jaggedGap);
  const uniforms = clouds.mesh.material.uniforms;
  uniforms.uCloudBase.value = radius * (1 + CLOUD_GAP) + jaggedGap;
  uniforms.uCloudLayerSpacing.value = radius * CLOUD_SHELL_SPACING;
  uniforms.uShellScale.value = clouds.mesh.scale.x;
  uniforms.uCloudCoverage.value = settings.cloudCoverage;
  (uniforms.uCloudColor.value as THREE.Color).set(settings.cloudColor);
  (uniforms.uCloudColor2.value as THREE.Color).set(settings.cloudColor2);
  uniforms.uCloudSoftness.value = settings.cloudSoftness;
  uniforms.uCloudScale.value = settings.cloudScale;
  uniforms.uCloudDetail.value = settings.cloudDetail;
  uniforms.uCloudFeather.value = settings.cloudFeather;
  uniforms.uCloudSwirl.value = settings.cloudSwirl;
  uniforms.uCloudBanding.value = settings.cloudBanding;
  uniforms.uCloudEquator.value = settings.cloudEquator;
  uniforms.uCloudMidLatitudes.value = settings.cloudMidLatitudes;
  uniforms.uCloudPoles.value = settings.cloudPoles;
  uniforms.uCloudDistributionStrength.value = settings.cloudDistributionStrength;
}

// Cloud clock speed per unit of wind (Dana, 2026-10-27: 3x, was too slow). Inferred, TUNABLE.
const CLOUD_TIME_PER_WIND = 0.75;

// Every frame: the clouds' clock runs with the wind (stronger wind, faster drift), and the light follows the Scene.
export function updateCloudLayerFrame(clouds: CloudLayer, wind: number, deltaSeconds: number, lightDirection: THREE.Vector3, ambient: number, cameraPosition: THREE.Vector3): void {
  const uniforms = clouds.mesh.material.uniforms;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  uniforms.uCloudTime.value += deltaSeconds * wind * CLOUD_TIME_PER_WIND;
  (uniforms.uLightDirection.value as THREE.Vector3).copy(lightDirection);
  uniforms.uAmbient.value = ambient;
}

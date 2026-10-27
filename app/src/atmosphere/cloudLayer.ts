import * as THREE from 'three';
import vertexShader from '../shaders/atmosphere/clouds.vert.glsl?raw';
import cloudsFragment from '../shaders/atmosphere/clouds.frag.glsl?raw';
import noiseGlsl from '../shaders/heightmap/noise.glsl?raw';
import type { AtmosphereSettings } from './atmosphereSettings';

// The planet's clouds: a transparent shell just above the highest ground, shaded by shaders/atmosphere/clouds.frag.glsl.
// How far above the ground, as a share of the radius on top of the terrain's own reach. Inferred, TUNABLE.
const CLOUD_GAP = 0.01;

export interface CloudLayer {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createCloudLayer(): CloudLayer {
  const geometry = new THREE.SphereGeometry(1, 128, 64);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: noiseGlsl + cloudsFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCloudCoverage: { value: 0 },
      uCloudColor: { value: new THREE.Color() },
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
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// terrainReach is the highest the ground can rise above the radius, in scene units.
export function updateCloudLayer(clouds: CloudLayer, settings: AtmosphereSettings, radius: number, terrainReach: number): void {
  clouds.mesh.visible = settings.enabled && settings.cloudCoverage > 0;
  clouds.mesh.scale.setScalar(radius * (1 + CLOUD_GAP) + terrainReach);
  const uniforms = clouds.mesh.material.uniforms;
  uniforms.uCloudCoverage.value = settings.cloudCoverage;
  (uniforms.uCloudColor.value as THREE.Color).set(settings.cloudColor);
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

// Every frame: the clouds' clock runs with the wind (stronger wind, faster drift), and the light follows the Scene.
export function updateCloudLayerFrame(clouds: CloudLayer, wind: number, deltaSeconds: number, lightDirection: THREE.Vector3, ambient: number, cameraPosition: THREE.Vector3): void {
  const uniforms = clouds.mesh.material.uniforms;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  uniforms.uCloudTime.value += deltaSeconds * (wind / 4);
  (uniforms.uLightDirection.value as THREE.Vector3).copy(lightDirection);
  uniforms.uAmbient.value = ambient;
}

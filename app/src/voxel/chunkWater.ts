import * as THREE from 'three';
import waterVertexGlsl from '../shaders/chunkWater.vert.glsl?raw';
import waterFragmentBody from '../shaders/chunkWater.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain.glsl?raw';
import waterGlsl from '../shaders/water.glsl?raw';
import oceanWavesGlsl from '../shaders/oceanWaves.glsl?raw';
import { buildRampUniformArrays, MAX_COLOR_STOPS } from '../planet/colorRamp';
import { WATER_SKY_COLOR, type WaterSettings } from '../planet/planetControls';

// The chunk's water: TDM's Seascape waves and sea color (shaders/oceanWaves.glsl, CC BY-NC-SA 3.0) on a flat sheet,
// recolored by the water ramp, see-through in the shallows, with shore and crest foam (shaders/chunkWater.frag.glsl).
export interface ChunkWater {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  dispose: () => void;
}

export function createChunkWater(): ChunkWater {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const ramp = buildRampUniformArrays([{ position: 0, color: '#ffffff' }]);
  const material = new THREE.ShaderMaterial({
    vertexShader: waterVertexGlsl,
    fragmentShader: terrainGlsl + waterGlsl + oceanWavesGlsl + waterFragmentBody,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uChunkHeightMap: { value: null },
      uHeightMapGreenChannel: { value: 1 },
      uChunkSize: { value: 1 },
      uSeaLevel: { value: 0 },
      uWaterDeepest: { value: -0.5 },
      uWaterRampColors: { value: ramp.colors },
      uWaterRampPositions: { value: ramp.positions },
      uWaterRampCount: { value: ramp.count },
      uWaterClarity: { value: 0.4 },
      uFoamWidth: { value: 0 },
      uSkyColor: { value: new THREE.Color(WATER_SKY_COLOR) },
      uLightDirection: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: 0.15 },
      uLightIntensity: { value: 1 },
      uCameraPosition: { value: new THREE.Vector3() },
      uSeaTime: { value: 0 },
      uSeaIterations: { value: 5 },
      uWaveScale: { value: 4 },
      uResolution: { value: 1000 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1; // after the ground, so the shallows show it through
  mesh.visible = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// Every frame: the eye, the waves' clock, and the view's width in pixels (Seascape's distance smoothing).
export function updateChunkWaterFrame(water: ChunkWater, cameraPosition: THREE.Vector3, deltaSeconds: number, viewWidthPixels: number): void {
  const uniforms = water.mesh.material.uniforms;
  uniforms.uResolution.value = viewWidthPixels;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  uniforms.uSeaTime.value += deltaSeconds;
}

// The sun and light follow the Scene lighting, as the land's do.
export function setChunkWaterLight(water: ChunkWater, lightDirection: THREE.Vector3, ambient: number, intensity: number): void {
  const uniforms = water.mesh.material.uniforms;
  (uniforms.uLightDirection.value as THREE.Vector3).copy(lightDirection);
  uniforms.uAmbient.value = ambient;
  uniforms.uLightIntensity.value = intensity;
}

// Sizes the sheet to the chunk, lifts it to sea level with the chunk's own height rule (chunk.vert.glsl), and loads the
// look: the ground's height texture, the water ramp, clarity, foam and wave detail.
export function updateChunkWater(
  water: ChunkWater,
  settings: WaterSettings,
  chunkSize: number,
  maxHeight: number,
  waterDeepest: number,
  heightMap: THREE.Texture | null,
  heightMapGreenChannel: boolean,
): void {
  water.mesh.scale.set(chunkSize, 1, chunkSize);
  water.mesh.position.y = Math.max(0, settings.seaLevel + 0.5) * maxHeight;
  const uniforms = water.mesh.material.uniforms;
  uniforms.uChunkHeightMap.value = heightMap;
  uniforms.uHeightMapGreenChannel.value = heightMapGreenChannel ? 1 : 0;
  uniforms.uChunkSize.value = chunkSize;
  uniforms.uSeaLevel.value = settings.seaLevel;
  uniforms.uWaterDeepest.value = waterDeepest;
  uniforms.uWaterClarity.value = settings.clarity;
  uniforms.uFoamWidth.value = settings.foamWidth;
  uniforms.uSeaIterations.value = settings.waveDetail;
  uniforms.uWaveScale.value = settings.waveScale;
  const ramp = buildRampUniformArrays(settings.colorStops);
  const rampColors = uniforms.uWaterRampColors.value as THREE.Color[];
  for (let i = 0; i < MAX_COLOR_STOPS; i++) rampColors[i].copy(ramp.colors[i]);
  (uniforms.uWaterRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
  uniforms.uWaterRampCount.value = ramp.count;
}

import * as THREE from 'three';
import waterVertexGlsl from '../shaders/water/chunkWater.vert.glsl?raw';
import waterFragmentBody from '../shaders/water/chunkWater.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import waterGlsl from '../shaders/water/water.glsl?raw';
import hazeGlsl from '../shaders/atmosphere/haze.glsl?raw';
import oceanWavesGlsl from '../shaders/water/oceanWaves.glsl?raw';
import { buildRampUniformArrays, MAX_COLOR_STOPS } from '../planet/colorRamp';
import { WATER_SKY_COLOR, type WaterSettings } from '../planet/planetControls';
import { TIDE_PERIOD_SECONDS } from '../atmosphere/tides';
import { applyWaveSet, buildWaveSet, createWaveUniforms, surfZoneShare, windLengthScale, windTimeScale } from '../planet/oceanSpectrum';

// The chunk's water: TDM's Seascape waves and sea color (shaders/water/oceanWaves.glsl, CC BY-NC-SA 3.0), with large Gerstner
// waves for variance (planet/oceanSpectrum.ts), on a flat sheet,
// recolored by the water ramp, see-through in the shallows, with shore and crest foam (shaders/water/chunkWater.frag.glsl).
export interface ChunkWater {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  // The tide (atmosphere/tides.ts) moves the water around its base level each frame; heights in raw units.
  tide: { baseSeaLevel: number; maxHeight: number; height: number; phase: number };
  dispose: () => void;
}

export function createChunkWater(): ChunkWater {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const ramp = buildRampUniformArrays([{ position: 0, color: '#ffffff' }]);
  const material = new THREE.ShaderMaterial({
    vertexShader: waterVertexGlsl,
    fragmentShader: terrainGlsl + waterGlsl + oceanWavesGlsl + hazeGlsl + waterFragmentBody,
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
      ...createWaveUniforms(), // the variance waves, plus Shine, Reflection and Wind
      uSeaIterations: { value: 3 },
      uWaveScale: { value: 4 },
      uHazeColor: { value: new THREE.Color(WATER_SKY_COLOR) },
      uHazeSkyColor: { value: new THREE.Color(WATER_SKY_COLOR) },
      uHazeDensity: { value: 0 },
      uHazeStart: { value: 0 },
      uResolution: { value: 1000 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1; // after the ground, so the shallows show it through
  mesh.visible = false;
  return {
    mesh,
    tide: { baseSeaLevel: 0, maxHeight: 0, height: 0, phase: 0 },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// The tide's height from the moon (tideHeight in atmosphere/tides.ts), 0 for none.
export function setChunkWaterTide(water: ChunkWater, height: number): void {
  water.tide.height = height;
  applyTide(water);
}

// The water's level right now, base plus tide, in raw height units.
export function chunkWaterLevel(water: ChunkWater): number {
  return water.tide.baseSeaLevel + water.tide.height * Math.sin(water.tide.phase * 2 * Math.PI);
}

// Moves the water sheet and its shoreline cutoff to the current level; the ground isn't re-baked.
function applyTide(water: ChunkWater): void {
  const level = chunkWaterLevel(water);
  water.mesh.position.y = Math.max(0, level + 0.5) * water.tide.maxHeight;
  water.mesh.material.uniforms.uSeaLevel.value = level;
}

// Every frame: the eye, the waves' clocks (Seascape's runs faster in wind, the variance waves keep real seconds since
// their speeds already follow the wind), and the view's width in pixels (Seascape's distance smoothing).
export function updateChunkWaterFrame(water: ChunkWater, cameraPosition: THREE.Vector3, deltaSeconds: number, viewWidthPixels: number): void {
  const uniforms = water.mesh.material.uniforms;
  uniforms.uResolution.value = viewWidthPixels;
  (uniforms.uCameraPosition.value as THREE.Vector3).copy(cameraPosition);
  uniforms.uSeaTime.value += deltaSeconds * windTimeScale(uniforms.uSeaWind.value as number);
  uniforms.uSeaClock.value += deltaSeconds;
  if (water.tide.height > 0) {
    water.tide.phase = (water.tide.phase + deltaSeconds / TIDE_PERIOD_SECONDS) % 1;
    applyTide(water);
  }
}

// The atmosphere: the sky the water reflects, and the haze it fades into with distance (as the land does).
export function setChunkWaterSky(water: ChunkWater, skyColor: string, hazeColor: string, hazeSkyColor: string, hazeDensity: number): void {
  const uniforms = water.mesh.material.uniforms;
  (uniforms.uSkyColor.value as THREE.Color).set(skyColor);
  (uniforms.uHazeColor.value as THREE.Color).set(hazeColor);
  (uniforms.uHazeSkyColor.value as THREE.Color).set(hazeSkyColor);
  uniforms.uHazeDensity.value = hazeDensity;
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
// How many variance waves (4 per step, planet/oceanSpectrum.ts). Inferred, TUNABLE.
const VARIANCE_WAVE_DETAIL = 3;

export function updateChunkWater(
  water: ChunkWater,
  settings: WaterSettings,
  chunkSize: number,
  maxHeight: number,
  waterDeepest: number,
  heightMap: THREE.Texture | null,
  heightMapGreenChannel: boolean,
  wind: number,
): void {
  water.mesh.scale.set(chunkSize, 1, chunkSize);
  water.tide.baseSeaLevel = settings.seaLevel;
  water.tide.maxHeight = maxHeight;
  const uniforms = water.mesh.material.uniforms;
  uniforms.uChunkHeightMap.value = heightMap;
  uniforms.uHeightMapGreenChannel.value = heightMapGreenChannel ? 1 : 0;
  uniforms.uChunkSize.value = chunkSize;
  applyTide(water);
  uniforms.uWaterDeepest.value = waterDeepest;
  uniforms.uWaterClarity.value = settings.clarity;
  uniforms.uFoamWidth.value = settings.foamWidth;
  uniforms.uSeaIterations.value = settings.waveDetail;
  // Wind lengthens Seascape's waves (windLengthScale); the variance waves already have the wind's lengths, so their
  // lengths and heights are divided back by it to stay true in meters.
  const lengthScale = windLengthScale(wind);
  uniforms.uWaveScale.value = settings.waveScale * lengthScale;
  uniforms.uSeaWaveScale.value = settings.waveScale * lengthScale;
  const depthRangeMeters = Math.max(0, settings.seaLevel - waterDeepest) * maxHeight * 1000;
  uniforms.uSurfZone.value = surfZoneShare(wind, depthRangeMeters);
  uniforms.uSeaShine.value = settings.shine;
  uniforms.uSeaReflection.value = settings.reflection;
  uniforms.uSeaWind.value = wind;
  const waveSet = buildWaveSet(wind, VARIANCE_WAVE_DETAIL);
  waveSet.wavelengths = waveSet.wavelengths.map((length) => length / lengthScale);
  waveSet.amplitudes = waveSet.amplitudes.map((amplitude) => amplitude / lengthScale);
  applyWaveSet(uniforms, waveSet, wind);
  const ramp = buildRampUniformArrays(settings.colorStops);
  const rampColors = uniforms.uWaterRampColors.value as THREE.Color[];
  for (let i = 0; i < MAX_COLOR_STOPS; i++) rampColors[i].copy(ramp.colors[i]);
  (uniforms.uWaterRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
  uniforms.uWaterRampCount.value = ramp.count;
}

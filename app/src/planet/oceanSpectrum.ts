import * as THREE from 'three';

// The sea's waves from the wind: Beaufort force to wind speed (NWS table), Pierson-Moskowitz for the dominant
// wavelength and height (Stewart, Introduction to Physical Oceanography 16.4), and a set of Gerstner waves picked the
// GPU Gems way (wavelengths between half and double the median, directions within an angle of the wind).

export const MAX_WAVES = 20;
const GRAVITY = 9.8;

// Midpoints of each Beaufort force's speed range in mph (NWS Miami table), force 0 to 12.
const BEAUFORT_MPH = [0.5, 2, 5.5, 10, 15.5, 21.5, 28, 35, 42.5, 50.5, 59, 68, 77.5];
const METERS_PER_SECOND_PER_MPH = 0.44704;

export function beaufortWindSpeed(force: number): number {
  const clamped = Math.min(12, Math.max(0, force));
  const low = Math.floor(clamped);
  const high = Math.min(12, low + 1);
  const mph = BEAUFORT_MPH[low] + (BEAUFORT_MPH[high] - BEAUFORT_MPH[low]) * (clamped - low);
  return mph * METERS_PER_SECOND_PER_MPH;
}

// Pierson-Moskowitz, with U19.5 ≈ 1.026 U10: peak frequency 0.877 g / U19.5, so the peak wavelength is
// 2 pi g / omega^2; significant wave height 0.21 U19.5^2 / g.
export function peakWavelength(windSpeed: number): number {
  const wind = 1.026 * windSpeed;
  const peakFrequency = (0.877 * GRAVITY) / Math.max(wind, 0.01);
  return (2 * Math.PI * GRAVITY) / (peakFrequency * peakFrequency);
}

export function significantWaveHeight(windSpeed: number): number {
  const wind = 1.026 * windSpeed;
  return (0.21 * wind * wind) / GRAVITY;
}

// How much longer Seascape's waves are in this wind than at force 4 (the look before Wind existed): Pierson-Moskowitz's
// peak wavelength grows with U^2. The clamp is inferred, TUNABLE.
export function windLengthScale(force: number): number {
  return Math.min(4, Math.max(0.3, peakWavelength(beaufortWindSpeed(force)) / peakWavelength(beaufortWindSpeed(4))));
}

// How fast Seascape's clock runs: stretching the waves by windLengthScale already speeds them across the water in
// proportion, but deep-water waves travel at the square root of their length (dispersion), so the clock slows by
// the square root: long waves move faster yet rise and fall more slowly, as real swells do.
export function windTimeScale(force: number): number {
  return 1 / Math.sqrt(windLengthScale(force));
}

// The surf zone as a share of the deepest water: waves break where the depth is under their height / 0.78
// (McCowan's criterion). Height is Pierson-Moskowitz's significant height for the wind, in real meters.
export function surfZoneShare(force: number, depthRangeMeters: number): number {
  const breakingDepth = significantWaveHeight(beaufortWindSpeed(force)) / 0.78;
  return Math.min(1, breakingDepth / Math.max(depthRangeMeters, 0.001));
}

export interface WaveSet {
  count: number;
  directions: number[]; // x, z pairs
  wavelengths: number[];
  amplitudes: number[];
  steepness: number[]; // Q_i, GPU Gems' per-wave steepness
}

// A fixed seed so the sea keeps its shape while sliders move. Mulberry32, a common small seeded generator.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// How far from the wind direction a wave may point. Inferred, TUNABLE (GPU Gems says "a constant angle").
const DIRECTION_SPREAD = Math.PI / 3;

// Wave detail (1 to 5) sets how many waves are summed, 4 per step. Steepness Q (0 to 1) grows with the wind, so calm
// water is rounded and stormy water sharp-crested (inferred, TUNABLE); GPU Gems' Q_i = Q / (w_i A_i N) keeps the
// crests from looping.
// Lengths are in the shader's units (meters divided by Wave size), so Wave size stretches them without a change here.
export function buildWaveSet(windForce: number, waveDetail: number): WaveSet {
  const random = seededRandom(1234);
  const count = Math.min(MAX_WAVES, Math.max(1, Math.round(waveDetail) * 4));
  const windSpeed = beaufortWindSpeed(windForce);
  const median = peakWavelength(windSpeed);
  const height = significantWaveHeight(windSpeed);
  const crestSharpness = 0.3 + 0.6 * Math.min(1, windForce / 12);
  const wavelengths: number[] = [];
  const directions: number[] = [];
  for (let i = 0; i < count; i++) {
    wavelengths.push(median * Math.pow(2, random() * 2 - 1)); // half to double the median
    const angle = (random() * 2 - 1) * DIRECTION_SPREAD;
    directions.push(Math.cos(angle), Math.sin(angle));
  }
  // Every wave keeps the median's height-to-length ratio; the ratio is set so the sum's significant height,
  // 4 times its standard deviation (sqrt of the sum of A^2 / 2), matches Pierson-Moskowitz.
  const lengthSquares = wavelengths.reduce((sum, length) => sum + (length * length) / 2, 0);
  const ratio = height / (4 * Math.sqrt(Math.max(lengthSquares, 1e-12)));
  const amplitudes = wavelengths.map((length) => length * ratio);
  const steepness = wavelengths.map((length, i) => {
    const frequency = (2 * Math.PI) / length;
    return crestSharpness / Math.max(frequency * amplitudes[i] * count, 1e-6);
  });
  return { count, directions, wavelengths, amplitudes, steepness };
}

// Loads a wave set into a material's uniforms, padded to MAX_WAVES, plus the wind speed.
export function applyWaveSet(uniforms: Record<string, { value: unknown }>, set: WaveSet, windForce: number): void {
  uniforms.uWaveCount.value = set.count;
  uniforms.uSeaWindSpeed.value = beaufortWindSpeed(windForce);
  const directions = uniforms.uWaveDirections.value as { set: (x: number, y: number) => void }[];
  const lengths = uniforms.uWaveLengths.value as number[];
  const amplitudes = uniforms.uWaveAmplitudes.value as number[];
  const steepness = uniforms.uWaveSteepness.value as number[];
  for (let i = 0; i < MAX_WAVES; i++) {
    const inSet = i < set.count;
    directions[i].set(inSet ? set.directions[i * 2] : 1, inSet ? set.directions[i * 2 + 1] : 0);
    lengths[i] = inSet ? set.wavelengths[i] : 1;
    amplitudes[i] = inSet ? set.amplitudes[i] : 0;
    steepness[i] = inSet ? set.steepness[i] : 0;
  }
}

// The wave uniforms every sea material starts with (shaders/gerstnerWaves.glsl), filled by applyWaveSet.
export function createWaveUniforms(): Record<string, { value: unknown }> {
  return {
    uSeaTime: { value: 0 },
    uSeaClock: { value: 0 },
    uSurfZone: { value: 0.12 },
    uSeaWind: { value: 4 },
    uSeaWindSpeed: { value: beaufortWindSpeed(4) },
    uSeaWaveScale: { value: 4 },
    uSeaShine: { value: 0.3 },
    uSeaReflection: { value: 1 },
    uWaveCount: { value: 0 },
    uWaveDirections: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector2(1, 0)) },
    uWaveLengths: { value: new Array(MAX_WAVES).fill(1) },
    uWaveAmplitudes: { value: new Array(MAX_WAVES).fill(0) },
    uWaveSteepness: { value: new Array(MAX_WAVES).fill(0) },
  };
}

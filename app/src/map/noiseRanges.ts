// The one table of every noise control's range. The sliders in
// ui/NoisePanel.tsx and Randomize in map/noiseLayers.ts both read it, so a
// randomized value is always one the slider could have been dragged to.
export type NoiseRangeKey =
  | 'seed'
  | 'frequency'
  | 'opacity'
  | 'layerHeight'
  | 'warpStrength'
  | 'octaves'
  | 'persistence'
  | 'lacunarity'
  | 'ridgeAmount'
  | 'terraceSteps'
  | 'offset'
  | 'stretch'
  | 'warpScale'
  | 'warpOctaves'
  | 'voronoiJitter'
  | 'ridgeOffset'
  | 'ridgeGain'
  | 'fractalOffset'
  | 'fractalGain';

export interface NoiseRange {
  min: number;
  max: number;
  step: number;
  default: number;
  scale: 'linear' | 'log'; // log needs min > 0
  // Left out of Randomize when false (default true). Stretch is the one
  // that is: random per-axis stretches over 0.1 to 10 mostly give smeared,
  // streaky noise rather than a different world.
  randomize?: boolean;
  // Randomize's own, narrower range: the slider's full range is for exploring by hand, and rolled at random it made
  // nearly every planet spiky (Dana, 2026-10-30). Inferred, TUNABLE.
  random?: [number, number];
}

export const NOISE_RANGES: Record<NoiseRangeKey, NoiseRange> = {
  seed: { min: 0, max: 1000, step: 1, default: 0, scale: 'linear' },
  frequency: { min: 0.1, max: 500, step: 0.1, default: 4, scale: 'log', random: [1, 12] },
  opacity: { min: 0, max: 1, step: 0.01, default: 1, scale: 'linear', random: [0.6, 1] },
  layerHeight: { min: -10, max: 10, step: 0.1, default: 1, scale: 'linear', random: [0.3, 2] },
  warpStrength: { min: 0, max: 10, step: 0.1, default: 1, scale: 'linear', random: [0, 2] },
  octaves: { min: 1, max: 12, step: 1, default: 4, scale: 'linear', random: [3, 8] },
  persistence: { min: 0, max: 1.5, step: 0.01, default: 0.5, scale: 'linear', random: [0.3, 0.65] },
  lacunarity: { min: 1, max: 6, step: 0.1, default: 2, scale: 'linear', random: [1.8, 2.6] },
  ridgeAmount: { min: 0, max: 1, step: 0.01, default: 1, scale: 'linear', random: [0.3, 1] },
  terraceSteps: { min: 2, max: 64, step: 1, default: 8, scale: 'linear', random: [4, 16] },
  // Judgment calls, no tool documents these ranges: offset is in lattice
  // cells, warp octaves tops out at Unity's documented warp Iterations of 8,
  // jitter follows Blender's 0 to 1 Randomness, and ridge offset/gain bracket
  // Blender's default of 1.
  offset: { min: -100, max: 100, step: 0.1, default: 0, scale: 'linear' },
  stretch: { min: 0.1, max: 10, step: 0.01, default: 1, scale: 'log', randomize: false },
  warpScale: { min: 0.1, max: 10, step: 0.01, default: 1, scale: 'log', random: [0.5, 2] },
  warpOctaves: { min: 1, max: 8, step: 1, default: 1, scale: 'linear', random: [1, 3] },
  voronoiJitter: { min: 0, max: 1, step: 0.01, default: 0.7, scale: 'linear', random: [0.5, 1] },
  ridgeOffset: { min: 0, max: 2, step: 0.01, default: 1, scale: 'linear', random: [0.8, 1.2] },
  ridgeGain: { min: 0, max: 5, step: 0.1, default: 1, scale: 'linear', random: [0.5, 1.5] },
  // Fractal type's Offset and Gain: no tool documents these ranges either; the
  // defaults (0 and 1) are the ones recalled for Blender's Musgrave node and
  // not verified here, so treat them as tunable.
  fractalOffset: { min: -2, max: 2, step: 0.01, default: 0, scale: 'linear', random: [-0.5, 0.5] },
  fractalGain: { min: 0, max: 5, step: 0.1, default: 1, scale: 'linear', random: [0.5, 1.5] },
};

// Uniform in Randomize's range (the slider's when it has none), or log-uniform for 'log' controls so every
// order of magnitude is equally likely. Snapped to the control's step.
// `position` (0 to 1) picks a point along the range instead of a random one, for Randomize's drivers.
export function randomForRange(key: NoiseRangeKey, position: number = Math.random()): number {
  const { step, scale, random } = NOISE_RANGES[key];
  const [min, max] = random ?? [NOISE_RANGES[key].min, NOISE_RANGES[key].max];
  const raw = scale === 'log' ? min * Math.pow(max / min, position) : min + position * (max - min);
  const snapped = Math.round(raw / step) * step;
  return Math.min(NOISE_RANGES[key].max, Math.max(NOISE_RANGES[key].min, Number(snapped.toFixed(6))));
}

// The min/max/step/scale props a Slider takes for a control.
export function sliderRange(key: NoiseRangeKey): Pick<NoiseRange, 'min' | 'max' | 'step' | 'scale'> {
  const { min, max, step, scale } = NOISE_RANGES[key];
  return { min, max, step, scale };
}

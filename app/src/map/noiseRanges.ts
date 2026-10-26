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
}

export const NOISE_RANGES: Record<NoiseRangeKey, NoiseRange> = {
  seed: { min: 0, max: 1000, step: 1, default: 0, scale: 'linear' },
  frequency: { min: 0.1, max: 500, step: 0.1, default: 4, scale: 'log' },
  opacity: { min: 0, max: 1, step: 0.01, default: 1, scale: 'linear' },
  layerHeight: { min: -10, max: 10, step: 0.1, default: 1, scale: 'linear' },
  warpStrength: { min: 0, max: 10, step: 0.1, default: 1, scale: 'linear' },
  octaves: { min: 1, max: 12, step: 1, default: 4, scale: 'linear' },
  persistence: { min: 0, max: 1.5, step: 0.01, default: 0.5, scale: 'linear' },
  lacunarity: { min: 1, max: 6, step: 0.1, default: 2, scale: 'linear' },
  ridgeAmount: { min: 0, max: 1, step: 0.01, default: 1, scale: 'linear' },
  terraceSteps: { min: 2, max: 64, step: 1, default: 8, scale: 'linear' },
  // Judgment calls, no tool documents these ranges: offset is in lattice
  // cells, warp octaves tops out at Unity's documented warp Iterations of 8,
  // jitter follows Blender's 0 to 1 Randomness, and ridge offset/gain bracket
  // Blender's default of 1.
  offset: { min: -100, max: 100, step: 0.1, default: 0, scale: 'linear' },
  stretch: { min: 0.1, max: 10, step: 0.01, default: 1, scale: 'log', randomize: false },
  warpScale: { min: 0.1, max: 10, step: 0.01, default: 1, scale: 'log' },
  warpOctaves: { min: 1, max: 8, step: 1, default: 1, scale: 'linear' },
  voronoiJitter: { min: 0, max: 1, step: 0.01, default: 0.7, scale: 'linear' },
  ridgeOffset: { min: 0, max: 2, step: 0.01, default: 1, scale: 'linear' },
  ridgeGain: { min: 0, max: 5, step: 0.1, default: 1, scale: 'linear' },
  // Fractal type's Offset and Gain: no tool documents these ranges either; the
  // defaults (0 and 1) are the ones recalled for Blender's Musgrave node and
  // not verified here, so treat them as tunable.
  fractalOffset: { min: -2, max: 2, step: 0.01, default: 0, scale: 'linear' },
  fractalGain: { min: 0, max: 5, step: 0.1, default: 1, scale: 'linear' },
};

// Uniform in the range, or log-uniform for 'log' controls so every
// order of magnitude is equally likely. Snapped to the control's step.
export function randomForRange(key: NoiseRangeKey): number {
  const { min, max, step, scale } = NOISE_RANGES[key];
  const raw = scale === 'log' ? min * Math.pow(max / min, Math.random()) : min + Math.random() * (max - min);
  const snapped = Math.round(raw / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
}

// The min/max/step/scale props a Slider takes for a control.
export function sliderRange(key: NoiseRangeKey): Pick<NoiseRange, 'min' | 'max' | 'step' | 'scale'> {
  const { min, max, step, scale } = NOISE_RANGES[key];
  return { min, max, step, scale };
}

import { HISTOGRAM_BINS } from '../map/elevationRange';

// The planet's heights as a cumulative, area-weighted histogram: the share of the surface below each bin.
export interface HeightDistribution {
  min: number;
  max: number; // the true highest point, not the ramp's clipped one
  binWidth: number;
  cumulative: Float32Array; // cumulative[i] = area share below the top of bin i
}

// From the GPU histogram of the whole-globe bake (map/heightmap.ts, getRegionHistogramAsync), whose samples are
// already weighted by cos(latitude), their real share of the sphere's area.
export function buildHeightDistribution(histogram: { min: number; max: number; bins: Float32Array }): HeightDistribution | null {
  const { min, max, bins } = histogram;
  if (!(max > min)) return null;
  let total = 0;
  for (let i = 0; i < bins.length; i++) total += bins[i];
  if (total <= 0) return null;
  const cumulative = new Float32Array(HISTOGRAM_BINS);
  let running = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    running += bins[i] ?? 0;
    cumulative[i] = running / total;
  }
  return { min, max, binWidth: (max - min) / HISTOGRAM_BINS, cumulative };
}

// The water ramp is spaced by light remaining, not meters: Beer-Lambert's exp(-depth / clarity), normalized so the
// deepest water is 1. Colors change fastest near the surface, as light does (NOAA's ocean light zones).
// Mirrors waterRampPosition in shaders/water.glsl.
export function depthToRampPosition(depthShare: number, clarity: number): number {
  const scale = Math.max(clarity, 0.001);
  return (1 - Math.exp(-Math.min(1, Math.max(0, depthShare)) / scale)) / (1 - Math.exp(-1 / scale));
}

export function rampPositionToDepth(position: number, clarity: number): number {
  const scale = Math.max(clarity, 0.001);
  return -scale * Math.log(1 - Math.min(1, Math.max(0, position)) * (1 - Math.exp(-1 / scale)));
}

// With water on, the land ramp starts at the depth light reaches (Clarity, as a share of the deepest water), not at sea
// level, so the seabed seen through the shallows keeps the land's colors (Dana, 2026-10-27). Never below the deepest point.
export function landRampFloor(seaLevel: number, deepest: number, clarity: number): number {
  return seaLevel - Math.min(1, Math.max(0, clarity)) * Math.max(0, seaLevel - deepest);
}

// Share of the surface above sea level, 0..1, interpolated within the bin the sea level falls in.
export function landShareAt(distribution: HeightDistribution, seaLevel: number): number {
  const position = (seaLevel - distribution.min) / distribution.binWidth;
  if (position <= 0) return 1;
  if (position >= HISTOGRAM_BINS) return 0;
  const bin = Math.floor(position);
  const below = bin > 0 ? distribution.cumulative[bin - 1] : 0;
  const waterShare = below + (distribution.cumulative[bin] - below) * (position - bin);
  return 1 - waterShare;
}

// The sea level that leaves the given share of the surface as land, for planet types.
export function seaLevelForLandShare(distribution: HeightDistribution, landShare: number): number {
  const waterShare = Math.min(1, Math.max(0, 1 - landShare));
  for (let bin = 0; bin < HISTOGRAM_BINS; bin++) {
    if (distribution.cumulative[bin] < waterShare) continue;
    const below = bin > 0 ? distribution.cumulative[bin - 1] : 0;
    const within = distribution.cumulative[bin] > below ? (waterShare - below) / (distribution.cumulative[bin] - below) : 0;
    return distribution.min + (bin + within) * distribution.binWidth;
  }
  return distribution.min + HISTOGRAM_BINS * distribution.binWidth;
}

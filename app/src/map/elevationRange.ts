// Where the elevation color ramp's low and high stops should land —
// Percent Clip, not the literal minimum and maximum. A straight min/max
// stretch is the default in raster tools but is documented as sensitive to
// outliers: Voronoi (and noise generally) has a skewed distribution, almost
// the whole surface sits in a narrow middle band while the true extremes
// are reached at only a handful of isolated pixels. Stretching the ramp to
// those literal extremes crushed everything else into one end of it
// (Dana, 2026-10-13: "i added the tiniest elevation and the base color
// disappears"). See REFERENCES.md.
//
// Histogram-based, not a full sort — exact percentiles need sorting the
// whole array (O(n log n)), which for the planet's 1024x512 map is 500k+
// elements read back and sorted on every layer edit. A fixed-bin histogram
// is one pass to find the real min/max, one pass to bin, then a cheap walk
// to find where the cumulative count crosses the percentile — approximate,
// but exact precision doesn't matter for where a color ramp starts.
// Exported so a GPU equivalent (map/heightmap.ts's getRegionPercentileRangeAsync)
// can walk the same bin count/clip percent, one definition instead of two
// that could drift apart.
export const HISTOGRAM_BINS = 256;
export const CLIP_PERCENT = 0.01; // 1% at each end, Esri's own Percent Clip default

export interface ElevationRange {
  min: number;
  max: number;
}

export function computeElevationRange(data: Float32Array): ElevationRange {
  let trueMin = Infinity;
  let trueMax = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < trueMin) trueMin = value;
    if (value > trueMax) trueMax = value;
  }
  if (!Number.isFinite(trueMin) || !Number.isFinite(trueMax) || trueMax <= trueMin) {
    // Flat or empty data — nothing to stretch, fall back to the literal bounds.
    return { min: trueMin, max: trueMax };
  }

  const histogram = new Uint32Array(HISTOGRAM_BINS);
  const binWidth = (trueMax - trueMin) / HISTOGRAM_BINS;
  for (let i = 0; i < data.length; i++) {
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((data[i] - trueMin) / binWidth));
    histogram[bin]++;
  }

  const clipCount = data.length * CLIP_PERCENT;
  let cumulative = 0;
  let lowBin = 0;
  for (; lowBin < HISTOGRAM_BINS; lowBin++) {
    cumulative += histogram[lowBin];
    if (cumulative >= clipCount) break;
  }
  cumulative = 0;
  let highBin = HISTOGRAM_BINS - 1;
  for (; highBin >= 0; highBin--) {
    cumulative += histogram[highBin];
    if (cumulative >= clipCount) break;
  }

  const clippedMin = trueMin + lowBin * binWidth;
  const clippedMax = trueMin + (highBin + 1) * binWidth;
  // Guards a pathological case (a tiny array, or almost everything in one
  // bin) where clipping from both ends could cross over — the true bounds
  // are always a safe fallback.
  if (clippedMin >= clippedMax) return { min: trueMin, max: trueMax };
  return { min: clippedMin, max: clippedMax };
}

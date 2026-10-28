// Tides on the land chunk (Dana, 2026-10-28): the water rises and falls with the moon. A body's tidal pull scales with
// its density times its apparent size cubed (arXiv 1406.0323; Stony Brook's sun and moon tide notes), so a moon twice
// as big raises tides eight times higher. Exaggerated on purpose, then capped. Inferred, TUNABLE.
const TIDE_REFERENCE_SIZE = 8; // degrees across: the default moon
const TIDE_REFERENCE_SHARE = 0.01; // that moon's tide, as a share of the terrain's height
const TIDE_MAX_SHARE = 0.08; // the cap, so a huge moon floods the shallows but not the land
export const TIDE_PERIOD_SECONDS = 120; // one rise and fall, compressed from Earth's 12 hours so it can be watched

// The tide's height above and below the base sea level, in the same raw height units as the sea level. Each moon's
// pull adds to the others' (their phases aren't modeled: one shared rise and fall).
export function tideHeight(moonOn: boolean, moonSizes: number[]): number {
  if (!moonOn) return 0;
  const pull = moonSizes.reduce((sum, size) => sum + TIDE_REFERENCE_SHARE * (size / TIDE_REFERENCE_SIZE) ** 3, 0);
  return Math.min(TIDE_MAX_SHARE, pull);
}

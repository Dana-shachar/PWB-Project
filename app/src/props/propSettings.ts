// Props on the land chunk (props/rockScatter.ts): rocks for now. Chunk only, never the planet.
export interface PropSettings {
  enabled: boolean;
  seed: number; // the rock shapes and where each rock falls; Reroll picks a new one
  boulders: number; // amount, 0 none to 2 double
  smallRocks: number;
  shoreRocks: number; // small rocks along the waterline
  size: number; // multiplies every rock's size
  largestBoulder: number; // meters, the biggest a boulder gets (before Size)
  drawDistance: number; // km from the camera rocks are drawn to, fading over the last fifth
  patchiness: number; // 0 even, 1 rock fields and clear stretches
  reach: number; // the shadow angle in degrees: fallen rocks lie below a line this steep from the cliff above
  hueTurn: number; // degrees from the ground's hue where the rocks' hue range starts, -180 to 180
  hueRange: number; // degrees the range reaches from there; each rock takes a hue within it
  saturation: number; // the rocks' saturation as a share of the ground's: 0 gray, 1 the ground's
}

export const DEFAULT_PROP_SETTINGS: PropSettings = {
  enabled: true,
  seed: 1,
  boulders: 1,
  smallRocks: 1,
  shoreRocks: 1,
  size: 1,
  largestBoulder: 100, // a control, not a real-world cap
  drawDistance: 20, // TUNABLE
  patchiness: 0.7,
  reach: 30, // within the published 27° to 37° (NHESS 2011); TUNABLE
  hueTurn: -40,
  hueRange: 80,
  saturation: 0.5,
};

// Older saves have no props and load the defaults.
export function migrateProps(saved: (Partial<PropSettings> & { hueSpread?: number }) | undefined): PropSettings {
  const { hueSpread, ...rest } = saved ?? {};
  // The old Hue spread (degrees each way) becomes the same range.
  const fromSpread = hueSpread !== undefined && rest.hueTurn === undefined ? { hueTurn: -hueSpread, hueRange: 2 * hueSpread } : {};
  return { ...DEFAULT_PROP_SETTINGS, ...rest, ...fromSpread };
}

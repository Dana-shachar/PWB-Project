import * as THREE from 'three';
import { createDefaultLayer, type NoiseLayer, type NoiseType } from '../map/heightmap';
import { getSkyView } from './skyDome';

// The chunk's moons (Dana, 2026-10-28): up to five, each with its own size, place in the sky, colors and surface. Meant to
// be randomized, not edited one by one; the per-moon controls are there only for adjusting.
export const MAX_MOONS = 5;
export interface MoonSettings {
  size: number; // degrees across
  height: number; // degrees above the horizon
  azimuth: number; // compass direction, degrees
  hueTurn: number; // degrees round the color wheel from the sky's hue; the sky sets the rest (moonColorsForSky)
  secondOffset: number; // the darks' hue, degrees from hueTurn (a harmony rule, or dragged freely)
  saturation: number; // both tones, 0 to 1; Randomize takes it from the sky (skySaturation)
  crescentAngle: number; // degrees the crescent turns from the sun's side
  crescent: number; // how much is in shadow: 0 full, 100 the thinnest crescent
  texture: number; // how clearly the surface shows: 0 pure glow, 1 a solid moon, 2 the strongest pattern
  halo: number; // a soft light around the moon; meant to stay subtle, under the sky's haze
  glow: number; // a soft brightening just inside its lit edge
  blend: number; // how far it fades into the sky at any height: 0 as drawn, 1 gone
  colorLocked: boolean; // a locked hue is kept by Randomize (LockButton)
  layers: NoiseLayer[]; // its surface: a simple stack of the engine's noise layers
}

// A moon's surface: soft settings only, so it reads as rounded bumps and cracks from the ground, never spikes, at feature
// sizes a moon in the sky can show. The moon is a landscape element, so a few large, smooth regions matter more than
// detail (Dana, 2026-10-28). Ranges inferred, TUNABLE.
const MOON_BASE_TYPES: NoiseType[] = ['perlin', 'simplex', 'voronoi'];
const MOON_BASE_FREQUENCY: [number, number] = [1, 3]; // a few large regions across the disc
// Moons in one sky draw their base scale and mask coverage from different bands, so no two surfaces look alike.
const MOON_SCALE_BANDS: [number, number][] = [[1, 1.5], [1.5, 2.1], [2.1, 3]];
const MOON_COVERAGE_BANDS: [number, number][] = [[30, 45], [45, 60], [60, 75]];
const MOON_DETAIL_FREQUENCY: [number, number] = [4, 8]; // softer bumps on top, still large
const MOON_OCTAVES: [number, number] = [2, 3];
const MOON_PERSISTENCE: [number, number] = [0.3, 0.45];
const MOON_JITTER: [number, number] = [0.8, 1]; // high Jitter, so Voronoi cells never line up
const MOON_DETAIL_OPACITY: [number, number] = [0.3, 0.55];
// The detail layer's mask, so the surface splits into regions (like continents or maria) instead of one even texture.
const MOON_MASK_FREQUENCY: [number, number] = [1, 2.5];
const MOON_MASK_COVERAGE: [number, number] = [40, 60]; // percent of the surface
const MOON_MASK_SOFTNESS = 25;

export const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);
export const pickOne = <T,>(options: T[]) => options[Math.floor(Math.random() * options.length)];
const shuffled = <T,>(options: T[]) => [...options].sort(() => Math.random() - 0.5);

function moonLayer(id: string, noiseType: NoiseType, frequency: number, octaves: number, opacity: number): NoiseLayer {
  return {
    ...createDefaultLayer(id, id),
    noiseType,
    seed: Math.floor(Math.random() * 1000),
    frequency,
    octavesEnabled: true,
    octaves,
    persistence: between(MOON_PERSISTENCE),
    lacunarity: 2,
    fractalType: 'fbm',
    ridgedEnabled: false,
    terraceEnabled: false,
    domainWarpEnabled: false,
    voronoiJitter: between(MOON_JITTER),
    voronoiDistance: 'euclidean',
    opacity,
    blendMode: 'normal',
    visible: true,
  };
}

function moonMask(frequency: number, coverage: number): Partial<NoiseLayer> {
  return { maskNoiseType: 'perlin', maskSeed: Math.floor(Math.random() * 1000), maskFrequency: frequency, maskCoverage: coverage, maskSoftness: MOON_MASK_SOFTNESS, maskInvert: false };
}

// A broad base plus a lighter, masked layer on top, which makes the regions. The type and bands vary moons from each other.
export function randomMoonLayers(
  baseType: NoiseType = pickOne(MOON_BASE_TYPES),
  scaleBand: [number, number] = MOON_BASE_FREQUENCY,
  coverageBand: [number, number] = MOON_MASK_COVERAGE,
): NoiseLayer[] {
  return [
    moonLayer('moon-base', baseType, between(scaleBand), Math.round(between(MOON_OCTAVES)), 1),
    {
      ...moonLayer('moon-detail', pickOne(['voronoi', 'perlin'] as NoiseType[]), between(MOON_DETAIL_FREQUENCY), 2, between(MOON_DETAIL_OPACITY)),
      ...moonMask(between(MOON_MASK_FREQUENCY), between(coverageBand)),
    },
  ];
}

const TYPE_NAMES: Record<NoiseType, string> = { none: 'none', random: 'random', perlin: 'Perlin', simplex: 'Simplex', voronoi: 'Voronoi' };
// The small text under Randomize: what a moon is made of, without per-layer controls.
export function describeMoonLayers(layers: NoiseLayer[]): string {
  return layers.map((layer) => `${TYPE_NAMES[layer.noiseType]} · scale ${layer.frequency.toFixed(1)} · ${layer.octaves} octaves`).join('  +  ');
}

// Moon colors that go with the sky (Dana, 2026-10-28): its complement or a hue close to it, short of full saturation
// (the screen blend softens them further), after No Man's Sky's color rules (REFERENCES.md). Inferred, TUNABLE.
const MOON_LIGHTNESS: [number, number] = [0.25, 0.9]; // only keeps a moon from going black or white
const SECOND_COLOR_DARKER = 0.8; // the darks' lightness against the brights'
const MOON_MIN_SATURATION = 0.4; // so a gray sky still gives colored moons
// Harmony rules for the darks' hue, in degrees from the main hue; picking one resets the second handle to it.
export const HARMONY_RULES: { name: string; offset: number }[] = [
  { name: 'Complementary', offset: 180 },
  { name: 'Split complementary', offset: 150 },
  { name: 'Triadic', offset: 120 },
  { name: 'Analogous', offset: 30 },
  { name: 'Monochrome', offset: 0 },
];
// The rule a second handle sits on (either side of the main hue), or Custom once dragged off them.
export const harmonyFor = (secondOffset: number) =>
  HARMONY_RULES.find((rule) => [rule.offset, -rule.offset].some((offset) => (((secondOffset - offset) % 360) + 360) % 360 === 0))?.name ?? 'Custom';
// The color rules, as hue turns from the sky: its complement, a neighbor on either side, split-complementary (the two
// hues either side of the complement) and triadic (a third of the way round either side). Each moon picks a rule at
// random and turns a little further at random, and moons in one sky stay MOON_HUE_GAP apart, so every roll differs.
export const COLOR_RULES = [0.5, -30 / 360, 30 / 360, 0.5 - 30 / 360, 0.5 + 30 / 360, 1 / 3, -1 / 3];
export const HUE_JITTER = 25 / 360; // the extra random turn, either way
const MOON_HUE_GAP = 40 / 360;
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b) % 1, 1 - (Math.abs(a - b) % 1));
function randomHueTurns(count: number): number[] {
  const turns: number[] = [];
  for (let tries = 0; turns.length < count && tries < 200; tries++) {
    const turn = pickOne(COLOR_RULES) + (Math.random() * 2 - 1) * HUE_JITTER;
    if (turns.every((other) => hueDistance(turn, other) >= MOON_HUE_GAP)) turns.push(turn);
  }
  while (turns.length < count) turns.push(Math.random());
  return turns;
}

const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
// The hue is the sky's average; saturation and lightness come from its stronger color, since averaging two different
// colors pulls them toward gray.
const skyHsl = (horizonColor: string, zenithColor: string) => {
  const [average, horizon, zenith] = [{ h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 0 }];
  new THREE.Color(horizonColor).lerp(new THREE.Color(zenithColor), 0.5).getHSL(average);
  new THREE.Color(horizonColor).getHSL(horizon);
  new THREE.Color(zenithColor).getHSL(zenith);
  const stronger = horizon.s >= zenith.s ? horizon : zenith;
  return { h: average.h, s: Math.max(stronger.s, MOON_MIN_SATURATION), l: stronger.l };
};

// A moon's two colors from the sky (Dana, 2026-10-30, so none can clash): its hue turned by hueTurn, saturation and
// lightness taken from the sky; the darks turn by secondOffset and are a little darker.
// The saturation that goes with the sky: its stronger color's, never below MOON_MIN_SATURATION.
export const skySaturation = (horizonColor: string, zenithColor: string) => skyHsl(horizonColor, zenithColor).s;

export function moonColorsForSky(horizonColor: string, zenithColor: string, hueTurn: number, secondOffset = 0, saturation = skySaturation(horizonColor, zenithColor)): { color: THREE.Color; color2: THREE.Color } {
  const sky = skyHsl(horizonColor, zenithColor);
  const hue = (sky.h + hueTurn / 360 + 1) % 1;
  const lightness = THREE.MathUtils.clamp(sky.l, ...MOON_LIGHTNESS);
  return {
    color: new THREE.Color().setHSL(hue, saturation, lightness),
    color2: new THREE.Color().setHSL((hue + secondOffset / 360 + 1) % 1, saturation, lightness * SECOND_COLOR_DARKER),
  };
}

// A saved color as a turn from the sky's hue, for saves from before the hue slider.
export const hueTurnFor = (color: string, horizonColor: string, zenithColor: string) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(hsl);
  return Math.round(wrapDegrees((hsl.h - skyHsl(horizonColor, zenithColor).h) * 360));
};

// The Hue track: the moon's color at each turn from -180 to 180, so the track's center is the sky's own hue.
export function moonHueTrackGradient(horizonColor: string, zenithColor: string, saturation?: number): string {
  const stops: string[] = [];
  for (let turn = -180; turn <= 180; turn += 30) stops.push(moonColorsForSky(horizonColor, zenithColor, turn, 0, saturation).color.getStyle());
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// Sizes: alien skies have huge moons and small ones. Any moon can be the largest, the others spread up to its
// size, and any two differ by at least MOON_SIZE_GAP, so none read as twins. Placement: spread across the
// sky the camera currently sees, at least MOON_MIN_GAP apart (edge to edge), so none randomizes out of view or into a
// cluster; looking down at the ground, they go low in front. Inferred, TUNABLE.
const MOON_LARGEST: [number, number] = [15, 70]; // degrees across, the largest moon in a sky
const MOON_SMALLEST = 3; // the others spread evenly from this up to the largest
const MOON_SIZE_GAP = 1.3; // the smallest ratio between any two moons' sizes
const MOON_MIN_GAP = 4; // degrees between neighboring moons' edges
const MOON_MIN_HEIGHT = 5; // degrees above the horizon
const VIEW_MARGIN = 0.9; // keep centers within this share of the view's half-width and half-height
const PLACEMENT_TRIES = 40;

// Several moons can be medium or large in one sky (Dana, 2026-10-28): the others spread evenly up to the largest, not
// bunched small, and the order is shuffled so any slot can hold the largest.
function randomSizes(): number[] {
  const sizes = [between(MOON_LARGEST)];
  for (let tries = 0; sizes.length < MAX_MOONS && tries < 200; tries++) {
    const size = between([MOON_SMALLEST, sizes[0]]);
    if (sizes.every((other) => Math.max(size, other) / Math.min(size, other) >= MOON_SIZE_GAP)) sizes.push(size);
  }
  while (sizes.length < MAX_MOONS) sizes.push(MOON_SMALLEST);
  return shuffled(sizes);
}

// Locked hues stay; the rest go with the sky.
export function randomMoons(count: number, current: MoonSettings[], horizonColor: string, zenithColor: string): MoonSettings[] {
  const view = getSkyView();
  const top = view.pitch + view.halfHeight * VIEW_MARGIN;
  const bottom = Math.max(MOON_MIN_HEIGHT, view.pitch - view.halfHeight * VIEW_MARGIN);
  const spread = view.halfWidth * VIEW_MARGIN;
  const sizes = randomSizes();
  const baseTypes = shuffled(MOON_BASE_TYPES);
  const scaleBands = shuffled(MOON_SCALE_BANDS);
  const coverageBands = shuffled(MOON_COVERAGE_BANDS);
  const hueTurns = randomHueTurns(MAX_MOONS);
  const placed: { azimuth: number; height: number; size: number }[] = [];
  return Array.from({ length: MAX_MOONS }, (_, i) => {
    const size = Math.round(sizes[i] * 2) / 2;
    // The spot farthest from the others among a few tries, so they spread out (only the shown ones count).
    let best = { azimuth: view.azimuth, height: top > bottom ? (top + bottom) / 2 : MOON_MIN_HEIGHT, room: -Infinity };
    for (let tries = 0; tries < PLACEMENT_TRIES; tries++) {
      const azimuth = view.azimuth + (Math.random() * 2 - 1) * spread;
      const height = top > bottom ? between([bottom, top]) : MOON_MIN_HEIGHT;
      const room = Math.min(Infinity, ...placed.map((other) => Math.hypot(azimuth - other.azimuth, height - other.height) - (size + other.size) / 2));
      if (room >= MOON_MIN_GAP) { best = { azimuth, height, room }; break; }
      if (room > best.room) best = { azimuth, height, room };
    }
    if (i < count) placed.push({ azimuth: best.azimuth, height: best.height, size });
    const colorLocked = current[i]?.colorLocked ?? false;
    return {
      size,
      height: Math.round(Math.min(90, best.height)),
      azimuth: Math.round((best.azimuth + 360) % 360),
      hueTurn: colorLocked ? current[i].hueTurn : Math.round(wrapDegrees(hueTurns[i] * 360)),
      secondOffset: colorLocked ? current[i].secondOffset : pickOne(HARMONY_RULES).offset * pickOne([1, -1]),
      colorLocked,
      crescent: Math.round(Math.random() * 100),
      texture: current[i]?.texture ?? 1,
      halo: current[i]?.halo ?? 0.15,
      glow: current[i]?.glow ?? 0.15,
      blend: current[i]?.blend ?? 0,
      saturation: colorLocked ? current[i].saturation : Math.round(skySaturation(horizonColor, zenithColor) * 100) / 100,
      layers: randomMoonLayers(baseTypes[i % baseTypes.length], scaleBands[i % scaleBands.length], coverageBands[i % coverageBands.length]),
      crescentAngle: Math.round(Math.random() * 360),
    };
  });
}

// The defaults: one fixed set of five, varied in size, place and color, so a saved planet always looks the same.
function fixedLayers(baseType: NoiseType, baseScale: number, detailType: NoiseType, detailScale: number, seed: number): NoiseLayer[] {
  return [
    { ...moonLayer('moon-base', baseType, baseScale, 3, 1), seed, persistence: 0.4, voronoiJitter: 0.9 },
    { ...moonLayer('moon-detail', detailType, detailScale, 2, 0.45), seed: seed + 29, persistence: 0.4, voronoiJitter: 0.9, ...moonMask(1.5, 50), maskSeed: seed + 7 },
  ];
}
export const DEFAULT_MOONS: MoonSettings[] = [
  { size: 8, height: 40, azimuth: 229, hueTurn: 180, secondOffset: 150, layers: fixedLayers('voronoi', 2, 'perlin', 6, 12) , crescentAngle: 0, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, blend: 0, saturation: 0.6, colorLocked: false },
  { size: 14, height: 25, azimuth: 262, hueTurn: -30, secondOffset: -120, layers: fixedLayers('perlin', 2.5, 'voronoi', 5, 51) , crescentAngle: 40, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, blend: 0, saturation: 0.6, colorLocked: false },
  { size: 3, height: 32, azimuth: 196, hueTurn: 30, secondOffset: 180, layers: fixedLayers('simplex', 1.5, 'perlin', 7, 88) , crescentAngle: 320, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, blend: 0, saturation: 0.6, colorLocked: false },
  { size: 5, height: 14, azimuth: 244, hueTurn: 150, secondOffset: 30, layers: fixedLayers('voronoi', 3, 'voronoi', 6, 23) , crescentAngle: 80, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, blend: 0, saturation: 0.6, colorLocked: false },
  { size: 2, height: 48, azimuth: 212, hueTurn: -150, secondOffset: -150, layers: fixedLayers('perlin', 1.2, 'voronoi', 4, 67) , crescentAngle: 200, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, blend: 0, saturation: 0.6, colorLocked: false },
];

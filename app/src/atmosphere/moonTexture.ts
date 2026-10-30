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
  color: string; // the gradient's first color
  color2: string; // the color its darks are tinted with (Color tints its brights)
  crescentAngle: number; // degrees the crescent turns from the sun's side
  crescent: number; // how much is in shadow: 0 full, 100 the thinnest crescent
  texture: number; // how clearly the surface shows: 0 pure glow, 1 a solid moon, 2 the strongest pattern
  halo: number; // a soft light around the moon; meant to stay subtle, under the sky's haze
  glow: number; // a soft brightening just inside its lit edge
  // Locked colors are kept by Randomize (LockButton).
  colorLocked: boolean;
  color2Locked: boolean;
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
const MOON_SATURATION: [number, number] = [0.45, 0.7]; // delicate, not neon (Dana, 2026-10-28)
const MOON_LIGHTNESS: [number, number] = [0.68, 0.82];
const MOON_SECOND_LIGHTNESS: [number, number] = [0.5, 0.66];
const SECOND_COLOR_SHIFT: [number, number] = [20 / 360, 50 / 360]; // how far the gradient's second color turns
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

export function moonColorsForSky(horizonColor: string, zenithColor: string, hueTurn: number = pickOne(COLOR_RULES)): { color: string; color2: string } {
  const sky = new THREE.Color(horizonColor).lerp(new THREE.Color(zenithColor), 0.5);
  const skyHsl = { h: 0, s: 0, l: 0 };
  sky.getHSL(skyHsl);
  const hue = (skyHsl.h + hueTurn + 1) % 1;
  const secondHue = (hue + (Math.random() < 0.5 ? -1 : 1) * between(SECOND_COLOR_SHIFT) + 1) % 1;
  return {
    color: `#${new THREE.Color().setHSL(hue, between(MOON_SATURATION), between(MOON_LIGHTNESS)).getHexString()}`,
    color2: `#${new THREE.Color().setHSL(secondHue, between(MOON_SATURATION), between(MOON_SECOND_LIGHTNESS)).getHexString()}`,
  };
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

// Locked colors stay; the rest go with the sky.
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
    const fresh = moonColorsForSky(horizonColor, zenithColor, hueTurns[i]);
    const colorLocked = current[i]?.colorLocked ?? false;
    const color2Locked = current[i]?.color2Locked ?? false;
    return {
      size,
      height: Math.round(Math.min(90, best.height)),
      azimuth: Math.round((best.azimuth + 360) % 360),
      color: colorLocked ? current[i].color : fresh.color,
      color2: color2Locked ? current[i].color2 : fresh.color2,
      colorLocked,
      color2Locked,
      crescent: Math.round(Math.random() * 100),
      texture: current[i]?.texture ?? 1,
      halo: current[i]?.halo ?? 0.15,
      glow: current[i]?.glow ?? 0.15,
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
  { size: 8, height: 40, azimuth: 229, color: '#f0b48c', color2: '#9c78c8', layers: fixedLayers('voronoi', 2, 'perlin', 6, 12) , crescentAngle: 0, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, colorLocked: false, color2Locked: false },
  { size: 14, height: 25, azimuth: 262, color: '#8fd6b4', color2: '#5f8fd0', layers: fixedLayers('perlin', 2.5, 'voronoi', 5, 51) , crescentAngle: 40, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, colorLocked: false, color2Locked: false },
  { size: 3, height: 32, azimuth: 196, color: '#f2cf6e', color2: '#e07f6a', layers: fixedLayers('simplex', 1.5, 'perlin', 7, 88) , crescentAngle: 320, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, colorLocked: false, color2Locked: false },
  { size: 5, height: 14, azimuth: 244, color: '#c29cf0', color2: '#7b6fd6', layers: fixedLayers('voronoi', 3, 'voronoi', 6, 23) , crescentAngle: 80, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, colorLocked: false, color2Locked: false },
  { size: 2, height: 48, azimuth: 212, color: '#d6ea8c', color2: '#82b86a', layers: fixedLayers('perlin', 1.2, 'voronoi', 4, 67) , crescentAngle: 200, crescent: 50, texture: 1, halo: 0.15, glow: 0.15, colorLocked: false, color2Locked: false },
];

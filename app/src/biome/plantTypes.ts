import * as THREE from 'three';
// The life types on the life grid (biome/lifeGrid.ts), Cordonnier et al. 2017's plant functional types: plants grouped by
// how they respond to conditions. Generation 0, the pioneers: algae and moss. Alien, so every range is ours and TUNABLE.

// Cordonnier's hat function: survival limits outside which the type dies back, and its ideal range.
export interface ResponseRange {
  min: number;
  idealMin: number;
  idealMax: number;
  max: number;
}

// How a type looks, derived from the planet's land color as every color in the app is (Shadow hue, moons, Randomize
// colors): its hue a turn from the land's, its saturation and lightness shares of the land's, varied across patches.
export interface LifeLook {
  hueTurn: number; // degrees from the land's hue, -180 to 180
  hueSpread: number; // degrees either side across patches
  saturationShare: [number, number]; // of the land color's saturation
  lightnessShare: [number, number]; // of the land color's lightness
  patternMeters: number; // its cushions' size
  relief: number; // how much its cushions bend the light, 0 flat
  edgeAmount: number; // how much it creeps onto sideways faces (the moss material function's edge mask)
  edgeThickness: number; // how far onto them: higher keeps it to the steepest
  hollowWeight: number; // how strongly hollows favor it over flats and ridges (Unity's Concavity filter)
  velvetCore: number; // FuzzyShading's CoreDarkness (Berg: 0.2)
  velvetPower: number; // FuzzyShading's Power (Berg: 3)
  velvetEdge: number; // FuzzyShading's EdgeBrightness (Berg: 3)
  shine: number; // highlight strength against the ground's, 1 the same
}

export interface LifeType {
  temperature: ResponseRange; // °C
  moisture: ResponseRange; // 0 dry, 1 saturated, 1.5 underwater
  sun: ResponseRange; // 0 to 1
  look: LifeLook;
}

export type LifeTypeKey = 'algae' | 'moss';

export interface BiomeSettings {
  enabled: boolean;
  years: number; // how long life has grown on the square
  growthRate: number; // coverage gained per year at full vigor
  evolve: boolean; // variants compete and mutate each era (stage 3)
  variation: number; // scales the visible genes (hue, brightness): how different variants look, 0 to 2
  mutationRate: number; // chance each gene changes per era (Sims's m)
  shoreReach: number; // meters from water algae can grow
  seed: number; // the evolution's random seed, so a rerun replays the same history
  deathRate: number; // coverage lost per year at full stress
  algae: LifeType;
  moss: LifeType;
}

export const DEFAULT_BIOME_SETTINGS: BiomeSettings = {
  enabled: true,
  years: 200,
  growthRate: 0.05,
  evolve: true,
  variation: 1,
  mutationRate: 0.2,
  shoreReach: 200,
  seed: 1,
  deathRate: 0.2,
  // Algae: warm-tolerant, wet ground, shorelines and under water, in light.
  algae: {
    temperature: { min: -10, idealMin: 5, idealMax: 35, max: 60 },
    moisture: { min: 0.7, idealMin: 0.9, idealMax: 1.5, max: 2 }, // at and below waterlines
    sun: { min: 0.05, idealMin: 0.3, idealMax: 1, max: 1.01 },
    // Algae: a flat film, no creep onto slopes, no velvet, a little gloss. Inferred, TUNABLE.
    look: { hueTurn: 30, hueSpread: 15, saturationShare: [0.8, 1.1], lightnessShare: [0.9, 1.15], patternMeters: 6, relief: 0.1, edgeAmount: 0, edgeThickness: 4, hollowWeight: 0.35, velvetCore: 0, velvetPower: 3, velvetEdge: 1, shine: 2 },
  },
  // Moss: cold-tolerant, damp ground, prefers shade, drowns under water.
  moss: {
    temperature: { min: -30, idealMin: -5, idealMax: 20, max: 35 },
    // Moisture that persists and shade (bryophyte ecology: sun dries it, richest near water). Inferred numbers, TUNABLE.
    moisture: { min: 0.35, idealMin: 0.55, idealMax: 1.1, max: 1.3 },
    sun: { min: 0, idealMin: 0, idealMax: 0.45, max: 0.75 },
    // Moss: cushions, creeping onto slopes, Berg's velvet, matte. Velvet values Berg's; the rest inferred, TUNABLE.
    look: { hueTurn: -30, hueSpread: 20, saturationShare: [0.6, 0.9], lightnessShare: [0.75, 1], patternMeters: 2, relief: 0.5, edgeAmount: 0.3, edgeThickness: 4, hollowWeight: 0.35, velvetCore: 0.2, velvetPower: 3, velvetEdge: 3, shine: 0.3 },
  },
};

export function migrateBiome(saved: Partial<BiomeSettings> | undefined): BiomeSettings {
  const type = (key: LifeTypeKey): LifeType => ({ ...DEFAULT_BIOME_SETTINGS[key], ...saved?.[key], look: { ...DEFAULT_BIOME_SETTINGS[key].look, ...saved?.[key]?.look } });
  return { ...DEFAULT_BIOME_SETTINGS, ...saved, algae: type('algae'), moss: type('moss') };
}

// A type's actual hue (degrees) and saturation and lightness ranges on this planet, in sRGB HSL, from the land color.
export function lifeColors(look: LifeLook, landColor: string): { hue: number; saturation: [number, number]; lightness: [number, number] } {
  const land = new THREE.Color(landColor).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
  return {
    hue: (((land.h * 360 + look.hueTurn) % 360) + 360) % 360,
    saturation: [clamp01(land.s * look.saturationShare[0]), clamp01(land.s * look.saturationShare[1])],
    lightness: [clamp01(land.l * look.lightnessShare[0]), clamp01(land.l * look.lightnessShare[1])],
  };
}

// Life's saturation against the land's: within the planet's own muted palette, so it blends; it reads by its hue turn and
// lightness, not extra saturation (Dana, 2026-11-10). Inferred, TUNABLE.
export const LIFE_SATURATION: Record<LifeTypeKey, [number, number]> = { algae: [1, 1.15], moss: [1, 1.15] };

// The land's middle ramp color, the one life's colors turn from.
export const landMiddleColor = (stops: { color: string }[]) => stops[Math.floor(stops.length / 2)]?.color ?? '#808080';

export const rangeVector = (range: ResponseRange): [number, number, number, number] => [range.min, range.idealMin, range.idealMax, range.max];

// Evolution (BIOME-PLAN.md stage 3). Four variants per type compete in every cell (JeDi-DGVM); each era the least
// abundant is replaced by a mutant of the most abundant (Sims 1991). Genes are only visible traits, as offsets from the
// type's own settings. Counts, era length and gene spans inferred, TUNABLE.
export const LIFE_VARIANTS = 4;
export const ERA_YEARS = 50;
export const MAX_ERAS = 40; // a longer span takes longer eras, so readbacks stay few
// Genes are stored 0 to 1, 0.5 the type's own value (Sims 1991 normalizes them), and turned into offsets only when used.
export interface Genome {
  hueTurn: number; // turn from the type's hue
  brightness: number; // added to its brightness
  moistureShift: number; // moves its moisture range (higher needs wetter ground)
  shadeShift: number; // moves its sunlight range down (higher needs more shade)
}
// Each gene's widest offset at 0 or 1. Variation scales only the visible ones, so it changes the look, never the growth.
const GENE_SPANS: Record<keyof Genome, number> = { hueTurn: 60, brightness: 0.4, moistureShift: 0.4, shadeShift: 0.4 };
const LOOK_GENES: (keyof Genome)[] = ['hueTurn', 'brightness'];
export const BASE_GENOME: Genome = { hueTurn: 0.5, brightness: 0.5, moistureShift: 0.5, shadeShift: 0.5 };
export function geneOffset(genome: Genome, gene: keyof Genome, variation: number): number {
  return (genome[gene] * 2 - 1) * GENE_SPANS[gene] * (LOOK_GENES.includes(gene) ? variation : 1);
}

// Sims 1991: each gene copied with chance m (Mutation rate) of adding a random amount in ±d, then clamped to 0 to 1.
const MUTATION_AMOUNT = 0.4; // Sims's d
export function mutate(parent: Genome, random: () => number, rate: number): Genome {
  const child = { ...parent };
  for (const gene of Object.keys(GENE_SPANS) as (keyof Genome)[]) {
    if (random() >= rate) continue;
    child[gene] = Math.min(Math.max(parent[gene] + (random() * 2 - 1) * MUTATION_AMOUNT, 0), 1);
  }
  return child;
}

// A seeded random (mulberry32), so a rerun replays the same evolution.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


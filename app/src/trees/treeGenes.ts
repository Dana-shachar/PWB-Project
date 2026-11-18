import * as THREE from 'three';
import { TreeType, type Tree } from '@dgreenheck/ez-tree';
import { LEAF_PART_OPTIONS, type LeafPart } from './leafParts';

// A tree species' shape and colors as genes: EZ-Tree's settings (MIT, procedural at runtime from a seed), only the ones
// that change the tree from walking distance (BIOME-PLAN.md, Trees). Mutated per era later (Sims 1991).
export type TreeFamily = 'clumps' | 'cone' | 'umbrella' | 'fan' | 'crown' | ShrubFamily;
// Shrub silhouettes, the growth forms extension guides sort shrubs by (UF/IFAS, Ohio State; REFERENCES.md).
export type ShrubFamily = 'mound' | 'vase' | 'spreading' | 'upright' | 'weeping' | 'creeping';

export interface TreeGenes {
  family: TreeFamily;
  seed: number;
  height: number; // trunk length, EZ-Tree units
  trunkRadius: number;
  limbs: number; // main limbs off the trunk
  limbAngle: number; // degrees from the trunk
  limbLength: number;
  limbStart: number; // where along the trunk the limbs begin, 0 to 1
  gnarliness: number; // how much the limbs curl
  bend: number; // EZ-Tree's growth force on the limbs: -1 hang down, 0 none, 1 reach up
  twigs: number; // children per limb; 0 keeps one branch level
  leafCount: number; // leaves per branch tip
  leafSize: number;
  leafSizeRange: number; // how much leaf sizes differ within one tree: each is the size times 1 ± this
  leafAngle: number; // degrees from the branch
  leafPart: LeafPart; // the 3D part each leaf is (trees/leafParts.ts)
  leafPart2: LeafPart | 'none'; // up to two more parts mixed in
  leafPart3: LeafPart | 'none';
  partMix: number; // share of leaves that take the extra parts, 0 to 1
  droop: number; // how drooping parts bend: -1 up, 0 straight, 1 down
  baseSwell: number; // how much the trunk's base swells, 0 none
  hueTurn: number; // the canopy's inner hue, degrees from the land's
  leafOffset: number; // the canopy's outer hue, degrees from its inner one (the gradient)
  trunkOffset: number; // the trunk base's hue, degrees from the canopy's inner one (a harmony rule or free)
  trunkTopOffset: number; // the trunk top's hue, degrees from its base (the trunk's own gradient)
  tipTurn: number; // each leaf part's tip hue, degrees from its base; shown only up close (trees/treeLook.ts)
  hueRange: number; // how far individuals of the species turn from its hues, ± degrees, from each one's seed
  glow: number; // a soft light at the leaf tips, 0 none to 1; grows with the tree (trees/treeLook.ts)
  fireflies: number; // floating lights around the canopy at full size, 0 none (trees/treeLights.ts)
}

export interface TreeSpecies {
  id: string;
  name: string;
  visible: boolean; // shown in the Tree view, as a layer's eye
  genes: TreeGenes;
  locks: GeneLocks; // groups Vary and New species keep
}

export const TREE_FAMILY_OPTIONS: { value: TreeFamily; label: string }[] = [
  { value: 'clumps', label: 'Clumps' },
  { value: 'cone', label: 'Cone' },
  { value: 'umbrella', label: 'Umbrella' },
  { value: 'fan', label: 'Fan' },
  { value: 'crown', label: 'Crown' },
];
export const SHRUB_FAMILY_OPTIONS: { value: ShrubFamily; label: string }[] = [
  { value: 'mound', label: 'Mound' },
  { value: 'vase', label: 'Vase' },
  { value: 'spreading', label: 'Spreading' },
  { value: 'upright', label: 'Upright' },
  { value: 'weeping', label: 'Weeping' },
  { value: 'creeping', label: 'Creeping' },
];
export const isShrub = (family: TreeFamily): family is ShrubFamily => SHRUB_FAMILY_OPTIONS.some((option) => option.value === family);

type ShapeGenes = Omit<TreeGenes, 'family' | 'seed' | 'hueTurn' | 'leafOffset' | 'trunkOffset' | 'trunkTopOffset' | 'tipTurn' | 'hueRange' | 'glow' | 'fireflies'>;
export type NumericShapeGene = Exclude<keyof ShapeGenes, 'leafPart' | 'leafPart2' | 'leafPart3'>;

// Each numeric shape gene's range, the sliders' and New species' own. Inferred, TUNABLE.
export const SHAPE_GENE_RANGES: Record<NumericShapeGene, [number, number]> = {
  height: [0.5, 40], trunkRadius: [0.2, 4], limbs: [1, 40], limbAngle: [0, 90], limbLength: [0.5, 25], limbStart: [0, 1],
  gnarliness: [0, 1], bend: [-1, 1], twigs: [0, 10], leafCount: [0, 30], leafSize: [0.5, 12], leafSizeRange: [0, 3], leafAngle: [0, 90], baseSwell: [0, 1.5], partMix: [0, 1], droop: [-1, 1],
};

// Starting values per silhouette family, read off Dana's references (round clumps, stacked cones, discs on long limbs,
// fanned tips), a few dozen big leaves each. Inferred, TUNABLE.
export const TREE_FAMILIES: Record<TreeFamily, ShapeGenes> = {
  clumps: { height: 12, trunkRadius: 1.3, limbs: 5, limbAngle: 45, limbLength: 8, limbStart: 0.45, gnarliness: 0.2, bend: 0.25, twigs: 2, leafCount: 4, leafSize: 5, leafSizeRange: 0.4, leafAngle: 30, leafPart: 'pad', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.4 },
  cone: { height: 18, trunkRadius: 1, limbs: 16, limbAngle: 75, limbLength: 7, limbStart: 0.2, gnarliness: 0.05, bend: 0.25, twigs: 0, leafCount: 3, leafSize: 3.5, leafSizeRange: 0.4, leafAngle: 20, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.2 },
  umbrella: { height: 10, trunkRadius: 0.8, limbs: 5, limbAngle: 25, limbLength: 12, limbStart: 0.5, gnarliness: 0.15, bend: 0.25, twigs: 0, leafCount: 1, leafSize: 7, leafSizeRange: 0.4, leafAngle: 90, leafPart: 'pad', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.3 },
  fan: { height: 14, trunkRadius: 1, limbs: 8, limbAngle: 55, limbLength: 4, limbStart: 0.92, gnarliness: 0.1, bend: 0.25, twigs: 0, leafCount: 4, leafSize: 7, leafSizeRange: 0.4, leafAngle: 40, leafPart: 'fan', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.8 },
  // A single trunk with a star of leaves at its top, as palms grow (#29). Limb genes are unused: it has no limbs.
  crown: { height: 14, trunkRadius: 0.7, limbs: 1, limbAngle: 45, limbLength: 4, limbStart: 0.9, gnarliness: 0.15, bend: 0.25, twigs: 0, leafCount: 14, leafSize: 9, leafSizeRange: 0.4, leafAngle: 70, leafPart: 'frond', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.6 },
  // Shrubs: almost no trunk, limbs from the ground, after EZ-Tree's bush presets (bush_1 to 3) scaled to shrub size.
  // Mound is bush_1 (steep limbs, a slight downward pull); Vase is bush_2 (many steep limbs, few twigs); Spreading is
  // bush_3 (wide-angled limbs); Upright, Weeping and Creeping set limb angle and Bend to their form. TUNABLE
  mound: { height: 0.5, trunkRadius: 0.5, limbs: 7, limbAngle: 22, limbLength: 5, limbStart: 0, gnarliness: 0.1, bend: -0.5, twigs: 3, leafCount: 5, leafSize: 2, leafSizeRange: 0.4, leafAngle: 40, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.4, baseSwell: 0 },
  vase: { height: 0.5, trunkRadius: 0.5, limbs: 10, limbAngle: 20, limbLength: 7, limbStart: 0, gnarliness: 0.05, bend: 0.25, twigs: 2, leafCount: 4, leafSize: 2, leafSizeRange: 0.4, leafAngle: 40, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.4, baseSwell: 0 },
  spreading: { height: 0.5, trunkRadius: 0.5, limbs: 13, limbAngle: 66, limbLength: 6, limbStart: 0, gnarliness: 0.06, bend: -0.2, twigs: 4, leafCount: 3, leafSize: 2.5, leafSizeRange: 0.4, leafAngle: 54, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.4, baseSwell: 0 },
  upright: { height: 0.5, trunkRadius: 0.5, limbs: 6, limbAngle: 8, limbLength: 8, limbStart: 0, gnarliness: 0.05, bend: 0.6, twigs: 2, leafCount: 5, leafSize: 2, leafSizeRange: 0.4, leafAngle: 25, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.2, baseSwell: 0 },
  weeping: { height: 3, trunkRadius: 0.5, limbs: 8, limbAngle: 50, limbLength: 6, limbStart: 0.7, gnarliness: 0.1, bend: -1, twigs: 2, leafCount: 5, leafSize: 2, leafSizeRange: 0.4, leafAngle: 30, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.8, baseSwell: 0 },
  creeping: { height: 0.3, trunkRadius: 0.4, limbs: 10, limbAngle: 85, limbLength: 6, limbStart: 0, gnarliness: 0.15, bend: 0, twigs: 2, leafCount: 4, leafSize: 1.5, leafSizeRange: 0.4, leafAngle: 60, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.2, baseSwell: 0 },
};

export const DEFAULT_TREE_GENES: TreeGenes = { family: 'clumps', seed: 1, ...TREE_FAMILIES.clumps, hueTurn: -30, leafOffset: 40, trunkOffset: 150, trunkTopOffset: 30, tipTurn: 0, hueRange: 0, glow: 0, fireflies: 0 };
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

// The three groups a species' randomizing can keep (each locked by its padlock in the Trees panel).
export type GeneGroup = 'shape' | 'leaves' | 'color' | 'effects';
export type GeneLocks = Record<GeneGroup, boolean>;
export const NO_LOCKS: GeneLocks = { shape: false, leaves: false, color: false, effects: false };
const SHAPE_KEYS = ['family', 'height', 'trunkRadius', 'baseSwell', 'limbs', 'limbAngle', 'limbLength', 'limbStart', 'gnarliness', 'bend', 'twigs'] as const;
const LEAF_KEYS = ['leafPart', 'leafPart2', 'leafPart3', 'partMix', 'leafCount', 'leafSize', 'leafSizeRange', 'leafAngle', 'droop'] as const;
const COLOR_KEYS = ['hueTurn', 'leafOffset', 'trunkOffset', 'trunkTopOffset', 'tipTurn', 'hueRange'] as const;
const EFFECT_KEYS = ['glow', 'fireflies'] as const;
const GROUP_KEYS: Record<GeneGroup, readonly (keyof TreeGenes)[]> = { shape: SHAPE_KEYS, leaves: LEAF_KEYS, color: COLOR_KEYS, effects: EFFECT_KEYS };

// Copies the locked groups from `kept` over `rolled`.
function keepLocked(rolled: TreeGenes, kept: TreeGenes, locks: GeneLocks): TreeGenes {
  const result = { ...rolled } as Record<keyof TreeGenes, unknown>;
  for (const group of Object.keys(GROUP_KEYS) as GeneGroup[]) {
    if (locks[group]) for (const key of GROUP_KEYS[group]) result[key] = kept[key]; // a lock saved before a group existed reads false
  }
  return result as TreeGenes;
}

// Many big leaves read as a blob: leaves times size is capped, the count giving way. Inferred, TUNABLE.
const MAX_LEAF_MASS = 60;
function keepLeavesReadable(genes: TreeGenes): TreeGenes {
  const mass = genes.leafCount * genes.leafSize;
  return mass > MAX_LEAF_MASS ? { ...genes, leafCount: Math.max(1, Math.round(MAX_LEAF_MASS / genes.leafSize)) } : genes;
}

// A new species rolled from scratch, coherent: a random family of the same kind (tree or shrub), each shape gene from half to one and a half times the
// family's start (within its range), any leaf part (sometimes a second), any hues, and a harmony rule for the trunk.
// Locked groups stay as they are. Spans inferred, TUNABLE.
export function randomTreeGenes(current: TreeGenes, locks: GeneLocks, harmonyOffsets: number[]): TreeGenes {
  const family = pick<{ value: TreeFamily }>(isShrub(current.family) ? SHRUB_FAMILY_OPTIONS : TREE_FAMILY_OPTIONS).value;
  const start = TREE_FAMILIES[family];
  const extra = (): LeafPart | 'none' => (Math.random() < 0.4 ? pick(LEAF_PART_OPTIONS).value : 'none');
  const shape = { ...start, leafPart: pick(LEAF_PART_OPTIONS).value, leafPart2: extra(), leafPart3: 'none' as const, partMix: 0.2 + Math.random() * 0.4 };
  for (const key of Object.keys(SHAPE_GENE_RANGES) as NumericShapeGene[]) {
    const [min, max] = SHAPE_GENE_RANGES[key];
    shape[key] = Math.min(max, Math.max(min, start[key] * (0.5 + Math.random())));
  }
  shape.bend = Math.min(1, Math.max(-1, start.bend + (Math.random() * 2 - 1) * 0.4)); // around the family's pull, either sign
  shape.droop = Math.random() * 2 - 1; // up or down, either way
  const turn = () => Math.round(Math.random() * 120 - 60);
  const rolled: TreeGenes = { family, seed: Math.floor(Math.random() * 1e9), ...shape, hueTurn: Math.round(Math.random() * 360 - 180), leafOffset: turn(), trunkOffset: pick(harmonyOffsets) * pick([1, -1]), trunkTopOffset: turn(), tipTurn: turn(), hueRange: Math.round(Math.random() * 40), glow: Math.random() < 0.5 ? 0 : Math.random() * 0.6, fireflies: Math.random() < 0.6 ? 0 : Math.round(Math.random() * FIREFLIES_MAX * 0.5) };
  return keepLeavesReadable(keepLocked(rolled, current, locks));
}

// A cousin of the species, by Sims's mutation (1991, as the moss and algae evolve): each gene changes with chance
// VARY_CHANCE by up to VARY_SHARE of its range; the family stays, a leaf part changes rarely. Locked groups stay.
// Evolution per era will use the same rule. Amounts inferred, TUNABLE.
const VARY_SHARE = 0.4; // Sims's d, the same as the biome's MUTATION_AMOUNT (biome/plantTypes.ts)
const PART_CHANGE_CHANCE = 0.08;
// Sims 1991: each gene changes with chance `mutationRate` (the Evolution panel's slider) by up to ±d of its range.
export function varyTreeGenes(current: TreeGenes, locks: GeneLocks, mutationRate: number): TreeGenes {
  const varied = { ...current };
  const nudge = (value: number, min: number, max: number) =>
    Math.random() < mutationRate ? Math.min(max, Math.max(min, value + (Math.random() * 2 - 1) * VARY_SHARE * (max - min))) : value;
  for (const key of Object.keys(SHAPE_GENE_RANGES) as NumericShapeGene[]) {
    const [min, max] = SHAPE_GENE_RANGES[key];
    varied[key] = nudge(current[key] ?? TREE_FAMILIES[current.family][key], min, max); // species saved before a gene existed
  }
  for (const key of ['hueTurn', 'leafOffset', 'trunkOffset', 'trunkTopOffset', 'tipTurn'] as const) varied[key] = Math.round(nudge(current[key] ?? 0, -180, 180));
  varied.hueRange = Math.round(nudge(current.hueRange ?? 0, 0, HUE_RANGE_MAX));
  varied.glow = nudge(current.glow ?? 0, 0, 1);
  varied.fireflies = Math.round(nudge(current.fireflies ?? 0, 0, FIREFLIES_MAX));
  if (Math.random() < PART_CHANGE_CHANCE) varied.leafPart = pick(LEAF_PART_OPTIONS).value;
  if (Math.random() < PART_CHANGE_CHANCE) varied.leafPart2 = pick(LEAF_PART_OPTIONS).value;
  varied.seed = Math.floor(Math.random() * 1e9);
  return keepLeavesReadable(keepLocked(varied, current, locks));
}

export const DEFAULT_SHRUB: TreeSpecies = { id: 'shrub-1', name: 'Shrub 1', visible: true, genes: { ...DEFAULT_TREE_GENES, family: 'mound', ...TREE_FAMILIES.mound }, locks: { ...NO_LOCKS } };
export const DEFAULT_TREE_SPECIES: TreeSpecies[] = [{ id: 'species-1', name: 'Species 1', visible: true, genes: DEFAULT_TREE_GENES, locks: { ...NO_LOCKS } }, DEFAULT_SHRUB];

// A species' four colors on this planet: the land's color turned by the genes' hues (the palette's rule turns). The
// canopy brightens outward, the trunk is darker. Lightness and saturation shares inferred, TUNABLE.
// The tips' pair is the canopy's turned by tipTurn (species saved before it existed read 0).
export function treeColors(genes: TreeGenes, landColor: string): { canopyInner: THREE.Color; canopyOuter: THREE.Color; tipInner: THREE.Color; tipOuter: THREE.Color; trunkBase: THREE.Color; trunkTop: THREE.Color } {
  const land = new THREE.Color(landColor).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const hue = (turn: number) => ((((land.h * 360 + turn) % 360) + 360) % 360) / 360;
  const saturation = Math.max(land.s, 0.35);
  const color = (turn: number, saturationShare: number, lightnessShare: number) =>
    new THREE.Color().setHSL(hue(turn), Math.min(saturation * saturationShare, 1), Math.min(land.l * lightnessShare, 0.95), THREE.SRGBColorSpace);
  const trunk = genes.hueTurn + genes.trunkOffset;
  const tip = genes.tipTurn ?? 0;
  return {
    canopyInner: color(genes.hueTurn, 1.1, 0.65),
    canopyOuter: color(genes.hueTurn + genes.leafOffset, 1.2, 0.95),
    tipInner: color(genes.hueTurn + tip, 1.1, 0.65),
    tipOuter: color(genes.hueTurn + genes.leafOffset + tip, 1.2, 0.95),
    trunkBase: color(trunk, 0.8, 0.6),
    trunkTop: color(trunk + genes.trunkTopOffset, 0.8, 0.8),
  };
}

export const HUE_RANGE_MAX = 90; // the Color range slider's top, degrees
export const FIREFLIES_MAX = 80; // the Fireflies slider's top, per full-grown tree. TUNABLE

// How grown a tree reads, 0 to 1, from its height until the Trees track gives it an age: effects grow with it, so a
// young tree glows faintly and has few fireflies (Dana, 2026-11-17). TUNABLE
const FULL_GROWN_HEIGHT = 20;
const SHRUB_FULL_GROWN = 6; // a shrub's limb length when full grown: a shrub is its limbs, its trunk stays a stub. TUNABLE
export function growth(genes: TreeGenes): number {
  const share = isShrub(genes.family) ? genes.limbLength / SHRUB_FULL_GROWN : genes.height / FULL_GROWN_HEIGHT;
  return THREE.MathUtils.clamp(share, 0.2, 1);
}

// This individual's hue turn within the species' Color range, from its own seed, so a tree keeps its color
// (as SpeedTree's hue variation shifts each instance, REFERENCES.md).
export function individualTurn(genes: TreeGenes): number {
  const range = genes.hueRange ?? 0;
  if (range <= 0) return 0;
  let state = (genes.seed ^ 0x5bd1e995) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) >>> 0;
  return ((state / 4294967296) * 2 - 1) * range;
}

const BEND_FORCE = 0.04; // EZ-Tree force strength at Bend 1; its default 0.01 is Bend 0.25, its bush presets -0.02. TUNABLE

// Writes the genes into a tree's EZ-Tree options; call tree.generate() after.
export function applyTreeGenes(tree: Tree, genes: TreeGenes): void {
  const options = tree.options;
  options.seed = genes.seed;
  options.type = genes.family === 'cone' ? TreeType.Evergreen : TreeType.Deciduous;
  const branch = options.branch;
  // A crown has no limbs: the trunk is its last branch, so EZ-Tree puts the leaves at its tip.
  branch.levels = genes.family === 'crown' ? 0 : genes.twigs > 0 ? 2 : 1;
  branch.length[0] = genes.height;
  branch.radius[0] = genes.trunkRadius;
  branch.taper[0] = 0.7;
  branch.gnarliness[0] = genes.gnarliness * 0.5;
  branch.children[0] = Math.round(genes.limbs);
  branch.angle[1] = genes.limbAngle;
  branch.length[1] = genes.limbLength;
  branch.start[1] = genes.limbStart;
  branch.gnarliness[1] = genes.gnarliness;
  branch.radius[1] = Math.max(0.1, genes.trunkRadius * 0.5);
  branch.children[1] = Math.round(genes.twigs);
  branch.angle[2] = genes.limbAngle;
  branch.length[2] = genes.limbLength * 0.5;
  branch.gnarliness[2] = genes.gnarliness;
  // EZ-Tree bends each section toward the force by strength / its radius, so thin limbs bend most.
  branch.force.direction = { x: 0, y: 1, z: 0 };
  branch.force.strength = (genes.bend ?? TREE_FAMILIES[genes.family].bend) * BEND_FORCE;
  const leaves = options.leaves;
  leaves.count = Math.round(genes.leafCount);
  leaves.size = genes.leafSize;
  leaves.angle = genes.leafAngle;
  leaves.start = genes.family === 'crown' ? 0.93 : genes.family === 'fan' || genes.family === 'umbrella' ? 0.8 : 0.3;
  leaves.sizeVariance = genes.leafSizeRange ?? 0.4; // EZ-Tree's own spread: size × (1 ± this); parts also vary (leafParts.ts)
  options.bark.textured = false; // our flat look replaces EZ-Tree's textures (trees/treeLook.ts)
}

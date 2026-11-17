import * as THREE from 'three';
import { TreeType, type Tree } from '@dgreenheck/ez-tree';
import { LEAF_PART_OPTIONS, type LeafPart } from './leafParts';

// A tree species' shape and colors as genes: EZ-Tree's settings (MIT, procedural at runtime from a seed), only the ones
// that change the tree from walking distance (BIOME-PLAN.md, Trees). Mutated per era later (Sims 1991).
export type TreeFamily = 'clumps' | 'cone' | 'umbrella' | 'fan' | 'crown' | 'shrub';

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
  twigs: number; // children per limb; 0 keeps one branch level
  leafCount: number; // leaves per branch tip
  leafSize: number;
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
  { value: 'shrub', label: 'Shrub' },
];

type ShapeGenes = Omit<TreeGenes, 'family' | 'seed' | 'hueTurn' | 'leafOffset' | 'trunkOffset' | 'trunkTopOffset' | 'tipTurn'>;
export type NumericShapeGene = Exclude<keyof ShapeGenes, 'leafPart' | 'leafPart2' | 'leafPart3'>;

// Each numeric shape gene's range, the sliders' and New species' own. Inferred, TUNABLE.
export const SHAPE_GENE_RANGES: Record<NumericShapeGene, [number, number]> = {
  height: [0.5, 40], trunkRadius: [0.2, 4], limbs: [1, 40], limbAngle: [0, 90], limbLength: [0.5, 25], limbStart: [0, 1],
  gnarliness: [0, 1], twigs: [0, 10], leafCount: [0, 30], leafSize: [0.5, 12], leafAngle: [0, 90], baseSwell: [0, 1.5], partMix: [0, 1], droop: [-1, 1],
};

// Starting values per silhouette family, read off Dana's references (round clumps, stacked cones, discs on long limbs,
// fanned tips), a few dozen big leaves each. Inferred, TUNABLE.
export const TREE_FAMILIES: Record<TreeFamily, ShapeGenes> = {
  clumps: { height: 12, trunkRadius: 1.3, limbs: 5, limbAngle: 45, limbLength: 8, limbStart: 0.45, gnarliness: 0.2, twigs: 2, leafCount: 4, leafSize: 5, leafAngle: 30, leafPart: 'pad', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.4 },
  cone: { height: 18, trunkRadius: 1, limbs: 16, limbAngle: 75, limbLength: 7, limbStart: 0.2, gnarliness: 0.05, twigs: 0, leafCount: 3, leafSize: 3.5, leafAngle: 20, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.2 },
  umbrella: { height: 10, trunkRadius: 0.8, limbs: 5, limbAngle: 25, limbLength: 12, limbStart: 0.5, gnarliness: 0.15, twigs: 0, leafCount: 1, leafSize: 7, leafAngle: 90, leafPart: 'pad', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.3 },
  fan: { height: 14, trunkRadius: 1, limbs: 8, limbAngle: 55, limbLength: 4, limbStart: 0.92, gnarliness: 0.1, twigs: 0, leafCount: 4, leafSize: 7, leafAngle: 40, leafPart: 'fan', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.8 },
  // A single trunk with a star of leaves at its top, as palms grow (#29). Limb genes are unused: it has no limbs.
  // EZ-Tree's bush presets (bush_1): almost no trunk, many limbs from the ground at a steep angle, two twig levels;
  // scaled to shrub size. TUNABLE
  shrub: { height: 0.5, trunkRadius: 0.5, limbs: 7, limbAngle: 22, limbLength: 5, limbStart: 0, gnarliness: 0.1, twigs: 3, leafCount: 5, leafSize: 2, leafAngle: 40, leafPart: 'blade', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.4, baseSwell: 0 },
  crown: { height: 14, trunkRadius: 0.7, limbs: 1, limbAngle: 45, limbLength: 4, limbStart: 0.9, gnarliness: 0.15, twigs: 0, leafCount: 14, leafSize: 9, leafAngle: 70, leafPart: 'frond', leafPart2: 'none', leafPart3: 'none', partMix: 0, droop: 0.7, baseSwell: 0.6 },
};

export const DEFAULT_TREE_GENES: TreeGenes = { family: 'clumps', seed: 1, ...TREE_FAMILIES.clumps, hueTurn: -30, leafOffset: 40, trunkOffset: 150, trunkTopOffset: 30, tipTurn: 0 };
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

// The three groups a species' randomizing can keep (each locked by its padlock in the Trees panel).
export type GeneGroup = 'shape' | 'leaves' | 'color';
export type GeneLocks = Record<GeneGroup, boolean>;
export const NO_LOCKS: GeneLocks = { shape: false, leaves: false, color: false };
const SHAPE_KEYS = ['family', 'height', 'trunkRadius', 'baseSwell', 'limbs', 'limbAngle', 'limbLength', 'limbStart', 'gnarliness', 'twigs'] as const;
const LEAF_KEYS = ['leafPart', 'leafPart2', 'leafPart3', 'partMix', 'leafCount', 'leafSize', 'leafAngle', 'droop'] as const;
const COLOR_KEYS = ['hueTurn', 'leafOffset', 'trunkOffset', 'trunkTopOffset', 'tipTurn'] as const;
const GROUP_KEYS: Record<GeneGroup, readonly (keyof TreeGenes)[]> = { shape: SHAPE_KEYS, leaves: LEAF_KEYS, color: COLOR_KEYS };

// Copies the locked groups from `kept` over `rolled`.
function keepLocked(rolled: TreeGenes, kept: TreeGenes, locks: GeneLocks): TreeGenes {
  const result = { ...rolled } as Record<keyof TreeGenes, unknown>;
  for (const group of Object.keys(GROUP_KEYS) as GeneGroup[]) {
    if (locks[group]) for (const key of GROUP_KEYS[group]) result[key] = kept[key];
  }
  return result as TreeGenes;
}

// Many big leaves read as a blob: leaves times size is capped, the count giving way. Inferred, TUNABLE.
const MAX_LEAF_MASS = 60;
function keepLeavesReadable(genes: TreeGenes): TreeGenes {
  const mass = genes.leafCount * genes.leafSize;
  return mass > MAX_LEAF_MASS ? { ...genes, leafCount: Math.max(1, Math.round(MAX_LEAF_MASS / genes.leafSize)) } : genes;
}

// A new species rolled from scratch, coherent: a random family, each shape gene from half to one and a half times the
// family's start (within its range), any leaf part (sometimes a second), any hues, and a harmony rule for the trunk.
// Locked groups stay as they are. Spans inferred, TUNABLE.
export function randomTreeGenes(current: TreeGenes, locks: GeneLocks, harmonyOffsets: number[]): TreeGenes {
  const family = pick(TREE_FAMILY_OPTIONS).value;
  const start = TREE_FAMILIES[family];
  const extra = (): LeafPart | 'none' => (Math.random() < 0.4 ? pick(LEAF_PART_OPTIONS).value : 'none');
  const shape = { ...start, leafPart: pick(LEAF_PART_OPTIONS).value, leafPart2: extra(), leafPart3: 'none' as const, partMix: 0.2 + Math.random() * 0.4 };
  for (const key of Object.keys(SHAPE_GENE_RANGES) as NumericShapeGene[]) {
    const [min, max] = SHAPE_GENE_RANGES[key];
    shape[key] = Math.min(max, Math.max(min, start[key] * (0.5 + Math.random())));
  }
  shape.droop = Math.random() * 2 - 1; // up or down, either way
  const turn = () => Math.round(Math.random() * 120 - 60);
  const rolled: TreeGenes = { family, seed: Math.floor(Math.random() * 1e9), ...shape, hueTurn: Math.round(Math.random() * 360 - 180), leafOffset: turn(), trunkOffset: pick(harmonyOffsets) * pick([1, -1]), trunkTopOffset: turn(), tipTurn: turn() };
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
    varied[key] = nudge(current[key], min, max);
  }
  for (const key of ['hueTurn', 'leafOffset', 'trunkOffset', 'trunkTopOffset', 'tipTurn'] as const) varied[key] = Math.round(nudge(current[key] ?? 0, -180, 180));
  if (Math.random() < PART_CHANGE_CHANCE) varied.leafPart = pick(LEAF_PART_OPTIONS).value;
  if (Math.random() < PART_CHANGE_CHANCE) varied.leafPart2 = pick(LEAF_PART_OPTIONS).value;
  varied.seed = Math.floor(Math.random() * 1e9);
  return keepLeavesReadable(keepLocked(varied, current, locks));
}

export const DEFAULT_TREE_SPECIES: TreeSpecies[] = [{ id: 'species-1', name: 'Species 1', visible: true, genes: DEFAULT_TREE_GENES, locks: { shape: false, leaves: false, color: false } }];

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
  const leaves = options.leaves;
  leaves.count = Math.round(genes.leafCount);
  leaves.size = genes.leafSize;
  leaves.angle = genes.leafAngle;
  leaves.start = genes.family === 'crown' ? 0.93 : genes.family === 'fan' || genes.family === 'umbrella' ? 0.8 : 0.3;
  leaves.sizeVariance = 0.4; // leaves differ in size; each part also rolls its own proportions (trees/leafParts.ts)
  options.bark.textured = false; // our flat look replaces EZ-Tree's textures (trees/treeLook.ts)
}

import * as THREE from 'three';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import landLayersGlsl from '../shaders/terrain/landLayers.glsl?raw';
import treeVertexGlsl from '../shaders/trees/tree.vert.glsl?raw';
import treeFragmentBody from '../shaders/trees/tree.frag.glsl?raw';
import type { AlienTree } from './alienTree';
import { buildLeafPart, PartBuilder, seededRandom, type LeafPart } from './leafParts';
import { growth, individualTurn, treeColors, type TreeGenes } from './treeGenes';
import { applyFireflies, showAllFireflies, updateFireflies } from './treeLights';

// A tree's look (BIOME-PLAN.md, Trees): 3D leaf parts at EZ-Tree's leaf spots, a two-hue gradient on the canopy and
// on the trunk, toon shaded with the planet's own shade settings, a swollen trunk base.

export interface TreeLighting {
  lightDirection: THREE.Vector3;
  lightIntensity: number;
  ambient: number;
  diffuseWrap: number;
  shadeStep: number; // 0 turns the toon shade off
  shadeFeather: number;
  shadeLift: number;
  shadeChroma: number;
  shadeHueTurn: number; // degrees
}

const MAX_LEAF_PARTS = 3000; // keeps a rolled giant species drawable; more spots are thinned evenly. TUNABLE
const SHADE_JITTER = 0.16; // each leaf's brightness varies by this share, so leaves of one tree differ. TUNABLE
const NORMAL_BEND = 0.6; // how far leaf normals turn toward the canopy sphere's. TUNABLE
// Per-part color shows only while the tree is big on screen: camera distance in tree sizes (bounding radii), full
// detail nearer than NEAR, none past FAR, as LOD groups switch by screen size (Unity LODGroup). TUNABLE
const DETAIL_NEAR = 8;
const DETAIL_FAR = 16;

// Wind (GPU Gems 3 ch. 16, Crysis): a main bend of the whole tree and a detail bend of the leaves, both scaled by the
// Atmosphere's Wind. Each tree's own stiffness, from Dana's rule (2026-11-17): a small or young tree sways less than a
// tall one, a thick trunk barely sways, but its leaves always move. Amounts inferred, TUNABLE.
const WIND_DIRECTION = new THREE.Vector2(1, 0.35).normalize(); // no wind direction in the settings yet. TUNABLE
const MAIN_BEND = 0.04; // the tip's sway at full wind, as a share of the tree's height. TUNABLE
const MAX_LEAN = 0.25; // in high wind the tip moves at most this share of the tree's height (Crysis: limit it). TUNABLE
const HIGH_WIND_FROM = 8; // Beaufort force where the high-wind protections start blending in. TUNABLE
const HIGH_WIND_TO = 20; // and where they are fully on
const SLENDER_REF = 12; // height over trunk radius at which a tree bends fully; stouter trees bend less. TUNABLE
const LEAF_EDGE = 0.015; // leaf edge flutter at full wind, as a share of leaf size. TUNABLE
const LEAF_BOB = 0.06; // whole-leaf up and down at full wind, as a share of leaf size. TUNABLE
const BEAUFORT_MAX_SPEED = 0.836 * 12 ** 1.5; // m/s at force 12 (the Beaufort formula v = 0.836 B^1.5)

// The Beaufort force as a share of force 12's wind speed. Wind goes past 12 (to 40, Jupiter's jets): beyond force 12
// the response keeps rising but tapers (1 + log of the excess), so leaves don't fly apart. Taper inferred, TUNABLE.
export function windShare(beaufort: number): number {
  const share = (0.836 * Math.max(beaufort, 0) ** 1.5) / BEAUFORT_MAX_SPEED;
  return share <= 1 ? share : 1 + 0.5 * Math.log(share);
}

// Each frame: the clock and the wind, on both of a tree's materials.
export function updateTreeWind(tree: AlienTree, time: number, beaufort: number): void {
  const share = windShare(beaufort);
  const high = THREE.MathUtils.smoothstep(beaufort, HIGH_WIND_FROM, HIGH_WIND_TO);
  for (const mesh of [tree.branchesMesh, tree.leavesMesh]) {
    const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
    if (!uniforms?.uTime) continue;
    uniforms.uTime.value = time;
    uniforms.uWind.value = share;
    uniforms.uHighWind.value = high;
  }
  updateFireflies(tree, time);
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const fragmentShader = terrainGlsl + '\n' + landLayersGlsl + '\n' + treeFragmentBody;

// Which part a leaf takes: the main one, or with Mix's chance one of the extras, from its own seed so it repeats.
function partFor(seed: number, genes: TreeGenes): LeafPart {
  const extras = [genes.leafPart2, genes.leafPart3].filter((part): part is LeafPart => part !== 'none');
  if (extras.length === 0) return genes.leafPart;
  const random = seededRandom(seed ^ 0x9e3779b9);
  return random() < genes.partMix ? extras[Math.floor(random() * extras.length)] : genes.leafPart;
}

// Our leaf parts at every recorded spot, merged into one geometry.
function buildLeaves(tree: AlienTree, genes: TreeGenes): THREE.BufferGeometry {
  const builder = new PartBuilder();
  const spots = tree.leafSpots;
  const stride = Math.max(1, spots.length / MAX_LEAF_PARTS);
  const transform = new THREE.Matrix4();
  for (let index = 0; index < spots.length; index += stride) {
    const spot = spots[Math.floor(index)];
    const random = seededRandom(spot.seed);
    transform.compose(spot.origin, spot.orientation, new THREE.Vector3(1, 1, 1));
    builder.begin(transform, 1 + (random() - 0.5) * 2 * SHADE_JITTER, random());
    const up = WORLD_UP.clone().applyQuaternion(spot.orientation.clone().invert());
    buildLeafPart(builder, partFor(spot.seed, genes), spot.size, random, genes.leafAngle, genes.droop, spot.branchRadius, up);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute('aShade', new THREE.Float32BufferAttribute(builder.shades, 1));
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(builder.alongs, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(builder.phases, 1));
  geometry.setIndex(builder.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Pushes the trunk's lowest vertices outward from the trunk's axis, most at the ground, none above the swell's height.
function swellBase(geometry: THREE.BufferGeometry, genes: TreeGenes): void {
  if (genes.baseSwell <= 0) return;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const zone = genes.height * 0.3; // the lower 30% of the trunk. Inferred, TUNABLE
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y >= zone) continue;
    const scale = 1 + genes.baseSwell * (1 - y / zone) ** 2;
    position.setX(i, position.getX(i) * scale);
    position.setZ(i, position.getZ(i) * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function treeMaterial(isLeaf: boolean, colorA: THREE.Color, colorB: THREE.Color, lighting: TreeLighting, tipA = colorA, tipB = colorB): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: treeVertexGlsl,
    fragmentShader,
    side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uIsLeaf: { value: isLeaf ? 1 : 0 },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uTipColorA: { value: tipA },
      uTrunkColorA: { value: new THREE.Color() },
      uTrunkColorB: { value: new THREE.Color() },
      uTipColorB: { value: tipB },
      uTreeSize: { value: 1 },
      uGlow: { value: 0 },
      uTime: { value: 0 },
      uWind: { value: 0 },
      uWindDirection: { value: WIND_DIRECTION.clone() },
      uBendHeight: { value: 1 },
      uMainBend: { value: 0 },
      uMaxLean: { value: 0 },
      uLeafSize: { value: 1 },
      uHighWind: { value: 0 },
      uLeafEdge: { value: 0 },
      uLeafBob: { value: 0 },
      uDetailNear: { value: DETAIL_NEAR },
      uDetailFar: { value: DETAIL_FAR },
      uCanopyCenter: { value: new THREE.Vector3() },
      uCanopyRadius: { value: 1 },
      uCanopyBottom: { value: 0 },
      uCanopyTop: { value: 1 },
      uTrunkTop: { value: 1 },
      uNormalBend: { value: NORMAL_BEND },
      uLightDirection: { value: lighting.lightDirection.clone().normalize() },
      uLightIntensity: { value: lighting.lightIntensity },
      uDiffuseWrap: { value: lighting.diffuseWrap },
      uAmbient: { value: lighting.ambient },
      uFillColor: { value: new THREE.Color(1, 1, 1) },
      uShadeStep: { value: lighting.shadeStep },
      uShadeFeather: { value: lighting.shadeFeather },
      uShadeLift: { value: lighting.shadeLift },
      uShadeChroma: { value: lighting.shadeChroma },
      uShadeHueTurn: { value: lighting.shadeHueTurn / 360 },
    },
  });
}

// The Tree view tunes species, so it always shows the close-up detail, however small the trees are on screen.
export function showFullDetail(tree: AlienTree): void {
  const uniforms = (tree.leavesMesh.material as THREE.ShaderMaterial).uniforms;
  uniforms.uDetailNear.value = 1e9;
  uniforms.uDetailFar.value = 2e9;
  showAllFireflies(tree);
}

// Replaces a freshly generated tree's leaves with our parts and both materials with the toon gradient shader.
export function applyTreeLook(tree: AlienTree, genes: TreeGenes, landColor: string, lighting: TreeLighting): void {
  const colors = treeColors({ ...genes, hueTurn: genes.hueTurn + individualTurn(genes) }, landColor); // this individual's colors
  const branches = tree.branchesMesh;
  const leaves = tree.leavesMesh;
  (branches.material as THREE.Material).dispose();
  (leaves.material as THREE.Material).dispose();
  leaves.geometry.dispose();
  leaves.geometry = buildLeaves(tree, genes);
  swellBase(branches.geometry, genes);
  branches.geometry.computeBoundingBox();

  const trunkMaterial = treeMaterial(false, colors.trunkBase, colors.trunkTop, lighting);
  trunkMaterial.uniforms.uTrunkTop.value = Math.max(branches.geometry.boundingBox?.max.y ?? 1, 1e-3);
  const leafMaterial = treeMaterial(true, colors.canopyInner, colors.canopyOuter, lighting, colors.tipInner, colors.tipOuter);
  leafMaterial.uniforms.uTrunkColorA.value = colors.trunkBase;
  leafMaterial.uniforms.uTrunkColorB.value = colors.trunkTop;
  leafMaterial.uniforms.uTrunkTop.value = trunkMaterial.uniforms.uTrunkTop.value;
  const canopy = leaves.geometry.boundingBox;
  if (canopy && !canopy.isEmpty()) {
    const sphere = canopy.getBoundingSphere(new THREE.Sphere());
    leafMaterial.uniforms.uCanopyCenter.value.copy(sphere.center);
    leafMaterial.uniforms.uCanopyRadius.value = sphere.radius;
    leafMaterial.uniforms.uCanopyBottom.value = canopy.min.y;
    leafMaterial.uniforms.uCanopyTop.value = canopy.max.y;
    const whole = canopy.clone().union(branches.geometry.boundingBox ?? canopy);
    leafMaterial.uniforms.uTreeSize.value = Math.max(whole.getBoundingSphere(new THREE.Sphere()).radius, 1e-3);
  }
  // Both materials bend the same way, so leaves stay on their branches.
  const height = Math.max(trunkMaterial.uniforms.uTrunkTop.value, leaves.geometry.boundingBox?.max.y ?? 0, 1e-3);
  const stiffness = THREE.MathUtils.clamp(genes.height / Math.max(genes.trunkRadius, 1e-3) / SLENDER_REF, 0.15, 1.5);
  for (const material of [trunkMaterial, leafMaterial]) {
    material.uniforms.uBendHeight.value = 1 / height;
    material.uniforms.uMainBend.value = MAIN_BEND * height * stiffness;
    material.uniforms.uMaxLean.value = MAX_LEAN * height;
    material.uniforms.uLeafSize.value = genes.leafSize;
    material.uniforms.uLeafEdge.value = LEAF_EDGE * genes.leafSize;
    material.uniforms.uLeafBob.value = LEAF_BOB * genes.leafSize;
  }
  // Glow and fireflies grow with the tree; both in the tips' hue.
  leafMaterial.uniforms.uGlow.value = (genes.glow ?? 0) * growth(genes);
  const lightColor = colors.tipOuter.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
  applyFireflies(tree, genes, lightColor, leafMaterial.uniforms.uTreeSize.value, DETAIL_NEAR, DETAIL_FAR);
  branches.material = trunkMaterial;
  leaves.material = leafMaterial;
}

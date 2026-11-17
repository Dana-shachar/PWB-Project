import * as THREE from 'three';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import landLayersGlsl from '../shaders/terrain/landLayers.glsl?raw';
import treeVertexGlsl from '../shaders/trees/tree.vert.glsl?raw';
import treeFragmentBody from '../shaders/trees/tree.frag.glsl?raw';
import type { AlienTree } from './alienTree';
import { buildLeafPart, PartBuilder, seededRandom, type LeafPart } from './leafParts';
import { treeColors, type TreeGenes } from './treeGenes';

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
    builder.begin(transform, 1 + (random() - 0.5) * 2 * SHADE_JITTER);
    buildLeafPart(builder, partFor(spot.seed, genes), spot.size, random, genes.leafAngle, genes.droop);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute('aShade', new THREE.Float32BufferAttribute(builder.shades, 1));
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

function treeMaterial(isLeaf: boolean, colorA: THREE.Color, colorB: THREE.Color, lighting: TreeLighting): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: treeVertexGlsl,
    fragmentShader,
    side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uIsLeaf: { value: isLeaf ? 1 : 0 },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
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

// Replaces a freshly generated tree's leaves with our parts and both materials with the toon gradient shader.
export function applyTreeLook(tree: AlienTree, genes: TreeGenes, landColor: string, lighting: TreeLighting): void {
  const colors = treeColors(genes, landColor);
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
  const leafMaterial = treeMaterial(true, colors.canopyInner, colors.canopyOuter, lighting);
  const canopy = leaves.geometry.boundingBox;
  if (canopy && !canopy.isEmpty()) {
    const sphere = canopy.getBoundingSphere(new THREE.Sphere());
    leafMaterial.uniforms.uCanopyCenter.value.copy(sphere.center);
    leafMaterial.uniforms.uCanopyRadius.value = sphere.radius;
    leafMaterial.uniforms.uCanopyBottom.value = canopy.min.y;
    leafMaterial.uniforms.uCanopyTop.value = canopy.max.y;
  }
  branches.material = trunkMaterial;
  leaves.material = leafMaterial;
}

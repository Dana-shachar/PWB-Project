import * as THREE from 'three';
import type { AlienTree } from './alienTree';
import { FIREFLIES_MAX, growth, type TreeGenes } from './treeGenes';
import { seededRandom } from './leafParts';

// Fireflies: soft glowing points drifting around a canopy, as three.js Points with additive blending and no depth
// writes (the threejs-fireflies and points-sprites method, REFERENCES.md). Their number grows with the tree; they show
// only near the camera, like the tip color. Sizes and drift inferred, TUNABLE.
const DRIFT = 0.6; // how far each drifts from its spot, as a share of leaf size
const POINT_SIZE = 0.35; // world size, as a share of leaf size

const vertexShader = `
uniform float uTime;
uniform float uDrift;
uniform float uSize;
uniform float uTreeSize;
uniform float uDetailNear;
uniform float uDetailFar;
attribute float aSeed;
varying float vAlpha;
void main() {
  float phase = aSeed * 6.2832;
  vec3 drift = vec3(sin(uTime * 0.37 + phase), sin(uTime * 0.29 + phase * 1.7) * 0.6, cos(uTime * 0.31 + phase * 2.3));
  vec4 world = modelMatrix * vec4(position + drift * uDrift, 1.0);
  vec4 view = viewMatrix * world;
  gl_Position = projectionMatrix * view;
  gl_PointSize = uSize * projectionMatrix[1][1] * 300.0 / max(-view.z, 1e-3);
  float sizes = length(view.xyz) / max(uTreeSize, 1e-3);
  float near = 1.0 - smoothstep(uDetailNear, uDetailFar, sizes);
  vAlpha = near * (0.55 + 0.45 * sin(uTime * 1.3 + phase * 3.0)); // a slow pulse each
}`;

const fragmentShader = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float glow = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uColor * glow * vAlpha, 1.0);
}`;

const FIREFLY_NAME = 'fireflies';

// Replaces a tree's fireflies (none when the gene is 0), seeded from its leaf spots so they gather around the canopy.
export function applyFireflies(tree: AlienTree, genes: TreeGenes, color: THREE.Color, treeSize: number, detailNear: number, detailFar: number): void {
  const old = tree.getObjectByName(FIREFLY_NAME) as THREE.Points | undefined;
  if (old) {
    tree.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
  }
  const count = Math.round(Math.min(genes.fireflies ?? 0, FIREFLIES_MAX) * growth(genes));
  const spots = tree.leafSpots;
  if (count <= 0 || spots.length === 0) return;
  const random = seededRandom(genes.seed ^ 0x27d4eb2f);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const spot = spots[Math.floor(random() * spots.length)];
    positions[i * 3] = spot.origin.x + (random() - 0.5) * genes.leafSize;
    positions[i * 3 + 1] = spot.origin.y + (random() - 0.2) * genes.leafSize;
    positions[i * 3 + 2] = spot.origin.z + (random() - 0.5) * genes.leafSize;
    seeds[i] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uDrift: { value: DRIFT * genes.leafSize },
      uSize: { value: POINT_SIZE * genes.leafSize },
      uColor: { value: color.clone() },
      uTreeSize: { value: treeSize },
      uDetailNear: { value: detailNear },
      uDetailFar: { value: detailFar },
    },
  });
  const points = new THREE.Points(geometry, material);
  points.name = FIREFLY_NAME;
  points.frustumCulled = false; // they drift past the cloud's bounds; few enough to always submit
  tree.add(points);
}

// Each frame, with the wind's clock.
export function updateFireflies(tree: AlienTree, time: number): void {
  const points = tree.getObjectByName(FIREFLY_NAME) as THREE.Points | undefined;
  if (points) (points.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
}

// The Tree view tunes species, so its fireflies show however small the trees are on screen.
export function showAllFireflies(tree: AlienTree): void {
  const points = tree.getObjectByName(FIREFLY_NAME) as THREE.Points | undefined;
  if (!points) return;
  const uniforms = (points.material as THREE.ShaderMaterial).uniforms;
  uniforms.uDetailNear.value = 1e9;
  uniforms.uDetailFar.value = 2e9;
}

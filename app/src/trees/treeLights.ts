import * as THREE from 'three';
import { BLOOM_LAYER } from './treeBloom';
import type { AlienTree } from './alienTree';
import { FIREFLIES_MAX, growth, type TreeGenes } from './treeGenes';
import { seededRandom } from './leafParts';

// Fireflies: soft glowing points drifting around a canopy, as three.js Points with additive blending and no depth
// writes (the threejs-fireflies and points-sprites method, REFERENCES.md). Their number grows with the tree; they show
// only near the camera, like the tip color. Sizes and drift inferred, TUNABLE.
const DRIFT = 0.6; // how far each drifts from its spot, as a share of leaf size
const POINT_SIZE = 0.35; // world size, as a share of leaf size, for a firefly of size 1
const HUE_SPREAD = 20; // each firefly turns the light's hue by up to ± this many degrees
const RATE_MIN = 0.6; // pulse speeds, radians per second: each its own
const RATE_MAX = 2.2;
const OUTSIDE_SHARE = 0.67; // share floating just outside the canopy; the rest glint among the leaves. TUNABLE
const SHELL_MIN = 0.85; // outside ones sit this many canopy radii from its center, up to SHELL_MAX. TUNABLE
const SHELL_MAX = 1.1;

const vertexShader = `
uniform float uTime;
uniform float uDrift;
uniform float uSize;
uniform float uTreeSize;
uniform float uDetailNear;
uniform float uDetailFar;
attribute float aSeed;
attribute float aSize; // half to double, mostly small
attribute float aHue; // this one's hue turn, radians
attribute float aRate; // its own pulse speed
varying float vPulse;
varying float vNear;
varying float vHue;
void main() {
  float phase = aSeed * 6.2832;
  vec3 drift = vec3(sin(uTime * 0.37 + phase), sin(uTime * 0.29 + phase * 1.7) * 0.6, cos(uTime * 0.31 + phase * 2.3));
  vec4 world = modelMatrix * vec4(position + drift * uDrift, 1.0);
  vec4 view = viewMatrix * world;
  gl_Position = projectionMatrix * view;
  // The pulse is the opacity: each fades from faint to full at its own speed, dim more often than bright.
  float wave = 0.5 + 0.5 * sin(uTime * aRate + phase * 3.0);
  vPulse = wave * wave;
  gl_PointSize = uSize * aSize * (0.85 + 0.3 * vPulse) * projectionMatrix[1][1] * 300.0 / max(-view.z, 1e-3);
  float sizes = length(view.xyz) / max(uTreeSize, 1e-3);
  vNear = 1.0 - smoothstep(uDetailNear, uDetailFar, sizes);
  vHue = aHue;
}`;

// A bright core with a soft inverse-distance halo (the usual shader glow), its color turned per firefly about the gray
// axis (a hue rotation), so they read as one family, not copies.
const fragmentShader = `
uniform vec3 uColor;
varying float vPulse;
varying float vNear;
varying float vHue;
vec3 hueRotate(vec3 color, float angle) {
  const vec3 axis = vec3(0.57735);
  float c = cos(angle);
  return color * c + cross(axis, color) * sin(angle) + axis * dot(axis, color) * (1.0 - c);
}
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0; // 0 at the center, 1 at the edge
  if (d > 1.0) discard;
  float core = smoothstep(0.22, 0.0, d);
  float halo = (0.2 / (d + 0.2) - 0.2 / 1.2) * (1.0 - d * d);
  float light = (core * 0.8 + halo * 1.6) * mix(0.1, 1.0, vPulse) * vNear;
  vec3 color = mix(hueRotate(uColor, vHue), vec3(1.0), core * 0.25); // the core whitens a little toward its center
  gl_FragColor = vec4(color * light, 1.0);
}`;

const FIREFLY_NAME = 'fireflies';

// Replaces a tree's fireflies (none when the gene is 0), seeded from its leaf spots so they gather around the canopy.
export function applyFireflies(tree: AlienTree, genes: TreeGenes, color: THREE.Color, canopy: THREE.Box3, treeSize: number, detailNear: number, detailFar: number): void {
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
  // The canopy as an ellipsoid from its box (a sphere around a wide, flat crown reaches far above and below it).
  const center = canopy.getCenter(new THREE.Vector3());
  const half = canopy.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(1e-3, 1e-3, 1e-3));
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const hues = new Float32Array(count);
  const rates = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const spot = spots[Math.floor(random() * spots.length)];
    const point = new THREE.Vector3(spot.origin.x + (random() - 0.5) * genes.leafSize, spot.origin.y + (random() - 0.2) * genes.leafSize, spot.origin.z + (random() - 0.5) * genes.leafSize);
    if (random() < OUTSIDE_SHARE && !canopy.isEmpty()) {
      // Toward its spot but just outside the canopy's ellipsoid, so chunky crowns don't swallow it; never underground.
      const out = point.clone().sub(center).divide(half);
      if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
      out.normalize().multiplyScalar(SHELL_MIN + random() * (SHELL_MAX - SHELL_MIN)).multiply(half);
      point.copy(center).add(out);
      point.y = Math.max(point.y, 0.2 * genes.leafSize);
    }
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    seeds[i] = random();
    sizes[i] = 0.5 + 1.5 * random() ** 2; // half to double, mostly small
    hues[i] = THREE.MathUtils.degToRad((random() * 2 - 1) * HUE_SPREAD);
    rates[i] = RATE_MIN + random() * (RATE_MAX - RATE_MIN);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));
  geometry.setAttribute('aRate', new THREE.BufferAttribute(rates, 1));
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
  points.layers.enable(BLOOM_LAYER);
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

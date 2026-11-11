import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import quadVertexGlsl from '../shaders/heightmap/heightmapBrush.vert.glsl?raw';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import noiseGlsl from '../shaders/heightmap/noise.glsl?raw';
import landLayersGlsl from '../shaders/terrain/landLayers.glsl?raw';
import hazeGlsl from '../shaders/atmosphere/haze.glsl?raw';
import rockShadowsGlsl from '../shaders/props/rockShadows.glsl?raw';
import densityGlsl from '../shaders/props/rockDensity.frag.glsl?raw';
import rockVertexBody from '../shaders/props/rock.vert.glsl?raw';
import rockFragmentBody from '../shaders/props/rock.frag.glsl?raw';
import { readRenderTargetAsync } from '../map/heightmap';
import { seededRandom } from '../biome/plantTypes';
import { PATCH_BORDER_TEXELS } from '../planet/patch';
import type { ShownChunkPatch } from '../voxel/ChunkPatchRenderer';
import type { PropSettings } from './propSettings';

// Rocks on the land chunk, per shown patch (voxel/ChunkPatchRenderer.ts), as engines place props per terrain tile
// (Horizon Zero Dawn, Van Muijden GDC 2017; Unreal's foliage per landscape component): each patch gets a density map
// from its own bake (rockDensity.frag.glsl), dithered into rocks on the CPU and set on the patch's own heights. A patch
// keeps only rocks big enough to see from it; a nearer, finer patch adds the smaller ones.
const ROCK_PATCH_GRID = 64; // density cells per patch side. TUNABLE
const DENSITY_PASSES_PER_FRAME = 4;
const GENERATE_MS_PER_FRAME = 4; // rock generation spreads over frames past this, as the ground patches' build budget does. TUNABLE

// Shapes: convex hulls around random points (three.js ConvexGeometry), a few families by how the points spread.
const SHAPE_FAMILIES: { extent: [number, number, number]; round: boolean }[] = [
  { extent: [1, 0.75, 0.9], round: false }, // blocks
  { extent: [1, 0.4, 0.85], round: false }, // slabs
  { extent: [0.65, 1, 0.6], round: false }, // pillars
  { extent: [1, 0.8, 0.9], round: true }, // cobbles
];
const SHAPES_PER_FAMILY = 2;
const SHAPE_COUNT = SHAPE_FAMILIES.length * SHAPES_PER_FAMILY;
const HULL_POINTS = [8, 20];
const FLAT_BASE_SHARE = 0.2; // of a rock's height cut flat at its base. TUNABLE // few points cut chunky, many round. TUNABLE

// Counts per square meter at full density and amount 1, and sizes in meters drawn from a power law, many more small than
// large (N(>D) ~ D^-3, boulder surveys). The largest boulder is a setting. TUNABLE
const BOULDERS_PER_M2 = 3 / 100;
const SMALL_PER_M2 = 1.2;
const SHORE_PER_M2 = 2.5;
// Rocks scale with the landscape: sizes multiply, and counts per area divide by its square, by the terrain's height
// scale against this reference, so small rocks read from the eye heights a big, tall world needs. TUNABLE
const REFERENCE_HEIGHT = 5;
const SMALLEST_BOULDER = 1;
const SMALL_SIZE = [0.15, 0.7];
// Small rocks gather around boulders as a Thomas cluster process (Neyman-Scott: parents, children spread around each by
// a normal distribution): CLUSTER_SHARE of small rocks around boulders, the rest scattered in the field. TUNABLE
const CLUSTER_SHARE = 0.7;
const CLUSTER_SPREAD = 1.5; // the children's spread, in boulder sizes
const MIN_PIXELS = 2; // a rock is kept where it would cover this many pixels (rock.vert.glsl fades it below)
// Unreal's foliage placement: Z Offset (sunk into the ground) and Align to Normal (tilted with the slope). TUNABLE
const SINK_SHARE = 0.1;
const TILT_SHARE = 0.5;
const MAX_ROCKS = 15000; // drawn at once, nearest patches first. TUNABLE, to fit measured counts
const MAX_PATCH_ROCKS = 5000; // per patch, so a far patch can't crowd out near ones

export interface RockGround {
  chunkHeightMap: THREE.Texture;
  heightMapGreenChannel: boolean;
  lakeLevels: THREE.Texture;
  seaLevel: number; // raw
  maxHeight: number; // world units per raw unit
  heightBase: number;
  chunkSize: number;
  elevationMin: number; // raw, the land's range
  elevationMax: number;
  // The drawn ground at chunk point (x, z) (ChunkPatchRenderer.sampleGround), so rocks sit on what is drawn.
  sampleGround: (x: number, z: number) => { height: number; normal: THREE.Vector3 } | null;
}

interface Rock {
  id: number; // unique, so a redraw can tell whether the drawn set changed
  shape: number;
  matrix: THREE.Matrix4;
  center: THREE.Vector3;
  size: number; // world units, its longest side
  hue: number;
  brightness: number;
  raw: number;
}

interface PatchRocks {
  bakeCount: number;
  densityKey: string; // the ground and settings its density was made with
  density: Float32Array | null;
  pending: boolean;
  lowestBand: number; // the smallest size band generated, by the patch's distance
  active: boolean; // in view and within the draw distance: only these get rocks and are drawn
  layoutKey: string;
  rocks: Rock[];
  distance: number;
}

function hullShape(random: () => number, family: (typeof SHAPE_FAMILIES)[number]): THREE.BufferGeometry {
  const count = Math.round(HULL_POINTS[0] + random() * (HULL_POINTS[1] - HULL_POINTS[0]));
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const point = family.round
      ? new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize().multiplyScalar(0.5 * (0.85 + 0.15 * random()))
      : new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5);
    points.push(point.multiply(new THREE.Vector3(...family.extent)));
  }
  // A flat base: the lowest points pressed into one plane, so the rock rests on a face. TUNABLE
  const lowest = Math.min(...points.map((point) => point.y));
  const highest = Math.max(...points.map((point) => point.y));
  const baseLevel = lowest + FLAT_BASE_SHARE * (highest - lowest);
  for (const point of points) point.y = Math.max(point.y, baseLevel);
  const geometry = new ConvexGeometry(points);
  // Centered, its longest side 1, so an instance's scale is its size.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z, 1e-6);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  return geometry;
}

// Size bands that double (band k starts at 2^k times the smallest small rock), each drawn from its own seeded numbers,
// so a nearer patch adds smaller bands and the big rocks already there stay put. The share of a power law in [from, to).
function bandShare(lo: number, hi: number, from: number, to: number): number {
  const a = Math.max(lo, from);
  const b = Math.min(hi, to);
  return b <= a ? 0 : (a ** -3 - b ** -3) / (lo ** -3 - hi ** -3);
}
// A size between a and b by the power law's inverse.
function sizeBetween(random: () => number, a: number, b: number): number {
  return (a ** -3 - random() * (a ** -3 - b ** -3)) ** (-1 / 3);
}

// The raw height at chunk uv (u, v) from a patch's CPU heights, bilinear (ChunkPatchRenderer.sampleHeight's mapping).
function patchRaw(patch: ShownChunkPatch, u: number, v: number): number {
  const { data, size } = patch.heights!;
  const { minU, minV, maxU, maxV } = patch.fractions;
  const tx = Math.min(size - 1.001, Math.max(0, PATCH_BORDER_TEXELS + ((u - minU) / (maxU - minU)) * (patch.samples - 1)));
  const ty = Math.min(size - 1.001, Math.max(0, PATCH_BORDER_TEXELS + ((v - minV) / (maxV - minV)) * (patch.samples - 1)));
  const x0 = Math.floor(tx);
  const y0 = Math.floor(ty);
  const bx = tx - x0;
  const by = ty - y0;
  const at = (col: number, row: number) => data[row * size + col];
  return (at(x0, y0) * (1 - bx) + at(x0 + 1, y0) * bx) * (1 - by) + (at(x0, y0 + 1) * (1 - bx) + at(x0 + 1, y0 + 1) * bx) * by;
}

let nextRockId = 1;

export class RockScatter {
  group = new THREE.Group();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private densityMaterial: THREE.ShaderMaterial;
  private densityTarget = new THREE.WebGLRenderTarget(ROCK_PATCH_GRID, ROCK_PATCH_GRID, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  private patches = new Map<string, PatchRocks>();
  private meshes: THREE.InstancedMesh[];
  private materials: THREE.ShaderMaterial[] = [];
  private shapeSeed = -1;
  // Each shape's real bottom and height after scaling (its longest side is 1), for sinking it by its own base.
  private shapeBottoms = new Array<number>(SHAPE_COUNT).fill(-0.5);
  private shapeHeights = new Array<number>(SHAPE_COUNT).fill(1);
  private hueTurn = { value: -40 };
  private hueRange = { value: 80 };
  private saturation = { value: 0.5 };
  private pixelsPerUnit = { value: 1000 };
  private drawDistance = { value: 20 };
  private frustum = new THREE.Frustum();
  private viewMatrix = new THREE.Matrix4();
  private box = new THREE.Box3();
  private dirty = false;
  version = 0; // counts changes to the set of drawn rocks, so the sun's shadow map redraws only then
  private drawnSignature = '';
  private worldScale = { value: 1 };
  private lastFill = new THREE.Vector3(Infinity, 0, 0);

  // shared: the chunk material's uniforms, so the rocks follow its light, ramp, haze and shadows.
  constructor(shared: Record<string, THREE.IUniform>) {
    this.densityMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertexGlsl,
      fragmentShader: terrainGlsl + '\n' + noiseGlsl + '\n' + densityGlsl,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPatchHeightMap: { value: null },
        uPatchSamples: { value: 64 },
        uPatchBorder: { value: PATCH_BORDER_TEXELS },
        uPatchUvMin: { value: new THREE.Vector2() },
        uPatchUvMax: { value: new THREE.Vector2(1, 1) },
        uChunkHeightMap: { value: null },
        uHeightMapGreenChannel: { value: 0 },
        uChunkLakeLevels: { value: null },
        uSeaLevel: { value: 0 },
        uMaxHeight: { value: 1 },
        uChunkSize: { value: 1 },
        uElevationMin: { value: 0 },
        uElevationMax: { value: 1 },
        uReachTan: { value: Math.tan(THREE.MathUtils.degToRad(30)) },
        uPatchiness: { value: 0.7 },
        uSeed: { value: 1 },
        uWorldScale: { value: 1 },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.densityMaterial));

    const vertexShader = noiseGlsl + '\n' + rockVertexBody;
    const fragmentShader = terrainGlsl + '\n' + noiseGlsl + '\n' + landLayersGlsl + '\n' + hazeGlsl + '\n' + rockShadowsGlsl + '\n' + rockFragmentBody;
    const capacity = Math.ceil((MAX_ROCKS / SHAPE_COUNT) * 2);
    this.meshes = Array.from({ length: SHAPE_COUNT }, (_, index) => {
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        lights: true, // three.js's shadow uniforms (shared with the chunk material)
        uniforms: { ...shared, uShapeSeed: { value: index + 1 }, uShapeBottom: { value: -0.5 }, uHueTurn: this.hueTurn, uHueRange: this.hueRange, uRockSaturation: this.saturation, uPixelsPerUnit: this.pixelsPerUnit, uDrawDistance: this.drawDistance, uWorldScale: this.worldScale },
      });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), material, capacity);
      // Casts into the sun's shadow map with its own vertex shader, so the shadow has the rock's noisy shape.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }', uniforms: material.uniforms });
      this.materials.push(mesh.customDepthMaterial as THREE.ShaderMaterial);
      mesh.geometry.setAttribute('aRock', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
      mesh.count = 0;
      mesh.frustumCulled = false; // the rocks spread over many patches, past one shape's bounds
      mesh.renderOrder = 2;
      this.group.add(mesh);
      return mesh;
    });
  }

  // Each frame, with the shown patches: makes density maps for new or re-baked patches (a few a frame), rocks for those
  // whose heights have arrived, and redraws when anything changed.
  update(renderer: THREE.WebGLRenderer, patches: ShownChunkPatch[], ground: RockGround, camera: THREE.PerspectiveCamera, viewHeightPixels: number, settings: PropSettings): void {
    this.group.visible = settings.enabled;
    this.hueTurn.value = settings.hueTurn;
    this.hueRange.value = settings.hueRange;
    this.saturation.value = settings.saturation;
    this.pixelsPerUnit.value = viewHeightPixels / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.drawDistance.value = settings.drawDistance;
    this.viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewMatrix);
    if (settings.seed !== this.shapeSeed) this.buildShapes(settings.seed);
    if (!settings.enabled) return;
    this.worldScale.value = Math.max(ground.maxHeight / REFERENCE_HEIGHT, 1e-3);

    const densityKey = JSON.stringify([ground.chunkHeightMap.uuid, ground.chunkHeightMap.version, ground.lakeLevels.version, ground.seaLevel, ground.maxHeight, ground.chunkSize, ground.elevationMin, ground.elevationMax, settings.reach, settings.patchiness, settings.seed]);
    const layoutKey = JSON.stringify([settings.boulders, settings.smallRocks, settings.shoreRocks, settings.size, settings.largestBoulder, settings.seed, ground.heightBase, this.worldScale.value]);
    const shownKeys = new Set(patches.map((patch) => patch.key));
    for (const key of [...this.patches.keys()]) {
      if (!shownKeys.has(key)) {
        this.patches.delete(key);
        this.dirty = true;
      }
    }
    let passes = 0;
    const frameStart = performance.now();
    for (const patch of patches) {
      let state = this.patches.get(patch.key);
      if (!state || state.bakeCount !== patch.bakeCount) {
        state = { bakeCount: patch.bakeCount, densityKey: '', density: null, pending: false, lowestBand: Infinity, active: false, layoutKey: '', rocks: [], distance: 0 };
        this.patches.set(patch.key, state);
        this.dirty = true;
      }
      state.distance = this.patchDistance(patch, ground, camera);
      // Only patches in view and within the draw distance get rocks (and their placement work).
      const { minU, minV, maxU, maxV } = patch.fractions;
      this.box.min.set((minU - 0.5) * ground.chunkSize, 0, (minV - 0.5) * ground.chunkSize);
      this.box.max.set((maxU - 0.5) * ground.chunkSize, Math.max(ground.maxHeight * 2, 1e-3), (maxV - 0.5) * ground.chunkSize);
      const active = state.distance < settings.drawDistance && this.frustum.intersectsBox(this.box);
      if (active !== state.active) {
        state.active = active;
        this.dirty = true;
        if (!active) {
          state.rocks = []; // freed; made again when it comes back into view
          state.layoutKey = '';
        }
      }
      if (!active) continue;
      if (state.densityKey !== densityKey && !state.pending && passes < DENSITY_PASSES_PER_FRAME) {
        passes++;
        this.makeDensity(renderer, patch, ground, settings, state, densityKey);
      }
      if (!state.density || state.densityKey !== densityKey || !patch.heights) continue;
      const lowestBand = this.lowestBand(state.distance, settings);
      if ((state.layoutKey !== layoutKey || state.lowestBand !== lowestBand) && performance.now() - frameStart < GENERATE_MS_PER_FRAME) {
        state.layoutKey = layoutKey;
        state.lowestBand = lowestBand;
        state.rocks = this.generate(patch, ground, settings, state.density, lowestBand);
        this.dirty = true;
      }
    }
    // Redrawn when rocks changed or the eye moved a share of its distance to the nearest ground.
    let nearest = Infinity;
    for (const state of this.patches.values()) if (state.active) nearest = Math.min(nearest, state.distance);
    if (this.dirty || camera.position.distanceTo(this.lastFill) > Math.max(0.05 * nearest, 1e-4)) {
      this.dirty = false;
      this.lastFill.copy(camera.position);
      this.fill(camera.position);
    }
  }

  // The camera's distance to the patch's nearest point at the chunk's base height, world units.
  private patchDistance(patch: ShownChunkPatch, ground: RockGround, camera: THREE.PerspectiveCamera): number {
    const { minU, minV, maxU, maxV } = patch.fractions;
    const u = THREE.MathUtils.clamp(camera.position.x / ground.chunkSize + 0.5, minU, maxU);
    const v = THREE.MathUtils.clamp(camera.position.z / ground.chunkSize + 0.5, minV, maxV);
    const dx = (u - 0.5) * ground.chunkSize - camera.position.x;
    const dz = (v - 0.5) * ground.chunkSize - camera.position.z;
    // Height above the patch's own ground there (its CPU heights; level with the eye until they arrive).
    const groundY = patch.heights ? Math.max(0, patchRaw(patch, u, v) + ground.heightBase) * ground.maxHeight : camera.position.y;
    return Math.hypot(dx, dz, camera.position.y - groundY);
  }

  // The smallest size band (in doublings above the smallest small rock) that still covers MIN_PIXELS from here.
  private lowestBand(distance: number, settings: PropSettings): number {
    const minMeters = (((MIN_PIXELS * distance) / Math.max(this.pixelsPerUnit.value, 1e-6)) * 1000) / Math.max(settings.size * this.worldScale.value, 1e-6);
    return Math.max(0, Math.floor(Math.log2(Math.max(minMeters, 1e-6) / SMALL_SIZE[0])));
  }

  private makeDensity(renderer: THREE.WebGLRenderer, patch: ShownChunkPatch, ground: RockGround, settings: PropSettings, state: PatchRocks, densityKey: string): void {
    const u = this.densityMaterial.uniforms;
    u.uPatchHeightMap.value = patch.texture;
    u.uPatchSamples.value = patch.samples;
    (u.uPatchUvMin.value as THREE.Vector2).set(patch.fractions.minU, patch.fractions.minV);
    (u.uPatchUvMax.value as THREE.Vector2).set(patch.fractions.maxU, patch.fractions.maxV);
    u.uChunkHeightMap.value = ground.chunkHeightMap;
    u.uHeightMapGreenChannel.value = ground.heightMapGreenChannel ? 1 : 0;
    u.uChunkLakeLevels.value = ground.lakeLevels;
    u.uSeaLevel.value = ground.seaLevel;
    u.uMaxHeight.value = ground.maxHeight;
    u.uChunkSize.value = ground.chunkSize;
    u.uElevationMin.value = ground.elevationMin;
    u.uElevationMax.value = ground.elevationMax;
    u.uReachTan.value = Math.tan(THREE.MathUtils.degToRad(settings.reach));
    u.uPatchiness.value = settings.patchiness;
    u.uSeed.value = settings.seed % 1000;
    u.uWorldScale.value = this.worldScale.value;
    renderer.setRenderTarget(this.densityTarget);
    renderer.clear(); // the shared renderer has autoClear off
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    state.pending = true;
    const bakeCount = state.bakeCount;
    // The read is queued now, so the one target is free for the next patch at once.
    void readRenderTargetAsync(renderer, this.densityTarget).then((density) => {
      state.pending = false;
      if (state.bakeCount !== bakeCount) return;
      state.density = density;
      state.densityKey = densityKey;
      state.layoutKey = ''; // regenerate its rocks
    });
  }

  private buildShapes(seed: number): void {
    this.shapeSeed = seed;
    const random = seededRandom(seed * 7919 + 13);
    const shapes = SHAPE_FAMILIES.flatMap((family) => Array.from({ length: SHAPES_PER_FAMILY }, () => hullShape(random, family)));
    this.meshes.forEach((mesh, index) => {
      const attribute = mesh.geometry.getAttribute('aRock');
      mesh.geometry.dispose();
      mesh.geometry = shapes[index];
      mesh.geometry.computeBoundingBox();
      this.shapeBottoms[index] = mesh.geometry.boundingBox!.min.y;
      this.shapeHeights[index] = mesh.geometry.boundingBox!.max.y - mesh.geometry.boundingBox!.min.y;
      (mesh.material as THREE.ShaderMaterial).uniforms.uShapeBottom.value = this.shapeBottoms[index];
      mesh.geometry.setAttribute('aRock', attribute);
      (mesh.material as THREE.ShaderMaterial).uniforms.uShapeSeed.value = (seed % 997) + index * 11 + 1;
    });
  }

  // Dithers the patch's density into rocks: per cell and size band, the expected count's whole part plus one more by
  // chance of the rest, from the cell's own seeded numbers.
  private generate(patch: ShownChunkPatch, ground: RockGround, settings: PropSettings, density: Float32Array, nearBand: number): Rock[] {
    const rocks: Rock[] = [];
    const { minU, minV, maxU, maxV } = patch.fractions;
    const cellMeters = (patch.worldSize * 1000) / ROCK_PATCH_GRID;
    const scale = this.worldScale.value;
    const cellArea = (cellMeters * cellMeters) / (scale * scale); // in rock-scaled square meters
    const chunkMeters = ground.chunkSize * 1000;
    const largest = Math.max(settings.largestBoulder, SMALLEST_BOULDER * 1.01);
    const place = (random: () => number, u: number, v: number, sizeMeters: number) => {
      const rock = this.placeRock(random, patch, ground, u, v, sizeMeters * settings.size * scale);
      if (rock) rocks.push(rock);
      return rock;
    };
    // One class over its size range: each doubling band with its own numbers, from the lowest kept band up.
    const spawnBands = (i: number, j: number, salt: number, expectedAll: number, lo: number, hi: number, onRock?: (u: number, v: number, size: number) => void) => {
      if (expectedAll <= 0) return;
      for (let band = Math.max(lowestBand, Math.floor(Math.log2(lo / SMALL_SIZE[0]))); SMALL_SIZE[0] * 2 ** band < hi; band++) {
        const from = SMALL_SIZE[0] * 2 ** band;
        const share = bandShare(lo, hi, from, from * 2);
        if (share <= 0) continue;
        const expected = expectedAll * share * thinning;
        const random = seededRandom(((i * 73856093) ^ (j * 19349663) ^ (settings.seed * 83492791) ^ (salt * 2654435761) ^ (band * 40503)) >>> 0);
        const count = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
        for (let k = 0; k < count && rocks.length < MAX_PATCH_ROCKS; k++) {
          const u = minU + ((i - baseI + random()) / ROCK_PATCH_GRID) * (maxU - minU);
          const v = minV + ((j - baseJ + random()) / ROCK_PATCH_GRID) * (maxV - minV);
          const size = sizeBetween(random, Math.max(lo, from), Math.min(hi, from * 2));
          if (place(random, u, v, size)) onRock?.(u, v, size);
        }
      }
    };
    // Over the patch's cap, the smallest sizes go first; only if the biggest alone are too many is every cell thinned.
    const expectedFrom = (band: number) => {
      const from = SMALL_SIZE[0] * 2 ** band;
      let total = 0;
      for (let cell = 0; cell < density.length; cell += 4) {
        total += density[cell] * cellArea * BOULDERS_PER_M2 * settings.boulders * bandShare(SMALLEST_BOULDER, largest, Math.max(from, SMALLEST_BOULDER), largest);
        if (from < SMALL_SIZE[1]) total += (density[cell + 1] * SMALL_PER_M2 * (1 - CLUSTER_SHARE) * settings.smallRocks + density[cell + 2] * SHORE_PER_M2 * settings.shoreRocks) * cellArea * bandShare(SMALL_SIZE[0], SMALL_SIZE[1], Math.max(from, SMALL_SIZE[0]), SMALL_SIZE[1]);
      }
      return total;
    };
    let lowestBand = nearBand;
    while (expectedFrom(lowestBand) > MAX_PATCH_ROCKS && SMALL_SIZE[0] * 2 ** (lowestBand + 1) < largest) lowestBand++;
    const lowestSize = SMALL_SIZE[0] * 2 ** lowestBand;
    const thinning = Math.min(1, MAX_PATCH_ROCKS / Math.max(expectedFrom(lowestBand), 1e-6));
    // The patch's cell index on the whole chunk, so each cell keeps its own numbers.
    const baseI = Math.round((minU * chunkMeters) / cellMeters);
    const baseJ = Math.round((minV * chunkMeters) / cellMeters);
    for (let j = 0; j < ROCK_PATCH_GRID; j++) {
      for (let i = 0; i < ROCK_PATCH_GRID; i++) {
        const cell = (j * ROCK_PATCH_GRID + i) * 4;
        const boulder = density[cell];
        const talus = density[cell + 1];
        const shore = density[cell + 2];
        spawnBands(baseI + i, baseJ + j, 1, boulder * cellArea * BOULDERS_PER_M2 * settings.boulders, SMALLEST_BOULDER, largest, (u, v, size) => {
          // The boulder's cluster of small rocks, spread by a normal distribution (Box-Muller), where small rocks show.
          if (lowestSize > SMALL_SIZE[1]) return;
          const random = seededRandom(((Math.round(u * 1e7) * 73856093) ^ (Math.round(v * 1e7) * 19349663) ^ 3) >>> 0);
          const mean = (CLUSTER_SHARE * SMALL_PER_M2 * settings.smallRocks) / Math.max(BOULDERS_PER_M2 * settings.boulders, 1e-6);
          const count = Math.round(mean * bandShare(SMALL_SIZE[0], SMALL_SIZE[1], Math.max(SMALL_SIZE[0], lowestSize), SMALL_SIZE[1]) * (0.5 + random()) * thinning);
          const spread = (size * settings.size * scale * CLUSTER_SPREAD) / chunkMeters;
          for (let k = 0; k < count && rocks.length < MAX_PATCH_ROCKS; k++) {
            const radius = spread * Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9)));
            const angle = random() * Math.PI * 2;
            place(random, u + Math.cos(angle) * radius, v + Math.sin(angle) * radius, sizeBetween(random, Math.max(SMALL_SIZE[0], lowestSize), SMALL_SIZE[1]));
          }
        });
        spawnBands(baseI + i, baseJ + j, 2, (talus * SMALL_PER_M2 * (1 - CLUSTER_SHARE) * settings.smallRocks + shore * SHORE_PER_M2 * settings.shoreRocks) * cellArea, SMALL_SIZE[0], SMALL_SIZE[1]);
      }
    }
    return rocks;
  }

  // A rock at chunk uv (u, v) on the patch's own heights: sunk and leaning with the slope (Unreal's Z Offset and Align
  // to Normal). Every number is drawn first, so a rock's look never depends on whether it is kept.
  private placeRock(random: () => number, patch: ShownChunkPatch, ground: RockGround, u: number, v: number, sizeMeters: number): Rock | null {
    const shape = Math.floor(random() * SHAPE_COUNT);
    const squash = 0.7 + 0.4 * random();
    const stretch = 0.85 + 0.3 * random();
    const turn = random() * Math.PI * 2;
    const hue = random();
    const brightness = random();
    const { minU, minV, maxU, maxV } = patch.fractions;
    if (u < minU || v < minV || u > maxU || v > maxV) return null;
    const rawAt = (fu: number, fv: number) => patchRaw(patch, fu, fv);
    const raw = rawAt(u, v);
    // The slope over one texel of the bake, in world units.
    const stepUv = (maxU - minU) / Math.max(patch.samples - 1, 1);
    const stepWorld = stepUv * ground.chunkSize;
    const dhdx = ((rawAt(u + stepUv, v) - rawAt(u - stepUv, v)) * ground.maxHeight) / (2 * stepWorld);
    const dhdz = ((rawAt(u, v + stepUv) - rawAt(u, v - stepUv)) * ground.maxHeight) / (2 * stepWorld);
    const drawn = ground.sampleGround((u - 0.5) * ground.chunkSize, (v - 0.5) * ground.chunkSize);
    const normal = drawn ? drawn.normal.clone() : new THREE.Vector3(-dhdx, 1, -dhdz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const lean = up.clone().lerp(normal, TILT_SHARE).normalize();
    const leftover = lean.angleTo(normal);
    const sizeWorld = sizeMeters / 1000;
    const height = sizeWorld * squash;
    const radius = 0.5 * sizeWorld * Math.max(stretch, 1);
    // The center above the ground along the lean; the slope left after leaning sinks the low side more.
    // From the shape's real base: its bottom at the ground, then sunk by a share of its real height.
    const lift = -this.shapeBottoms[shape] * height - SINK_SHARE * this.shapeHeights[shape] * height - radius * Math.tan(leftover);
    const groundPoint = new THREE.Vector3((u - 0.5) * ground.chunkSize, drawn ? drawn.height : Math.max(0, raw + ground.heightBase) * ground.maxHeight, (v - 0.5) * ground.chunkSize);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, lean).multiply(new THREE.Quaternion().setFromAxisAngle(up, turn));
    const matrix = new THREE.Matrix4().compose(groundPoint.addScaledVector(lean, lift), rotation, new THREE.Vector3(sizeWorld * stretch, height, sizeWorld));
    return { id: nextRockId++, shape, matrix, center: new THREE.Vector3().setFromMatrixPosition(matrix), size: sizeWorld * Math.max(stretch, squash, 1), hue, brightness, raw };
  }

  // The rocks that show from this eye: anything under MIN_PIXELS is not drawn, and the slots go to the biggest on
  // screen first.
  private fill(eye: THREE.Vector3): void {
    const shown: { rock: Rock; pixels: number }[] = [];
    for (const state of this.patches.values()) {
      if (!state.active) continue;
      for (const rock of state.rocks) {
        const pixels = (rock.size * this.pixelsPerUnit.value) / Math.max(eye.distanceTo(rock.center), 1e-6);
        if (pixels >= MIN_PIXELS) shown.push({ rock, pixels });
      }
    }
    if (shown.length > MAX_ROCKS) shown.sort((a, b) => b.pixels - a.pixels);
    const counts = new Array(SHAPE_COUNT).fill(0);
    let idSum = 0;
    let idMix = 0;
    for (const { rock } of shown.slice(0, MAX_ROCKS)) {
      idSum = (idSum + rock.id) >>> 0;
      idMix = (idMix + Math.imul(rock.id, 2654435761)) >>> 0;
      const mesh = this.meshes[rock.shape];
      const index = counts[rock.shape];
      if (index >= mesh.instanceMatrix.count) continue;
      mesh.setMatrixAt(index, rock.matrix);
      (mesh.geometry.getAttribute('aRock') as THREE.InstancedBufferAttribute).setXYZ(index, rock.hue, rock.brightness, rock.raw);
      counts[rock.shape]++;
    }
    // The same rocks in a new order don't change any shadow; a different set does.
    const signature = `${Math.min(shown.length, MAX_ROCKS)}:${idSum}:${idMix}`;
    if (signature !== this.drawnSignature) {
      this.drawnSignature = signature;
      this.version++;
    }
    this.meshes.forEach((mesh, shape) => {
      mesh.count = counts[shape];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.getAttribute('aRock').needsUpdate = true;
    });
  }

  // How many rocks are drawn, for checking.
  get drawnCount(): number {
    return this.meshes.reduce((sum, mesh) => sum + mesh.count, 0);
  }

  dispose(): void {
    this.densityTarget.dispose();
    this.densityMaterial.dispose();
    this.meshes.forEach((mesh) => mesh.geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}

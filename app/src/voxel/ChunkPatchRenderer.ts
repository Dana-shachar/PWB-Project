import * as THREE from 'three';
import { buildLeafIndex, computeStitchFlags, coveringLeaves, patchKey, type EdgeStitchFlags } from '../planet/planetPatches';
import { bakeSamplesCap, bakeSamplesForPixelWidth, createPatchTarget, PATCH_BORDER_TEXELS, PATCH_GRID, type TerrainPatch } from '../planet/patch';
import { chunkFrame, chunkPatchBox, chunkPatchPixelWidth, chunkPatchWorldSize, chunkSelectionThreshold, morphRange, rootFractions, selectChunkPatches, type ChunkDetail } from './chunkPatches';
import { buildChunkBaseGeometry, buildFlatPatchGeometry } from './chunkPatchMesh';

// Bakes one patch's heightmap into a target; false if the planet view isn't ready.
export type BakeChunkPatch = (patch: TerrainPatch, target: THREE.WebGLRenderTarget, root: TerrainPatch) => boolean;
// Bakes the next rows of the chunk's full base map within a texel budget; switched once it replaces the preview, pending until then.
export type AdvanceChunkBase = (root: TerrainPatch, texelBudget: number) => { texels: number; switched: boolean; pending: boolean };

// A shown patch as props read it (props/rockScatter.ts): its place on the chunk, its bake and the bake's CPU heights.
export interface ShownChunkPatch {
  key: string;
  fractions: { minU: number; minV: number; maxU: number; maxV: number }; // chunk uv
  worldSize: number;
  texture: THREE.Texture; // heights in green, with a border (terrain.glsl borderedTextureUv)
  samples: number;
  bakeCount: number;
  heights: { data: Float32Array; size: number } | null; // null until the read arrives
}

// Per-frame build limits, so a big change spreads over frames instead of stalling one.
const MAX_BUILDS_PER_FRAME = 4;
const MAX_BAKE_TEXELS_PER_FRAME = 1_100_000;
const RESELECT_DISTANCE_FRACTION = 0.002;
const RESELECT_TURN_ANGLE = 0.01;

interface ChunkPatchEntry {
  patch: TerrainPatch;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  target: THREE.WebGLRenderTarget;
  bakeSamples: number;
  flags: EdgeStitchFlags | undefined;
  stale: boolean; // its terrain changed: it re-bakes through the per-frame budget, keeping its old bake until then
  // A CPU copy of the bake's heights for sampleHeight, read once without stalling; a re-bake drops it (bakeCount).
  heights: { data: Float32Array; parent: Float32Array; size: number } | null; // green and blue (the coarser level)
  heightsRequested: boolean;
  bakeCount: number;
}

// The Patches debug view's color for a patch: a hue from its key, lighter for finer levels. Bright on purpose, a debug
// exception to the palette rule.
function patchDebugColor(patch: TerrainPatch): THREE.Color {
  const key = patchKey(patch);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((hash % 360) / 360, 0.8, 0.3 + 0.08 * (patch.depth % 5));
}

// Which local edges (u = 0, u = 1, v = 0, v = 1) face a finer neighbor, for chunk.vert.glsl's uEdgeFiner.
function edgeFinerVector(flags: EdgeStitchFlags | undefined, target = new THREE.Vector4()): THREE.Vector4 {
  return target.set(flags?.left ? 1 : 0, flags?.right ? 1 : 0, flags?.top ? 1 : 0, flags?.bottom ? 1 : 0);
}

const EDGE_FADE_CELLS = 6.4; // chunk.vert.glsl's: n/10 of the 64-cell grid (Losasso and Hoppe 2004, 6.2)

// chunk.vert.glsl's finerEdgeFade: the blend fades to 0 toward an edge facing a finer neighbor ([B171]).
function finerEdgeFade(localU: number, localV: number, flags: EdgeStitchFlags | undefined): number {
  const fadeAt = (on: boolean | undefined, share: number) => (on ? Math.min(1, Math.max(0, (share * PATCH_GRID) / EDGE_FADE_CELLS)) : 1);
  return Math.min(fadeAt(flags?.left, localU), fadeAt(flags?.right, 1 - localU), fadeAt(flags?.top, localV), fadeAt(flags?.bottom, 1 - localV));
}

function flagsEqual(a: EdgeStitchFlags | undefined, b: EdgeStitchFlags | undefined): boolean {
  return !!a?.top === !!b?.top && !!a?.bottom === !!b?.bottom && !!a?.left === !!b?.left && !!a?.right === !!b?.right;
}

// The smooth land chunk as patches that split as you zoom, the planet's
// PlanetPatchRenderer in miniature. Each patch material shares the chunk
// material's uniforms (light, ramp, the whole-chunk texture for shadows) and
// owns only its texture and its place on the chunk.
export class ChunkPatchRenderer {
  readonly group = new THREE.Group();
  private entries = new Map<string, ChunkPatchEntry>();
  // What is drawn now, and what the latest selection wants.
  private shown = new Set<string>();
  private wanted: TerrainPatch[] = [];
  private stitchFlags = new Map<string, EdgeStitchFlags>();
  private root: TerrainPatch | null = null;
  private chunkSize = 1;
  private baseDepth = 0;
  private baseMesh: THREE.Mesh | null = null;
  private lastCameraPosition = new THREE.Vector3(Infinity, 0, 0);
  private eye = new THREE.Vector3(); // this frame's camera, for sampleHeight's blend (chunk.vert.glsl's cameraPosition)
  private lastCameraQuaternion = new THREE.Quaternion();
  private lastErrorPixels = 0;
  private lastGroundData: Float32Array | undefined; // a new ground reading reselects the patches
  private boundsMaxHeight = 0;
  private boundsGround: Float32Array | undefined;

  private template: THREE.ShaderMaterial;

  constructor(template: THREE.ShaderMaterial) {
    this.template = template;
  }

  // A new spot or size moves every vertex, so everything is rebuilt.
  configure(root: TerrainPatch, chunkSize: number, baseDepth: number): void {
    if (this.root && patchKey(this.root) === patchKey(root) && this.chunkSize === chunkSize && this.baseDepth === baseDepth) return;
    this.clear();
    this.root = root;
    this.chunkSize = chunkSize;
    this.baseDepth = baseDepth;
    this.baseMesh = new THREE.Mesh(buildChunkBaseGeometry(chunkSize, baseDepth), this.template);
    this.group.add(this.baseMesh);
  }

  // After a layer, detail or base map change: every built patch re-bakes, spread over frames by the build budget.
  markAllStale(): void {
    for (const entry of this.entries.values()) entry.stale = true;
  }

  update(camera: THREE.PerspectiveCamera, detail: ChunkDetail, bake: BakeChunkPatch, maxTextureSize: number, advanceBase: AdvanceChunkBase): void {
    const root = this.root;
    if (!root) return;
    const moved =
      this.lastCameraPosition.distanceTo(camera.position) > this.chunkSize * RESELECT_DISTANCE_FRACTION ||
      this.lastCameraQuaternion.angleTo(camera.quaternion) > RESELECT_TURN_ANGLE ||
      this.lastErrorPixels !== detail.maxErrorPixels ||
      this.lastGroundData !== detail.ground?.data;
    if (moved) {
      this.lastGroundData = detail.ground?.data;
      this.lastCameraPosition.copy(camera.position);
      this.lastCameraQuaternion.copy(camera.quaternion);
      this.lastErrorPixels = detail.maxErrorPixels;
      this.wanted = selectChunkPatches(root, camera.position, detail, this.wanted.length ? this.wanted : undefined);
      this.stitchFlags = computeStitchFlags(this.wanted, chunkFrame(root));
    }
    if (this.boundsMaxHeight !== detail.maxHeight || this.boundsGround !== detail.ground?.data) {
      this.boundsMaxHeight = detail.maxHeight;
      this.boundsGround = detail.ground?.data; // the boxes follow each patch's own ground
      for (const entry of this.entries.values()) this.fitBounds(entry.mesh.geometry, entry.patch, detail);
    }
    this.buildDone = true;
    this.build(camera, detail, bake, maxTextureSize, advanceBase);
    this.swap();
    // Each patch's blend range into its coarser level, from this frame's view (chunkPatches.ts morphRange).
    this.eye.copy(camera.position);
    const threshold = chunkSelectionThreshold();
    for (const key of this.shown) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      const [start, end] = morphRange(root, entry.patch, detail, threshold);
      entry.material.uniforms.uMorphStart.value = start;
      entry.material.uniforms.uMorphEnd.value = end;
    }
    this.settled = this.buildDone && this.wanted.every((patch) => this.shown.has(patchKey(patch)));
  }

  // Every wanted patch is built at its size and shown: the walk map's fade waits for this after a jump.
  settled = false;
  private buildDone = true;

  // By distance only, like the split (chunkPatches.ts shouldSplit), so a patch turning into view needs no re-bake.
  private wantedSamples(patch: TerrainPatch, camera: THREE.PerspectiveCamera, detail: ChunkDetail, cap: number): number {
    return bakeSamplesForPixelWidth(chunkPatchPixelWidth(this.root!, patch, camera.position, detail), cap);
  }

  // The shader lifts each flat patch, which three.js can't see, so it would cull
  // by the flat shape; the bounds cover the real height range instead ([B56]).
  private fitBounds(geometry: THREE.BufferGeometry, patch: TerrainPatch, detail: ChunkDetail): void {
    geometry.boundingBox = chunkPatchBox(this.root!, patch, detail, new THREE.Box3());
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  }

  private build(camera: THREE.PerspectiveCamera, detail: ChunkDetail, bake: BakeChunkPatch, maxTextureSize: number, advanceBase: AdvanceChunkBase): void {
    const root = this.root!;
    const cap = bakeSamplesCap(this.wanted.length, maxTextureSize);
    let builds = 0;
    // Half the budget goes to the base map's upgrade, so patches keep building while it bakes.
    const base = advanceBase(root, MAX_BAKE_TEXELS_PER_FRAME / 2);
    if (base.switched) this.markAllStale();
    let texels = base.texels;
    for (const patch of this.wanted) {
      if (builds >= MAX_BUILDS_PER_FRAME || texels >= MAX_BAKE_TEXELS_PER_FRAME) {
        this.buildDone = false; // more to build next frame
        break;
      }
      const key = patchKey(patch);
      const flags = this.stitchFlags.get(key);
      const entry = this.entries.get(key);
      const samples = this.wantedSamples(patch, camera, detail, cap);
      if (entry) {
        if (!flagsEqual(entry.flags, flags)) {
          entry.mesh.geometry.dispose();
          entry.mesh.geometry = buildFlatPatchGeometry(root, patch, this.chunkSize, this.baseDepth, flags);
          this.fitBounds(entry.mesh.geometry, patch, detail);
          entry.flags = flags;
          edgeFinerVector(flags, entry.material.uniforms.uEdgeFiner.value);
        }
        // A patch grown on screen gets a bigger bake; one that shrank keeps its own size, re-baked if stale.
        // A stale patch keeps its old image until the full map is ready, so a change bakes it once, not twice.
        if (samples > entry.bakeSamples || (entry.stale && !base.pending)) {
          if (samples > entry.bakeSamples) {
            entry.target.dispose();
            entry.target = createPatchTarget(samples);
            entry.bakeSamples = samples;
          }
          if (!bake(patch, entry.target, root)) {
            this.buildDone = false;
            return;
          }
          entry.stale = false;
          entry.bakeCount++;
          entry.heights = null;
          entry.heightsRequested = false;
          this.setTextureUniforms(entry.material, entry.target, entry.bakeSamples);
          builds++;
          texels += entry.bakeSamples * entry.bakeSamples;
        }
        continue;
      }
      const target = createPatchTarget(samples);
      if (!bake(patch, target, root)) {
        this.buildDone = false;
        target.dispose();
        return;
      }
      const material = this.createMaterial(patch, target, samples, flags);
      const mesh = new THREE.Mesh(buildFlatPatchGeometry(root, patch, this.chunkSize, this.baseDepth, flags), material);
      mesh.receiveShadow = true; // rocks' shadows (props/rockScatter.ts)
      this.fitBounds(mesh.geometry, patch, detail);
      mesh.visible = false;
      this.group.add(mesh);
      this.entries.set(key, { patch, mesh, material, target, bakeSamples: samples, flags, stale: false, heights: null, heightsRequested: false, bakeCount: 0 });
      builds++;
      texels += samples * samples;
    }
  }

  // An old patch goes once every patch replacing it is built, and those show
  // together, so a spot is never empty or drawn twice.
  // The drawn ground's height at chunk point (x, z), read from the deepest shown
  // patch's bake, as Cesium reads terrain height from the most detailed loaded
  // tile. Null off the chunk or before a patch shows. Same texel mapping as chunk.vert.glsl.
  sampleHeight(renderer: THREE.WebGLRenderer, x: number, z: number, maxHeight: number, heightBase: number): number | null {
    return this.sampleGround(renderer, x, z, maxHeight, heightBase)?.height ?? null;
  }

  // The drawn ground at chunk point (x, z): the triangle chunk.vert.glsl draws there, its corners displaced by the same
  // formula (the bake, the blend into the coarser level, edge stitching, the lake rim), interpolated across it. Engines
  // read height on drawn LOD terrain this way; the bake itself holds detail the 64-cell mesh doesn't show.
  sampleGround(renderer: THREE.WebGLRenderer, x: number, z: number, maxHeight: number, heightBase: number): { height: number; normal: THREE.Vector3 } | null {
    const root = this.root;
    if (!root) return null;
    const chunkU = x / this.chunkSize + 0.5;
    const chunkV = z / this.chunkSize + 0.5;
    let best: ChunkPatchEntry | null = null;
    for (const key of this.shown) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      const fractions = rootFractions(root, entry.patch);
      if (chunkU < fractions.minU || chunkU > fractions.maxU || chunkV < fractions.minV || chunkV > fractions.maxV) continue;
      if (!best || entry.patch.depth > best.patch.depth) best = entry;
    }
    if (!best) return null;
    const size = best.bakeSamples + 2 * PATCH_BORDER_TEXELS;
    if (!best.heights || best.heights.size !== size) {
      this.requestHeights(renderer, best, size);
      return null; // until the CPU copy arrives (a frame or two); callers fall back to the preview ground
    }
    const fractions = rootFractions(root, best.patch);
    const localU = (chunkU - fractions.minU) / (fractions.maxU - fractions.minU);
    const localV = (chunkV - fractions.minV) / (fractions.maxV - fractions.minV);
    const geometry = best.mesh.geometry;
    const index = this.triangleIndex(geometry);
    const uvs = geometry.getAttribute('uv');
    const positions = geometry.getAttribute('position');
    const cell = Math.min(PATCH_GRID - 1, Math.max(0, Math.floor(localV * PATCH_GRID))) * PATCH_GRID + Math.min(PATCH_GRID - 1, Math.max(0, Math.floor(localU * PATCH_GRID)));
    const triangles = geometry.getIndex()!;
    for (const triangle of index[cell]) {
      const a = triangles.getX(triangle * 3);
      const b = triangles.getX(triangle * 3 + 1);
      const c = triangles.getX(triangle * 3 + 2);
      // Barycentric weights in the patch's uv, where the mesh is flat before displacement.
      const ax = uvs.getX(a), ay = uvs.getY(a), bx = uvs.getX(b), by = uvs.getY(b), cx = uvs.getX(c), cy = uvs.getY(c);
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-12) continue;
      const wa = ((by - cy) * (localU - cx) + (cx - bx) * (localV - cy)) / det;
      const wb = ((cy - ay) * (localU - cx) + (ax - cx) * (localV - cy)) / det;
      const wc = 1 - wa - wb;
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
      const corner = (vertex: number) => {
        const raw = this.drawnRaw(best!, uvs.getX(vertex), uvs.getY(vertex), positions.getX(vertex), positions.getZ(vertex), maxHeight, heightBase);
        return new THREE.Vector3(positions.getX(vertex), Math.max(0, raw + heightBase) * maxHeight, positions.getZ(vertex));
      };
      const pa = corner(a), pb = corner(b), pc = corner(c);
      const normal = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa)).normalize();
      if (normal.y < 0) normal.negate();
      return { height: pa.y * wa + pb.y * wb + pc.y * wc, normal };
    }
    return null;
  }

  // chunk.vert.glsl's displaced raw elevation at one mesh vertex (patch uv, chunk x and z): drawnElevation, the edge
  // stitch points, then lakeRim. Kept line for line with the shader; change both together.
  private drawnRaw(entry: ChunkPatchEntry, u: number, v: number, x: number, z: number, maxHeight: number, heightBase: number): number {
    const elevation = (pu: number, pv: number, px: number, pz: number) => {
      const fine = this.bakeAt(entry, pu, pv, 'data');
      const { uMorphStart, uMorphEnd } = entry.material.uniforms;
      if (!(uMorphEnd.value > uMorphStart.value)) return fine;
      const oddU = (Math.floor(pu * PATCH_GRID + 0.5) % 2 + 2) % 2;
      const oddV = (Math.floor(pv * PATCH_GRID + 0.5) % 2 + 2) % 2;
      const lowU = pu - oddU / PATCH_GRID, highU = pu + oddU / PATCH_GRID;
      const lowV = pv - oddV / PATCH_GRID, highV = pv + oddV / PATCH_GRID;
      const coarse = 0.25 * (this.bakeAt(entry, lowU, lowV, 'parent') + this.bakeAt(entry, highU, lowV, 'parent') + this.bakeAt(entry, lowU, highV, 'parent') + this.bakeAt(entry, highU, highV, 'parent'));
      const distance = Math.hypot(px - this.eye.x, Math.max(0, coarse + heightBase) * maxHeight - this.eye.y, pz - this.eye.z);
      const morph = Math.min(1, Math.max(0, (distance - uMorphStart.value) / (uMorphEnd.value - uMorphStart.value))) * finerEdgeFade(pu, pv, entry.flags);
      return fine + (coarse - fine) * morph;
    };
    let raw = elevation(u, v, x, z);
    const edgeU = u < 1e-5 || u > 1 - 1e-5;
    const edgeV = v < 1e-5 || v > 1 - 1e-5;
    const along = edgeV ? u : v;
    if ((edgeU || edgeV) && Math.abs(((along * PATCH_GRID) % 1) - 0.5) < 0.25) {
      const stepU = edgeV ? 0.5 / PATCH_GRID : 0;
      const stepV = edgeV ? 0 : 0.5 / PATCH_GRID;
      const worldSize = entry.material.uniforms.uPatchWorldSize.value as number;
      raw = 0.5 * (elevation(u - stepU, v - stepV, x - stepU * worldSize, z - stepV * worldSize) + elevation(u + stepU, v + stepV, x + stepU * worldSize, z + stepV * worldSize));
    }
    return this.lakeRim(x, z, raw, maxHeight);
  }

  // A bake channel at patch uv, bilinear, as chunk.vert.glsl's texture read (patchTextureUv).
  private bakeAt(entry: ChunkPatchEntry, u: number, v: number, channel: 'data' | 'parent'): number {
    const { size } = entry.heights!;
    const values = entry.heights![channel];
    const tx = Math.min(size - 1, Math.max(0, PATCH_BORDER_TEXELS + u * (entry.bakeSamples - 1)));
    const ty = Math.min(size - 1, Math.max(0, PATCH_BORDER_TEXELS + v * (entry.bakeSamples - 1)));
    const x0 = Math.min(Math.floor(tx), size - 2);
    const y0 = Math.min(Math.floor(ty), size - 2);
    const bx = tx - x0;
    const by = ty - y0;
    const at = (col: number, row: number) => values[row * size + col];
    return (at(x0, y0) * (1 - bx) + at(x0 + 1, y0) * bx) * (1 - by) + (at(x0, y0 + 1) * (1 - bx) + at(x0 + 1, y0 + 1) * bx) * by;
  }

  // chunk.vert.glsl's lakeRim: ground beside a lake is lifted to half a meter above its level.
  private lakeRim(x: number, z: number, raw: number, maxHeight: number): number {
    const { uChunkLakeLevels, uLakeCells } = this.template.uniforms;
    const cells = uLakeCells.value as number;
    const data = (uChunkLakeLevels.value as THREE.DataTexture | null)?.image?.data as Float32Array | undefined;
    if (cells < 2 || !data) return raw;
    const cellX = Math.floor((x / this.chunkSize + 0.5) * (cells - 1) + 0.5);
    const cellY = Math.floor((z / this.chunkSize + 0.5) * (cells - 1) + 0.5);
    const level = (cx: number, cy: number) => {
      const clampedX = Math.min(cells - 1, Math.max(0, cx));
      const clampedY = Math.min(cells - 1, Math.max(0, cy));
      return data[(clampedY * cells + clampedX) * 4];
    };
    if (level(cellX, cellY) > -999) return raw;
    const lift = 0.5 / Math.max(maxHeight * 1000, 1e-6);
    let rim = raw;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = level(cellX + dx, cellY + dy);
      if (neighbor > -999) rim = Math.max(rim, neighbor + lift);
    }
    return rim;
  }

  // Each mesh's top triangles by the grid cell they overlap, built once per geometry, for sampleGround's lookup.
  private triangleIndexes = new WeakMap<THREE.BufferGeometry, number[][]>();
  private triangleIndex(geometry: THREE.BufferGeometry): number[][] {
    const cached = this.triangleIndexes.get(geometry);
    if (cached) return cached;
    const cells: number[][] = Array.from({ length: PATCH_GRID * PATCH_GRID }, () => []);
    const uvs = geometry.getAttribute('uv');
    const displace = geometry.getAttribute('displace');
    const triangles = geometry.getIndex()!;
    for (let t = 0; t < triangles.count / 3; t++) {
      const corners = [triangles.getX(t * 3), triangles.getX(t * 3 + 1), triangles.getX(t * 3 + 2)];
      if (corners.some((vertex) => displace.getX(vertex) < 0.5)) continue; // skirts and walls
      const us = corners.map((vertex) => uvs.getX(vertex));
      const vs = corners.map((vertex) => uvs.getY(vertex));
      const cellRange = (values: number[]) => [Math.max(0, Math.floor(Math.min(...values) * PATCH_GRID - 1e-6)), Math.min(PATCH_GRID - 1, Math.floor(Math.max(...values) * PATCH_GRID + 1e-6))];
      const [lowU, highU] = cellRange(us);
      const [lowV, highV] = cellRange(vs);
      for (let j = lowV; j <= highV; j++) for (let i = lowU; i <= highU; i++) cells[j * PATCH_GRID + i].push(t);
    }
    this.triangleIndexes.set(geometry, cells);
    return cells;
  }

  // The shown patches, asking for each one's CPU heights once (read without stalling).
  shownPatches(renderer: THREE.WebGLRenderer): ShownChunkPatch[] {
    const root = this.root;
    if (!root) return [];
    const list: ShownChunkPatch[] = [];
    for (const key of this.shown) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      const size = entry.bakeSamples + 2 * PATCH_BORDER_TEXELS;
      const ready = entry.heights && entry.heights.size === size;
      if (!ready) this.requestHeights(renderer, entry, size);
      list.push({
        key,
        fractions: rootFractions(root, entry.patch),
        worldSize: chunkPatchWorldSize(root, entry.patch, this.chunkSize),
        texture: entry.target.texture,
        samples: entry.bakeSamples,
        bakeCount: entry.bakeCount,
        heights: ready ? { data: entry.heights!.data, size } : null,
      });
    }
    return list;
  }

  // Reads a patch's whole bake back without stalling (this repo's rule for GPU reads) and keeps its heights (green).
  private requestHeights(renderer: THREE.WebGLRenderer, entry: ChunkPatchEntry, size: number): void {
    if (entry.heightsRequested) return;
    entry.heightsRequested = true;
    const bakeCount = entry.bakeCount;
    const target = entry.target;
    const pixels = new Float32Array(size * size * 4);
    void renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size, pixels).then(() => {
      if (entry.bakeCount !== bakeCount || entry.target !== target) return; // re-baked meanwhile: a later call asks again
      const data = new Float32Array(size * size);
      const parent = new Float32Array(size * size);
      for (let i = 0; i < data.length; i++) {
        data[i] = pixels[i * 4 + 1];
        parent[i] = pixels[i * 4 + 2];
      }
      entry.heights = { data, parent, size };
    });
  }

  private swap(): void {
    const frame = chunkFrame(this.root!);
    const wantedIndex = buildLeafIndex(this.wanted, frame);
    const wantedKeys = new Set(this.wanted.map(patchKey));
    const remainingOld: TerrainPatch[] = [];
    for (const key of [...this.shown]) {
      if (wantedKeys.has(key)) continue;
      const entry = this.entries.get(key)!;
      const replacements = coveringLeaves(wantedIndex, entry.patch, frame);
      if (replacements.length > 0 && replacements.every((leaf) => this.entries.has(patchKey(leaf)))) {
        for (const leaf of replacements) this.show(patchKey(leaf));
        this.remove(key);
      } else {
        remainingOld.push(entry.patch);
      }
    }
    // A built patch not overlapping anything old shows at once.
    const oldIndex = buildLeafIndex(remainingOld, frame);
    for (const patch of this.wanted) {
      const key = patchKey(patch);
      if (this.shown.has(key) || !this.entries.has(key)) continue;
      if (coveringLeaves(oldIndex, patch, frame).length === 0) this.show(key);
    }
    // Built but no longer wanted or shown: drop it.
    for (const key of [...this.entries.keys()]) {
      if (!wantedKeys.has(key) && !this.shown.has(key)) this.remove(key);
    }
  }

  private show(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.mesh.visible = true;
    this.shown.add(key);
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.material.dispose();
    entry.target.dispose();
    this.entries.delete(key);
    this.shown.delete(key);
  }

  private createMaterial(patch: TerrainPatch, target: THREE.WebGLRenderTarget, samples: number, flags: EdgeStitchFlags | undefined): THREE.ShaderMaterial {
    const fractions = rootFractions(this.root!, patch);
    const patchWorldSize = chunkPatchWorldSize(this.root!, patch, this.chunkSize);
    const material = new THREE.ShaderMaterial({
      vertexShader: this.template.vertexShader,
      fragmentShader: this.template.fragmentShader,
      side: this.template.side,
      lights: this.template.lights, // three.js's shadow uniforms (the rocks' cast shadows)
      // Shared uniform objects, so the chunk material's updates reach every patch.
      uniforms: {
        ...this.template.uniforms,
        uHeightMap: { value: target.texture },
        uBakeSamples: { value: samples },
        uBorderTexels: { value: PATCH_BORDER_TEXELS },
        uPatchWorldSize: { value: patchWorldSize },
        uPatchUvMin: { value: new THREE.Vector2(fractions.minU, fractions.minV) },
        uPatchUvMax: { value: new THREE.Vector2(fractions.maxU, fractions.maxV) },
        uMorphStart: { value: 0 },
        uMorphEnd: { value: 0 },
        uEdgeFiner: { value: edgeFinerVector(flags) },
        uPatchColor: { value: patchDebugColor(patch) },
      },
    });
    this.setTextureUniforms(material, target, samples);
    return material;
  }

  private setTextureUniforms(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget, samples: number): void {
    material.uniforms.uHeightMap.value = target.texture;
    material.uniforms.uBakeSamples.value = samples;
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) this.remove(key);
    this.wanted = [];
    this.stitchFlags.clear();
    this.lastCameraPosition.set(Infinity, 0, 0);
    if (this.baseMesh) {
      this.group.remove(this.baseMesh);
      this.baseMesh.geometry.dispose();
      this.baseMesh = null;
    }
    this.root = null;
  }

  dispose(): void {
    this.clear();
  }
}

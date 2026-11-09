import * as THREE from 'three';
import { buildLeafIndex, computeStitchFlags, coveringLeaves, patchKey, type EdgeStitchFlags } from '../planet/planetPatches';
import { bakeSamplesCap, bakeSamplesForPixelWidth, createPatchTarget, PATCH_BORDER_TEXELS, type TerrainPatch } from '../planet/patch';
import { chunkFrame, chunkPatchBox, chunkPatchPixelWidth, chunkPatchWorldSize, chunkSelectionThreshold, morphRange, rootFractions, selectChunkPatches, type ChunkDetail } from './chunkPatches';
import { buildChunkBaseGeometry, buildFlatPatchGeometry } from './chunkPatchMesh';

// Bakes one patch's heightmap into a target; false if the planet view isn't ready.
export type BakeChunkPatch = (patch: TerrainPatch, target: THREE.WebGLRenderTarget, root: TerrainPatch) => boolean;
// Bakes the next rows of the chunk's full base map within a texel budget; switched once it replaces the preview, pending until then.
export type AdvanceChunkBase = (root: TerrainPatch, texelBudget: number) => { texels: number; switched: boolean; pending: boolean };

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
  private readBuffer = new Float32Array(16); // a 2x2 block of RGBA floats for sampleHeight

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
      const material = this.createMaterial(patch, target, samples);
      const mesh = new THREE.Mesh(buildFlatPatchGeometry(root, patch, this.chunkSize, this.baseDepth, flags), material);
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
    const fractions = rootFractions(root, best.patch);
    const size = best.bakeSamples + 2 * PATCH_BORDER_TEXELS;
    const texelAt = (fraction: number, min: number, max: number) =>
      Math.min(size - 1, Math.max(0, PATCH_BORDER_TEXELS + ((fraction - min) / (max - min)) * (best!.bakeSamples - 1)));
    const texelX = texelAt(chunkU, fractions.minU, fractions.maxU);
    const texelY = texelAt(chunkV, fractions.minV, fractions.maxV);
    const x0 = Math.min(Math.floor(texelX), size - 2);
    const y0 = Math.min(Math.floor(texelY), size - 2);
    const blendX = texelX - x0;
    const blendY = texelY - y0;
    // From the patch's CPU copy when it has one; the direct read (which stalls the frame on the GPU, 22 ms for
    // walk mode's 5 reads, measured 2026-11-04) only until that copy arrives.
    // Fine (green) and coarser-level (blue) corners.
    let corners: [number, number, number, number];
    let parents: [number, number, number, number];
    const copy = best.heights;
    if (copy && copy.size === size) {
      const at = (values: Float32Array, col: number, row: number) => values[row * size + col];
      corners = [at(copy.data, x0, y0), at(copy.data, x0 + 1, y0), at(copy.data, x0, y0 + 1), at(copy.data, x0 + 1, y0 + 1)];
      parents = [at(copy.parent, x0, y0), at(copy.parent, x0 + 1, y0), at(copy.parent, x0, y0 + 1), at(copy.parent, x0 + 1, y0 + 1)];
    } else {
      this.requestHeights(renderer, best, size);
      renderer.readRenderTargetPixels(best.target, x0, y0, 2, 2, this.readBuffer);
      corners = [this.readBuffer[1], this.readBuffer[5], this.readBuffer[9], this.readBuffer[13]];
      parents = [this.readBuffer[2], this.readBuffer[6], this.readBuffer[10], this.readBuffer[14]];
    }
    const bilinear = (values: [number, number, number, number]) =>
      (values[0] * (1 - blendX) + values[1] * blendX) * (1 - blendY) + (values[2] * (1 - blendX) + values[3] * blendX) * blendY;
    const fine = bilinear(corners);
    const coarse = bilinear(parents);
    // The same blend chunk.vert.glsl draws, by the distance from the eye to the coarse surface here.
    const { uMorphStart, uMorphEnd } = best.material.uniforms;
    let raw = fine;
    if (uMorphEnd.value > uMorphStart.value) {
      const distance = Math.hypot(x - this.eye.x, Math.max(0, coarse + heightBase) * maxHeight - this.eye.y, z - this.eye.z);
      const morph = Math.min(1, Math.max(0, (distance - uMorphStart.value) / (uMorphEnd.value - uMorphStart.value)));
      raw = fine + (coarse - fine) * morph;
    }
    return Math.max(0, raw + heightBase) * maxHeight;
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

  private createMaterial(patch: TerrainPatch, target: THREE.WebGLRenderTarget, samples: number): THREE.ShaderMaterial {
    const fractions = rootFractions(this.root!, patch);
    const patchWorldSize = chunkPatchWorldSize(this.root!, patch, this.chunkSize);
    const material = new THREE.ShaderMaterial({
      vertexShader: this.template.vertexShader,
      fragmentShader: this.template.fragmentShader,
      side: this.template.side,
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

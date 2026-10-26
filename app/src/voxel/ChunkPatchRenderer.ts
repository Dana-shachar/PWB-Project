import * as THREE from 'three';
import { buildLeafIndex, computeStitchFlags, coveringLeaves, patchKey, type EdgeStitchFlags } from '../planet/planetPatches';
import { bakeSamplesCap, bakeSamplesForPixelWidth, createPatchTarget, PATCH_BAKE_SAMPLES_MIN, PATCH_BORDER_TEXELS, type TerrainPatch } from '../planet/patch';
import { chunkPatchBox, chunkPatchInView,chunkPatchPixelWidth, chunkPatchWorldSize, rootFractions, selectChunkPatches, type ChunkDetail } from './chunkPatches';
import { buildChunkBaseGeometry, buildFlatPatchGeometry } from './chunkPatchMesh';

// Bakes one patch's heightmap into a target; false if the planet view isn't ready.
export type BakeChunkPatch = (patch: TerrainPatch, target: THREE.WebGLRenderTarget) => boolean;

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
  private lastCameraQuaternion = new THREE.Quaternion();
  private lastErrorPixels = 0;
  private boundsMaxHeight = 0;

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

  // After a layer or detail change: every built patch bakes again in place.
  rebakeAll(bake: BakeChunkPatch): void {
    for (const entry of this.entries.values()) bake(entry.patch, entry.target);
  }

  update(camera: THREE.PerspectiveCamera, detail: ChunkDetail, bake: BakeChunkPatch, maxTextureSize: number): void {
    const root = this.root;
    if (!root) return;
    const moved =
      this.lastCameraPosition.distanceTo(camera.position) > this.chunkSize * RESELECT_DISTANCE_FRACTION ||
      this.lastCameraQuaternion.angleTo(camera.quaternion) > RESELECT_TURN_ANGLE ||
      this.lastErrorPixels !== detail.maxErrorPixels;
    if (moved) {
      this.lastCameraPosition.copy(camera.position);
      this.lastCameraQuaternion.copy(camera.quaternion);
      this.lastErrorPixels = detail.maxErrorPixels;
      this.wanted = selectChunkPatches(root, camera.position, detail, this.wanted.length ? this.wanted : undefined);
      this.stitchFlags = computeStitchFlags(this.wanted);
    }
    if (this.boundsMaxHeight !== detail.maxHeight) {
      this.boundsMaxHeight = detail.maxHeight;
      for (const entry of this.entries.values()) this.fitBounds(entry.mesh.geometry, entry.patch, detail);
    }
    this.build(camera, detail, bake, maxTextureSize);
    this.swap();
  }

  private wantedSamples(patch: TerrainPatch, camera: THREE.PerspectiveCamera, detail: ChunkDetail, cap: number): number {
    if (!chunkPatchInView(this.root!, patch, detail)) return PATCH_BAKE_SAMPLES_MIN;
    return bakeSamplesForPixelWidth(chunkPatchPixelWidth(this.root!, patch, camera.position, detail), cap);
  }

  // The shader lifts each flat patch, which three.js can't see, so it would cull
  // by the flat shape; the bounds cover the real height range instead ([B56]).
  private fitBounds(geometry: THREE.BufferGeometry, patch: TerrainPatch, detail: ChunkDetail): void {
    geometry.boundingBox = chunkPatchBox(this.root!, patch, detail, new THREE.Box3());
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  }

  private build(camera: THREE.PerspectiveCamera, detail: ChunkDetail, bake: BakeChunkPatch, maxTextureSize: number): void {
    const root = this.root!;
    const cap = bakeSamplesCap(this.wanted.length, maxTextureSize);
    let builds = 0;
    let texels = 0;
    for (const patch of this.wanted) {
      if (builds >= MAX_BUILDS_PER_FRAME || texels >= MAX_BAKE_TEXELS_PER_FRAME) break;
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
        // A patch grown on screen gets a bigger bake; one that shrank keeps its own.
        if (samples > entry.bakeSamples) {
          entry.target.dispose();
          entry.target = createPatchTarget(samples);
          if (!bake(patch, entry.target)) return;
          entry.bakeSamples = samples;
          this.setTextureUniforms(entry.material, entry.target, samples);
          builds++;
          texels += samples * samples;
        }
        continue;
      }
      const target = createPatchTarget(samples);
      if (!bake(patch, target)) {
        target.dispose();
        return;
      }
      const material = this.createMaterial(patch, target, samples);
      const mesh = new THREE.Mesh(buildFlatPatchGeometry(root, patch, this.chunkSize, this.baseDepth, flags), material);
      this.fitBounds(mesh.geometry, patch, detail);
      mesh.visible = false;
      this.group.add(mesh);
      this.entries.set(key, { patch, mesh, material, target, bakeSamples: samples, flags });
      builds++;
      texels += samples * samples;
    }
  }

  // An old patch goes once every patch replacing it is built, and those show
  // together, so a spot is never empty or drawn twice.
  private swap(): void {
    const wantedIndex = buildLeafIndex(this.wanted);
    const wantedKeys = new Set(this.wanted.map(patchKey));
    const remainingOld: TerrainPatch[] = [];
    for (const key of [...this.shown]) {
      if (wantedKeys.has(key)) continue;
      const entry = this.entries.get(key)!;
      const replacements = coveringLeaves(wantedIndex, entry.patch);
      if (replacements.length > 0 && replacements.every((leaf) => this.entries.has(patchKey(leaf)))) {
        for (const leaf of replacements) this.show(patchKey(leaf));
        this.remove(key);
      } else {
        remainingOld.push(entry.patch);
      }
    }
    // A built patch not overlapping anything old shows at once.
    const oldIndex = buildLeafIndex(remainingOld);
    for (const patch of this.wanted) {
      const key = patchKey(patch);
      if (this.shown.has(key) || !this.entries.has(key)) continue;
      if (coveringLeaves(oldIndex, patch).length === 0) this.show(key);
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

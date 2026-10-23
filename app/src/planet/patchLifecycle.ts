import { buildLeafIndex, coveringLeaves, patchKey } from './planetPatches';
import type { TerrainPatch } from './patch';

// Cached patches kept hidden, in grid vertices (about 200 KB each with its
// bake at the default grid, so roughly 125 MB), least recently used evicted
// first. Sized so the whole sphere at the default Resolution fits, since a
// cache smaller than a full rotation's patches misses on every one.
export const PATCH_CACHE_MAX_VERTICES = 2_500_000;
// The same cache counted in baked texels (16 bytes each), since deep patches
// bake more samples than their grid has vertices: 6M is about 96 MB, so a
// few close-up bakes (up to 17 MB each) can stay cached when you move off.
export const PATCH_CACHE_MAX_BAKE_TEXELS = 6_000_000;

// active: in the current selection. retiring: replaced, but kept on screen
// until what replaces it is built. cached: hidden, kept for when it's needed.
export type PatchState = 'active' | 'retiring' | 'cached';

export interface LifecycleEntry {
  patch: TerrainPatch;
  state: PatchState;
  // Whether it should be drawn: active unless held back, retiring always.
  shown: boolean;
  // For a retiring patch, the selected patches that replace it.
  coverKeys: string[];
  lastUsed: number;
  vertices: number;
  bakeTexels: number;
  // The terrain bake this entry's texture came from, see bumpBakeVersion.
  version: number;
}

// The pure bookkeeping behind PlanetPatchRenderer (no GPU objects, so it can
// be tested alone): which built patches are drawn, which are kept hidden, and
// when a replaced patch may finally go. A replaced patch stays visible until
// everything replacing it is built, then they swap in one step, so the
// sphere never shows a hole, and the replacements stay hidden meanwhile
// (Cesium's REPLACE refinement draws a tile or its children, never both).
export class PatchLifecycle {
  readonly entries = new Map<string, LifecycleEntry>();
  private counter = 0;
  private bakeVersion = 0;

  // Terrain changed: hidden patches now hold old terrain, so they are
  // evicted rather than shown stale when they return.
  bumpBakeVersion(): number {
    this.bakeVersion++;
    return this.bakeVersion;
  }

  markRebaked(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.version = this.bakeVersion;
  }

  // Classifies every built patch against a new selection. Returns the keys
  // to dispose and the selected patches that still need building.
  beginSelection(nextLeaves: TerrainPatch[]): { disposed: string[]; toBuild: TerrainPatch[] } {
    this.counter++;
    const nextIndex = buildLeafIndex(nextLeaves);
    const nextKeys = new Set(nextLeaves.map(patchKey));
    const disposed: string[] = [];

    for (const [key, entry] of this.entries) {
      if (nextKeys.has(key)) {
        if (entry.state === 'cached' && entry.version !== this.bakeVersion) {
          disposed.push(key);
          continue;
        }
        entry.state = 'active';
        entry.coverKeys = [];
        entry.lastUsed = this.counter;
      } else if (entry.state !== 'cached') {
        // Waiting to be shown but no longer wanted: nothing to hide it from.
        if (!entry.shown) {
          entry.state = 'cached';
          entry.coverKeys = [];
        } else {
          entry.state = 'retiring';
          entry.coverKeys = coveringLeaves(nextIndex, entry.patch).map(patchKey);
        }
      }
    }
    for (const key of disposed) this.entries.delete(key);

    const toBuild = nextLeaves.filter((patch) => !this.entries.has(patchKey(patch)));
    disposed.push(...this.refresh());
    return { disposed, toBuild };
  }

  // A newly built patch, active and shown unless it replaces something that
  // is still on screen.
  add(patch: TerrainPatch, vertices: number, bakeTexels: number): void {
    this.entries.set(patchKey(patch), {
      patch,
      state: 'active',
      shown: true,
      coverKeys: [],
      lastUsed: this.counter,
      vertices,
      bakeTexels,
      version: this.bakeVersion,
    });
  }

  remove(key: string): void {
    this.entries.delete(key);
  }

  // A patch's bake was redone at another size (an upgrade).
  setBakeTexels(key: string, bakeTexels: number): void {
    const entry = this.entries.get(key);
    if (entry) entry.bakeTexels = bakeTexels;
  }

  // A patch's mesh was rebuilt at another grid size (a Resolution change).
  setVertices(key: string, vertices: number): void {
    const entry = this.entries.get(key);
    if (entry) entry.vertices = vertices;
  }

  // Releases replaced patches whose replacements are all built, recomputes
  // what is shown, and trims the cache. Returns the keys to dispose.
  refresh(): string[] {
    for (const entry of this.entries.values()) {
      if (entry.state !== 'retiring') continue;
      if (entry.coverKeys.every((key) => this.isBuilt(key))) {
        entry.state = 'cached';
        entry.coverKeys = [];
      }
    }
    const held = new Set<string>();
    for (const entry of this.entries.values()) {
      if (entry.state === 'retiring') for (const key of entry.coverKeys) held.add(key);
    }
    for (const [key, entry] of this.entries) {
      entry.shown = entry.state === 'retiring' || (entry.state === 'active' && !held.has(key));
    }
    return this.trimCache();
  }

  // The keys of patches that should be drawn and picked right now.
  shownKeys(): string[] {
    return [...this.entries].filter(([, entry]) => entry.shown).map(([key]) => key);
  }

  // Patches not in the current selection and not yet released.
  hasRetiring(): boolean {
    for (const entry of this.entries.values()) if (entry.state === 'retiring') return true;
    return false;
  }

  private isBuilt(key: string): boolean {
    const entry = this.entries.get(key);
    return !!entry && entry.state === 'active' && entry.version === this.bakeVersion;
  }

  private trimCache(): string[] {
    const cached = [...this.entries].filter(([, entry]) => entry.state === 'cached');
    let totalVertices = cached.reduce((sum, [, entry]) => sum + entry.vertices, 0);
    let totalTexels = cached.reduce((sum, [, entry]) => sum + entry.bakeTexels, 0);
    if (totalVertices <= PATCH_CACHE_MAX_VERTICES && totalTexels <= PATCH_CACHE_MAX_BAKE_TEXELS) return [];
    cached.sort((first, second) => first[1].lastUsed - second[1].lastUsed);
    const disposed: string[] = [];
    for (const [key, entry] of cached) {
      if (totalVertices <= PATCH_CACHE_MAX_VERTICES && totalTexels <= PATCH_CACHE_MAX_BAKE_TEXELS) break;
      totalVertices -= entry.vertices;
      totalTexels -= entry.bakeTexels;
      this.entries.delete(key);
      disposed.push(key);
    }
    return disposed;
  }
}

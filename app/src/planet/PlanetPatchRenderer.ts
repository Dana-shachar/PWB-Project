import * as THREE from 'three';
import type { HeightmapPipeline } from '../map/heightmap';
import type { NoiseLayer } from '../map/heightmap';
import { applySharedUniforms, buildPatchGeometry, createPatchMaterial, type PlanetSharedUniforms } from './planetPatchMesh';
import { computeStitchFlags, patchInView, patchKey, patchPixelWidth, selectPatchesIncremental, type EdgeStitchFlags, type PatchDetail } from './planetPatches';
import { PatchLifecycle } from './patchLifecycle';
import {
  bakeSamplesCap,
  bakeSamplesForPixelWidth,
  faceIndex,
  INITIAL_BAKE_SAMPLES,
  PATCH_BAKE_SAMPLES_MIN,
  patchCenterDirection,
  PREFERRED_PATCH_GRID,
  type TerrainPatch,
} from './patch';

// A patch's baked heightmap is sample data, a texture, distinct from the
// *display mesh*'s own resolution (PREFERRED_PATCH_GRID, [B28]). Its size
// comes from how wide the patch is on screen (bakeSamplesForPixelWidth in
// patch.ts). The sample spacing the noise fades by follows the target's own
// width in HeightmapPipeline.bakeRegionInto.
// Recompute the camera-distance LOD selection only once the camera has
// actually moved a meaningful fraction of the radius, not every frame —
// selection + any new bakes are real GPU work, re-running it every single
// frame regardless of whether the view changed would be pure waste.
const RESELECT_DISTANCE_FRACTION = 0.01;
// Also reselect when the camera turns this far (radians), since what is in
// view changes with it.
const RESELECT_TURN_ANGLE = 0.02;
// How many newly-selected patches actually get baked/compiled in one
// updatePatches call — each one is a real GPU bake plus a ShaderMaterial
// compile, and doing all of them synchronously the moment many patches
// become visible at once (e.g. on first load) is what made loading feel
// choppy. Matches Unigine's own terrain streaming docs, which cap tiles
// loaded per frame the same way (default 4) — a cited convention, not a
// guess. See REFERENCES.md.
const MAX_NEW_PATCHES_PER_FRAME = 4;
// A patch's build grows with the square of its grid and of its bake size, so
// a frame's budget is vertices plus baked texels of work, not a patch count.
// Always at least one, so building can't stall.
const MAX_BUILD_VERTICES_PER_FRAME = 65536;
// Swapping in a re-stitched mesh is geometry only (the bake and material
// stay valid), far cheaper than a new patch, so more fit in one frame.
const MAX_RESTITCH_VERTICES_PER_FRAME = 262144;

const NO_STITCH_FLAGS: EdgeStitchFlags = { top: false, bottom: false, left: false, right: false };

// A missing set of flags means no edge needs stitching.
function edgeStitchFlagsEqual(built: EdgeStitchFlags, current: EdgeStitchFlags | undefined): boolean {
  const next = current ?? NO_STITCH_FLAGS;
  return built.top === next.top && built.bottom === next.bottom && built.left === next.left && built.right === next.right;
}

// The GPU side of one patch; whether it is shown, hidden or retiring is
// tracked separately by PatchLifecycle.
interface PatchEntry {
  patch: TerrainPatch;
  // The stitch flags this entry's mesh was actually built with, to notice
  // when a neighbor's detail level changes and its edges no longer match.
  builtFlags: EdgeStitchFlags;
  // The grid size this entry's mesh was built at, to notice a Resolution
  // change and rebuild the mesh in place.
  builtGrid: number;
  // Its baked texture's width.
  bakeSamples: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  target: THREE.WebGLRenderTarget;
}

// [B28]'s fix, encapsulated: a group of small per-patch meshes, each
// displaced from its own baked heightmap (planet/planetPatchMesh.ts), whose
// membership is re-selected by camera distance (planet/planetPatches.ts) —
// replacing mesh.ts's single whole-globe mesh sampling one shared,
// permanently detail-capped map. Exposes roughly the same surface
// SceneCanvas.tsx's old single `planetMesh` ref needed (a group to add to
// the scene, a way to push shared uniform changes, a raycast helper), so
// swapping call sites is close to mechanical rather than a structural
// rewrite of this component's own caller.
export class PlanetPatchRenderer {
  readonly group = new THREE.Group();
  private entries = new Map<string, PatchEntry>();
  // Which built patches are shown, retiring or kept hidden in the cache.
  private lifecycle = new PatchLifecycle();
  private currentLeaves: TerrainPatch[] = [];
  private pressure = 0;
  // Set while the budget pressure is still stepping, so the next frame
  // selects again even if the camera didn't move.
  private selectionUnsettled = false;
  private lastCameraPosition: THREE.Vector3 | null = null;
  private lastRadius = 0;
  private lastViewDirection: THREE.Vector3 | null = null;
  // The mesh grid tier in force, chosen by the selection, and how many
  // patches were in view then (the bake budget is shared among them).
  private currentGrid = PREFERRED_PATCH_GRID;
  private visibleCount = 0;
  // Built patches whose bake is smaller than the screen wants, upgraded one
  // per frame when nothing new is waiting.
  private upgradeKeys = new Set<string>();
  private lastMaxErrorPixels = 0;
  private lastViewKey = '';
  // Selected (by the quadtree) but not yet actually baked/compiled —
  // drained a few at a time per frame in updatePatches, see
  // MAX_NEW_PATCHES_PER_FRAME.
  private pendingBuilds: TerrainPatch[] = [];
  // Which of each currently-selected patch's edges need the finer-neighbor
  // stitching (planetPatchMesh.ts's buildPatchGeometry), recomputed
  // alongside patch selection itself. See planet/planetPatches.ts's
  // computeStitchFlags, ISSUES.md [B28].
  private stitchFlags = new Map<string, EdgeStitchFlags>();
  // Built patches whose edges no longer match their neighbors' current
  // detail, waiting for a geometry-only rebuild. See [B39].
  private staleStitchKeys = new Set<string>();
  // Built patches (any state) whose mesh grid is not the current Resolution's,
  // rebuilt in place, geometry only, so a Resolution change keeps every bake.
  private staleGridKeys = new Set<string>();

  // Rebuilds every drawn patch's bake, e.g. after a layer/paint change —
  // the same moment the single-mesh path re-renders its one shared map.
  // Hidden cached patches are not rebaked: they become stale and are dropped
  // if they return (see PatchLifecycle.bumpBakeVersion).
  rebakeAll(renderer: THREE.WebGLRenderer, heightmapPipeline: HeightmapPipeline, layers: NoiseLayer[]): void {
    this.lifecycle.bumpBakeVersion();
    for (const [key, entry] of this.entries) {
      if (this.lifecycle.entries.get(key)?.state === 'cached') continue;
      heightmapPipeline.bakeRegionToTarget(
        renderer,
        { layers, face: faceIndex(entry.patch.face), min: entry.patch.min, max: entry.patch.max, resolution: entry.bakeSamples },
        entry.target,
      );
      this.lifecycle.markRebaked(key);
    }
  }

  // The bake a patch should have: what its on-screen width asks for within the
  // view's share of the texel budget, and the smallest for a patch out of view.
  private wantedBakeSamples(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number, detail: PatchDetail, maxTextureSize: number): number {
    if (!patchInView(patch, cameraPosition, radius, detail)) return PATCH_BAKE_SAMPLES_MIN;
    return bakeSamplesForPixelWidth(patchPixelWidth(patch, cameraPosition, radius, detail), bakeSamplesCap(this.visibleCount, maxTextureSize));
  }

  private disposeEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.material.dispose();
    entry.target.dispose();
    this.entries.delete(key);
    this.upgradeKeys.delete(key);
    this.lifecycle.remove(key);
  }

  // Applies the lifecycle's decisions: dispose evicted patches, show or hide
  // the rest.
  private syncVisibility(disposed: string[]): void {
    for (const key of disposed) this.disposeEntry(key);
    for (const [key, entry] of this.entries) {
      entry.mesh.visible = this.lifecycle.entries.get(key)?.shown ?? false;
    }
  }

  // Cheap: applied every frame regardless of whether patch selection itself
  // is throttled this frame, so lighting/camera/color-ramp changes are
  // always live even while LOD selection is skipped.
  applyShared(shared: PlanetSharedUniforms): void {
    for (const entry of this.entries.values()) applySharedUniforms(entry.material, shared);
  }

  // The expensive half: re-walks the quadtree by camera distance, queues any
  // newly-visible patch, disposes any patch that fell out of view —
  // reselection itself is throttled by how far the camera has actually
  // moved (RESELECT_DISTANCE_FRACTION). Queued patches are then drained a
  // few at a time below, every call, independent of that throttle, so a
  // burst of newly-visible patches (e.g. on first load) doesn't all bake
  // and compile in one frame. See MAX_NEW_PATCHES_PER_FRAME.
  updatePatches(
    cameraPosition: THREE.Vector3,
    renderer: THREE.WebGLRenderer,
    heightmapPipeline: HeightmapPipeline,
    layers: NoiseLayer[],
    shared: PlanetSharedUniforms,
  ): void {
    const detail = {
      maxErrorPixels: shared.maxErrorPixels,
      gridResolution: this.currentGrid,
      viewHeightPixels: shared.viewHeightPixels,
      fieldOfViewRadians: shared.fieldOfViewRadians,
      frustum: shared.frustum,
      elevationMargin: shared.displacementAmplitude * Math.max(Math.abs(shared.elevationMin), Math.abs(shared.elevationMax), 0.5),
    };
    const maxTextureSize = renderer.capabilities?.maxTextureSize ?? 2048;
    // A new radius moves every vertex, so all patches (cached ones too) go,
    // and the selection below rebuilds them. A new Resolution (detail bias)
    // doesn't: the bakes stay valid, so patches are only added or merged
    // through the same retiring path as zooming.
    const radiusChanged = shared.radius !== this.lastRadius;
    if (radiusChanged) {
      for (const key of [...this.entries.keys()]) this.disposeEntry(key);
      this.pendingBuilds = [];
      this.staleStitchKeys.clear();
      this.staleGridKeys.clear();
      this.upgradeKeys.clear();
      this.currentLeaves = []; // the next selection settles fully, so the budget holds from the start
    }
    // A new bias, viewport size or field of view moves every patch's pixel
    // error, so selection reruns; existing patches are reused as they are.
    const viewKey = `${shared.viewHeightPixels}:${shared.fieldOfViewRadians}`;
    const detailChanged = shared.maxErrorPixels !== this.lastMaxErrorPixels || viewKey !== this.lastViewKey;
    const turned =
      !!shared.viewDirection && (!this.lastViewDirection || this.lastViewDirection.angleTo(shared.viewDirection) > RESELECT_TURN_ANGLE);
    const movedEnough =
      radiusChanged ||
      detailChanged ||
      turned ||
      this.selectionUnsettled ||
      !this.lastCameraPosition ||
      this.lastCameraPosition.distanceTo(cameraPosition) > shared.radius * RESELECT_DISTANCE_FRACTION;

    if (movedEnough) {
      this.lastCameraPosition = cameraPosition.clone();
      this.lastRadius = shared.radius;
      this.lastMaxErrorPixels = shared.maxErrorPixels;
      this.lastViewKey = viewKey;
      if (shared.viewDirection) this.lastViewDirection = shared.viewDirection.clone();

      const selection = selectPatchesIncremental(
        cameraPosition,
        shared.radius,
        detail,
        this.currentLeaves.length > 0 ? { leaves: this.currentLeaves, pressure: this.pressure, gridResolution: this.currentGrid } : undefined,
      );
      const nextLeaves = selection.leaves;
      this.currentLeaves = nextLeaves;
      this.pressure = selection.pressure;
      this.currentGrid = selection.gridResolution;
      this.visibleCount = selection.visibleCount;
      this.selectionUnsettled = !selection.settled;
      this.stitchFlags = computeStitchFlags(nextLeaves);

      // Patches that leave the selection are kept (hidden, or on screen
      // until their replacements are built) instead of destroyed, so a
      // rotation doesn't rebuild what just turned away.
      const { disposed, toBuild } = this.lifecycle.beginSelection(nextLeaves);
      this.syncVisibility(disposed);
      this.pendingBuilds = toBuild;

      // A selected patch that stays keeps its mesh, but its neighbors may
      // have split or merged, so its edges must follow (the standard
      // chunked-LOD rule: stitching tracks the neighbors' current level).
      this.staleStitchKeys.clear();
      for (const [key, entry] of this.entries) {
        const state = this.lifecycle.entries.get(key)?.state;
        if (state === 'active' && !edgeStitchFlagsEqual(entry.builtFlags, this.stitchFlags.get(key))) this.staleStitchKeys.add(key);
      }

      // Shown or retiring patches built at another grid size get a geometry-only
      // rebuild; hidden cached ones wait until they are needed again.
      for (const [key, entry] of this.entries) {
        const state = this.lifecycle.entries.get(key)?.state;
        if (state !== 'cached' && entry.builtGrid !== this.currentGrid) this.staleGridKeys.add(key);
      }

      // A patch that has come into view (or into reach of the budget) with a
      // smaller bake than it now wants is queued for an upgrade.
      for (const [key, entry] of this.entries) {
        if (this.lifecycle.entries.get(key)?.state === 'cached') continue;
        if (this.wantedBakeSamples(entry.patch, cameraPosition, shared.radius, detail, maxTextureSize) > entry.bakeSamples) this.upgradeKeys.add(key);
      }

      // Nearest first, so what's under the camera fills in before the rest.
      const distanceToCamera = (patch: TerrainPatch) => patchCenterDirection(patch).multiplyScalar(shared.radius).distanceTo(cameraPosition);
      this.pendingBuilds.sort((first, second) => distanceToCamera(first) - distanceToCamera(second));
    }

    const gridResolution = this.currentGrid;
    const gridVertices = gridResolution * gridResolution;
    const maxRestitches = Math.max(1, Math.floor(MAX_RESTITCH_VERTICES_PER_FRAME / gridVertices));
    // Meshes rebuilt in place (neighbors changed detail, or Resolution moved
    // the grid), drawn patches first so what you see stays consistent.
    const geometryJobs = [...new Set([...this.staleGridKeys, ...this.staleStitchKeys])];
    const isShown = (key: string) => (this.lifecycle.entries.get(key)?.shown ? 1 : 0);
    geometryJobs.sort((first, second) => isShown(second) - isShown(first));
    let restitched = 0;
    for (const key of geometryJobs) {
      if (restitched >= maxRestitches) break;
      this.staleStitchKeys.delete(key);
      this.staleGridKeys.delete(key);
      const entry = this.entries.get(key);
      if (!entry) continue;
      const flags = this.stitchFlags.get(key);
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = buildPatchGeometry(entry.patch, shared.radius, gridResolution, flags);
      entry.builtFlags = flags ?? NO_STITCH_FLAGS;
      entry.builtGrid = gridResolution;
      this.lifecycle.setVertices(key, gridVertices);
      restitched++;
    }

    let builtAny = false;
    let builtCount = 0;
    let spentWork = 0;
    while (builtCount < MAX_NEW_PATCHES_PER_FRAME && this.pendingBuilds.length > 0) {
      const patch = this.pendingBuilds[0];
      const key = patchKey(patch);
      if (this.entries.has(key)) {
        this.pendingBuilds.shift();
        continue;
      }
      // The bake the screen wants, within this view's share of the texel
      // budget; a big one is built small first and upgraded below.
      const wantedSamples = this.wantedBakeSamples(patch, cameraPosition, shared.radius, detail, maxTextureSize);
      const bakeSamples = Math.min(wantedSamples, INITIAL_BAKE_SAMPLES);
      if (wantedSamples > bakeSamples) this.upgradeKeys.add(key);
      const work = gridVertices + bakeSamples * bakeSamples;
      if (builtCount > 0 && spentWork + work > MAX_BUILD_VERTICES_PER_FRAME) break;
      this.pendingBuilds.shift();

      const geometry = buildPatchGeometry(patch, shared.radius, gridResolution, this.stitchFlags.get(key));
      const target = new THREE.WebGLRenderTarget(bakeSamples, bakeSamples, { type: THREE.FloatType });
      heightmapPipeline.bakeRegionToTarget(
        renderer,
        { layers, face: faceIndex(patch.face), min: patch.min, max: patch.max, resolution: bakeSamples },
        target,
      );
      const material = createPatchMaterial(patch, target.texture, bakeSamples, shared);
      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      this.entries.set(key, {
        patch,
        builtFlags: this.stitchFlags.get(key) ?? NO_STITCH_FLAGS,
        builtGrid: gridResolution,
        bakeSamples,
        mesh,
        material,
        target,
      });
      this.lifecycle.add(patch, gridVertices, bakeSamples * bakeSamples);
      builtAny = true;
      builtCount++;
      spentWork += work;
    }
    // With nothing new waiting, one built patch whose bake is smaller than the
    // screen wants gets its full-size bake: nearest first, one a frame.
    if (builtCount === 0 && this.upgradeKeys.size > 0) {
      let nearestKey: string | null = null;
      let nearestDistance = Infinity;
      for (const key of this.upgradeKeys) {
        const entry = this.entries.get(key);
        if (!entry || this.lifecycle.entries.get(key)?.state === 'cached') continue;
        const distance = patchCenterDirection(entry.patch).multiplyScalar(shared.radius).distanceTo(cameraPosition);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestKey = key;
        }
      }
      if (nearestKey) {
        this.upgradeKeys.delete(nearestKey);
        const entry = this.entries.get(nearestKey)!;
        const wantedSamples = this.wantedBakeSamples(entry.patch, cameraPosition, shared.radius, detail, maxTextureSize);
        if (wantedSamples > entry.bakeSamples) {
          const target = new THREE.WebGLRenderTarget(wantedSamples, wantedSamples, { type: THREE.FloatType });
          heightmapPipeline.bakeRegionToTarget(
            renderer,
            { layers, face: faceIndex(entry.patch.face), min: entry.patch.min, max: entry.patch.max, resolution: wantedSamples },
            target,
          );
          entry.material.uniforms.uHeightMap.value = target.texture;
          entry.material.uniforms.uBakeSamples.value = wantedSamples;
          entry.target.dispose();
          entry.target = target;
          entry.bakeSamples = wantedSamples;
          this.lifecycle.setBakeTexels(nearestKey, wantedSamples * wantedSamples);
        }
      }
      // Entries that went away or are hidden drop out of the queue.
      for (const key of this.upgradeKeys) if (!this.entries.has(key)) this.upgradeKeys.delete(key);
    }
    // A built replacement may let a retiring patch go and swap them in.
    if (builtAny || this.lifecycle.hasRetiring()) this.syncVisibility(this.lifecycle.refresh());
  }

  // All current patch meshes, nearest hit across all of them — the planet
  // used to be one mesh a raycaster could hit directly; now it's a group,
  // so picking (SceneCanvas.tsx's pickPatchAt) needs to test every current
  // patch mesh and keep the closest intersection, same as intersecting any
  // other multi-mesh group.
  raycast(raycaster: THREE.Raycaster): THREE.Intersection | null {
    let closest: THREE.Intersection | null = null;
    for (const entry of this.entries.values()) {
      if (!entry.mesh.visible) continue;
      const hits = raycaster.intersectObject(entry.mesh, false);
      if (hits[0] && (!closest || hits[0].distance < closest.distance)) closest = hits[0];
    }
    return closest;
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
      entry.target.dispose();
    }
    this.entries.clear();
    this.lifecycle = new PatchLifecycle();
    this.currentLeaves = [];
    this.pendingBuilds = [];
    this.stitchFlags.clear();
    this.staleStitchKeys.clear();
    this.staleGridKeys.clear();
    this.upgradeKeys.clear();
  }
}

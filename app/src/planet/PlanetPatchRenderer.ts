import * as THREE from 'three';
import type { HeightmapPipeline } from '../map/heightmap';
import type { NoiseLayer } from '../map/heightmap';
import { applySharedUniforms, buildPatchGeometry, createPatchMaterial, type PlanetSharedUniforms } from './planetPatchMesh';
import { computeStitchFlags, patchKey, selectLeafPatches, type EdgeStitchFlags } from './planetPatches';
import { faceIndex, type TerrainPatch } from './patch';

// A patch's own baked heightmap stays a fixed 65x65 (Cesium's own heightmap
// tile format, already cited in patch.ts, reused rather than re-guessed) —
// this is sample data, a texture, distinct from the *display mesh*'s own
// resolution below, which is now a live, slider-driven value instead of a
// fixed constant (shared.gridResolution, see ISSUES.md [B28]).
const PATCH_BAKE_SAMPLES = 65;
// A central-difference bump sample a couple of texels wide on this patch's
// own, much smaller texture — the whole-globe shader hardcodes 32/1024 for
// its fixed map; this is the equivalent ratio at this patch's own size, not
// a re-guess.
const PATCH_SAMPLE_OFFSET = 2 / PATCH_BAKE_SAMPLES;
// Recompute the camera-distance LOD selection only once the camera has
// actually moved a meaningful fraction of the radius, not every frame —
// selection + any new bakes are real GPU work, re-running it every single
// frame regardless of whether the view changed would be pure waste.
const RESELECT_DISTANCE_FRACTION = 0.01;
// How many newly-selected patches actually get baked/compiled in one
// updatePatches call — each one is a real GPU bake plus a ShaderMaterial
// compile, and doing all of them synchronously the moment many patches
// become visible at once (e.g. on first load) is what made loading feel
// choppy. Matches Unigine's own terrain streaming docs, which cap tiles
// loaded per frame the same way (default 4) — a cited convention, not a
// guess. See REFERENCES.md.
const MAX_NEW_PATCHES_PER_FRAME = 4;

interface PatchEntry {
  patch: TerrainPatch;
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
  private lastCameraPosition: THREE.Vector3 | null = null;
  private lastRadius = 0;
  private lastGridResolution = 0;
  // Selected (by the quadtree) but not yet actually baked/compiled —
  // drained a few at a time per frame in updatePatches, see
  // MAX_NEW_PATCHES_PER_FRAME.
  private pendingBuilds: TerrainPatch[] = [];
  // Which of each currently-selected patch's edges need the finer-neighbor
  // stitching (planetPatchMesh.ts's buildPatchGeometry), recomputed
  // alongside patch selection itself. See planet/planetPatches.ts's
  // computeStitchFlags, ISSUES.md [B28].
  private stitchFlags = new Map<string, EdgeStitchFlags>();

  // Rebuilds every current patch's bake, e.g. after a layer/paint change —
  // the same moment the single-mesh path re-renders its one shared map.
  rebakeAll(renderer: THREE.WebGLRenderer, heightmapPipeline: HeightmapPipeline, layers: NoiseLayer[]): void {
    for (const entry of this.entries.values()) {
      heightmapPipeline.bakeRegionToTarget(
        renderer,
        { layers, face: faceIndex(entry.patch.face), min: entry.patch.min, max: entry.patch.max, resolution: PATCH_BAKE_SAMPLES },
        entry.target,
      );
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
    const radiusChanged = shared.radius !== this.lastRadius;
    const movedEnough =
      radiusChanged ||
      !this.lastCameraPosition ||
      this.lastCameraPosition.distanceTo(cameraPosition) > shared.radius * RESELECT_DISTANCE_FRACTION;

    if (movedEnough) {
      this.lastCameraPosition = cameraPosition.clone();
      this.lastRadius = shared.radius;

      const nextLeaves = selectLeafPatches(cameraPosition, shared.radius);
      const nextKeys = new Set(nextLeaves.map(patchKey));
      this.stitchFlags = computeStitchFlags(nextLeaves);

      // Drop patches no longer selected, built or still pending.
      for (const [key, entry] of this.entries) {
        if (!nextKeys.has(key)) {
          this.group.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          entry.material.dispose();
          entry.target.dispose();
          this.entries.delete(key);
        }
      }
      this.pendingBuilds = this.pendingBuilds.filter((patch) => nextKeys.has(patchKey(patch)));

      // Queue whatever's newly visible and not already built or queued. A
      // patch already present (the camera moved, but this one's still in
      // view at the same depth) keeps its existing bake rather than paying
      // for a new one.
      const pendingKeys = new Set(this.pendingBuilds.map(patchKey));
      for (const patch of nextLeaves) {
        const key = patchKey(patch);
        if (!this.entries.has(key) && !pendingKeys.has(key)) this.pendingBuilds.push(patch);
      }
    }

    // The Resolution slider changed: every currently-built patch needs a
    // real rebuild at the new grid resolution. Cheapest *correct* way to do
    // that is to drop it and let the pending-build path below (already
    // budgeted per frame, MAX_NEW_PATCHES_PER_FRAME) treat it as newly
    // selected again, reusing one already-tested build path rather than a
    // second, geometry-only one just for this. More expensive than a bare
    // geometry swap (this also re-bakes and recompiles), but a resolution
    // change only fires once per settled slider drag, not continuously,
    // so reusing tested code wins over micro-optimizing this.
    if (shared.gridResolution !== this.lastGridResolution) {
      this.lastGridResolution = shared.gridResolution;
      for (const [key, entry] of this.entries) {
        this.group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.material.dispose();
        entry.target.dispose();
        this.entries.delete(key);
        this.pendingBuilds.push(entry.patch);
      }
    }

    for (let built = 0; built < MAX_NEW_PATCHES_PER_FRAME && this.pendingBuilds.length > 0; built++) {
      const patch = this.pendingBuilds.shift()!;
      const key = patchKey(patch);
      if (this.entries.has(key)) continue;

      const geometry = buildPatchGeometry(patch, shared.radius, shared.gridResolution, this.stitchFlags.get(key));
      const target = new THREE.WebGLRenderTarget(PATCH_BAKE_SAMPLES, PATCH_BAKE_SAMPLES, { type: THREE.FloatType });
      heightmapPipeline.bakeRegionToTarget(
        renderer,
        { layers, face: faceIndex(patch.face), min: patch.min, max: patch.max, resolution: PATCH_BAKE_SAMPLES },
        target,
      );
      const material = createPatchMaterial(patch, target.texture, PATCH_SAMPLE_OFFSET, shared);
      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      this.entries.set(key, { patch, mesh, material, target });
    }
  }

  // All current patch meshes, nearest hit across all of them — the planet
  // used to be one mesh a raycaster could hit directly; now it's a group,
  // so picking (SceneCanvas.tsx's pickPatchAt) needs to test every current
  // patch mesh and keep the closest intersection, same as intersecting any
  // other multi-mesh group.
  raycast(raycaster: THREE.Raycaster): THREE.Intersection | null {
    let closest: THREE.Intersection | null = null;
    for (const entry of this.entries.values()) {
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
    this.pendingBuilds = [];
    this.stitchFlags.clear();
  }
}

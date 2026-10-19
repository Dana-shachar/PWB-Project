import * as THREE from 'three';
import type { HeightmapPipeline } from '../map/heightmap';
import type { NoiseLayer } from '../map/heightmap';
import { applySharedUniforms, buildPatchGeometry, createPatchMaterial, type PlanetSharedUniforms } from './planetPatchMesh';
import { patchKey, selectLeafPatches } from './planetPatches';
import { faceIndex, type TerrainPatch } from './patch';

// Vertices per edge of one patch's own baked grid — Cesium's own heightmap
// tile format (already cited in patch.ts) is a fixed 65x65 per tile; reusing
// that exact, already-established number rather than picking a new one.
const PATCH_GRID_RESOLUTION = 64; // 65x65 vertices
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

  // The expensive half: re-walks the quadtree by camera distance, bakes any
  // newly-visible patch, disposes any patch that fell out of view. Throttled
  // internally by how far the camera has actually moved, not called
  // unconditionally — see RESELECT_DISTANCE_FRACTION.
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
    if (!movedEnough) return;
    this.lastCameraPosition = cameraPosition.clone();
    this.lastRadius = shared.radius;

    const nextLeaves = selectLeafPatches(cameraPosition, shared.radius);
    const nextKeys = new Set(nextLeaves.map(patchKey));

    // Drop patches no longer selected.
    for (const [key, entry] of this.entries) {
      if (!nextKeys.has(key)) {
        this.group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.material.dispose();
        entry.target.dispose();
        this.entries.delete(key);
      }
    }

    // Build + bake whatever's newly visible. A patch already present (the
    // camera moved, but this particular patch is still in view at the same
    // depth) keeps its existing bake rather than paying for a new one.
    for (const patch of nextLeaves) {
      const key = patchKey(patch);
      if (this.entries.has(key)) continue;

      const geometry = buildPatchGeometry(patch, shared.radius, PATCH_GRID_RESOLUTION);
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
  }
}

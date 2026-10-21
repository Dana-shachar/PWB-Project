import * as THREE from 'three';
import { CUBE_FACES } from './cubeFace';
import { MAX_PATCH_DEPTH, patchCenterDirection, rootPatch, subdivide, type TerrainPatch } from './patch';

// How close the camera needs to be, relative to a patch's own world size,
// before that patch is worth splitting further — the same distance/size
// ratio CDLOD's own LOD selection uses (Strugar 2009, see REFERENCES.md):
// a patch much smaller than the camera's distance to it contributes little
// extra visible detail, so there's no reason to resolve it any finer.
const LOD_DISTANCE_FACTOR = 2.2;

// A patch's own rough world size — proportional to the fraction of its
// face's u/v range it covers times the radius. Not exact (a cube face isn't
// isotropic after normalizing onto the sphere, corners stretch slightly more
// than centers), but it only needs to rank patches against each other and
// against camera distance, not measure physical size precisely.
function patchWorldSize(patch: TerrainPatch, radius: number): number {
  return ((patch.max.x - patch.min.x) / 2) * radius;
}

function shouldSplit(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number): boolean {
  if (patch.depth >= MAX_PATCH_DEPTH) return false;
  const center = patchCenterDirection(patch).multiplyScalar(radius);
  const distance = center.distanceTo(cameraPosition);
  return distance < patchWorldSize(patch, radius) * LOD_DISTANCE_FACTOR;
}

function collectLeaves(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number, out: TerrainPatch[]): void {
  if (shouldSplit(patch, cameraPosition, radius)) {
    for (const child of subdivide(patch)) collectLeaves(child, cameraPosition, radius, out);
  } else {
    out.push(patch);
  }
}

const EPSILON = 1e-6;

function overlaps1D(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax - EPSILON && bMin < aMax - EPSILON;
}

// Two patches on the same cube face share an edge of nonzero length — the
// adjacency restricted-quadtree balancing (below) needs to find, to decide
// whether a neighbor's depth is too far from this one's.
function shareEdge(a: TerrainPatch, b: TerrainPatch): boolean {
  const verticalEdge =
    (Math.abs(a.max.x - b.min.x) < EPSILON || Math.abs(b.max.x - a.min.x) < EPSILON) && overlaps1D(a.min.y, a.max.y, b.min.y, b.max.y);
  const horizontalEdge =
    (Math.abs(a.max.y - b.min.y) < EPSILON || Math.abs(b.max.y - a.min.y) < EPSILON) && overlaps1D(a.min.x, a.max.x, b.min.x, b.max.x);
  return verticalEdge || horizontalEdge;
}

// Restricted quadtree: no two same-face neighboring leaves differ by more
// than one depth level. Real chunked-LOD terrain either enforces this (the
// simpler, well-known mitigation) or does true per-vertex morphing across
// every possible neighbor combination (CDLOD's own full technique) — this
// project takes the simpler route for now, same-face only, plus a physical
// skirt per patch (planet/planetPatchMesh.ts) to visually cover whatever
// crack a one-level difference (or an unhandled cross-face boundary) still
// leaves. Cross-face balancing is NOT done here: two different faces have
// entirely different local (u,v) frames, so "neighboring across a face
// boundary" is a harder, separate problem than this pass takes on, flagged
// in ISSUES.md rather than silently skipped.
function balanceFace(leaves: TerrainPatch[]): TerrainPatch[] {
  let current = leaves;
  for (let pass = 0; pass < MAX_PATCH_DEPTH; pass++) {
    let changed = false;
    const next: TerrainPatch[] = [];
    for (const patch of current) {
      const tooShallow = current.some((other) => other !== patch && shareEdge(patch, other) && other.depth > patch.depth + 1);
      if (tooShallow) {
        next.push(...subdivide(patch));
        changed = true;
      } else {
        next.push(patch);
      }
    }
    current = next;
    if (!changed) break;
  }
  return current;
}

// This frame's (or this update's — selection is throttled by the caller,
// not necessarily re-run every single frame) actual list of patches to bake
// and render: distance-based LOD per face, then balanced so no same-face
// neighbors ever differ by more than one depth level.
export function selectLeafPatches(cameraPosition: THREE.Vector3, radius: number): TerrainPatch[] {
  const result: TerrainPatch[] = [];
  for (const face of CUBE_FACES) {
    const faceLeaves: TerrainPatch[] = [];
    collectLeaves(rootPatch(face), cameraPosition, radius, faceLeaves);
    result.push(...balanceFace(faceLeaves));
  }
  return result;
}

// Which of a patch's own four edges border two same-face neighbors one
// level finer — the balancing above guarantees a same-face neighbor is
// never more than one depth level away, so an edge bordered by exactly two
// depth+1 neighbors is the only case where this patch's own fixed vertex
// count (buildPatchGeometry, planetPatchMesh.ts) leaves real points
// unrepresented that the finer side actually has — the T-junction crack
// Dana saw as dark gaps between patches. See ISSUES.md [B28].
export interface EdgeStitchFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

// Matches buildPatchGeometry's own edge naming exactly: top = min.y, bottom
// = max.y, left = min.x, right = max.x (planetPatchMesh.ts's topRow/
// bottomRow/leftCol/rightCol).
export function computeStitchFlags(leaves: TerrainPatch[]): Map<string, EdgeStitchFlags> {
  const result = new Map<string, EdgeStitchFlags>();
  for (const patch of leaves) {
    const finerSameFace = leaves.filter(
      (other) => other !== patch && other.face === patch.face && other.depth === patch.depth + 1,
    );
    const borderedByTwo = (predicate: (other: TerrainPatch) => boolean) => finerSameFace.filter(predicate).length === 2;

    const top = borderedByTwo(
      (other) => Math.abs(other.max.y - patch.min.y) < EPSILON && overlaps1D(other.min.x, other.max.x, patch.min.x, patch.max.x),
    );
    const bottom = borderedByTwo(
      (other) => Math.abs(other.min.y - patch.max.y) < EPSILON && overlaps1D(other.min.x, other.max.x, patch.min.x, patch.max.x),
    );
    const left = borderedByTwo(
      (other) => Math.abs(other.max.x - patch.min.x) < EPSILON && overlaps1D(other.min.y, other.max.y, patch.min.y, patch.max.y),
    );
    const right = borderedByTwo(
      (other) => Math.abs(other.min.x - patch.max.x) < EPSILON && overlaps1D(other.min.y, other.max.y, patch.min.y, patch.max.y),
    );

    result.set(patchKey(patch), { top, bottom, left, right });
  }
  return result;
}

// A stable identity for caching a patch's bake/mesh across frames — two
// calls to subdivide() produce new TerrainPatch objects even for "the same"
// patch, so reference equality can't be used the way voxel/landChunk.ts's
// single current patch gets away with; this needs real structural identity.
export function patchKey(patch: TerrainPatch): string {
  return `${patch.face}:${patch.min.x.toFixed(6)},${patch.min.y.toFixed(6)}:${patch.max.x.toFixed(6)},${patch.max.y.toFixed(6)}`;
}

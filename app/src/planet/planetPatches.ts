import * as THREE from 'three';
import { CUBE_FACES, cubeFacePoint, type CubeFace } from './cubeFace';
import {
  MAX_INDEX_DEPTH,
  MAX_PATCH_DEPTH,
  neighborProbe,
  patchCenterDirection,
  PATCH_EDGES,
  rootPatch,
  subdivide,
  type PatchEdge,
  type TerrainPatch,
} from './patch';

// Level of detail by screen-space error, the rule Cesium documents for
// terrain and 3D Tiles: a patch splits when its simplification error, as
// pixels on screen, is over a threshold (the 3D Tiles spec derives screen-
// space error from a tile's geometricError; Cesium's maximumScreenSpaceError
// is the threshold, lower means more detail). The formula below is the widely
// used form, medium trust. The distance rule is CDLOD's (Strugar 2009).
// Zoomed out, nothing's error reaches the threshold, so little is built.
//
// The Resolution slider is that threshold (planet/patch.ts, in pixels).
// When few patches are in view and the triangle budget has room, the
// threshold drops below it by BONUS_STEP per step, to at most
// MIN_AUTO_ERROR_PIXELS: a close-up gets sharper on its own. That bonus is
// an inference from Dana's request, not a documented rule; TUNABLE.
export const MIN_AUTO_ERROR_PIXELS = 2;
const BONUS_FILL = 0.3;
const MAX_BONUS_STEPS = 6;
// A patch already split merges back only once its error is this much below
// the threshold, so a camera hovering at the split point doesn't flip it
// (the two-threshold hysteresis chunked-LOD uses; replaces the distance
// factors 2.2 and 2.6, which are this same ratio).
export const MERGE_SSE_RATIO = 0.85;

// A patch's width along the sphere, in world units: its share of a cube
// face's width times a quarter turn of the radius. An average (a face's
// center is about 1.3 times wider per unit than its corners), it only needs
// to rank patches against camera distance, not measure them exactly.
function patchWorldSize(patch: TerrainPatch, radius: number): number {
  return ((patch.max.x - patch.min.x) / 2) * (Math.PI / 2) * radius;
}

// What the screen-space-error rule needs besides the camera's position.
export interface PatchDetail {
  // The Resolution slider: the screen-space error, in pixels, a patch may
  // have before it splits. Lower is sharper.
  maxErrorPixels: number;
  // Cells across a patch's mesh (PATCH_GRID).
  gridResolution: number;
  // The viewport's height in pixels, and the camera's vertical field of view.
  viewHeightPixels: number;
  fieldOfViewRadians: number;
  // What the camera sees. Patches outside it are not split, so a close-up
  // builds only what is in view; the coarse placeholders stay. Absent means
  // no culling beyond the horizon.
  frustum?: THREE.Frustum;
  // How far terrain can rise above the sphere, so a tall patch isn't culled.
  elevationMargin: number;
}

// Distance from the camera to the near side of a patch's bounding sphere,
// kept above a small floor so a camera at the surface can't divide by zero.
function distanceToPatch(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number): number {
  const center = patchCenterDirection(patch).multiplyScalar(radius);
  const boundingRadius = patchWorldSize(patch, radius) * 0.75;
  return Math.max(center.distanceTo(cameraPosition) - boundingRadius, radius * 0.001);
}

// Pixels per world unit at a distance: viewport height over the view's
// height at that distance (2 * distance * tan(fov / 2)).
function pixelsPerWorldUnit(distance: number, detail: PatchDetail): number {
  return detail.viewHeightPixels / (distance * 2 * Math.tan(detail.fieldOfViewRadians / 2));
}

// The patch's geometricError is the world spacing between its mesh cells
// (patch width over the grid), the coarsest thing it draws; the screen-space
// error is that spacing in pixels from the camera.
export function screenSpaceError(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number, detail: PatchDetail): number {
  const geometricError = patchWorldSize(patch, radius) / detail.gridResolution;
  return geometricError * pixelsPerWorldUnit(distanceToPatch(patch, cameraPosition, radius), detail);
}

// How wide a patch appears on screen, in pixels, for choosing its bake size.
export function patchPixelWidth(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number, detail: PatchDetail): number {
  return patchWorldSize(patch, radius) * pixelsPerWorldUnit(distanceToPatch(patch, cameraPosition, radius), detail);
}

// The most triangles worth drawing at once. Over it, the threshold rises one
// step at a time, so the refinements that matter least (the fewest pixels of
// error) are dropped first and what is under the camera keeps its detail.
const MAX_VISIBLE_TRIANGLES = 6_000_000;
// Each pressure step multiplies the pixel threshold by this, up to the max.
const PRESSURE_THRESHOLD_STEP = 1.25;
const MAX_PRESSURE = 16;
// Balancing adds some patches after the count is taken, so leave headroom.
const BUDGET_HEADROOM = 1.25;
// Pressure only steps back down when the lower level fits well inside the
// budget, so it can't oscillate right at the limit.
const BUDGET_RELAX = 0.85;

interface SelectionContext {
  cameraPosition: THREE.Vector3;
  cameraDirection: THREE.Vector3;
  radius: number;
  detail: PatchDetail;
  horizonAngle: number;
  // How many budget steps raise the pixel threshold.
  pressure: number;
  // The previous selection, to tell a patch that was already split.
  previousIndex?: LeafIndex;
}

// A patch already split stays so a little past the horizon, so one hovering
// at the edge of view doesn't flip.
const HORIZON_HYSTERESIS_ANGLE = 0.05;

// A patch inside the horizon cone (plus its own angular radius) and the
// camera's frustum can actually be seen. Culls the far side of the planet and
// whatever is out of view. A margin keeps a patch already split from flipping.
function isVisible(patch: TerrainPatch, context: SelectionContext, margin = 0): boolean {
  const halfExtent = (patch.max.x - patch.min.x) / 2;
  const angularRadius = halfExtent * Math.SQRT2;
  const center = patchCenterDirection(patch);
  if (center.angleTo(context.cameraDirection) >= context.horizonAngle + angularRadius + margin) return false;
  const frustum = context.detail.frustum;
  if (!frustum) return true;
  return patchIntersectsFrustum(patch, context.radius, context.detail.elevationMargin, frustum, margin > 0 ? patchWorldSize(patch, context.radius) * 0.25 : 0);
}

// The conservative corner test: a patch's column of terrain (its four corners
// and center, at the lowest and highest the ground can be) is outside the
// frustum only if all of those points lie behind one of its planes. Tighter
// than a bounding sphere, which tall terrain would inflate until nothing was
// culled. `inflate` loosens it a little for a patch already split.
const cullPoint = new THREE.Vector3();
function patchIntersectsFrustum(patch: TerrainPatch, radius: number, elevationMargin: number, frustum: THREE.Frustum, inflate: number): boolean {
  const spots: Array<[number, number]> = [
    [patch.min.x, patch.min.y],
    [patch.max.x, patch.min.y],
    [patch.min.x, patch.max.y],
    [patch.max.x, patch.max.y],
    [(patch.min.x + patch.max.x) / 2, (patch.min.y + patch.max.y) / 2],
  ];
  const directions = spots.map(([u, v]) => cubeFacePoint(patch.face, u, v).normalize());
  for (const plane of frustum.planes) {
    let anyInside = false;
    for (const direction of directions) {
      for (const height of [-elevationMargin, elevationMargin]) {
        cullPoint.copy(direction).multiplyScalar(radius + height);
        if (plane.distanceToPoint(cullPoint) >= -inflate) {
          anyInside = true;
          break;
        }
      }
      if (anyInside) break;
    }
    if (!anyInside) return false;
  }
  return true;
}

// Whether a patch is in view from a camera position, for choosing how big its
// bake should be (patches out of view stay small).
export function patchInView(patch: TerrainPatch, cameraPosition: THREE.Vector3, radius: number, detail: PatchDetail): boolean {
  const cameraDistance = Math.max(cameraPosition.length(), radius * 1.0001);
  const context = {
    cameraPosition,
    cameraDirection: cameraPosition.clone().normalize(),
    radius,
    detail,
    horizonAngle: Math.acos(Math.min(1, radius / cameraDistance)),
    pressure: 0,
  } as SelectionContext;
  return isVisible(patch, context);
}

// True if the previous selection had this patch split into deeper leaves.
function wasSplit(patch: TerrainPatch, context: SelectionContext): boolean {
  if (!context.previousIndex) return false;
  const previous = leafContaining(context.previousIndex, patch.face, (patch.min.x + patch.max.x) / 2, (patch.min.y + patch.max.y) / 2);
  return !!previous && previous.depth > patch.depth;
}

// The pixel threshold at a budget level: above 0 the budget is tight and the
// threshold rises; below 0 there is room and it drops, never under the
// automatic floor (the slider itself may go lower).
function thresholdFor(maxErrorPixels: number, pressure: number): number {
  const scaled = maxErrorPixels * PRESSURE_THRESHOLD_STEP ** pressure;
  return pressure < 0 ? Math.max(scaled, Math.min(maxErrorPixels, MIN_AUTO_ERROR_PIXELS)) : scaled;
}

function shouldSplit(patch: TerrainPatch, context: SelectionContext): boolean {
  if (patch.depth >= MAX_PATCH_DEPTH) return false;
  const split = wasSplit(patch, context);
  if (!isVisible(patch, context, split ? HORIZON_HYSTERESIS_ANGLE : 0)) return false;
  const threshold = thresholdFor(context.detail.maxErrorPixels, context.pressure);
  const error = screenSpaceError(patch, context.cameraPosition, context.radius, context.detail);
  return error > (split ? threshold * MERGE_SSE_RATIO : threshold);
}

function collectLeaves(patch: TerrainPatch, context: SelectionContext, out: TerrainPatch[]): void {
  if (shouldSplit(patch, context)) {
    for (const child of subdivide(patch)) collectLeaves(child, context, out);
  } else {
    out.push(patch);
  }
}

function collectAllFaces(context: SelectionContext): TerrainPatch[] {
  const leaves: TerrainPatch[] = [];
  for (const face of CUBE_FACES) collectLeaves(rootPatch(face), context, leaves);
  return leaves;
}

// Leaves indexed by cell (face, depth, column, row), so "which leaf contains
// this point" is a short walk down the tree instead of a scan of every leaf.
export type LeafIndex = Map<string, TerrainPatch>;

function cellKey(face: CubeFace, depth: number, column: number, row: number): string {
  return `${face}:${depth}:${column}:${row}`;
}

function leafKeyOf(patch: TerrainPatch): string {
  const cells = 2 ** patch.depth;
  return cellKey(patch.face, patch.depth, Math.round(((patch.min.x + 1) / 2) * cells), Math.round(((patch.min.y + 1) / 2) * cells));
}

export function buildLeafIndex(leaves: TerrainPatch[]): LeafIndex {
  const index: LeafIndex = new Map();
  for (const leaf of leaves) index.set(leafKeyOf(leaf), leaf);
  return index;
}

function leafContaining(index: LeafIndex, face: CubeFace, u: number, v: number): TerrainPatch | undefined {
  for (let depth = 0; depth <= MAX_INDEX_DEPTH; depth++) {
    const cells = 2 ** depth;
    const column = Math.min(cells - 1, Math.max(0, Math.floor(((u + 1) / 2) * cells)));
    const row = Math.min(cells - 1, Math.max(0, Math.floor(((v + 1) / 2) * cells)));
    const leaf = index.get(cellKey(face, depth, column, row));
    if (leaf) return leaf;
  }
  return undefined;
}

// The leaf across one of a patch's edges, `t` along it, whether on the same
// cube face or the next one over (see neighborProbe in patch.ts).
function leafAcross(index: LeafIndex, patch: TerrainPatch, edge: PatchEdge, t: number): TerrainPatch | undefined {
  const probe = neighborProbe(patch, edge, t);
  return leafContaining(index, probe.face, probe.coord.x, probe.coord.y);
}

// Restricted quadtree: no two neighboring leaves differ by more than one
// depth level, across cube-face edges as well as within a face. Real chunked-
// LOD terrain either enforces this (the simpler, well-known mitigation) or
// does true per-vertex morphing across every neighbor combination (CDLOD's
// own full technique), this project takes the simpler route. A patch too
// shallow next to a much deeper one is split, repeatedly, until none are. The
// physical skirt per patch (planet/planetPatchMesh.ts) stays as a last-resort
// cover, not the thing hiding cracks.
export function balance(leaves: TerrainPatch[]): TerrainPatch[] {
  let current = leaves;
  for (let pass = 0; pass < MAX_PATCH_DEPTH * 2; pass++) {
    const index = buildLeafIndex(current);
    const tooShallow = new Set<TerrainPatch>();
    for (const patch of current) {
      if (patch.depth < 2) continue;
      for (const edge of PATCH_EDGES) {
        const neighbor = leafAcross(index, patch, edge, 0.5);
        if (neighbor && neighbor.depth < patch.depth - 1) tooShallow.add(neighbor);
      }
    }
    if (tooShallow.size === 0) break;
    const next: TerrainPatch[] = [];
    for (const patch of current) {
      if (tooShallow.has(patch)) next.push(...subdivide(patch));
      else next.push(patch);
    }
    current = next;
  }
  return current;
}

// The leaves of a selection that cover a given patch's ground: the patch
// itself, the one leaf that absorbed it, or every leaf it was split into.
// What a replaced patch waits on before it can be released.
export function coveringLeaves(index: LeafIndex, patch: TerrainPatch): TerrainPatch[] {
  const containing = leafContaining(index, patch.face, (patch.min.x + patch.max.x) / 2, (patch.min.y + patch.max.y) / 2);
  if (!containing) return [];
  if (containing.depth <= patch.depth) return [containing];
  const covering: TerrainPatch[] = [];
  collectDescendantLeaves(index, patch, covering);
  return covering;
}

function collectDescendantLeaves(index: LeafIndex, patch: TerrainPatch, out: TerrainPatch[]): void {
  const leaf = index.get(leafKeyOf(patch));
  if (leaf) {
    out.push(leaf);
    return;
  }
  if (patch.depth >= MAX_INDEX_DEPTH) return;
  for (const child of subdivide(patch)) collectDescendantLeaves(index, child, out);
}

export interface PatchSelection {
  leaves: TerrainPatch[];
  // How many budget steps are in force (negative: the sharpening bonus),
  // passed back in as `previous` next time.
  pressure: number;
  // How many selected patches are actually in view, for the bake budget.
  visibleCount: number;
  // False when something moved this update, so one more pass is due.
  settled: boolean;
}

// This update's actual list of patches to bake and render, by screen-space
// error, then balanced. If the triangle budget is blown the pixel threshold
// is raised, and if there is plenty of room it drops (the bonus). Given the
// previous selection, the budget pressure moves by at most one step per update
// (so a small camera move can't mass-rebuild) and splits use hysteresis; the
// first selection has no previous one and settles fully.
export function selectPatchesIncremental(
  cameraPosition: THREE.Vector3,
  radius: number,
  detail: PatchDetail,
  previous?: { leaves: TerrainPatch[]; pressure: number },
): PatchSelection {
  const cameraDistance = Math.max(cameraPosition.length(), radius * 1.0001);
  const baseContext: SelectionContext = {
    cameraPosition,
    cameraDirection: cameraPosition.clone().normalize(),
    radius,
    detail,
    horizonAngle: Math.acos(Math.min(1, radius / cameraDistance)),
    pressure: previous ? Math.min(Math.max(previous.pressure, -MAX_BONUS_STEPS), MAX_PRESSURE) : 0,
    previousIndex: previous ? buildLeafIndex(previous.leaves) : undefined,
  };
  const collectAt = (pressure: number): TerrainPatch[] => collectAllFaces({ ...baseContext, pressure });
  const visibleOf = (leaves: TerrainPatch[]): number => leaves.filter((leaf) => isVisible(leaf, baseContext)).length;
  const triangles = (count: number) => count * 2 * detail.gridResolution ** 2 * BUDGET_HEADROOM;
  const overBudget = (count: number, factor = 1) => triangles(count) > MAX_VISIBLE_TRIANGLES * factor;

  let pressure = baseContext.pressure;
  let leaves = collectAt(pressure);

  if (!previous) {
    while (overBudget(leaves.length) && pressure < MAX_PRESSURE) {
      pressure++;
      leaves = collectAt(pressure);
    }
    return { leaves: balance(leaves), pressure, visibleCount: visibleOf(leaves), settled: true };
  }

  let settled = true;
  if (overBudget(leaves.length) && pressure < MAX_PRESSURE) {
    pressure++;
    leaves = collectAt(pressure);
    settled = false;
  } else if (pressure > 0) {
    const lowered = collectAt(pressure - 1);
    if (!overBudget(lowered.length, BUDGET_RELAX)) {
      pressure--;
      leaves = lowered;
      settled = false;
    }
  } else if (pressure > -MAX_BONUS_STEPS) {
    // Room to spare: one step sharper while the result stays well in budget.
    const sharper = collectAt(pressure - 1);
    if (!overBudget(sharper.length, BONUS_FILL)) {
      pressure--;
      leaves = sharper;
      settled = false;
    }
  }
  if (pressure < 0 && overBudget(leaves.length, BONUS_FILL * 1.2)) {
    pressure++;
    leaves = collectAt(pressure);
    settled = false;
  }
  return { leaves: balance(leaves), pressure, visibleCount: visibleOf(leaves), settled };
}

export function selectLeafPatches(cameraPosition: THREE.Vector3, radius: number, detail: PatchDetail): TerrainPatch[] {
  return selectPatchesIncremental(cameraPosition, radius, detail).leaves;
}

// Which of a patch's own four edges border two neighbors one level finer
// (same face or across a cube edge) — the balancing above guarantees a
// neighbor is never more than one depth level away, so an edge bordered by
// exactly two depth+1 neighbors is the only case where this patch's own
// fixed vertex count (buildPatchGeometry, planetPatchMesh.ts) leaves real
// points unrepresented that the finer side actually has — the T-junction
// crack Dana saw as dark gaps between patches. See ISSUES.md [B28].
export interface EdgeStitchFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

// Matches buildPatchGeometry's own edge naming exactly: top = min.y, bottom
// = max.y, left = min.x, right = max.x (planetPatchMesh.ts's topRow/
// bottomRow/leftCol/rightCol). Probes a quarter and three quarters along
// each edge: two different finer leaves there means it's bordered by two.
export function computeStitchFlags(leaves: TerrainPatch[]): Map<string, EdgeStitchFlags> {
  const index = buildLeafIndex(leaves);
  const result = new Map<string, EdgeStitchFlags>();
  for (const patch of leaves) {
    const flags: EdgeStitchFlags = { top: false, bottom: false, left: false, right: false };
    for (const edge of PATCH_EDGES) {
      const first = leafAcross(index, patch, edge, 0.25);
      const second = leafAcross(index, patch, edge, 0.75);
      flags[edge] = !!first && !!second && first !== second && first.depth === patch.depth + 1 && second.depth === patch.depth + 1;
    }
    result.set(patchKey(patch), flags);
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

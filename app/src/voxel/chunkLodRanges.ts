// The chunk's detail ranges, from one view distance, as CDLOD does (Strugar 2009; its CDLODQuadTree.cpp). Every range is a
// share of the view distance, and the view distance comes from the haze, so stronger haze loads less.

// The haze amount at which the ground counts as hidden. TUNABLE.
export const HAZE_CLOSED_SHARE = 0.98;
// Each level covers twice the distance of the next finer one (CDLOD's LODLevelDistanceRatio, its demo's 2.0).
export const LOD_DISTANCE_RATIO = 2;
// Where each level starts blending into the next coarser one, as a share of its range: the paper's "last 15%-30%". TUNABLE
export const MORPH_START_RATIO = 0.7;
// CDLOD's GetMorphConsts pulls each blend's end in by 1%, so a vertex is fully blended just before its range ends.
const MORPH_END_FUDGE = 0.01;

export interface HazeShape {
  density: number; // per chunk unit at the haze floor (uHazeDensity)
  scaleHeight: number; // world units over which the haze thins by e (uHazeScaleHeight)
  floor: number; // the haze floor's world height (uHazeFloor)
}

// How far a level ray from this height travels before the haze reaches HAZE_CLOSED_SHARE: haze.glsl's amount for a level
// ray (density e^(-height / scale) times distance), solved for the distance. Infinite with no haze.
export function hazeViewDistance(haze: HazeShape, eyeHeight: number): number {
  const localDensity = haze.density * Math.exp(-Math.max(eyeHeight - haze.floor, 0) / Math.max(haze.scaleHeight, 1e-4));
  if (localDensity <= 0) return Infinity;
  return Math.log(1 / (1 - HAZE_CLOSED_SHARE)) / localDensity;
}

// Each tree level's range: index 0 is the root and covers the whole view distance, each finer level about half the last.
// CDLOD's loop: the finest level gets one section, and each coarser level adds LOD_DISTANCE_RATIO times the last section.
export function lodRanges(viewDistance: number, levelCount: number): number[] {
  let total = 0;
  let balance = 1;
  for (let i = 0; i < levelCount; i++) {
    total += balance;
    balance *= LOD_DISTANCE_RATIO;
  }
  const section = viewDistance / total;
  const ranges = new Array<number>(levelCount);
  let reach = 0;
  balance = 1;
  for (let i = 0; i < levelCount; i++) {
    reach += section * balance;
    ranges[levelCount - i - 1] = reach;
    balance *= LOD_DISTANCE_RATIO;
  }
  return ranges;
}

// Each tree level's blend into its parent, [start, end], by tree level like lodRanges. CDLOD's loop runs from the finest
// level out: a level ends at its own range and starts MORPH_START_RATIO of the way from the previous level's start.
export function morphRanges(ranges: number[]): [number, number][] {
  const levelCount = ranges.length;
  const blends = new Array<[number, number]>(levelCount);
  let previousStart = 0;
  for (let i = 0; i < levelCount; i++) {
    const level = levelCount - i - 1;
    const end = ranges[level];
    const start = previousStart + (end - previousStart) * MORPH_START_RATIO;
    blends[level] = [start, end + (start - end) * MORPH_END_FUDGE];
    previousStart = start;
  }
  return blends;
}

// The shortest view distance whose ranges pass CDLOD's safety check at every level ("increasing the viewing range will
// move LOD transition areas further away ... and solve the problem", Strugar 2009). A patch picked at level t reaches at
// most its range plus its own diagonal (heightSpans: the tallest patch's height range at each level); ranges grow in step
// with the distance, so each level's bound is solved exactly and the largest wins.
export function minRangeDistance(chunkSize: number, heightSpans: number[]): number {
  const levelCount = heightSpans.length;
  const unitRanges = lodRanges(1, levelCount);
  const unitBlends = morphRanges(unitRanges);
  let needed = 0;
  for (let level = 1; level < levelCount; level++) {
    const patchSize = chunkSize / 2 ** level;
    const diagonal = Math.hypot(patchSize, patchSize, heightSpans[level]);
    const margin = unitBlends[level - 1][0] - unitRanges[level];
    if (margin <= 0) return Infinity;
    needed = Math.max(needed, diagonal / margin);
  }
  return needed;
}

// The tallest patch's height range at each tree level, in world units, from the ground map (rows top to bottom, raw), as
// CDLOD keeps each node's min and max height. Read once per map; levels finer than the map share its finest cell.
const spanCache = new WeakMap<Float32Array, Map<string, number[]>>();
export function levelHeightSpans(ground: { data: Float32Array; size: number; heightBase: number }, maxHeight: number, levelCount: number): number[] {
  let byKey = spanCache.get(ground.data);
  if (!byKey) {
    byKey = new Map();
    spanCache.set(ground.data, byKey);
  }
  const key = `${levelCount}:${maxHeight}:${ground.heightBase}`;
  const cached = byKey.get(key);
  if (cached) return cached;
  const toWorld = (raw: number) => Math.max(0, raw + ground.heightBase) * maxHeight;
  const last = ground.size - 1;
  const spans: number[] = [];
  for (let level = 0; level < levelCount; level++) {
    const cells = Math.min(2 ** level, last);
    let tallest = 0;
    for (let cellRow = 0; cellRow < cells; cellRow++) {
      for (let cellCol = 0; cellCol < cells; cellCol++) {
        let low = Infinity;
        let high = -Infinity;
        const lastRow = Math.ceil(((cellRow + 1) * last) / cells);
        const lastCol = Math.ceil(((cellCol + 1) * last) / cells);
        for (let row = Math.floor((cellRow * last) / cells); row <= lastRow; row++) {
          for (let col = Math.floor((cellCol * last) / cells); col <= lastCol; col++) {
            const raw = ground.data[row * ground.size + col];
            if (raw < low) low = raw;
            if (raw > high) high = raw;
          }
        }
        tallest = Math.max(tallest, toWorld(high) - toWorld(low));
      }
    }
    spans.push(tallest);
  }
  byKey.set(key, spans);
  return spans;
}

// CDLOD's safety check (m_visDistTooSmall): a patch reaching past its parent level's blend start would carry two blends at
// once, which opens seams. True when the ranges are too short for a patch this far out at this level.
export function rangesTooSmall(blends: [number, number][], treeLevel: number, farthestDistance: number): boolean {
  if (treeLevel <= 0) return false;
  return farthestDistance > blends[treeLevel - 1][0];
}

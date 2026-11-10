# 🧵 Skirts bug: the "drips" on hillsides

*Vertical streaks hanging down hillsides at walking height. Bug `[B171]` in `ISSUES.md`. Investigated 2026-11-08 and 11-09; cause found, fix planned, not built.*

---

## 📋 Status

*Where this stands in one look.*

- ✅ **Cause found:** skirts showing through gaps where two patches of different detail don't meet.
- ✅ **Rule for the fix found:** both patches must use identical edge points (every source agrees).
- ⚪ **Fix:** planned below, not built.
- ⏸️ **Open first step:** a read-only check at a drip view, to see which side of a seam leaves the shared edge line.

---

## 🔍 What the bug is

*The words used below, then what Dana sees.*

**Patch**
- One square tile of the land chunk's ground. Near the eye the tiles are small and detailed; far away they are big and coarse.
- Example: at walking height the patch under the eye spans about 4 km with a height point every 31 to 61 m.

**Seam**
- The edge where two patches meet. Where a finer patch meets a coarser one, the finer edge has twice as many points.

**Skirt**
- A vertical strip hanging from every patch edge down to the slab's base, the standard way to hide small cracks between terrain tiles (Ulrich's Chunked LOD; Cesium).
- If two patches don't meet, you look through the crack onto the skirt.

**What Dana sees**
- Thin vertical "drips" and broken lines on hillsides, worst at a low eye height, gone at the maximum eye height.
- They looked worse after the round that stylized the shading (layered haze, slope rock, stronger contrast).

---

## 🧪 How it was diagnosed

*Each step, what it showed, and what it ruled in or out. In order.*

1. **Rock off, same view.** The drips stayed. The rock is not the cause. It does cause a separate problem, dark dashes on rocky slopes (`[B170]`).
2. **Lake rim off, same view.** No change; the rim was not even active (lakes off on Dana 01).
3. **Bare geometry view.** The ground drawn as plain triangles lit by their own facing, no colors, rock or per-pixel lighting. The drips stayed as thin vertical faces: they are **geometry, not shading**.
4. **Each patch tinted its own color.** Every drip carried the color of the patch **above** it and hung over the patch below. So the drips are **skirts showing at patch borders**.
5. **Skirt detector at a drip view.** Every skirt pixel painted red and counted: **6,128 skirt pixels showing (1.3% of the view)**. Confirms gaps between patches.
6. **Compared with the last commit (`c39f118`).** Committed all work on branch `wip-2026-11-09`, switched to the last commit, same camera. The bare geometry showed **the same seam lines in the same places**. The seams are **not new**; the new look most likely made them visible (inferred, see below).
7. **Read the code changed since the last commit.** None of the 32 changed files alters how patches meet: the mesh and skirt builder (`planet/planetPatchMesh.ts`) only gained rock color uniforms, and the blend between detail levels is unchanged.
8. **Eye height test (Dana).** Drips vanish at the maximum eye height. Fits skirts: seen from above, the higher patch covers the gap and the strip turns edge-on.

**Why they became visible (inferred, not proven)**
- The skirt's pixels sit far below the ground. The new layered haze colors by height and distance (a darker near color, denser haze low down), so skirts read as dark streaks where the old, lighter haze blended them in.
- Today's patch fixes (`[B167]`, `[B169]`) made more patches near the eye finer, so more fine-to-coarse borders sit in view.
- Walk mode is now used at low eye heights, the grazing angle where skirts show most.

---

## ❌ What was tried and ruled out

*Each idea, why it looked plausible, and the evidence against it.*

**A collider read from the drawn triangles (`[B165]`)**
- Tried for the eye ending inside the ground. Tested alone: ground over the eye in 432 of 593 frames with it, 93 of 516 without. Reverted.

**Patch boxes ignoring the slab lift (`[B167]`)**
- A real bug, fixed (finer ground underfoot), but not the drips: at Dana's drip spots the ground sits below the old box top, so the fix changed nothing there.

**CDLOD distance ranges replacing the selection**
- Froze the tab (no cap on patch count, reach stretched by a worst-case estimate). Reverted.

**32 cells per patch instead of 64 (CDLOD's demo grid)**
- Gap count barely moved. Reverted.

**A stitch-edge shader change, in memory**
- No visible change at one drip view; whether it compiled was not verified before the page reloaded. Not ruled in or out.

---

## ⚠️ Measuring mistakes, so they aren't repeated

*Numbers that turned out wrong, and why.*

- **Wrong border.** A seam script read heights assuming a 2-sample border; the real border is 4 (`PATCH_BORDER_TEXELS`). It produced a false "baked heights disagree, 54 m median, 620 m max" finding. Every seam count from the morning of 2026-11-09 is void.
- **Steepness counted as drips.** A "near-vertical pixels" count scored 19.3% for both the old and current code: it measured steep terrain, not drips. Discarded.
- **Light-dependent debug view.** The bare geometry view shades by the light, which follows the camera, so seam faces can look bright and vanish. The skirt detector (red skirt pixels) doesn't depend on light; use it.
- **Settled vs loading.** Some seam lines were caught while patches were still loading. Measure after the patch system reports settled.

---

## 📚 What the sources say

*Every source read for this bug, with what it says, so none needs reopening. All read in full on 2026-11-09 unless marked.*

**CDLOD paper** · Strugar 2009 · peer-reviewed, high trust
- Edge vertices "must remain exactly the same as the ones on the neighbouring nodes"; heights must be sampled "using a consistent filter" on both sides.
- Each node stores the min and max height of its area; that box drives both the detail choice and frustum culling.
- "Granularity issues": a node can carry only one blend between two levels; rough terrain with large height differences needs different settings (longer view range, fewer levels, or a finer quadtree).
- *[Paper PDF](https://github.com/fstrugar/CDLOD/blob/master/cdlod_paper_latest.pdf); text extracted locally, not in the course folder.*

**CDLOD reference code** · Strugar, `source/BasicCDLOD` · the author's own implementation, high trust
- `CDLODQuadTree.cpp`: LOD ranges are shares of one view distance, each twice the next (`LODLevelDistanceRatio` 2.0); a node uses its children when its box reaches the next finer range; each level blends over the last part of its range (`MorphStartRatio`); `m_visDistTooSmall` flags a selected node whose farthest point passes its parent's blend start.
- `CDLODTerrain.vsh`: the blend weight comes from each vertex's own distance to the eye.
- Demo grid: 32 cells per node (`LeafQuadTreeNodeSize` 8 x `RenderGridResolutionMult` 4).
- *[Repository](https://github.com/fstrugar/CDLOD) (files read through the GitHub API).*

**Geometry Clipmaps** · Losasso and Hoppe 2004, section 6.2 · peer-reviewed, high trust
- Each level blends into the next coarser one near its outer boundary; the weight "ramps up linearly to reach 1 at the outer perimeter" over a width of n/10 grid units, so the boundary **is** the coarser shape at any distance.
- Leftover cracks at T-junctions (a fine edge's extra points against a coarse edge) are closed with "zero-area triangles": the extra points lie on the coarse edge's line.
- *Course folder: `Geometry Clipmaps- Terrain Rendering Using Nested Regular Grids .pdf` · [project page](https://hhoppe.com/proj/geomclipmap/).*

**Khronos forum, "Chunked LOD cracks"** · 2014, 12 posts · forum, medium trust
- The cause named by the expert replying: no skirts can stitch tiles "if you change the vertices at one side of the border and not on the other."
- The fix rule: size tiles so "the vertices on the edges are shared between tiles."
- Also discussed: skirts, an overlapping ring around each chunk, a separate stitching strip. The thread never confirms a working fix.
- *[Thread](https://community.khronos.org/t/chunked-lod-cracks/72110)*

**Godot forum, "Data Aligned CLOD"** · 2026, 4 posts · forum, medium trust
- Builds on Ulrich's Chunked LOD; removed skirts because they were "messing up the normals at the seams slightly."
- Gives no rule for closing gaps afterwards; its tiles are power-of-two meshes that "just line up."
- *[Thread](https://forum.godotengine.org/t/data-aligned-clod/140289)*

**pulsegeek, "Terrain stitching and chunking"** · 2025 article · low trust, no sources cited
- Stitch strips that "average neighbor heights and recompute normals"; skirts are "cheap and robust" but "visible on silhouettes."
- Too vague to build from, and its own sample builds skirts. Not used.
- *[Article](https://pulsegeek.com/articles/terrain-stitching-and-chunking-seamless-streaming/)*

**gamedev.net, "Geomipmapping: solving cracks"** · not read
- The site refused automated access. Only a search summary was seen: skirts can fail "when viewed along the surface plane." Not relied on.
- *[Thread](https://www.gamedev.net/forums/topic/323462-geomipmapping-solving-cracks/)*

> [!NOTE]
> 🧭 **The rule every source agrees on:** both patches on a border must use identical edge points. Hiding the gap (recoloring skirts) treats the symptom; matching the edges removes it.

---

## 🛠️ Fix plan

*One step per test, each tried in memory in Claude's tab before any file changes.*

1. **Read-only check at a drip view.** Read both patches' heights along a gapped edge (border 4, after the patches settle): which side leaves the shared edge line, and by how much. Decides which part of step 2 does the work.
2. **Shared edge rule** in `app/src/shaders/terrain/chunk.vert.glsl`:
   - **Edge with a coarser neighbor (fine side):** the blend into the coarser shape reaches exactly 1 at the edge, ramping over 6.4 cells (the paper's n/10 of 64).
   - **Edge with a finer neighbor (coarse side):** the patch's own blend fades to 0 at the edge, so it shows its own shape, the one the fine side copies; its extra stitch points sit exactly on the line between their two coarse neighbors.
   - New per-patch uniforms `uEdgeCoarser` and `uEdgeFiner`, set in `app/src/voxel/ChunkPatchRenderer.ts` from the existing `computeStitchFlags` and a new `computeCoarserEdges` in `app/src/planet/planetPatches.ts`. No files added or removed.
3. **Same rule in walk mode's height read** (`sampleHeight`, `ChunkPatchRenderer.ts`), so the eye matches the drawn ground.
4. **Tests before Dana sees it:**
   - Skirt pixels at the drip view near 0 (6,128 before).
   - No seam lines in the bare geometry view, after the patches settle.
   - No new flicker while panning (swap count during a 3 s pan), frame time unchanged.
   - Then Dana's test at her drip spots.

> [!NOTE]
> ⚠️ **Risk:** where three detail levels meet at one corner, the two edge rules can ask for different shapes at the same point. Neighbor balancing keeps patches within one level of each other along edges, so this should be rare; check corners in the test.

---

## 🧰 How to test

*The tools built for this, so they aren't rebuilt.*

- **Skirt detector:** replace the terrain shader's final color with red where `vDisplace < 0.999` (skirt) and black elsewhere, render the view offscreen, count red pixels.
- **Bare geometry view:** final color from the triangle's own facing, `normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)))`; light-dependent, so pair it with the skirt detector.
- **Per-patch tint:** color each patch by a hash of `uPatchUvMin` to see which patch a mark belongs to.
- **Same view across versions:** save the camera's position and rotation (`sessionStorage`), switch code, restore it after walk mode settles.
- **Old code without the probe:** the last commit has no `window.__probe`; find the walk camera through a one-frame hook on `renderer.render` (the perspective camera with `near < 1`).

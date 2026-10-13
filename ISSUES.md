# Decisions & Issues

`Last updated: 2026-10-13`

Technical decisions, tradeoffs, and bugs for this project — organized by category (not chronologically; `ROADMAP.md` tracks current stage/feature status and points here for detail; `WEEKLY-PUSHES.md` is the chronological log).

Each entry is short numbered lists, not prose, each longer item as **bold short name** — explanation:
> 🐛 **Bug** or 🧭 **Decision** — one-line title
> **Status:** <span style="color:#2da44e">✅ Fixed/Decided</span> · <span style="color:#bf8700">🟡 Partial</span> · <span style="color:#cf222e">🔴 Open</span> — with the date(s)
>
> **Symptom** / **Cause** / **Fix** (bugs), or **Considered** / **Decided** / **Why** (decisions) — each its own short list.

---

## 🏗️ Foundation & Architecture

### 📋 GPU compute (WebGPURenderer) for voxel meshing — tracked, not decided
**Status:** <span style="color:#cf222e">🔴 Open, tracked, not scheduled (2026-09-23)</span>

> **Issue:** CPU-based voxel meshing (column-based, O(resolution²) — see Voxel / Land Cube Terrain, below) has a real ceiling: worst-case triangle count for very noisy terrain at very high resolution (e.g. true UHD/4096) can reach 100M+ triangles, risking an actual tab crash from the raw buffer size, not just slow performance. GPU compute would generate geometry directly on the GPU, never materializing a giant CPU-side buffer at all.
>
> **Why not now:** adopting compute means migrating the *entire app's* renderer off `WebGLRenderer` to `WebGPURenderer` — Three.js can't run both simultaneously in one scene. Every existing hand-written GLSL shader (`noise.glsl`, `heightmap.frag.glsl`, `vertex.glsl`/`fragment.glsl`, `strokePath.frag.glsl`, the grid shaders) would need porting to Three.js's newer TSL node system. Not a small addition on top of voxels — a renderer-wide rewrite affecting every feature in the app.
>
> **Decided for now (2026-09-23):** stay on CPU, resolution cap raised to 2048 (true UHD/4096 held back deliberately — see `ROADMAP.md`, Stage 07). This was the exact scenario flagged when CPU vs. GPU was first discussed ("build CPU first, measure, decide GPU only if actually insufficient") — now genuinely measured, logged here as a real tracked decision point, not scheduled or started.
>
> **A real middle-ground option, not yet explored (Dana, 2026-09-23):** raymarching/SDF-based terrain rendering — stays entirely on the existing `WebGLRenderer`/GLSL pipeline, no renderer migration at all. "Heightfield raymarching" (step along each pixel's ray, compare against a height function in the fragment shader, no explicit triangle mesh generated) is a well-established technique for exactly this case, and is the technique `active-geometry-project` itself already used. This should have been raised when the land-chunk meshing question was first scoped — the "mesh-based Three.js, not raymarching" decision above was made specifically for the *planet* (needing real mesh for agents/vegetation/roads/LOD), and got carried forward as a blanket constraint onto the land-chunk question without re-examining whether a small individual chunk preview actually has the same requirement. It may not. Proposed direction: raymarch/SDF for fast, flexible terrain *preview* by default; drop into real mesh generation case-by-case, specifically when something actually needs to be real (collision, placed objects/agents, export) — not a wholesale replacement of the mesh approach, a hybrid.

### 🧭 Mesh-based Three.js, not raymarching
**Status:** <span style="color:#2da44e">✅ Decided (2026-09-02)</span>

> **Considered:** raymarching/SDFs, the technique `active-geometry-project` uses for its boolean CSG editor.
>
> **Decided:** mesh-based Three.js instead — GLSL shaders still used, just on real mesh geometry (`ShaderMaterial`), not for raymarching.
>
> **Why:**
> 1. **Real mesh objects needed** — agents, instanced vegetation, roads, LOD all assume real geometry.
> 2. **Raymarching's advantage doesn't apply** — cheap boolean union/subtract without regenerating topology isn't something this project needs.

### 🧭 Heightmap pipeline: GPU render-target texture, CPU reads on demand
**Status:** <span style="color:#2da44e">✅ Decided (2026-09-02), built later</span>

> **Decided:**
> 1. **Fragment shader → texture** — computed into an off-screen render target.
> 2. **Vertex shader samples it** — the planet's vertex shader reads that texture for displacement.
> 3. **CPU reads on demand** — `readRenderTargetPixels()` only when a value is actually needed (future agent/road placement).
>
> **Why:** the shader stays the single source of truth — never duplicated in JS just to keep CPU queries in sync.

### 🐛 App.tsx became a five-feature monolith
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-22)</span>

> **Symptom:** lighting/grid, planet appearance, layer-stack management, brush/painting, and project persistence had all accumulated as loose `useState`/`useEffect` calls directly in `App.tsx` as each was built — caught by Dana, not proactively split ("why do I need to catch you instead of you following directions??").
>
> **Cause:** each new feature was wired straight into `App.tsx` at the point it was built, rather than getting its own hook file at that time.
>
> **Fix:**
> 1. **Five feature-scoped hooks extracted** — `useSceneControls` (`scene/sceneControls.ts`, lighting/grid), `usePlanetControls` (`planet/planetControls.ts`, radius/color/display mode + km↔scene-unit conversion), `useNoiseLayers` (`map/noiseLayers.ts`, layer-stack CRUD), `useBrush` (`map/2Dbrush.ts`, brush settings + stroke history + undo), `useSaveProject` (`projectSettings/saveProject.ts`, multi-project load/save/rename/new/reset).
> 2. **`App.tsx` reduced to composition only** — calls each hook, wires the results into JSX props; no feature state/logic lives there directly anymore.
> 3. **`planet/` elevated to its own top-level folder** — `scene/planet.ts` → `planet/mesh.ts` (mesh/shader), alongside the new `planetControls.ts`; `map/` deliberately stays standalone, not nested under it (see `README.md`'s code-organization section for why).
> 4. **`project/` renamed `projectSettings/`** for clarity (naming is per feature/functionality, not a vague role).
> 5. **Working rule added** — `CLAUDE.md` now states explicitly: split a feature into its own hook the moment it adds state to `App.tsx`, don't wait to accumulate.

### 📋 Design-system/config tokenization — not built yet
**Status:** <span style="color:#cf222e">🔴 Open, tracked, not urgent (2026-09-09)</span>

> **Issue:** scattered arbitrary placeholder values (colors, lighting, radius, segments, camera distance) with no design rationale, no central place to adjust them.
>
> **Plan:**
> 1. **CSS custom properties** — for visual/styling values.
> 2. **A scene-config file** — for Three.js geometry values.
> 3. **In the meantime** — flag every one inline with `// TODO(DS): arbitrary placeholder`.

---

## 🖥️ UI & Panel Architecture

### 🧭 Right panel tabs: by technique, not by the planet's parts
**Status:** <span style="color:#2da44e">✅ Decided (2026-09-14)</span>

> **Considered:** organize the right panel around the planet's *parts* (Terrain, Population, Climate...) vs. around *techniques* (Noise, Paint, Erosion, Color...).
>
> **Decided:** by technique.
>
> **Why:**
> 1. **Same underlying data** — Noise/Paint/Erosion/Color all operate on the same heightmap+texture data as sequential operations, not independent domains.
> 2. **Matches industry convention** — mirrors World Machine/Gaea's own node-pipeline organization.
> 3. **"By planet part" doesn't fit yet** — only makes sense once a feature has genuinely independent state (e.g. a real population sim) — nothing today is that.

### 🐛 Gumball rendered on top of the new right panel
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-14)</span>

> **Cause:** `position: fixed` against the whole window, so the panel covered it once the right panel existed.
>
> **Fix:** mount inside `.app-viewport`, `position: absolute` against it instead.

### 🐛 Gumball axis lines didn't respond to direct drags
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-09)</span>

> **Cause:** two `pointer-events` gaps:
> 1. **SVG children not opted out** — the `line`/`text` elements weren't individually excluded from hit-testing.
> 2. **Container had no override** — the outer container captured clicks over its whole bounding box.
>
> **Fix:** explicit `pointer-events: none` on the `line`/`text` elements and the container, with just the real controls opted back in via `pointer-events: auto`.

### 🐛 "Expand" opened a dark overlay over everything instead of replacing the viewport
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-24)</span>

> **Cause:** the expanded noise canvas was a `position: fixed; inset: 0` element with a dark backdrop, rendered from inside `NoisePanel` — it covered the entire window, both side panels included, not just the 3D viewport. This had been logged as a to-do since 2026-09-16 ("Expand should replace, not overlay... keeping both side panels visible") but never fixed.
>
> **Fix:** `isExpanded` moved out of `NoisePanel` and up to `App.tsx` — it now controls what `App.tsx` renders inside `.app-viewport` (swapping the planet/chunk panes for the full-size `MapView`) rather than something local to the right panel. Both side panels stay mounted and visible throughout, since they're siblings of `.app-viewport`, not inside it. The shared gumball (which mounts into `.app-viewport` itself) is hidden via CSS while expanded, since it has no 3D camera to target then.

### 🐛 Panel width changed with content (accordion open/close, tab switch)
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-30)</span>

> **Cause:** `.panel-outer` used `width: max-content` — the panel auto-sized to whatever was currently visible, so it visibly resized every time an accordion opened/closed or a right-panel tab switched (including toggling to the still-empty Erosion/Color placeholders, which are narrower than Noise's content).
>
> **First fix (incomplete):** pinned `.panel-outer` to a single fixed `width: var(--panel-max-width)` (360px). Worked, but wasn't what Dana meant — "i didnt mean it to have a hard coded width."
>
> **Actual fix — ported active-geometry-project's resize-handle pattern:** that project's right panel (`.ag-right-outer`/`.ag-right-panel-handle`, `js/uiDesign.js`) isn't a fixed number either — a draggable handle on the panel's edge sets its width via a CSS custom property, clamped between a min and max, and the width only ever changes on an explicit user drag. Ported as `ui/panelResize.ts`'s `usePanelResize(initialWidth, anchorSide, minWidth?, maxWidth?)` hook, applied to both panels via a `viewport-divider`-styled handle in `App.tsx` (reusing the same divider convention already built for the planet/chunk split, rather than porting active-geometry's absolutely-positioned handle CSS). `anchorSide` accounts for the two panels resizing from opposite edges (left panel's left edge is fixed, handle drags its right edge; right panel's right edge is fixed, handle drags its left edge).
>
> **Follow-up — per-panel minimum:** the left panel's controls need less horizontal room than the right panel's, so its min (and starting width) was lowered to 280px independently of the right panel's 360–600px range (Dana, 2026-09-30: "the left side menu is a bit too wide... lower it's min value") — `minWidth`/`maxWidth` made per-hook-instance parameters, not shared module constants, to support this.
>
> **Follow-up bug — components didn't reflow into the narrower width:** at 280px, several slider rows' number fields were visibly clipped past the panel's right edge ("you just cut the width without adjusting all the components - to fill panel width"). Cause: `.ui-slider-track` (the `<input type="range">`) and `.ui-select` both had `flex: 1` but no `min-width: 0` — browsers give range/select inputs an intrinsic default width that `flex: 1` alone can't shrink below, so the row would rather overflow the panel than shrink the track/select past that point. Fixed by adding `min-width: 0` to both, the standard fix for this specific flexbox behavior (a flex item's default `min-width: auto` is based on its content's intrinsic size, not 0, unless overridden).

---

## 🪐 Planet mesh and adaptive resolution

*Why the planet moved from a lat/long sphere to a cube sphere, what broke when it did, and the fix.*

> [!NOTE]
> This section follows the documentation conventions from the procedural-creative-coding-tool project. The rest of this file predates them and gets retrofitted as its own step.

### The problem in plain terms

*The planet had one level of detail, spread evenly over the whole globe.*

Detail was fixed everywhere at once, so zooming in on one spot could never show more than the whole planet already carried. Raising it for that one spot meant paying the same cost across the entire far side, which nobody is looking at.

The goal is detail that follows the camera: fine where you are, coarse everywhere else.

### 🧭 Decided: quadtree patches on a cube sphere

**Date:** 2026-10-07 · **Status:** 🟡 phase 1 built, awaiting sign-off

**Rejected: raise the resolution slider** · `does not solve it`
- a sphere's triangle count is already minimal for its segment count, so there is no hidden waste to reclaim, unlike the land chunk's old cubic voxel grid (see Voxel / Land Cube Terrain, below)
- resolution is spent evenly over the whole surface, so a bigger number multiplies the waste instead of removing it
- *Dana, 2026-10-07: "think outside of the box. this shouldn't be an issue."*

**Rejected: raymarching and SDFs** · `conflicts with planned work`
- resolution free by construction, with no mesh or LOD bookkeeping
- an SDF surface has no discrete pieces to click, which breaks the planned "pick a spot on the planet to open as a land chunk" feature
- *reverses the 2026-09-02 mesh-over-raymarching decision in Foundation & Architecture, above*

**Chosen: a cube inflated into a sphere, each face a quadtree** · `decided`
- six flat grids pushed out onto the sphere; a face near the camera splits into four smaller ones, repeatedly, and only the undivided ones are drawn
- a lat/long grid cannot do this, because its lines all converge at two fixed points no matter how it is divided
- *Ulrich's chunked LOD, plus the cube sphere variant used in production planet engines. See `REFERENCES.md`*

**Why a cube and not the sphere's own grid** · `decided`
- every cube face is a roughly even patch of the sphere, so one splitting rule works everywhere
- a lat/long grid stretches without limit toward the poles, so the splitting rule would need a different answer at every latitude
- *Dana asked for this to be confirmed against real sources rather than reasoned out. See `REFERENCES.md`*

### 🔴 Open: terrain tears into streaks at both poles

**Found:** 2026-10-13 · **Where:** `app/src/shaders/vertex.glsl`, `app/src/map/heightmap.ts`

**What happens**
- thin stretched streaks of geometry at both poles, visible once terrain height is turned up
- an earlier, separate symptom was a black slit on the surface, now fixed

**Expected**
- terrain reads the same at the poles as anywhere else, with no stretching or tearing

**How it was diagnosed**
1. colored each of the six cube faces flat, which showed no gaps and no inside-out faces, ruling out a broken mesh
2. drew the texture coordinates as color, which showed hard jumps at the seam and a wedge radiating from each pole
3. changed the lighting math to work from each point's 3D position instead of its texture coordinate, which removed the black slit and left only the streaks

**Root cause**
- the map wraps at longitude 180°, and that wrap line crosses three of the six cube faces: down the middle of one side face, and across each pole face from its center out to one edge
- a triangle sitting on that line reads from both ends of the map at once, so the whole width of the map gets smeared across it. On screen that is a bright and dark hairline, and once it drives displacement it tears the mesh into streaks
- the side face was handled when the cube sphere was built. The two pole faces were missed, because longitude sweeps a full circle across them and the same trick does not work there

**Fix**
- each pole face is generated as two halves, split along the wrap line, so the vertices sitting on it exist twice, once per side, and no triangle spans the jump
- the same approach `THREE.SphereGeometry` uses at its own seam, which is why the old sphere never showed this
- contained to `app/src/planet/mesh.ts`. Nothing in the heightmap pipeline, the shaders or the 2D canvas changed

**Notes**
- the black slit and the streaks had different causes, so fixing one did not fix the other
- a soft blur remains at each pole. That is the rectangular map's own distortion, not this bug, and it is covered by the detail-ceiling work below

### ⚠️ Wrong diagnosis, and what it cost

**Status:** <span style="color:#cf222e">reverted 2026-10-13</span>

*Kept deliberately. The reasoning was wrong in a way worth not repeating.*

**The claim** · `wrong`
- that reading height back out of the rectangular map is lossy at the poles, and that this is what tore the terrain
- it is the reverse: an equirectangular map *over*-samples near the poles, spending more pixels per unit of real surface there than anywhere else. There is no detail being lost to recover

**What was built on it** · `reverted`
- the layer stack was split into a shared module so the planet could evaluate terrain from 3D position instead of reading the map
- that meant the planet's vertex shader sampling up to 16 paint textures, which exhausted the GPU's texture slots (`Trying to use 16 texture units while this GPU supports only 16`), so no height reached the planet at all and it rendered perfectly smooth
- all of it reverted. The real bug was a texture coordinate seam on two faces, fixed in `mesh.ts` alone

**How it went unnoticed for so long** · `process`
- the texture limit was a warning in the dev server log the whole time, and was not read
- "the shader compiled" was treated as proof the approach worked, when the failure was at bind time, not compile time
- several rounds of reasoning were spent on what *should* happen instead of looking at the rendered data. The thing that actually found it was drawing the height value on screen and looking at it
- *Dana, 2026-10-13: "research and work according to known architectures. always research new additions you're unsure of how to add." Now in `CLAUDE.md`*

### 🧭 Patches are the unit of terrain

**Status:** <span style="color:#2da44e">✅ Built and tested 2026-10-13</span> · **Covers:** the land chunk. The planet still reads the shared map

*One piece of the planet's surface with its own heightmap. Everything showing terrain consumes these.*

**The rule** · `decided`
- a patch is a cube face, a rectangle on it, and a depth, with a heightmap baked for it alone
- the planet is patches drawn curved; the land chunk is a patch drawn flat. There is no separate chunk pipeline, so "the chunk is a piece of the planet, zoomed in" is true by construction rather than by two systems being kept in step
- *Dana's framing from the start, 2026-09-24: "the land chunk should be a chunk of the planet that's flattened... divide the planet's surface into x chunks and the chunk is one of them"*

**Why this shape and not a bigger map** · 📚 `established practice`
- globe renderers make the whole surface out of tiles and get detail by descending, not by growing textures. Cesium treats a plain sphere as a special case of terrain, and its heightmap tiles are a fixed 65x65
- growing one texture instead is what stalled the chunk: cost rises with the square and every sample is copied back from the GPU
- *Sources in `REFERENCES.md`*

**Resolution and footprint are separate** · `decided`
- resolution is how finely a patch's ground is measured; depth is which ground it covers. Independent, and conflating them was wrong
- the first attempt drove depth from the Resolution slider, so raising it zoomed in and the terrain flattened, because a smaller area holds less relief
- *Dana, 2026-10-13: "res and zoom shouldnt be the same thing. i can zoom in on something and it could still be low res"*

**Picking** · `built`
- double-clicking the planet chooses which patch the chunk shows: raycast the planet, take the direction from its center, find which axis dominates to get the face, divide the other two by it to get the position on that face
- the documented method, and the exact inverse of the cube-to-sphere projection, so the two cannot disagree
- *Sources in `REFERENCES.md`*

**Known limitation** · ⚠️ `accepted`
- plain cube-to-sphere normalization makes patches near a face's center cover more ground than those at its corners, so detail is not perfectly even across a face
- a distortion-correcting projection fixes it. Not blocking, recorded rather than discovered later

### 📌 Still open: the planet's own detail is capped by the map

**Status:** ⚪ not started · **Raised:** 2026-10-13

*Separate from the bug above, and the real blocker on zooming in.*

**The limit** · `open`
- the planet's own geometry still displaces from the one 1024x512 map, so zooming into it reveals nothing past what that holds
- the soft blur at each pole is the same cause: every longitude converges to one point there, so the stored data bunches up
- the land chunk no longer has this problem, since it reads its own patch. The planet gets the same treatment by rendering as patches

**The documented answer** · `researched, not yet decided`
- evaluate terrain from a function of 3D position rather than storing it, which is what resolution-independent planet renderers do
- per-patch heightmaps rendered on the GPU as patches subdivide, rather than one map for the whole planet
- *Sources in `REFERENCES.md`. The research holds; it was simply applied to the wrong problem above*

### Results

*Tested by Dana, 2026-10-13.*

**Fixed: the hairline and the tearing** · ✅
- the bright and dark hairline is gone, confirmed in the height-field view at both poles
- terrain no longer tears into streaks when height is turned up

**Still rough at the poles** · <span style="color:#cf222e">🔴 open</span>
- a soft blur and some rough ridging remain at both poles, so this is improved rather than fully solved
- the mesh seam itself is fixed, so what is left is the rectangular map's own distortion: every longitude converges to one point at each pole, so the stored data bunches up there and reads back smeared. Visible directly in the 2D preview, whose top and bottom edges are smeared the same way
- not fixable while the map is where detail lives. Covered by the detail ceiling item above, which removes the dependency rather than patching around it

---

### 🧭 Superseded: the original cube sphere plan
**Status:** <span style="color:#2da44e">✅ Decided (2026-10-07), superseded in part 2026-10-13</span>

> [!NOTE]
> Kept for the record. The texture coordinate handling described below was replaced by the position based fix above. The cube sphere decision itself still stands.

> **Trigger:** making the planet's Resolution control contextual (like Radius/Size, Stage 07) surfaced that no real resolution control exists for the planet mesh at all — `planet/mesh.ts` hardcodes `THREE.SphereGeometry(radius, 64, 32)`. Dana asked for it to go much higher "to zoom in."
>
> **Considered and rejected — flat slider, bigger range:** unlike the land chunk's old O(resolution³) voxel bug (a real architectural ceiling, fixed 2026-09-23, see Voxel/Land Cube Terrain above), a `SphereGeometry`'s triangle count is already O(resolution²)-minimal for its segment count — there's no hidden inefficiency to remove here. The actual problem: resolution is spent *uniformly* across the whole sphere, including the entire far side the camera isn't looking at. Raising a single number can't fix that; it only makes the waste worse. Dana: "think outside of the box. this shouldn't be an issue."
>
> **Considered — Option B, raymarching/SDF heightfield rendering** (Dana's own earlier-logged idea, see Foundation & Architecture above, re-raised here): resolution-free by construction, no mesh/LOD bookkeeping needed. Not chosen — would reintroduce the exact inconsistency the mesh-vs-raymarching decision (2026-09-02, above) already settled against for anything needing real mesh objects, and specifically conflicts with the land-chunk's existing mesh-raycast-based "real chunk location picking" to-do (Stage 07) — an SDF surface has no discrete pieces to raycast-pick the way a literal mesh patch does.
>
> **Decided — Option A, chunked-LOD quadtree on a cube-sphere:** verified against the original technique (Thatcher Ulrich, Gamasutra 2000 / SIGGRAPH 2002 course notes, "Rendering massive terrains using chunked level of detail control") and the cube-sphere variant used in Sebastian Lague-inspired planet implementations (already a cited project reference, see Procedural System Feedback references in `ROADMAP.md`). Planet becomes a cube (6 faces), each face a quadtree; nodes near the camera split into 4 children (threshold scales with node size); only leaf nodes render, each a small fixed-size grid regardless of depth. Dana, 2026-10-07: "i'm thinking this is better given everything," explicitly over Option B — also noted as the better fit for the already-planned "pick a spot on the planet to view as a land chunk" feature (Stage 07's open to-do), since each visible leaf is a literal mesh patch with known bounds, a normal raycast target — an SDF surface isn't.
>
> **Key technical finding — both existing shaders need zero code changes:** `fragment.glsl`'s analytic-normal computation is driven entirely by `vUv`-derived longitude/latitude, not mesh topology. `vertex.glsl` reads `uv` directly for heightmap displacement, relying on `SphereGeometry`'s built-in equirectangular UV — but that same UV can be computed on the CPU per cube-sphere vertex (from its own normalized 3D position, the same formula the shaders already use, just inverted) and handed to Three.js as a plain `uv` `BufferAttribute`, exactly like `SphereGeometry` already provides. So the real Phase 1 work is narrowly scoped to `planet/mesh.ts`'s geometry construction, not the shaders.
>
> **Open technical risk — equirectangular UV seam + poles:** `SphereGeometry` avoids seam artifacts by construction (its grid lines up with lines of longitude, so no triangle straddles the ±180° wrap; duplicated seam vertices hold u=0/u=1 on either side). A cube's 6 faces don't line up that way — one face straddles the seam, and the two pole-facing faces span all longitudes. Fix: let that one seam-straddling face's U values extend slightly outside 0–1 and rely on the heightmap texture's existing `RepeatWrapping` (already set, see Stage 05) to sample correctly — no vertex duplication needed for that face. The two pole faces are trickier (longitude varies across the *whole* face, not just one line) — decided fix (Dana, 2026-10-07, "combine the two methods"): keep the pole patches' 3D geometry built the plain cube-projected way (so edges still line up with neighboring faces), but compute their texture UVs using the same "duplicate vertices along a wrap line, let U exceed 0–1" trick as the main seam, applied a few times radially around the pole instead of once. This reuses proven technique rather than inventing new pole math, but hasn't been built or visually verified yet — flagged as a real, testable risk, not glossed over.
>
> **Resolution semantics, clarified for Dana 2026-10-07:** there's no single "resolution" number in this system. Each leaf patch always has the same fixed vertex grid (e.g. 32×32) — that number doesn't change with zoom, same as a brush size doesn't change with stroke length. *Effective* resolution (detail per unit of visible area) does increase with zoom, because patches split into smaller, more numerous pieces at the same per-patch vertex count as the camera gets closer. The adjustable "Resolution" slider (Phase 5, see `ROADMAP.md`) is the max quadtree depth — a ceiling on how far that zoom-driven splitting goes, not the mechanism that makes it work.
>
> **Skirts:** extra geometry extending inward (toward planet center) along each patch's boundary, invisible from normal viewing angles, hiding the thin crack that appears where a detailed patch meets a coarser neighbor. Standard, long-used technique (same lineage as Ulrich's original paper), not experimental — and the exact technique already built/verified for the land chunk's smooth mesh (Stage 07) gets reused here. Dana flagged concern about how it'll look in practice; agreed to verify visually once built rather than over-engineer the depth value blind.
>
> **6-phase build plan:** logged under Stage 02's new "Adaptive resolution — chunked-LOD cube-sphere" feature in `ROADMAP.md`, not duplicated here.

---

## 🧱 Layer Compositing & Noise

### 🐛 New layer visually erased existing painted terrain
**Status:** <span style="color:#2da44e">✅ Fixed — 2 attempts (2026-09-22)</span>

> **Symptom:** "+ Add layer" made painted terrain on layers beneath it disappear. No data was actually lost — purely a compositing bug.
>
> **Cause:** an empty layer's flat mid-gray placeholder read as real opaque content at `Normal`/full opacity, fully replacing everything beneath it.
>
> **Fix attempts:**
> 1. **Wrong** — added a `coverage` gate but kept the old gray-blend formula too, applying the paint mask twice; caused a ridged double-edge at stroke boundaries.
> 2. **Closer, but new bug** — fixed the double-blend, but then black paint became indistinguishable from "nothing painted" (both read as the composite's starting value, black).
> 3. **Actual fix** — `layerHeight = paint.x` (no gray blended in) + `coverage = paint.y` applied exactly once; composite starts at 0.5 (gray/neutral) instead of 0.0 (black), matching the convention already used elsewhere (`planet.ts`, `vertex.glsl`).

### 🧭 GLSL ES 1.00 forbids dynamic sampler-array indexing
**Status:** <span style="color:#2da44e">✅ Decided/worked around (2026-09-16)</span>

> **Issue:** looping over paint textures with a variable index fails to compile under GLSL ES 1.00 (Three.js's default `ShaderMaterial` mode).
>
> **Fix:** `MAX_LAYERS` (16) separately-named uniforms + an if/else chain to select by constant index, instead of a real array.

### 🧭 Layer multi-select + per-layer visibility toggle
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-23)</span>

> **Trigger:** with paint strokes now composited live across the whole layer stack, there was no way to tell which layer a stroke was actually landing on — the 2D canvas always showed the full composite.
>
> **Multi-select:** shift+click a layer row to add/remove it from selection (plain click selects exclusively, same convention later reused for the shared gumball's pane selection); editing any control while multiple layers are selected applies the change to all of them at once. A slider's displayed value follows the last-clicked ("primary") layer, not an average or the first-selected. Opened the door to per-layer height (amplitude distinct from Opacity) as a natural next step — logged as a to-do under Stage 03's Modifier architecture, not yet built; no clear use case pinned down beyond "big base layer + subtle detail layer scaled independently."
>
> **Visibility toggle — considered and rejected 2 shortcuts:**
> 1. **Force opacity to 0** — rejected, Dana: "it's not the same as 0 opacity though" — a hidden layer's noise would still be computed (wasted GPU work every frame) and it conflates a genuinely separate concept with the existing Opacity slider.
> 2. **Shader-side `uLayerVisible` uniform + `continue` skip** — built, then reverted. Dana: "it's much easier to just disregard the layer... so just do not compute it if its hidden" — simpler to filter it out entirely before any uniform is set than to still upload it and skip it per-fragment.
>
> **Actual fix:** a real `visible: boolean` field on `NoiseLayer`; `HeightmapPipeline.render()` filters to `layers.filter(l => l.visible !== false)` before setting any per-layer uniform (so `uLayerCount` only ever counts visible layers — a hidden layer's noise/paint is never evaluated at all), while paint-target create/dispose still tracks the full (unfiltered) layer list so a hidden layer's paint data isn't lost. Whole-row dimming (not just the eye icon) marks a hidden layer in the list.
>
> **Fixed along the way — old saved layers defaulted to hidden:** `visible` doesn't exist on any layer saved before this feature, so plain truthiness (`layer.visible`, `!layer.visible`) read `undefined` as falsy/hidden. Fixed by using explicit `!== false` (the render filter) / `=== false` (the eye icon and row-dimming checks) everywhere instead, so missing data on old projects defaults to visible, per Dana: "the default should be all layers visible."

### 🧭 Per-layer Height: a genuinely separate channel from Opacity/Blend Mode, not baked into the same composite
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-24)</span>

> **Trigger:** Dana's original request for per-layer Height (logged above) was built as a first pass by scaling each layer's own noise deviation by `heightScale` *before* the existing Opacity/Blend-Mode crossfade math — i.e. folded directly into the same `layerHeight` value already used for the 2D shape composite. On testing, Height and Opacity turned out to be indistinguishable on a lone base layer: "i noticed you basically mapped the height to the 2d canvas opacity. i thought these were 2 different things. otherwise i could just use layer opacity to control height."
>
> **Root cause of the collapse:** for a base layer under Normal blend mode, the shader's crossfade is `composite = mix(neutral, layerHeight, opacity)`. Substituting `layerHeight = neutral + raw*heightScale` and simplifying: `composite = neutral + raw*(opacity*heightScale)` — Opacity and Height only ever appear *multiplied together*, so no combination of the two sliders produces anything a single slider couldn't. This isn't a bug specific to the code, it's a mathematical property of a linear crossfade onto a flat starting value — the two knobs only diverge once there's a second layer and/or a non-Normal blend mode (where the blend result actually depends on what's underneath).
>
> **What Dana actually wanted (confirmed against real 3D/terrain software convention):** "same as an amplitude/strength control... height... is not related to blend modes or opacity... it's a separate param" — real elevation, measured from the terrain's zero, that stays a stable baseline regardless of Height's value; only the *amplitude of variation* should scale. Also: "it should sample from everything in a specific layer" — both procedural noise and paint, not raw noise alone.
>
> **Fix — split into two genuinely independent channels of the same texture, not one value doing double duty:**
> 1. **R (shape)** — exactly the pre-existing Opacity/Blend-Mode composite, entirely unaffected by Height. Drives the 2D canvas/painting only ("i never said height belongs in the 2d").
> 2. **G (elevation)** — a separate, purely additive accumulator, `elevation += heightScale[i] * (layerHeight[i] - 0.5) * coverage[i]`, summed across every visible layer with **no** Opacity or Blend Mode involved at all. Reuses the *same* `layerHeight` already computed for the shape channel (so it legitimately reflects noise-and-paint together, per "sample from everything in a specific layer"), just re-centered on 0 (real terrain-zero) instead of the shape channel's 0.5 "neutral gray," and never clamped to 0..1 the way the shape channel is (real elevation can exceed 1 or go negative).
> 3. **Consequence, explicitly accepted:** since elevation ignores Opacity entirely, a layer at Opacity 0 (but still `visible`) still fully affects elevation — a direct, intentional result of "not related to opacity," not an oversight.
>
> **Technical implications of the split:**
> 1. `HeightmapPipeline`'s render target switched from the default byte texture to `THREE.FloatType`, so elevation can hold real, unclamped, possibly-negative values — chosen over `HalfFloatType` specifically because `FloatType` reads back cleanly into a `Float32Array` via `readRenderTargetPixels` (the standard Three.js GPGPU compute-in-shader/read-on-CPU pattern), avoiding ambiguity around half-float byte layouts.
> 2. Two separate CPU readback paths now exist: `getCompositeImageData()` (R only, converted into a `Uint8ClampedArray`-backed `ImageData` for the 2D `<canvas>`, which requires that exact format) and a new `getElevationData()` (G only, a raw `Float32Array`, no byte conversion — used by the land chunk's `sampleChunkElevation()`, replacing the old `sampleChunkHeight()`).
> 3. The planet's `vertex.glsl` switched from sampling `.r` to `.g`, and dropped its own `-0.5` recentering (elevation is already zero-centered, unlike the shape channel).
> 4. `density.ts`/`smoothMesh.ts` add `+0.5` back when converting elevation into their existing 0..1-normalized-height convention (so a single default layer at default settings reproduces the exact old look), plus a floor clamp at 0 — elevation can now go negative, which the old always-0..1 texture never could, and the smooth mesh's grounding/skirt-wall logic assumes a top surface that never dips below the y=0 base.

### 🧭 Modifiers restructured: independent toggles on any base generator, not separate Perlin-only types
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-30)</span>

> **Trigger:** logged as a to-do since the noise types were first built — Ridged/Octaves/Terrace/Domain warp were 4 of the 9 `noiseType` dropdown options, but each was secretly hardcoded to "Perlin + that one modifier." You couldn't terrace a Voronoi field, or combine Ridged with Octaves — they were mutually exclusive, not composable, and silently ignored whatever base generator was actually selected. Raised again in the context of making the project read as a procedural *system*: a fixed, Gaea-style pipeline (Domain warp → generator/Octaves → Ridged → Terrace) of composable modifiers is more "generative system" than a flat list of noise-type presets.
>
> **Data model:** `noiseType` narrowed to the 4 real base generators (Random/Perlin/Simplex/Voronoi) plus 'none'. 4 new independent boolean fields on `NoiseLayer` — `domainWarpEnabled`, `octavesEnabled`, `ridgedEnabled`, `terraceEnabled` — each gate their own existing params (`warpStrength`; `octaves`/`persistence`/`lacunarity`; a new `ridgeAmount`; `terraceSteps`), which still exist on the layer regardless of whether the toggle is on, so disabling and re-enabling a modifier doesn't lose its tuned values.
>
> **Shader restructure:** GLSL here has no function pointers, so `fbm3D` and the domain-warp offset were previously hardcoded to call `perlinNoise3D` directly — making them generator-agnostic required a different approach: a single `evalBaseGenerator(p, seed, baseType)` dispatch function (the old 4-way base-generator branch, extracted), which `fbm3D` and the domain-warp offset now call instead of `perlinNoise3D`. `evalLayerNoise()` became a real composable pipeline: warp the sample position if enabled → evaluate (octaves-summed via `fbm3D`, or a single sample) at that position → ridge-blend if enabled → terrace if enabled. Domain warp's own function also changed shape — it used to return a pre-computed noise *value*; now it returns the warped *position* (`domainWarpedPosition()`), since whatever comes next in the pipeline needs to sample AT that displaced position, not receive a scalar.
>
> **Ridge amount — the one modifier without a natural parameter:** `ridge(x) = 2*(1-|x|)-1` (see the earlier Ridged bias fix) is a fixed transform with no continuous "how much" knob, unlike the other 3 modifiers which already had one. Dana asked directly: "how would you control the amount of it? another slider?" — added `ridgeAmount` (0..1), blending `mix(value, ridge(value), ridgeAmount)`, matching how the other 3 modifiers already scale via their existing sliders.
>
> **Backward compatibility:** old saved layers have `noiseType` as one of the now-retired values (`'ridged'`/`'octaves'`/`'terrace'`/`'domainWarp'`) — these were always secretly Perlin-based, so `migrateLegacyLayers()` (map/heightmap.ts) converts them on load: e.g. `'ridged'` → `{ noiseType: 'perlin', ridgedEnabled: true }`. Applied at both of `projectSettings/saveProject.ts`'s load sites (initial auto-load, and switching projects), before the data reaches rendering or React state — same "migrate once, at the boundary" pattern as the `visible`/`heightScale` old-data defaults above, except this one remaps a *value*, not just fills in a missing field.
>
> **UI:** the existing "Modifiers" section (previously conditionally shown based on which single noiseType was selected) became 4 independent `Toggle` checkboxes in the fixed Gaea order, each revealing its own sliders only when checked — hidden entirely for `noiseType: 'none'` (no generator content to modify).

---

## 🎨 Paint & Brush System

### 🐛 Stroke-drag opacity buildup → jagged 3D terrain
**Status:** <span style="color:#bf8700">🟡 Partially fixed — smoother, still jagged; tabled (2026-09-16 → 2026-09-22)</span>

> **Symptom:**
> 1. **Hardened edges** — dragging a soft/feathered stroke hardened into a solid edge.
> 2. **Still jagged after v1 fix** — painted terrain still displaced with jagged/pointed ridges.
>
> **Cause (v1):** each dab composited "over" the previous state — fine across separate strokes, but within one drag this stacked/saturated a soft edge into a hard one.
>
> **Fix v1 (2026-09-16):** per-stroke MAX-accumulation buffer instead of sequential "over."
> - **Fixed the hardening.**
> - **New problem** — MAX-of-circles leaves a crease in the falloff's *slope* wherever two dabs are equidistant, invisible in flat color but visible as ridges once it drives 3D displacement.
>
> **Fix v2 (2026-09-22):** replaced MAX-accumulation with a true distance-to-polyline computation (`shaders/strokePath.frag.glsl`) — one smooth "capsule chain" along the whole stroke path, no crease. Net simplification: the separate mask-accumulation buffer/pass is gone.
>
> **Still open:**
> 1. **Still jagged** — terrain is still visibly jagged, feather still not very noticeable.
> 2. **Likely cause, unconfirmed** — the sphere's mesh resolution (64×32 segments) is too coarse for a narrow painted feature; displacement only happens at actual vertices, linearly interpolated per-triangle.
> 3. **Tabled** — Dana's call, revisit after erosion (which might help incidentally).

### 🐛 Brush strokes cut off at the sphere's UV seam
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-22)</span>

> **Symptom:**
> 1. **One-sided painting** — a stroke near the seam only painted on one side.
> 2. **Visible crack** — paint misalignment plus an actual crack in the terrain geometry at the seam.
>
> **Cause:** brush falloff used a plain UV-space `distance()`, which doesn't know U=0 and U=1 are the same wrapped longitude.
>
> **Fix:** wrap the horizontal distance component (`du = min(du, 1.0-du)`). Doesn't retroactively fix strokes painted before the fix.

### 🐛 Paint erase did nothing
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-16)</span>

> **Symptom:** painting toward black had no visible effect.
>
> **Cause:**
> 1. **Clamped output** — WebGL clamps fragment output to [0,1] before GPU blending, silently zeroing a negative "erase" delta.
> 2. **Underlying cause** — GPU blending into a float render target needs `EXT_float_blend`, not reliably supported cross-browser.
>
> **Fix:** ping-pong render targets instead of GPU blending — each stroke computes the complete new frame in-shader.

### 🐛 Partial-opacity strokes looked diluted/dark
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-16)</span>

> **Symptom:** a light-colored dab at reduced strength looked dark instead of light-at-half-opacity.
>
> **Cause:** value and mask were blended toward the target at the same naive rate.
>
> **Fix:** standard Porter-Duff "over" compositing — weights by relative opacity contribution, not raw falloff.

### 🐛 Brush radius used display size, not texture resolution
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-16)</span>

> **Symptom:** a "20px" brush covered a much bigger real fraction of the sphere than intended.
>
> **Cause:** px→UV conversion divided by the canvas's CSS display size, not the fixed texture resolution.
>
> **Fix:** divide by the exported `HEIGHTMAP_WIDTH` (1024) constant instead.

### 🧭 Brush hardness/feather model — 4 attempts
**Status:** <span style="color:#2da44e">✅ Decided — fixed-radius, percentage-based (2026-09-16)</span>

> **Considered** (tried in order, each only revealing its problem once tested):
> 1. **% of radius (original)** — absolute softness scaled with brush size (the original complaint).
> 2. **Additive** (`radius+feather`) — brush ballooned bigger than expected.
> 3. **Subtractive px, radius fixed** — values above radius all looked identical.
> 4. **% of radius, radius fixed** — same formula as #1, chosen deliberately this time.
>
> **Decided:** #4 — matches true Photoshop Hardness behavior.

### 🐛 Stroke history replay & undo — architecture
**Status:** <span style="color:#2da44e">✅ Decided/built (2026-09-22)</span>

> **Decided:**
> 1. **One global history** — `strokeHistory`, not per-layer arrays; each entry `{ layerId, points, radius, feather, brushValue }`.
> 2. **Global, not per-layer** — so Cmd+Z can undo the single most recent stroke regardless of which layer it's on, matching standard undo behavior everywhere else.
> 3. **Always full replay** — reconstruction always replays the *full* desired history from scratch (clear + replay every stroke in order) rather than incrementally patching state; one code path for both loading a saved project and undoing, not two to keep in sync.
>
> **Why:** a stroke log, not a baked raster, is what makes painting genuinely retraceable/procedural — and undo falls out of the same data almost for free.

### 🐛 Replayed strokes/undo didn't visually update until clicked
**Status:** <span style="color:#2da44e">✅ Fixed — two different causes (2026-09-22)</span>

> **Symptom:** on reload, the 2D canvas (and briefly the 3D view) showed stale/empty content until a paint click forced a redraw. After Cmd+Z, the 3D view updated instantly but the 2D canvas stayed stale until clicked.
>
> **Cause 1 (reload) — a genuine ordering bug:** `App.tsx` called `setLayers()` first, then replayed strokes in a separate `useEffect`. React fires a child component's effects *before* its parent's, within the same commit — so `SceneCanvas`'s and `MapView`'s own `[layers]`-effects (reading whatever paint texture currently existed) both ran before `App.tsx`'s effect got around to actually replaying the strokes.
>
> **Fix 1 — reordered, not patched:** first proposed a `paintVersion` counter to force a second read after the fact; rejected — "it sounds like the order of actions needs revising," correctly. Real fix: a new `SceneCanvasHandle.loadProject(layers, strokeHistory)` does target-creation + replay + recomposite *synchronously*, called before `setLayers()` is ever invoked — so by the time any effect fires, the data is already correct. `pendingReplayRef`, the workaround this replaces, is deleted entirely rather than left in place alongside a new signal.
>
> **Cause 2 (undo) — not an ordering issue, a missing connection:** `MapView`'s 2D canvas only refreshes off its `layers` prop. `undo()` only ever changes `strokeHistory`, which `MapView` never receives — no ordering fix could address this, since there's no relevant order between two things that aren't connected at all.
>
> **Fix 2:** a small `paintVersion` counter in `App.tsx`, bumped once inside `undo()`, threaded down as a prop that `MapView`'s refresh effect also watches (`[layers, paintVersion]`). This one *is* a legitimate use of a counter-as-signal — the two fixes look similar on the surface but address genuinely different classes of bug (see also the general note logged for this in Claude's own memory: fix the actual order when it's an ordering bug, add a signal only when there's truly no other connection).

---

## 💡 Lighting & Normals

### 🐛 No real per-pixel normal → terrain bumps didn't show in lighting
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-16)</span>

> **Attempt 1 (regression):** screen-space-derivative normal (`dFdx`/`dFdy`).
> - **Faceted the whole sphere** — derivatives are ~constant per triangle. (Dana liked the look as a future style *option*, not the default.)
>
> **Fix:** analytic sphere tangent basis (`dPdu`/`dPdv`, exact calculus derivatives).
> 1. **Smooth** — mesh-resolution-independent.
> 2. **Winding verified** — by hand-computing a concrete point, not guessed.
> 3. **Bump detail** — perturbed by the heightmap's own gradient (sampled 16 texels away, not the immediate neighbor, to avoid amplifying noise).
>
> **Also fixed:**
> 1. **Units mismatch** — tangent vectors were unit-sphere-relative while displacement was world-space-scaled, dwarfing the base term. Added a `uRadius` uniform.
> 2. **`normalMatrix` compile error** — Three.js auto-sets it but only auto-declares it in the vertex stage.

---

## 🧊 Voxel / Land Cube Terrain

### 🧭 Land cube meshing technique & compute location
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-23)</span>

> **Considered:**
> 1. **Marching Cubes** — smooth, interpolated isosurface; initially assumed to be required for any voxel terrain at all.
> 2. **Cube/culled-face meshing** — one flat quad per voxel face exposed to empty space, no interpolation; skips buried faces entirely.
>
> **Decided:** cube/culled-face meshing. The actual goal is a Minecraft-style blocky look, and Marching Cubes produces the opposite (smooth/rounded) — it was the wrong tool for this specific goal, not a harder version of the right one. Greedy meshing (merging adjacent same-facing quads into larger rectangles) deferred as a later optimization, only once resolution/perf actually calls for it.
>
> **Also decided — where it computes:**
> 1. **CPU, inside a Web Worker** — not GPU compute. Culled-face meshing is cheap even at high resolution for a heightmap-derived (non-cave) volume — exposed surface area scales with the chunk's area, not its full volume. A Worker keeps the main thread/3D view responsive during (re)generation without needing true parallel hardware.
> 2. **GPU compute (`WebGPURenderer`) explicitly deferred** — Three.js can't run `WebGLRenderer` and `WebGPURenderer` side by side in one scene, so adopting compute would mean migrating the *entire* app's renderer, not just the voxel subsystem — every existing hand-written GLSL shader (`noise.glsl`, `heightmap.frag.glsl`, `vertex.glsl`, `strokePath.frag.glsl`, the brush pass) would need porting to Three.js's newer node-based shading language (TSL), since `WebGPURenderer` doesn't take raw GLSL `ShaderMaterial` the way the app currently works. Revisit only if CPU+Worker measures as insufficient once actually built, not pre-emptively.
> 3. **Density seed, v1** — derived from the existing composited heightmap, read back via `readRenderTargetPixels()` — the same "CPU reads on demand" pattern already anticipated in this project's architecture (see Foundation & Architecture, above; originally noted for future agent/road placement, this is that pattern's first real use). A voxel column is solid below the heightmap's height at that point — no caves/overhangs yet.
>
> **Scoped to one fixed-size land cube, not the whole planet** — a full volumetric planet isn't tractable at any reasonable resolution (a naive 512³ grid alone is ~134M cells). Sequenced before Erosion in `ROADMAP.md` per Dana's call, since it's syllabus-required and has no dependency either direction.
>
> **Noted for future dev, not in scope now:** the same blocky/voxel technique eventually generalizing to all geometry in the project, including the planet itself — not just this one land-cube detail view (Dana, 2026-09-23).

### 🐛 Chunk sat half-buried under the grid
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-23)</span>

> **Cause:** the mesh worker centered all 3 axes (x/y/z) at the local origin, including the vertical one — so roughly half the terrain sat below y=0, where the grid plane lives.
>
> **Fix:** only x/z (horizontal) are centered, for on-screen framing. Y is left starting at 0, so the terrain's base sits at grid level and rises upward — matching the planet's own "ground sits on the grid" convention.

### 🧭 Voxel is a display style, not a land-chunk-exclusive feature
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-23)</span>

> **Considered:** keeping the land-chunk pane exclusively voxel-rendered (its original scope) vs. treating "blocky" as one of several rendering styles that could apply to any geometry.
>
> **Decided:** voxel is a display style — the same conceptual family as the existing planet Display dropdown (Shaded/Wireframe), now with a third option, "Voxel." Shaded/Wireframe render the land chunk as a smooth, continuously-displaced surface instead; Voxel renders the existing blocky mesh. The planet doesn't respond to "Voxel" yet (generalizing that is a separate future item, see `ROADMAP.md`'s Potential Features), but the control lives where it will matter once that's built, rather than needing to move later.

### 🐛 Smooth render style looked flat and floated above the grid
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-23)</span>

> **Symptom:** the new smooth (non-voxel) chunk render looked like a flat, featureless sheet hovering above the grid, not resting on it.
>
> **Cause:** the smooth mesh was a bare displaced surface — just a top layer, no walls or base connecting it down to grid level. Unlike the voxel version (a solid block with visible side walls all the way to y=0), a lone floating surface has nothing to visually judge its actual height variation against, and nothing grounding it to the scene.
>
> **Fix:** extruded the smooth patch into a solid slab — skirt walls around the perimeter (top edge down to y=0) plus a flat bottom cap, matching the voxel version's grounded look. Top surface keeps smooth per-vertex normals (central-difference heightmap normal, hand-derived); walls/bottom get flat per-face normals, same technique as the voxel mesh's face table.

### 🐛 Smooth-mesh walls missing on some sides
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-23)</span>

> **Symptom:** one wall rendered as a large flat quad; the other three were effectively absent, leaving the terrain surface's edges looking like they trailed off into nothing on those sides ("if the chunk has height geometry on one side, it should be on all sides").
>
> **Cause:** the 4 skirt walls (from the grounding fix above) each had their winding hand-derived independently, one per side — 4 separate opportunities to get the sign wrong, and at least one (north) had already needed a correction mid-derivation earlier the same day. A wrong winding makes a face invisible from most angles (default backface culling), which reads as a "missing" wall.
>
> **Fix:** replaced the 4 special-cased walls with one generic technique — walk the chunk's boundary as a single ordered loop of edge points, and for every edge use one fixed formula: the outward normal is the edge's own travel direction rotated -90° in the XZ plane (a general geometric fact for a consistently-wound polygon boundary, verified once, not four times). `DoubleSide` also added to the chunk's material as a safety net regardless — Three.js flips the lighting normal for back-facing polygons automatically under `DoubleSide`, so it stays visually correct even if a winding mistake recurs elsewhere.

### 🐛 Toggling view mode unmounted panes — planet lost its color and camera position
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-23)</span>

> **Symptom:** switching Planet/Land Chunk/Split reset the planet's base color to a shader construction placeholder (`0x3a7bd5`, a medium blue) and reset its camera back to the default position/zoom.
>
> **Cause:** the view-mode control conditionally *rendered* each pane (`{condition && <SceneCanvas/>}`), so leaving a pane's mode destroyed its whole `SceneCanvas`/`LandChunkCanvas` instance — Three.js scene, camera, and renderer included. Coming back created a brand-new instance from scratch; the planet's material's own placeholder default (meant to be instantly overridden by its own "apply current color" effect) was what showed, and the camera reset to its construction-time default position.
>
> **Fix:** both panes are now always mounted for the life of the app — the view-mode control only toggles CSS `display` (`.viewport-pane--hidden`), never unmounts. Nothing about either pane's Three.js state resets on a mode switch anymore.

### 🧭 Single shared gumball, driving a list of targets
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-23)</span>

> **Considered:**
> 1. **One `Gumball` instance per viewport** — simplest to build, but two visible widgets on screen at once is wasted space, and there's no way for one action (zoom, reset) to drive both cameras together.
> 2. **One shared instance, retargetable to a single camera at a time** — solves the duplication, but not "drive both at once."
> 3. **One shared instance driving a list of 1-2 targets** — `setTargets()` retargets an existing instance rather than recreating it; every action (zoom, reset, view-preset snap) loops over however many targets are currently set.
>
> **Decided:** #3. Click a pane to select it exclusively; shift+click the other pane to add it, driving both cameras from the same controls at once — standard "extend the selection" convention (same as multi-select in Finder/Explorer). A subtle outline (matching `.noise-layer-row--selected`'s existing border-color convention) marks the selected pane(s), shown only in Split mode where more than one pane is visible to disambiguate.
>
> **Fixed along the way — zoom/reset didn't work right for the chunk:** the zoom-percentage and Reset View math used one fixed `DEFAULT_CAMERA_DISTANCE` (200, calibrated for the planet) for every target. For the ~16-unit chunk (natural distance ~40), the slider's clamped range translated to absolute distances between 50 and 2000 — meaning even at maximum zoom-in, the camera couldn't get closer than 50, farther than the chunk's own default view. Fixed by giving each `GumballTarget` its own `referenceDistance` (each target's own "100%"/reset distance) — the same slider percentage now scales proportionally per camera instead of using one global distance for every target.

### 🐛 Land-chunk lighting was too dark, with no visible directional shading
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-23)</span>

> **Cause:** the chunk view reused the planet's raw `ambientLight`/light-direction numeric values unmodified, but the two views use completely different lighting systems — the planet through a hand-written shader with its own calibrated math (ambient ~0.12 reads fine there), the chunk through Three.js's real physically-based `MeshStandardMaterial`, which needs much higher intensities to read as anything but near-black.
>
> **Fix:**
> 1. **Rescaled intensities** — ambient scaled by a placeholder ×4 multiplier, directional light bumped from 0.8 to 2.5 — direction still follows the shared X/Y sliders, only magnitude is recalibrated for this material.
> 2. **`directionalLight.target` added to the scene** — standard Three.js practice (a light's target must be part of the scene graph for its direction to be computed reliably); was previously omitted.

> Note: intensities were retuned once more after this fix — see "Land-chunk viewport & navigation" in `ROADMAP.md` (ambient multiplier x4 → x1.5, directional 2.5 → 4) so shadowed faces read as darker against lit ones instead of washed out by flat ambient fill (2026-09-23).

### 🧭 Voxel meshing rearchitected: column-based (O(resolution²)), not a 3D solid/empty grid (O(resolution³))
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-23)</span>

> **Trigger:** Dana pushed the Resolution slider's max repeatedly (64→512→2048) before asking directly why it was capped at all ("why just 512? i want uhd at least") — surfacing that the real constraint was architectural, not a slider-range choice.
>
> **Cause:** `density.ts` originally built a full `Uint8Array(resolution³)` solid/empty grid, and `meshWorker.ts` culled per-voxel-face against it. Both memory and meshing cost scale with the *cube* of resolution — 512³ is already ~134M cells (~134MB just for the density array); a naive 4096³ isn't representable in a typed array at all. This is cubic growth for a shape that doesn't need it.
>
> **Insight:** v1 has no caves/overhangs (documented from the start, see "Land cube meshing technique & compute location" above) — so a column is always exactly "solid from the ground up to some height, empty above," never anything more complex. That means one height value per (x, z) column is a *complete* representation, not an approximation — the same O(resolution²) shape the smooth render style already used via `sampleChunkHeight()`.
>
> **Fix:**
> 1. **`density.ts`** — `buildTestChunkDensity()` → `buildChunkHeights()`, returning `Uint32Array(resolution²)` (one height per column) instead of `Uint8Array(resolution³)`.
> 2. **`meshWorker.ts`** rewritten around the column grid: one top quad per solid column (always exposed — nothing sits above a column's own top in a no-caves field); walls wherever two neighboring columns differ in height, checked in both the X and Z directions, treating "outside the chunk" as height 0 so the chunk's own perimeter edge is handled by the exact same rule as an internal step between two different-height columns (no separate perimeter-wall special case); one flat bottom cap spanning the whole footprint. Each wall case's winding hand-verified via the right-hand-rule cross product, same method as the smooth-mesh boundary-walk fix above.
> 3. **`chunkGrid.ts`** — the now-unused 3D `voxelIndex()` helper removed.
>
> **Result:** this is what actually unlocked pushing the Resolution slider's max past the old ceiling (64→512→2048, see `ROADMAP.md`). True UHD (4096) still deliberately held back — worst-case triangle count for very noisy terrain at 4096 risks crashing the tab outright from raw buffer size, not just running slow; logged as the trigger for the GPU-compute tracked-not-decided item above.

### 🐛 Ridged noise wasn't zero-mean — inflated the whole planet/chunk uniformly, not just its peaks
**Status:** <span style="color:#2da44e">✅ Fixed (2026-09-24)</span>

> **Symptom:** with the new elevation/Height system (above), a Ridged layer at a moderate Height turned the planet into an almost-solid spiky blob — the whole silhouette bulged outward, not just its mountains against otherwise-flat terrain. Reproduced and screenshotted; the effect scaled directly with Height and was specific to Ridged — other noise types didn't do this.
>
> **Diagnosis:** `ridge(x) = 1 - abs(x)`. Perlin noise (`x`, `ridge`'s input) clusters mostly near 0 — and `ridge(0) = 1`, its *maximum*. So `ridge()`'s output sits close to 1 almost everywhere, only dipping toward 0 at the rare spots where the underlying Perlin noise happens to hit an extreme value. Every other noise/modifier here (Random, Perlin, Simplex, Voronoi, Octaves/fbm, Domain warp) is genuinely zero-mean by construction; Ridged alone carried a strong built-in positive bias. That's invisible under the old pipeline (Opacity/Blend-Mode bounded and compressed everything through a 0..1 crossfade), but once Height applies that same raw value as an *unclamped, additive* elevation contribution, the bias scales directly with Height instead of staying hidden.
>
> **Confirmed not a bug in the new elevation math itself:** Voronoi and Terrace (the other two candidates checked for the same kind of bias — Voronoi's distance-based output isn't perfectly symmetric either, Terrace's `floor()` rounds down slightly) both tested clean per-layer ("voronoi seems fine. terrace is fine perlayer"). Random/Perlin/Simplex/Octaves/Domain warp are all zero-mean by construction (gradient/hash noise, or — for fbm/domain-warp — a sum/reposition of zero-mean terms, which stays zero-mean).
>
> **Fix:** re-centered `ridge()` itself, not a downstream special case — `2.0 * (1.0 - abs(x)) - 1.0` instead of `1.0 - abs(x)`, so its output genuinely spans -1..1 with a true zero mean like every other type. One shared function, reused everywhere Ridged is evaluated, rather than patching the elevation formula to special-case one noise type. Also changes Ridged's existing 2D-canvas/Opacity-driven look slightly (it can now dip below its old baseline, not just rise above it) — an accepted, correct side effect of fixing the root cause, not a separate regression.

### 🧭 Terrain Height as a percentage of context size, not an absolute scene-unit value
**Status:** <span style="color:#2da44e">✅ Decided and built (2026-09-24)</span>

> **Trigger:** even after the Ridged fix above, Height still looked "massive" on the land chunk relative to how the same value looked on the planet ("any height changes on the planet seem massive on the land chunk"). Also investigated separately: whether increasing the *global* Terrain Height was inflating the whole planet the same way Ridged had — ruled out mathematically (a global multiplier applied after summing zero-mean per-layer contributions can't introduce a new bias) and via a live diagnostic (Dana checked Wireframe display at high Height and confirmed the mesh dips inward roughly as often as it pushes outward — genuinely symmetric, not a bug).
>
> **Root cause of the chunk-specific mismatch:** the planet's Radius already converts km → scene units via a `KM_PER_SCENE_UNIT = 300` factor (`radiusScene = radiusKm / 300`); the chunk's Size never had an equivalent conversion, used directly as raw scene units. Height itself was a flat, absolute scene-unit multiplier shared between both — reasonable against the planet's already-compressed ~20-unit radius, disproportionately large against the chunk's much smaller, uncompressed footprint (e.g. 16 units).
>
> **Considered and rejected:** applying the same `/300` km-conversion to the chunk's Size, matching Radius, for consistency. Worked out the actual math first — since Height would still be an absolute scene-unit number, shrinking Size by ~300x while leaving Height unchanged makes the *same* value proportionally *more* dominant against the now-tinier chunk, not less (the opposite of the goal). The fully-consistent version of that fix would require converting Height through the same km factor everywhere, including the planet, which would nearly flatten the planet's terrain at its current default values and need every Height default/range recalibrated — a much bigger, riskier change than the actual ask.
>
> **Actual fix — Dana's suggestion:** make Height a percentage of whichever context it's applied to, not an absolute number: `(Height / 100) × radius` for the planet, `(Height / 100) × chunkSize` for the chunk, computed right where each is used (`SceneCanvas.tsx`, `voxel/landChunk.ts`). A percentage self-normalizes automatically — "15%" produces proportionally similar terrain whether the context is a 20-unit planet or a 4-unit chunk, with no unit-conversion bookkeeping needed at all, and no change required to Radius/Size's own units. Per-layer Height (above) is untouched by this — it stays a relative multiplier *between layers* within the same elevation sum, not tied to any physical size itself. Default recalibrated 3 → 15 (%) to reproduce the old default look exactly.

---

## 2026-09-02 — early notes, pre-dating this structure

### Grid: plain `THREE.GridHelper` at first (later replaced)
`active-geometry-project`'s procedural grid depends on its raymarching pipeline, not portable on its own — used `THREE.GridHelper` initially. Superseded 2026-09-14 by a shader-based plane (see `ROADMAP.md`, Stage 01), since the plain helper looked like bounded CAD-software floor rather than empty space.

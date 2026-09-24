# Decisions & Issues

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

---

## 2026-09-02 — early notes, pre-dating this structure

### Grid: plain `THREE.GridHelper` at first (later replaced)
`active-geometry-project`'s procedural grid depends on its raymarching pipeline, not portable on its own — used `THREE.GridHelper` initially. Superseded 2026-09-14 by a shader-based plane (see `ROADMAP.md`, Stage 01), since the plain helper looked like bounded CAD-software floor rather than empty space.

# Decisions & Issues

Technical decisions, tradeoffs, and bugs for this project — organized by category (not chronologically; `ROADMAP.md` tracks current stage/feature status and points here for detail; `WEEKLY-PUSHES.md` is the chronological log).

Each entry is short numbered lists, not prose, each longer item as **bold short name** — explanation:
> 🐛 **Bug** or 🧭 **Decision** — one-line title
> **Status:** <span style="color:#2da44e">✅ Fixed/Decided</span> · <span style="color:#bf8700">🟡 Partial</span> · <span style="color:#cf222e">🔴 Open</span> — with the date(s)
>
> **Symptom** / **Cause** / **Fix** (bugs), or **Considered** / **Decided** / **Why** (decisions) — each its own short list.

---

## 🏗️ Foundation & Architecture

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

## 2026-09-02 — early notes, pre-dating this structure

### Grid: plain `THREE.GridHelper` at first (later replaced)
`active-geometry-project`'s procedural grid depends on its raymarching pipeline, not portable on its own — used `THREE.GridHelper` initially. Superseded 2026-09-14 by a shader-based plane (see `ROADMAP.md`, Stage 01), since the plain helper looked like bounded CAD-software floor rather than empty space.

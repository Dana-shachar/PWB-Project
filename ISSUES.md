# Decisions & Issues

Technical decisions, tradeoffs, and bugs for this project — organized by category (not chronologically; `ROADMAP.md` tracks current stage/feature status and points here for detail; `WEEKLY-PUSHES.md` is the chronological log).

Each entry:
> 🐛 **Bug** or 🧭 **Decision** — one-line title
> **Status:** ✅ Fixed/Decided · 🟡 Partial · 🔴 Open — with the date(s)
>
> Short labeled points: **Symptom/Cause/Fix**, or **Considered/Decided/Why**.

---

## 🏗️ Foundation & Architecture

### 🧭 Mesh-based Three.js, not raymarching
**Status:** ✅ Decided (2026-09-02)

> Raymarching/SDFs fit `active-geometry-project`'s boolean CSG editor specifically. This project needs real mesh objects (agents, instanced vegetation, roads, LOD) — GLSL shaders still used, just on real mesh geometry (`ShaderMaterial`), not for raymarching.

### 🧭 Heightmap pipeline: GPU render-target texture, CPU reads on demand
**Status:** ✅ Decided (2026-09-02), built later

> Fragment shader → off-screen render target; the planet's vertex shader samples it for displacement. CPU reads back specific texels via `readRenderTargetPixels()` only when it actually needs a value (future agent/road placement) — the shader stays the single source of truth, never duplicated in JS.

### 📋 Design-system/config tokenization — not built yet
**Status:** 🔴 Open, tracked, not urgent (2026-09-09)

> Scattered arbitrary placeholder values (colors, lighting, radius, segments, camera distance) need eventual centralizing — CSS custom properties for visual values, a separate scene-config file for Three.js geometry values. Convention in the meantime: flag every one inline with `// TODO(DS): arbitrary placeholder`.

---

## 🖥️ UI & Panel Architecture

### 🧭 Right panel tabs: by technique, not by the planet's parts
**Status:** ✅ Decided (2026-09-14)

> Noise/Paint/Erosion/Color all operate on the *same* underlying heightmap+texture data as sequential operations, not independent domains — mirrors World Machine/Gaea's own node-pipeline organization. "By planet part" only makes sense once a feature has genuinely independent state (e.g. a real population sim) — nothing today is that.

### 🐛 Gumball rendered on top of the new right panel
**Status:** ✅ Fixed (2026-09-14)

> **Cause:** `position: fixed` against the whole window, so the panel covered it once the right panel existed.
> **Fix:** mount inside `.app-viewport`, `position: absolute` against it instead.

### 🐛 Gumball axis lines didn't respond to direct drags
**Status:** ✅ Fixed (2026-09-09)

> **Cause:** two `pointer-events` gaps — the SVG's children weren't individually opted out of hit-testing, and the outer container had no override of its own.
> **Fix:** explicit `pointer-events: none` on the `line`/`text` elements and the container, with just the real controls opted back in via `pointer-events: auto`.

---

## 🧱 Layer Compositing & Noise

### 🐛 New layer visually erased existing painted terrain
**Status:** ✅ Fixed — 2 attempts (2026-09-22)

> **Symptom:** "+ Add layer" made painted terrain on layers beneath it disappear. No data was actually lost — purely a compositing bug.
> **Cause:** an empty layer's flat mid-gray placeholder read as real opaque content at `Normal`/full opacity, fully replacing everything beneath it.
> **Fix attempt 1 (wrong):** added a `coverage` gate but kept the old gray-blend formula too — applied the paint mask twice, causing a ridged double-edge at stroke boundaries.
> **Fix attempt 2:** fixed the double-blend, but then black paint became indistinguishable from "nothing painted" (both read as the composite's starting value, black).
> **Actual fix:** `layerHeight = paint.x` (no gray blended in) + `coverage = paint.y` applied exactly once; composite starts at 0.5 (gray/neutral) instead of 0.0 (black), matching the convention already used elsewhere (`planet.ts`, `vertex.glsl`).

### 🧭 GLSL ES 1.00 forbids dynamic sampler-array indexing
**Status:** ✅ Decided/worked around (2026-09-16)

> **Issue:** looping over paint textures with a variable index fails to compile under GLSL ES 1.00 (Three.js's default `ShaderMaterial` mode).
> **Fix:** `MAX_LAYERS` (16) separately-named uniforms + an if/else chain to select by constant index, instead of a real array.

---

## 🎨 Paint & Brush System

### 🐛 Stroke-drag opacity buildup → jagged 3D terrain
**Status:** 🟡 Partially fixed — smoother, still jagged; tabled (2026-09-16 → 2026-09-22)

> **Symptom:** dragging a soft/feathered stroke hardened into a solid edge; after fixing that, painted terrain still displaced with jagged/pointed ridges.
> **Cause (v1):** each dab composited "over" the previous state — fine across separate strokes, but within one drag this stacked/saturated a soft edge into a hard one.
> **Fix v1 (2026-09-16):** per-stroke MAX-accumulation buffer instead of sequential "over" — fixed the hardening, but MAX-of-circles leaves a crease in the falloff's *slope* wherever two dabs are equidistant, invisible in flat color but visible as ridges once it drives 3D displacement.
> **Fix v2 (2026-09-22):** replaced MAX-accumulation with a true distance-to-polyline computation (`shaders/strokePath.frag.glsl`) — one smooth "capsule chain" along the whole stroke path, no crease. Net simplification: the separate mask-accumulation buffer/pass is gone.
> **Still open:** terrain is still visibly jagged, feather still not very noticeable. Likely cause, unconfirmed: the sphere's mesh resolution (64×32 segments) is too coarse for a narrow painted feature — displacement only happens at actual vertices, linearly interpolated per-triangle. Dana's call: tabled, revisit after erosion (which might help incidentally).

### 🐛 Brush strokes cut off at the sphere's UV seam
**Status:** ✅ Fixed (2026-09-22)

> **Symptom:** a stroke near the seam only painted on one side; paint misalignment plus an actual crack in the terrain geometry at the seam.
> **Cause:** brush falloff used a plain UV-space `distance()`, which doesn't know U=0 and U=1 are the same wrapped longitude.
> **Fix:** wrap the horizontal distance component (`du = min(du, 1.0-du)`). Doesn't retroactively fix strokes painted before the fix.

### 🐛 Paint erase did nothing
**Status:** ✅ Fixed (2026-09-16)

> **Symptom:** painting toward black had no visible effect.
> **Cause:** WebGL clamps fragment output to [0,1] before GPU blending, silently zeroing a negative "erase" delta — underlying cause: GPU blending into a float render target needs `EXT_float_blend`, not reliably supported cross-browser.
> **Fix:** ping-pong render targets instead of GPU blending — each stroke computes the complete new frame in-shader.

### 🐛 Partial-opacity strokes looked diluted/dark
**Status:** ✅ Fixed (2026-09-16)

> **Symptom:** a light-colored dab at reduced strength looked dark instead of light-at-half-opacity.
> **Cause:** value and mask were blended toward the target at the same naive rate.
> **Fix:** standard Porter-Duff "over" compositing — weights by relative opacity contribution, not raw falloff.

### 🐛 Brush radius used display size, not texture resolution
**Status:** ✅ Fixed (2026-09-16)

> **Symptom:** a "20px" brush covered a much bigger real fraction of the sphere than intended.
> **Cause:** px→UV conversion divided by the canvas's CSS display size, not the fixed texture resolution.
> **Fix:** divide by the exported `HEIGHTMAP_WIDTH` (1024) constant instead.

### 🧭 Brush hardness/feather model — 4 attempts
**Status:** ✅ Decided — fixed-radius, percentage-based (2026-09-16)

> Four models tried in order, each only revealing its problem once tested:
> 1. Feather as % of radius — absolute softness scaled with brush size (original complaint).
> 2. Feather additive (`radius+feather`) — brush ballooned bigger than expected.
> 3. Feather subtractive px, radius fixed — values above radius all looked identical.
> 4. **Landed here:** feather as % of radius, radius fixed (same formula as #1, chosen deliberately this time) — matches true Photoshop Hardness behavior.

---

## 💡 Lighting & Normals

### 🐛 No real per-pixel normal → terrain bumps didn't show in lighting
**Status:** ✅ Fixed (2026-09-16)

> **Attempt 1 (regression):** screen-space-derivative normal (`dFdx`/`dFdy`) — faceted the *whole* sphere since derivatives are ~constant per triangle. (Dana liked the look as a future style *option*, not the default.)
> **Fix:** analytic sphere tangent basis (`dPdu`/`dPdv`, exact calculus derivatives) — smooth, mesh-resolution-independent. Winding verified by hand-computing a concrete point, not guessed. Perturbed by the heightmap's own gradient (sampled 16 texels away, not the immediate neighbor, to avoid amplifying noise) for fine bump detail.
> **Also fixed:** a units mismatch (`uRadius` uniform added — tangent vectors were unit-sphere-relative while displacement was world-space-scaled, dwarfing the base term) and a `normalMatrix` compile error (Three.js auto-sets it but only auto-declares it in the vertex stage).

---

## 2026-09-02 — early notes, pre-dating this structure

### Grid: plain `THREE.GridHelper` at first (later replaced)
`active-geometry-project`'s procedural grid depends on its raymarching pipeline, not portable on its own — used `THREE.GridHelper` initially. Superseded 2026-09-14 by a shader-based plane (see `ROADMAP.md`, Stage 01), since the plain helper looked like bounded CAD-software floor rather than empty space.

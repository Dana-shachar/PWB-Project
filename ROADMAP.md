# Roadmap / Project Log

The main doc for planning and progress tracking on Procedural World Building — organized by **product stage and feature**, not chronologically, so it reads as current state rather than a log to scan through. (The syllabus's graded Weekly Push reports, which *are* chronological, live in `WEEKLY-PUSHES.md`; technical decision *rationale* and bug detail live in `ISSUES.md`; external-facing structure/conventions reference lives in `README.md`.)

Every feature follows the same template — short numbered lists, not prose, each longer item as **bold short name** — explanation:
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Short name** — what's actually built and working, dated `(YYYY-MM-DD)`. A fixed issue belongs here too (as "**Fixed: ...**"), never in Issues to fix below.
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Short name** — what's known to still be missing/open. If a feature isn't 100%, this is *why*.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span> *(only currently-open problems — full detail in `ISSUES.md`)*
> 1. **Short name** — one line, dated.

Both the stage and each feature inside it carry their own `NN%` — the stage number is a rough average of its features, not a separate estimate.

Stages are numbered in roughly the order they were/are being built (see `CLAUDE.md`'s working rules — earlier stages finish before later ones start). A separate "Potential Features / Ideas" section at the end holds reference/brainstorm material that isn't scheduled as a stage at all.

---
---

## Stage 01 — Foundation & Scene Setup
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 95%

#### Project scaffold — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Scaffolded** — Vite + React + TypeScript + Three.js (2026-09-09).
> 2. **Conventions** — follows `active-geometry-project`'s own conventions, not the class repo's Entity/World OOP pattern.
> 3. **Entity/World removed** — an early attempt (`app/src/engine/Entity.ts`) was tried and removed (2026-09-02) — see `ISSUES.md`.
> 4. **Fixed: `App.tsx` had become a five-feature monolith** — split into five feature-scoped hooks (`useSceneControls`, `usePlanetControls`, `useNoiseLayers`, `useBrush`, `useSaveProject`), `App.tsx` reduced to pure composition; `planet/` elevated to its own top-level folder, `project/` renamed `projectSettings/` (2026-09-22). See `ISSUES.md`.
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### 3D scene, camera, controls, grid — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Base setup** — scene/camera/orbit-controls (2026-09-09).
> 2. **Camera distance** — `DEFAULT_CAMERA_DISTANCE` tuned to 200 for planet scale, not active-geometry's small-CAD-shape default of 80 (2026-09-09).
> 3. **Shader grid** — infinite-looking grid plane, replacing `THREE.GridHelper` (2026-09-14).
> 4. **Grid controls** — "Grid lines" toggle + "Grid spacing" slider added to Scene controls (2026-09-14).
> 5. **Fade distance widened** — 400→3000, was fading out at moderate zoom-out (2026-09-16).
> 6. **Fixed: grid duplication** — a StrictMode-related leak duplicated the grid on resolution change (2026-09-09).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Gumball navigation widget — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Built** — orientation/navigation widget ported and debugged (axis indicator, zoom slider, view presets, reset) (2026-09-09).
> 2. **Scoped to viewport** — mounts inside `.app-viewport` (`position: absolute`) instead of the whole window (2026-09-14).
> 3. **Fixed: unresponsive axis drags** — a `pointer-events` cascade issue (2026-09-09).
> 4. **Fixed: drifted onto right panel** — repositioned once the right panel existed (2026-09-14).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Control panel UI system — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Component set** — `Slider`, `ColorPicker`, `Toggle`, `Select` (2026-09-09).
> 2. **Left panel** — `Panel.tsx`, sectioned (Scene controls, Planet controls) (2026-09-09).
> 3. **Right panel** — `RightPanel.tsx` tab bar, organized by technique not by planet part (2026-09-14).
> 4. **Brush gradient track** — `Slider` gained a `trackClassName` option for the black-white brush-strength gradient (2026-09-16).
> 5. **Fixed: planet off-center** — canvas was full-bleed behind the panel (2026-09-09).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Placeholder tab width** — Erosion/Color tabs don't match the Noise tab's width. Cosmetic, deferred.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 02 — Planet Base
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 90% *(done, ongoing tuning)*

#### Sphere geometry & radius control — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Cheap rebuilds** — `planetGeometry()` split out for radius-only rebuilds (2026-09-14).
> 2. **Centered growth** — planet stays centered at the origin as radius changes (2026-09-14).
> 3. **Radius range retuned** — **1,000–100,000 km**, against the actual camera/grid setup (2026-09-16).
> 4. **Fixed: stale displacement uniforms** — radius changes weren't updating `uDisplacementAmplitude`/`uRadius` (2026-09-16).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Base color, ambient light, display mode — 80%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Controls** — base color `ColorPicker`, ambient + light X/Y sliders, display mode `Select` (2026-09-09).
> 2. **Retuned** — base color lightened, ambient light retuned for visible shading contrast (2026-09-16).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Color-picker theming** — still native OS/browser chrome. Open decision: keep native, add `react-colorful`, or hand-build.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 03 — Terrain: Noise Generation
🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 60%

#### Base noise types — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **8 types built** — Random, Perlin, Simplex, Voronoi, Ridged, Octaves/fBm, Terrace, Domain warp, plus None (2026-09-14/15).
> 2. **Verified against source** — Perlin3D/Simplex3D checked against the canonical Stefan Gustavson/Ashima Arts source (2026-09-14).
> 3. **fBm verified** — checked against thebookofshaders.com/13 (2026-09-14).
> 4. **Fixed: wrong Perlin constant** — a hand-reproduced constant was wrong, caught by diffing against the canonical source (2026-09-14).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Multi-layer stack & blend modes — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Shared pipeline** — `HeightmapPipeline` became a single shared instance, not duplicated per-component (2026-09-15).
> 2. **Layer stack** — Photoshop-style: add/delete/drag-to-reorder, up to 16 layers (2026-09-16).
> 3. **Blend modes** — 7 modes verified against Gaea's actual Combine node docs (2026-09-16).
> 4. **Fixed: layer erased terrain beneath it** — a newly-added layer visually erased existing painted terrain; layer coverage/transparency fixed, 2 attempts (2026-09-22). See `ISSUES.md`.
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Layer naming** — layers show their noise-type label, not a real name. Want auto-assigned "Layer 01"/"Layer 02" (ever-incrementing counter) plus a rename option (double-click to edit inline). Requested 2026-09-22, not built.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Modifier architecture — 0%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. _None._
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Modifiers as toggles, not types** — Ridged/Octaves/Terrace/Domain warp are separate selectable *noise types* today, not independently-toggleable modifiers layered onto a base type in a fixed order (Domain warp → generator/Octaves → Ridged → Terrace), the way Gaea structures it.
> 2. **Per-layer height control** — an amplitude control distinct from Opacity, requested but not implemented.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 04 — Terrain: Paint Authoring
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 90%

#### 2D heightmap canvas — 85%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Preview canvas** — flat 2D preview, no WebGL context of its own (2026-09-14).
> 2. **Paint capture** — captures paint pointer input, reads back pixels from the shared pipeline (2026-09-16).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Expand should replace, not overlay** — the "Expand" button opens a dark overlay; should instead *replace* the 3D viewport's content, keeping both side panels visible (requested 2026-09-16). A richer expanded-mode brush toolset (strength, size beyond radius, shape) is planned to land there too.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Brush system — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Absolute brush** — "set to this gray," not additive (2026-09-16).
> 2. **Strength slider** — black-white "Brush" slider, -1 (erase/black) to 1 (paint/white) (2026-09-16).
> 3. **Feather model** — % of the (fixed) brush radius, true Photoshop-Hardness-style, landed after 4 tried-and-reverted models, full history in `ISSUES.md` (2026-09-16).
> 4. **Correct radius scale** — px→UV via the fixed texture resolution, not the canvas's display size (2026-09-16).
> 5. **Polyline rendering** — whole-stroke rendering, no manual dab-interpolation needed for gap-filling (2026-09-22).
> 6. **Seam wraparound** — brush wraps correctly across the sphere's UV seam instead of cutting off (2026-09-22).
> 7. **Fixed: stroke-drag opacity buildup** — soft edges were hardening mid-drag; fixed via the polyline rewrite (2026-09-16 → 09-22).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. **Terrain still jagged, feather still subtle** — 🟡 open, tabled. Likely the sphere's mesh resolution (64×32) is too coarse for a narrow painted feature. Dana's call: revisit after erosion. See `ISSUES.md`, 2026-09-22.

---

#### Paint persistence pipeline — 95%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Ping-pong targets** — per-layer paint texture, no GPU blending (2026-09-16).
> 2. **Porter-Duff compositing** — "over" blend for correct partial-opacity strokes (2026-09-16).
> 3. **Pole-snapped sampling** — no geometry tear at the poles (2026-09-16).
> 4. **Stroke-log save/load** — full stroke history (points, radius, feather, value) saved/loaded and replayed on load to reconstruct the exact same result (2026-09-22).
> 5. **Undo (Cmd+Z)** — pops the most recent stroke, any layer, and rebuilds from what remains (2026-09-22).
> 6. **Fixed: GLSL sampler-array indexing** — GLSL ES 1.00 forbids a dynamic index; worked around with named uniforms (2026-09-16).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Live-test stroke-log save/load** — built, build passes, not yet tested live (reload and confirm exact reconstruction). Undo itself is already live-tested and confirmed (2026-09-22).
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 05 — Terrain: Displacement & Lighting
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 95%

#### GPU heightmap → displacement pipeline — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Render-to-texture pipeline** — fragment shader → render-target texture, sampled by the planet's vertex shader for displacement (2026-09-14).
> 2. **CPU readback ready** — can read back specific texels on demand for future agent/road placement, instead of duplicating the noise algorithm in JS.
> 3. **Fixed: sphere UV-seam artifact** — duplicated seam vertices sampling non-identical texels, fixed via `RepeatWrapping` (2026-09-14).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Surface normal / lighting — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Analytic tangent basis** — smooth, mesh-resolution-independent surface normal (2026-09-16).
> 2. **Bump detail** — perturbed by the heightmap's own gradient, sampled 16 texels away to avoid amplifying noise (2026-09-16).
> 3. **Fixed: unit mismatch** — `uRadius` scaling fix; tangents were unit-sphere-relative, displacement was world-space-scaled (2026-09-16).
> 4. **Fixed: faceting regression** — an initial screen-space-derivative approach faceted the whole sphere; replaced with the analytic approach (2026-09-16).
> 5. **Fixed: `normalMatrix` compile error** — auto-set by Three.js but not auto-declared in the fragment stage (2026-09-16).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Flat/faceted style option** — a deliberate `Display` mode option, alongside Shaded/Wireframe. Liked as a future style *choice*, not built.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 06 — Project Persistence
🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜ 85%

Right now this is the only thing keeping the app from being a real tool session-to-session. Surfaced as urgent (2026-09-22) by the Stage 03 layer-erasing bug.

**Decided architecture** (see `ISSUES.md` for full reasoning): Firebase (Auth + Firestore), not browser-only storage — anonymous auth now, real sign-in later via account-linking; a global chronological stroke history (not per-layer), so painting is retraceable and undo works correctly.

#### Firebase setup & anonymous identity — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Firebase project** — `PWBdashboard`, Firestore + Anonymous auth enabled (2026-09-22).
> 2. **SDK wiring** — `firebase/client.ts` (SDK init) + `firebase/useCurrentUser.ts` (anonymous sign-in) wired into `App.tsx` (2026-09-22).
> 3. **Verified working** — a real anonymous UID logs on load, user appears in the Firebase console (2026-09-22).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Save/load — layer settings — 60%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **CLI set up** — Firebase CLI installed and authenticated (2026-09-22).
> 2. **Security rules deployed** — `firestore.rules`, a user can only read/write their own document (2026-09-22).
> 3. **Save/load wired** — `firebase/storage.ts`, debounced 1s, wired into `App.tsx` (2026-09-22).
> 4. **Live-tested and confirmed working by Dana** — layer add/opacity changes survive a reload (2026-09-22).
>
> <span style="color:#0969da">📋 **To do**</span> — **plan agreed 2026-09-22, being implemented now:**
> 1. **Multi-project data model** — move from one document per user (`projects/{uid}`) to a subcollection of named planets (`projects/{uid}/planets/{planetId}`, each `{ name, layers, strokeHistory, updatedAt }`). Requires a matching `firestore.rules` update.
> 2. **"Project" panel section** — new collapsible accordion section, above "Edit," in the left panel: a dropdown of saved planets by name with **"+ New Project"** as the last option; a **Rename** button (prompt-based, pre-filled with the current name); a **Save** button (prompts for a name if the current planet is unnamed, otherwise saves immediately under its existing name — covers both "Save As" and a manual "just in case" save with one button).
> 3. **"Edit" section becomes an accordion too**, gains a **Reset** button — distinct from "New Project": clears the *currently open* planet's content back to blank without switching which named project is active. Gated behind a confirm (destructive, not part of the undo history).
> 4. **Auto-save interval — kept as debounce, not a fixed timer**, per discussion: a flat 5-10 minute timer either saves needlessly or risks losing several minutes of work right before a tick; the existing ~1s-after-last-change debounce already only fires on real changes (and `strokeHistory` only updates once per *completed* stroke, not per dab) — widening it slightly (~3s) covers the actual goal (fewer writes) better than a fixed interval would.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Save/load — paint stroke logs — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Stroke records** — `StrokeRecord` per completed stroke (`layerId`, points, radius, feather, brush value), kept as one global chronological `strokeHistory` (2026-09-22).
> 2. **Saved with layers** — persisted alongside `layers` in the same Firestore document (2026-09-22).
> 3. **Replay on load** — reconstructed through the exact same `beginStroke`/`paintStroke`/`endStroke` sequence live painting uses, not a separate load-time renderer (2026-09-22).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Live-test** — paint, reload, confirm the terrain reconstructs identically.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. **Fixed: replayed strokes didn't show until clicked** — the 2D canvas (and briefly the 3D view) showed stale/empty content right after a reload, only refreshing once a paint click forced a re-read. Root cause was a real ordering bug — React fires child components' effects before a parent's, so the load-triggered replay (in `App.tsx`) ran *after* `SceneCanvas`'s/`MapView`'s own effects had already read the (still-empty) texture. Fixed by reordering, not patching: a new `SceneCanvasHandle.loadProject()` replays synchronously, before `setLayers()` is ever called, so no effect can read stale data in the first place — `pendingReplayRef`, the earlier workaround, is deleted entirely (2026-09-22).

---

#### Undo (Cmd+Z) — 95%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Shortcut** — Cmd+Z (Mac) / Ctrl+Z pops the single most recent stroke, regardless of which layer it's on (2026-09-22).
> 2. **Rebuild** — rebuilds every layer's paint texture from what remains, via the same replay mechanism as save/load (2026-09-22).
> 3. **Edit panel button** — a new left-panel "Edit" section with an "Undo" button, disabled when there's nothing to undo (2026-09-22).
> 4. **Live-tested and confirmed working by Dana** (2026-09-22).
> 5. **Fixed: 2D canvas didn't refresh after undo** — the 3D view updated instantly, but the 2D preview stayed stale until clicked, confirmed by Dana. Different cause from the reload bug above — not an ordering issue, `MapView` simply had no connection to `strokeHistory` at all (it only watches `layers`, and undo never touches `layers`). Fixed with a small `paintVersion` counter, bumped in `undo()` and threaded down as a prop `MapView`'s refresh effect also watches (2026-09-22).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Redo** — no redo yet, deliberately deferred as a natural fast-follow on the same history array.
> 2. **Scope** — covers paint strokes only, not other edits (opacity/noise-type/layer-add changes). A general "undo anything" system would be a separate, bigger feature.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 07 — Land Cube / Voxel Terrain
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

A detail view into one fixed-size chunk of terrain, rendered as blocky/voxel geometry (Minecraft-style, not smooth) rather than the heightmap-displaced sphere used elsewhere — syllabus-required, sequenced before Erosion per Dana's call (2026-09-23). Full reasoning/tradeoffs in `ISSUES.md`.

#### Voxel meshing pipeline — 0%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. _None._
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Density field** — one fixed test chunk, seeded from the existing composited heightmap via CPU readback (`readRenderTargetPixels()`); a column is solid below the heightmap's height. No caves/overhangs yet.
> 2. **Meshing — cube/culled-face, not Marching Cubes** — one flat quad per voxel face exposed to empty space; buried faces skipped entirely. Produces the blocky look directly; Marching Cubes would produce a smooth/rounded surface instead. Greedy meshing (merging same-facing quads) deferred until resolution/perf actually needs it.
> 3. **Compute location — CPU, in a Web Worker** — not GPU compute; keeps the main thread/3D view responsive during (re)generation without needing true parallelism. GPU compute (`WebGPURenderer`) explicitly deferred — would require migrating the whole app off `WebGLRenderer` and porting every existing GLSL shader to Three.js's node-based TSL, disproportionate unless CPU+Worker measures as insufficient once built.
> 4. **Resolution control** — a slider (voxel grid dimension per axis, e.g. 16/32/64), regenerating via the same Worker pipeline on change, not continuously.
> 5. **Chunk entry point** — a fixed test cube first, to prove the pipeline before building any picking/selection UX on the planet itself.
> 6. **Editing (digging/adding voxels live)** — separate feature, out of scope for this pass; when it lands, only the changed region gets remeshed (dirty-chunk updates), not the whole grid.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 08 — Erosion Simulation
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

Hydraulic/thermal erosion applied to the terrain over time, with a way to scrub/visualize its progression (syllabus: "Map simulations - Erosion simulation - Biomes"). An empty placeholder "Erosion" tab is already reserved for it in the right panel.

> <span style="color:#0969da">📋 **To do**</span>
> 1. **Hydraulic first, thermal second** — decided (2026-09-23); hydraulic (droplet-based flow/sediment carry) built before thermal (talus-angle slope collapse).
> 2. **Trigger — manual** — decided (2026-09-23); a Run button, not automatic/live.
> 3. **Timeline meaning — run-N-iterations** — decided (2026-09-23); not a scrub-able animation.
> 4. **Everything else** — nothing built yet.

---
---

## Stage 09 — Color / Biome Texturing
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

Biome-style surface texturing/coloring. An empty placeholder "Color" tab is already reserved for it in the right panel. Nothing decided or built yet.

---
---

## Stage 10 — Design System & UI Polish
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

#### Design-system / config tokenization — 0%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. _None._
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Centralize placeholder values** — scattered `TODO(DS)` values (colors, lighting, radius/segments, grid size, camera distance, km-to-scene-unit conversion) into real design-system/config files instead of inline magic numbers. Tracked since 2026-09-09, not urgent.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Adjustable control panel — 0%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. _None._
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Resizable panel** — a drag handle, like `active-geometry-project`'s, instead of the fixed `max-width`. Explicitly deferred by Dana, raised again 2026-09-16.
> 2. **Scope question** — its own step, or bundled with other panel work — not answered.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Wireframe overlay accuracy — 0%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. _None._
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Overlay doesn't track displacement** — the "Wireframe" display mode overlays undisplaced CPU geometry, won't track the actual GPU-displaced terrain once real height is applied. Not urgent, not visible as a problem yet.
> 2. **Fix plan** — give the overlay its own shader, sampling the same heightmap/displacement as the planet's vertex shader.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

# 💡 Potential Features / Ideas

Not stages — nothing below is scheduled or committed to being built. Reference material only, pulled in here so it doesn't only live in chat history/Obsidian notes.

## Future Terrain Ideas

Design notes and feature ideas from the 2026-09-14 planning session, not yet decided how much of this actually gets built:

- **Chunk/tile terrain viewing** — inspired by World Machine's ability to view/work on a square chunk of terrain rather than the whole thing at once. Now tracked concretely as Stage 07's land cube, not just an idea.
- **Voxel/blocky rendering generalized beyond the land cube** — the same cube/culled-face meshing technique (Stage 07) eventually applicable to all geometry in the project, including the planet itself, not just the one detail-view chunk. Noted for future dev (Dana, 2026-09-23), not in scope now.
- **Redo** — a natural fast-follow to Stage 06's undo (Cmd+Z), once undo itself is proven out.
- **Topography-line overlay** — contour lines rendered directly on the terrain surface as a visual guide (standard in this category of tool, e.g. World Machine).
- **No node-based UI** — explicit decision: the left-panel-list/right-panel-details structure already in place is correct; not building a node graph like World Machine/Gaea/Substance Designer use.
- **Feature ideas pasted from World Machine's website (2026-09-14)** — kept as reference, not committed to building any/all of it:
  - **Selectors (masking tools)** — richer masking than plain elevation/slope for orchestrating where materials go: *Basic* — elevation and slope, with directional falloff (a north face can read differently from a south one); *Advanced* — roughness, wetness, water, surface convexity (with adjustable smoothing); *Natural filter outputs* — every simulation produces its own masks (sedimentation, wear, talus, snow, etc.); *Comparative* — a "Compare Maps" tool returns a soft comparison between any two maps (e.g. select where sediment landed, or where one pass differs from another); *By identity* — "Select by ID"/"ID Convert" build masks from discrete region IDs rather than continuous values. Point: "put gravel where the water ran and lichen where it never does."
  - **Weightmaps** — texture weightmaps/splat-maps: RGBA bitmaps whose channels weight the distribution of each material across the world (what every game-engine terrain shader expects). Combine any selectors/erosion masks; a "Weightmap" device keeps channels normalized and coverage where set.
  - **Built for comparing** — most viewport time goes to judging whether a change helped, so tools are built around that: side-by-side A:B comparison of two states in one view, or a sliding wipe between them, comparing a device's input against its output; display guides stackable over the terrain (a slope overlay for where the ground exceeds what the engine will let a player walk on, contour lines to read elevation topographically, a terrain grid showing where the real data resolution sits); camera slots on keys 1-8 to recheck the same vantage points after every change instead of re-flying the terrain; an orthographic camera that transitions smoothly out of perspective, for judging layout/scale without foreshortening.
  - **Worlds bigger than memory** — for large open worlds, one asset for the whole region stops being workable. Export a set of tiles covering the region instead (Professional Edition+); each tile builds separately, buying extreme detail with world size bounded by disk rather than RAM. Tiles read back too — a "Tiled File Input" device points at the file collection and the whole set comes in, cached at multiple resolutions, so a world far larger than memory can be opened/edited as if it were a single file. A long build that fails resumes from where it stopped rather than restarting, and finished tiles merge as they go rather than waiting on one long final pass.

---

## Narrative Ideas *(early brainstorm, 2026-09-02)*

From the very first planning session — inserting storytelling into the builder, since this is a procedural-building class the narrative should also be procedural:

- **Population growth** — choose an area to place population, let the project run and observe how it grows/develops. Choose a starting development level (cavemen, agricultural society, medieval, etc.) and let it progress along a timeline.
- **Apocalyptic scenarios:**
  - Nuclear bombing — destroys wide areas of the planet; configurable destructiveness (radius, number of bombs, destroyed areas, post-destruction radiation).
  - Meteor / space-related disaster.
  - Climate change / global warming — slow, gradual destruction.
  - Ice age.
  - Volcanic eruption.
  - Etc. — will keep adding as the project develops.

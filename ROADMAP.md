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
> 5. **Fixed: Ridged wasn't zero-mean** — `ridge(x) = 1 - abs(x)` output mostly near 1 (its max, hit whenever the input noise was near its own most common value, 0), unlike every other noise type here, which are all genuinely symmetric around 0. Invisible before Height/elevation existed (the old pipeline bounded/clamped everything through Opacity); with Height unclamped, it inflated the whole planet/chunk uniformly instead of just amplifying peaks vs. valleys. Fixed by re-centering: `2.0 * (1.0 - abs(x)) - 1.0` (2026-09-24). See `ISSUES.md`.
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
> 5. **Multi-select with batch edit** — shift+click a layer to add/remove it from the selection (click alone selects exclusively); any control changed while multiple layers are selected applies to all of them at once, same "joint edit" pattern later reused for the shared gumball's pane selection. A slider's displayed value always follows the last-clicked ("primary") layer (2026-09-23).
> 6. **Visible drag-to-reorder** — dragging a layer row now moves the actual row itself (via `position:fixed`, following the cursor) instead of reordering instantly with no visible feedback; a first "ghost copy" approach was rejected — Dana wanted to see the real token move, not a floating duplicate (2026-09-23).
> 7. **Per-layer visibility toggle** — a Photoshop-style eye icon per row; a hidden layer is skipped entirely before its uniforms are ever set (`layers.filter(l => l.visible !== false)` in `HeightmapPipeline.render()`), so its noise is never evaluated, not just zero-weighted. Solves not being able to tell which layer is being painted on in the shared 2D/3D preview. Considered and rejected forcing opacity to 0 instead — Dana: "it's not the same as 0 opacity though," a hidden layer's noise would still be computed and it conflates a real distinct concept with the existing Opacity slider. Also considered and rejected a shader-side `uLayerVisible` uniform + `continue` skip — Dana: simpler to just not compute a disregarded layer at all, so the CPU-side filter replaced it (2026-09-23).
> 8. **Fixed: old saved layers defaulted to hidden** — `visible` didn't exist on layers saved before this feature, so plain truthiness read `undefined` as falsy/hidden. Fixed by checking `!== false` (filter) / `=== false` (eye-icon + row dimming) everywhere instead of plain truthiness, so missing data defaults to visible (2026-09-23).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Layer naming** — layers show their noise-type label, not a real name. Want auto-assigned "Layer 01"/"Layer 02" (ever-incrementing counter) plus a rename option (double-click to edit inline). Requested 2026-09-22, not built.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Modifier architecture — 30%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Per-layer Height (amplitude)** — a real `heightScale` field per layer, distinct from Opacity/Blend Mode: Opacity/Blend Mode govern the 2D shape/paint composite only; Height is a separate, purely additive contribution to actual elevation, ignoring Opacity/Blend Mode entirely (Dana, 2026-09-24: "same as an amplitude/strength control... it's a separate param... not related to blend modes or opacity"). See the elevation-channel split under Stage 05, and `ISSUES.md`, 2026-09-24, for the full design (including a rejected first version where Height and Opacity collapsed into the same number on a base layer).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Modifiers as toggles, not types** — Ridged/Octaves/Terrace/Domain warp are separate selectable *noise types* today, not independently-toggleable modifiers layered onto a base type in a fixed order (Domain warp → generator/Octaves → Ridged → Terrace), the way Gaea structures it.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 04 — Terrain: Paint Authoring
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 90%

#### 2D heightmap canvas — 95%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Preview canvas** — flat 2D preview, no WebGL context of its own (2026-09-14).
> 2. **Paint capture** — captures paint pointer input, reads back pixels from the shared pipeline (2026-09-16).
> 3. **Fixed: Expand opened a dark overlay instead of replacing the viewport** — the "Expand" button used to cover the entire window, both side panels included, with a `position:fixed` dark backdrop. `isExpanded` moved from `NoisePanel` up to `App.tsx` (it affects what renders in `.app-viewport`, not just something local to the right panel) — expanding now swaps the 3D viewport's planet/chunk panes for the full-size canvas in place, both panels stay visible (2026-09-24).
> 4. **Noise canvas section is now an Accordion** — collapsible, matching Project Settings/Edit, instead of always-open (Dana, 2026-09-30: "it's starting to crowd the menu").
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Richer expanded-mode brush toolset** — strength, size beyond radius, shape — planned to land in the now-fixed expanded view.
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
> 4. **Elevation split from the 2D shape/paint composite** — the heightmap texture now carries two genuinely independent channels instead of one doing double duty: R (shape) is exactly the old Opacity/Blend-Mode composite, driving only the 2D canvas/painting; G (elevation) is a separate, purely additive per-layer sum (each layer's own Height × its own noise-and-paint value, ignoring Opacity/Blend Mode) that the planet's displacement and the land chunk's height both read instead of R. Render target switched to `FloatType` so elevation can hold real, unclamped, possibly-negative values instead of a clamped 0..255 color (2026-09-24). See Stage 03's Modifier architecture and `ISSUES.md` for the full reasoning, including 2 rejected simpler designs.
> 5. **Height is a percentage of context size, not an absolute scene-unit value** — `(Height / 100) × radius` for the planet, `(Height / 100) × chunkSize` for the land chunk (Stage 07), computed where each is used. Fixes the same Height value looking reasonable on the planet (large radius) but dwarfing the chunk (much smaller footprint) — a percentage self-normalizes regardless of the two views' wildly different absolute scale, no unit-conversion bookkeeping needed (Dana, 2026-09-24: "can the height be in %?"). Default recalibrated to 15% to match the old look. See `ISSUES.md`.
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
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 95%

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

#### Save/load — multi-project — 95%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **CLI set up** — Firebase CLI installed and authenticated (2026-09-22).
> 2. **Multi-project data model** — a subcollection of named planets (`projects/{uid}/planets/{planetId}`, each `{ name, layers, strokeHistory, updatedAt }`), not one document per user — lets a user save multiple named versions and start new ones (2026-09-22/23).
> 3. **Security rules deployed** — `firestore.rules`, matching the subcollection model; a user can only read/write their own (2026-09-22).
> 4. **Save/load wired** — `firebase/storage.ts`, debounced ~3s (see reasoning below), wired via `projectSettings/saveProject.ts` (2026-09-22/23).
> 5. **Project Settings panel section** — collapsible accordion: an inline-editable project name (click it, type, Enter/blur commits and auto-saves — replaced an earlier prompt-based Rename button), a nested "My Projects" accordion listing saved planets as rows (click to load, "×" to delete, confirmed since it's permanent), a "+ New Project" action inside that list, and a "Save" button for a manual just-in-case save (2026-09-23).
> 6. **Always named, never an "unnamed" state** — a brand-new user, "+ New Project", and deleting the last remaining planet all auto-generate a name ("New Planet 01", "New Planet 02"...) and save immediately, rather than waiting on a prompt (2026-09-23).
> 7. **"Edit" section is an accordion too**, with **Undo**, **Redo**, and **Reset** — Reset clears the *currently open* planet's content back to blank without switching which named project is active, confirmed since it's destructive and not part of the undo history (2026-09-22/23).
> 8. **Auto-save interval — kept as debounce, not a fixed timer**, per discussion: a flat 5-10 minute timer either saves needlessly or risks losing several minutes of work right before a tick; the existing debounce already only fires on real changes (and `strokeHistory` only updates once per *completed* stroke, not per dab) — ~3s covers the actual goal (fewer writes) better than a fixed interval would.
> 9. **Live-tested and confirmed working by Dana** — the original single-project version: layer add/opacity changes survive a reload (2026-09-22).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Live-test the multi-project flow** — new/rename/delete/switch-between-projects, built and passing build checks, not yet live-tested end-to-end.
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

#### Undo/Redo (Cmd+Z / Cmd+Shift+Z) — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Shortcut** — Cmd+Z (Mac) / Ctrl+Z pops the single most recent stroke, regardless of which layer it's on (2026-09-22).
> 2. **Rebuild** — rebuilds every layer's paint texture from what remains, via the same replay mechanism as save/load (2026-09-22).
> 3. **Edit panel button** — a new left-panel "Edit" section with an "Undo" button, disabled when there's nothing to undo (2026-09-22).
> 4. **Live-tested and confirmed working by Dana** (2026-09-22).
> 5. **Fixed: 2D canvas didn't refresh after undo** — the 3D view updated instantly, but the 2D preview stayed stale until clicked, confirmed by Dana. Different cause from the reload bug above — not an ordering issue, `MapView` simply had no connection to `strokeHistory` at all (it only watches `layers`, and undo never touches `layers`). Fixed with a small `paintVersion` counter, bumped in `undo()` and threaded down as a prop `MapView`'s refresh effect also watches (2026-09-22).
> 6. **Redo** — Cmd+Shift+Z (Mac) / Ctrl+Shift+Z and an Edit-panel "Redo" button, mirrors undo's architecture (a `redoStack`, cleared on any new stroke) (2026-09-23).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Scope** — covers paint strokes only, not other edits (opacity/noise-type/layer-add changes). A general "undo anything" system would be a separate, bigger feature.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---
---

## Stage 07 — Land Cube / Voxel Terrain
🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 75%

A detail view into one fixed-size chunk of terrain, shown side by side with the planet, with a render-style choice (blocky voxel or smooth) — syllabus-required, sequenced before Erosion per Dana's call (2026-09-23). Full reasoning/tradeoffs in `ISSUES.md`.

#### Voxel meshing pipeline — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Density field** — one fixed test chunk, seeded from the existing composited heightmap via `getPreviewImageData()`; a column is solid below the heightmap's height. No caves/overhangs yet (2026-09-23).
> 2. **Meshing — cube/culled-face, not Marching Cubes** — one flat quad per voxel face exposed to empty space; buried faces skipped entirely. Produces the blocky look directly; Marching Cubes would produce a smooth/rounded surface instead (2026-09-23).
> 3. **Compute location — CPU, in a Web Worker** — not GPU compute; keeps the main thread/3D view responsive during (re)generation. GPU compute (`WebGPURenderer`) explicitly deferred — would mean migrating the whole app off `WebGLRenderer` and porting every GLSL shader to TSL, disproportionate unless CPU+Worker measures as insufficient (2026-09-23).
> 4. **Resolution control** — a "Land Chunk" panel section with a Resolution slider, regenerating on change (2026-09-23).
> 5. **Connected to the noise layer stack** — regenerates whenever the layer stack changes, not just when the chunk pane first becomes visible (2026-09-23).
> 6. **Fixed: chunk sat half-buried under the grid** — the mesh centered all 3 axes including vertical, so half the terrain sat below y=0. Only x/z are centered now; the base sits at grid level (2026-09-23).
> 7. **Rearchitected: column-based (O(resolution²)), not a 3D solid/empty grid (O(resolution³))** — the original density field was a full `Uint8Array(resolution³)`, which is cubic in both memory and meshing cost and hits a real wall well before "high resolution" (512³ is ~134MB; a naive 4096³ isn't representable at all). Since v1 has no caves/overhangs, a column is always "solid from the ground up to some height," so one height value per column (`Uint32Array(resolution²)`, `density.ts`'s `buildChunkHeights()`) is the complete representation — same O(resolution²) shape the smooth render style already used. Meshing rewritten to match: one top quad per solid column, walls wherever two neighboring columns (including the chunk's own edge, treated as height 0) differ in height, one bottom cap — replacing per-voxel-face culling entirely (2026-09-23). See `ISSUES.md`.
> 8. **Resolution ceiling raised** — this rearchitecture is what actually unlocked pushing the slider's max past the old per-voxel-face-culling ceiling; raised 64→512→2048 (Dana: "why just 512? i want uhd at least"). True UHD (4096) deliberately held back — worst-case triangle count for very noisy terrain at 4096 risks crashing the tab outright, not just running slow (2026-09-23).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Real chunk location picking** — still one fixed arbitrary spot on the heightmap, not yet tied to a location the user picks on the planet. Deferred, Dana's call (2026-09-23). Direction floated 2026-09-24: "the land chunk should be a chunk of the planet that's flattened... divide the planet's surface into x chunks and the chunk is one of them" — the actual selection mechanism (how the user picks/navigates which chunk) still needs figuring out, not decided yet.
> 2. **Editing (digging/adding voxels live)** — separate feature; when it lands, only the changed region gets remeshed (dirty-chunk updates), not the whole grid.
> 3. **Greedy meshing** — merging same-facing quads, deferred until resolution/perf actually needs it.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Smooth render style — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Voxel is a display style, not the chunk's only way to render** — the existing planet Display dropdown (Shaded/Wireframe) gained a third option, "Voxel" (Dana, 2026-09-23: "voxel is a feature that could be applied to both chunk and planet and also toggled off — it's a stylistic choice"). Shaded/Wireframe render the chunk as a smooth, continuously-displaced surface instead of blocky voxels (2026-09-23).
> 2. **Grounded, not floating** — the smooth patch is extruded down to a solid slab (skirt walls + a bottom cap), not a bare surface, so it sits on the grid like the voxel version instead of floating as a disconnected sheet (2026-09-23).
> 3. **Shared sampling** — both render styles read the exact same terrain via one `sampleChunkHeight()` helper, not two independently-drifting copies (2026-09-23).
> 4. **Planet unaffected for now** — selecting "Voxel" has no visible effect on the planet yet; generalizing the blocky look to the planet itself stays a noted future item, not built.
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None for the chunk. Planet-voxel generalization tracked separately, see Potential Features below._
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Land-chunk viewport & navigation — 90%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Side-by-side layout** — planet and land-chunk panes, resizable via a drag handle between them (2026-09-23).
> 2. **View-mode control** — a small Planet / Land Chunk / Split button, top-right of the viewport, replacing an earlier plain on/off toggle. Matches the earlier "Expand should replace, not overlay" idea. Defaults to Planet (2026-09-23).
> 3. **Fixed: panes were unmounting on toggle** — switching view mode used to destroy and rebuild each pane's whole Three.js scene/camera/renderer, resetting the planet's camera position and even its color back to a shader placeholder default. Both panes are now always mounted, toggled via CSS visibility only (2026-09-23).
> 4. **Shared scene settings** — lighting, grid, and base color all shared with the planet's own Scene/Planet controls, not separate per-viewport settings; lighting intensity is rescaled for the chunk's real PBR material (`MeshStandardMaterial`) rather than reused raw from the planet's own hand-written-shader-calibrated values (2026-09-23).
> 5. **Fixed: smooth-mesh walls missing on some sides** — 4 separately hand-derived wall windings, one already proven wrong, replaced with a single boundary walk using one formula (outward normal = edge direction rotated -90°) — see `ISSUES.md`. `DoubleSide` also added as a safety net (2026-09-23).
> 6. **Resolution vs. Size decoupled** — Resolution now only controls voxel/vertex subdivision (detail); a new **Size** control governs the footprint's actual world-space width/depth independently (2026-09-23).
> 7. **Height retuned for contrast** — ambient/directional ratio adjusted (ambient multiplier x4 → x1.5) so shadowed faces read as darker against lit ones, not washed out by flat ambient fill (2026-09-23).
> 8. **Radius/Size unified into one contextual slider** — Planet controls' Radius and this section's Size collapsed into a single slider that relabels/rebinds to whichever pane is actually in view or selected (Radius when the planet, Size when the chunk), instead of showing both separately (Dana, 2026-09-23/24: "the slider should actually change depending on the view"). Disables (doesn't hide) when both panes are selected in Split, since it's a view-specific control, not a joint one like lighting/zoom. Resolution stays chunk-only — no planet-side resolution control exists yet to merge it with (2026-09-24).
> 9. **Section renamed "Land Chunk" → "Chunk"** — matches the actual industry term for a fixed-size, independently-meshed block of terrain (already the internal naming throughout the code — `landChunk.ts`, `ViewMode: 'landChunk'`), not a newly-invented name (2026-09-24).
> 10. **Height scale fixed relative to the chunk's own footprint** — see Stage 05's percentage-based Height fix; the chunk specifically was where the mismatch was first noticed ("any height changes on the planet seem massive on the land chunk").
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. **Real cast shadows** — a shadow map (terrain casting shadows onto itself) for genuine depth/contrast beyond flat per-face shading, especially for craggy/blocky terrain. Needs `renderer.shadowMap` enabled, the light and mesh marked to cast/receive, and the directional light's shadow-camera frustum tuned to the chunk. Bigger, separate piece of work — noted, not started (Dana, 2026-09-23).
> 2. **Camera auto-framing** — the chunk's camera distance is fixed regardless of Size; not an issue in practice since the gumball's zoom already compensates manually (Dana, 2026-09-23), not planned unless it becomes one. Same gap exists for the planet's Radius, for the same reason not currently a priority.
>
> <span style="color:#cf222e">🐛 **Issues to fix**</span>
> 1. _None._

---

#### Shared gumball — 95%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **One instance, not one per viewport** — `Gumball` now drives a list of 1-2 camera targets instead of a single fixed one, retargeted via `setTargets()` rather than recreated (2026-09-23).
> 2. **Click to select, shift+click to add** — click a pane to give it the gumball exclusively; shift+click the other pane to drive both cameras together from the same controls (2026-09-23).
> 3. **Selection frame** — a subtle outline (matching the existing `.noise-layer-row--selected` convention) on whichever pane(s) are targeted, shown only in Split mode where it's actually needed (2026-09-23).
> 4. **Fixed: zoom/reset didn't work right for the chunk** — the zoom/reset math used one fixed reference distance calibrated for the planet's scale; for the ~16-unit chunk, the slider's range couldn't get closer than the chunk's own default view. Each target now carries its own `referenceDistance`, so the same slider percentage scales proportionally per camera (2026-09-23).
> 5. **Positioned correctly** — gumball stays at its original bottom-right corner (sticky across view-mode changes, not duplicated); the view-mode button (a separate control) is what actually moved to top-right (2026-09-23).
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None currently._
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
🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜ 30%

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

#### Adjustable control panel — 100%
> <span style="color:#2da44e">✅ **Done**</span>
> 1. **Fixed: panel width changed with content** — both panels used `width: max-content`, so they visibly resized every time an accordion opened/closed or a right-panel tab switched (Dana, 2026-09-30: "it changes width according to what is open... a stable width").
> 2. **Resizable panel** — a drag handle on each panel's inner edge, ported from `active-geometry-project`'s `.ag-right-panel-handle` pattern (`ui/panelResize.ts`): width only ever changes via an explicit user drag, never auto-adjusted by content — the same fix as #1, but user-adjustable instead of one hardcoded number (Dana, 2026-09-30: "i didnt mean it to have a hard coded width"). Applied to both the left and right panels (2026-09-30).
> 3. **Min/starting width lowered to 280px** — first on the left panel only (Dana, 2026-09-30: "the left side menu is a bit too wide... lower it's min value"), then matched on the right panel too ("add the same fix to the right panel - inc 280 min"). Both now share the same 280–600px range.
> 4. **Fixed: slider/select rows didn't reflow into the narrower width** — `.ui-slider-track`/`.ui-select` had `flex: 1` but no `min-width: 0`, so the browser's intrinsic default width for range/select inputs blocked them from actually shrinking — number fields got pushed past the panel's edge instead ("you just cut the width without adjusting all the components - to fill panel width"). Fixed by adding `min-width: 0` to both.
>
> <span style="color:#0969da">📋 **To do**</span>
> 1. _None._
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
- **Heightmap/noise resolution as a user control** — the shared heightmap texture (`HEIGHTMAP_WIDTH`/`HEIGHT`, 1024×512) is currently one fixed constant for the whole pipeline (noise + paint together), not adjustable, and not per-layer. A real resolution control here is a separate, bigger change than the land chunk's own resolution slider (Stage 07) — it affects the whole shared pipeline, with real memory/performance tradeoffs across the entire app, not just one view. Noted for later (Dana, 2026-09-23), not in scope now.
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

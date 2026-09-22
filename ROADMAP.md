# Roadmap / Project Log

The main doc for planning and progress tracking on Procedural World Building — organized by **product stage and feature**, not chronologically, so it reads as current state rather than a log to scan through. (The syllabus's graded Weekly Push reports, which *are* chronological, live in `WEEKLY-PUSHES.md`; technical decision *rationale* and bug detail live in `ISSUES.md`; external-facing structure/conventions reference lives in `README.md`.)

Each feature follows the same template, boxed as a quote block so it's visually clear where one feature ends and the next begins:
> <span style="color:#2da44e">✅ **Done:**</span> what's actually built and working — each change dated `(YYYY-MM-DD)`.
>
> <span style="color:#0969da">📋 **To do:**</span> what's known to still be missing/open, not yet built.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> short pointers only — full technical detail lives in `ISSUES.md`, cross-referenced by date.

Each stage has a progress bar (e.g. 🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜ 55%) instead of a status label — a rough visual read of how open vs. done that stage's features are, **not** an exact/measured metric.

Stages are numbered in roughly the order they were/are being built, matching how work actually proceeds through this roadmap (see `CLAUDE.md`'s working rules — earlier stages finish before later ones start). A separate "Potential Features / Ideas" section at the end holds reference/brainstorm material that isn't scheduled as a stage at all.

---
---

## Stage 01 — Foundation & Scene Setup
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 95%

#### Project scaffold
> <span style="color:#2da44e">✅ **Done:**</span> Vite + React + TypeScript + Three.js project scaffolded (2026-09-09), following `active-geometry-project`'s own conventions (see `README.md`'s code-organization section) rather than the class repo's Entity/World OOP pattern — an early Entity/World attempt (`app/src/engine/Entity.ts`) was tried and removed (2026-09-02; see `ISSUES.md` for why).
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---

#### 3D scene, camera, controls, grid
> <span style="color:#2da44e">✅ **Done:**</span> scene/camera/orbit-controls setup (2026-09-09); `DEFAULT_CAMERA_DISTANCE` bumped from active-geometry's 80 to 200 (2026-09-09 — that value was calibrated for small CAD shapes, not a planet); a shader-based infinite-looking grid plane (`scene/grid.ts`, `shaders/grid.vert.glsl`/`grid.frag.glsl`) replacing `THREE.GridHelper` (2026-09-14), reusing active-geometry's minor/major fwidth-anti-aliased line math and distance fade; a "Grid lines" toggle and "Grid spacing" slider in Scene controls (2026-09-14); grid `fadeDistance` widened 400→3000 (2026-09-16 — was fading out at moderate zoom-out).
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> a real React StrictMode-related leak duplicated the grid on resolution change (cleanup was tearing down a stale closure reference instead of the ref's current value) — fixed (2026-09-09). See `ISSUES.md`, 2026-09-09.

---

#### Gumball navigation widget
> <span style="color:#2da44e">✅ **Done:**</span> ported/debugged the orientation/navigation widget (axis indicator, zoom slider, view presets, reset) (2026-09-09), reusing active-geometry's camera-calibration math; mounts inside `.app-viewport` (`position: absolute` against it) instead of `document.body`/`fixed` against the window (2026-09-14), so it stays confined to the 3D viewport.
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> axis lines didn't respond to direct drags — a `pointer-events` cascade issue — fixed (2026-09-09); the widget drifted onto the new right panel once it existed — fixed by scoping its positioning to the viewport (2026-09-14). See `ISSUES.md`, 2026-09-09 and 2026-09-14.

---

#### Control panel UI system
> <span style="color:#2da44e">✅ **Done:**</span> a generic UI component set (`Slider` — draggable + scrubbable/typeable field; `ColorPicker`; `Toggle`; `Select`) in `ui/UIElements.tsx` (2026-09-09), feature-grouped rather than split per-component, matching active-geometry's own convention; left `Panel.tsx` (Scene controls, Planet controls, sectioned) (2026-09-09); right `RightPanel.tsx` tab bar (2026-09-14, ported from active-geometry's `buildStageTabs`/`.ag-stage-tab` convention, reimplemented with React state) — tabs organized by technique/effect (Noise/Erosion/Color), not by the planet's parts (see `ISSUES.md`, 2026-09-14, for the reasoning); `Slider` gained an optional `trackClassName` for the black-white brush-strength gradient track (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> the placeholder tabs (Erosion/Color) don't match the Noise tab's width — cosmetic, deferred (2026-09-14).
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> the planet initially rendered off-center (canvas was full-bleed behind the panel) — fixed via the flex layout (`app-layout`/`app-viewport` in `design.css`) (2026-09-09).

---
---

## Stage 02 — Planet Base
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 90% *(done, ongoing tuning)*

#### Sphere geometry & radius control
> <span style="color:#2da44e">✅ **Done:**</span> `planetGeometry()` split out from `planet()` for cheap radius-only rebuilds (2026-09-14); the planet stays centered at the origin as radius changes, not anchored to the grid (2026-09-14); a Radius slider (km, narrative-scale, mapped down via `KM_PER_SCENE_UNIT = 300`, an arbitrary placeholder conversion) — its range was retuned several times against the actual camera/grid setup (1,000–15,000 on 2026-09-09/14 → 500,000 → 150,000 → **1,000–100,000 km** (2026-09-16), the range it's on now) so the planet stays framed/visible: at the 100,000km max, scene radius ≈333 units, comfortably under the grid's 3,000-unit fade distance and the camera's 10,000-unit far clip.
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> radius changes weren't updating the shader material's `uDisplacementAmplitude`/`uRadius` uniforms (only the geometry itself was rebuilt) — fixed alongside the lighting fix (2026-09-16), see Stage 05.

---

#### Base color, ambient light, display mode
> <span style="color:#2da44e">✅ **Done:**</span> base color `ColorPicker` (native `<input type="color">`); ambient light + light X/Y sliders; display mode `Select` (Shaded/Wireframe) — all 2026-09-09; base color lightened (`#3a7bd5` → `#c9dbea`) and ambient light retuned (0.15 → 0.12) for visible shading contrast on the terrain bumps (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> color-picker theming — currently native OS/browser chrome, not themed to match the app. Open decision, not yet made: keep native, add a small dependency (e.g. `react-colorful`), or hand-build one.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---
---

## Stage 03 — Terrain: Noise Generation
🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜ 55%

#### Base noise types
> <span style="color:#2da44e">✅ **Done:**</span> 8 selectable types — Random, Perlin, Simplex, Voronoi (base generators, 3D-position-sampled to avoid sphere pole/seam artifacts), Ridged, Octaves/fBm, Terrace (2026-09-14), and Domain warp (2026-09-15), plus None (flat/no displacement). Perlin3D/Simplex3D verified against the canonical Stefan Gustavson/Ashima Arts source (2026-09-14, see `README.md`'s References section); the fBm formula verified against thebookofshaders.com/13 (2026-09-14).
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> a wrong constant in a hand-reproduced Perlin noise function, caught by diffing against the canonical source (2026-09-14). See `README.md`'s References section and `ISSUES.md`, 2026-09-14.

---

#### Multi-layer stack & blend modes
> <span style="color:#2da44e">✅ **Done:**</span> the heightmap pipeline became a single shared instance owned by `SceneCanvas` rather than duplicated per-component (2026-09-15, "have the threejs be the manager for the system"); a real Photoshop-style layer stack (bottom of the array = base/applied first, top = applied last — the visual list renders reversed to match Photoshop's own panel convention) — add/delete/drag-to-reorder, up to `MAX_LAYERS = 16`, each with its own noise type/params/opacity/blend mode (Normal/Add/Subtract/Multiply/Max/Min/Screen, verified against Gaea's actual Combine node docs, docs.quadspinner.com) (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> layer naming — layers currently display their noise-type label, not a real name; want auto-assigned sequential names ("Layer 01", "Layer 02", ... from an ever-incrementing counter so deleted numbers aren't reused) plus a rename option (proposed: double-click the name to edit inline) (requested 2026-09-22, not yet built).
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> a newly-added layer visually erases existing painted terrain beneath it (found 2026-09-22) — root cause: an empty layer (no noise, no paint) still outputs a flat "height" value rather than true zero-coverage/transparency, and at `Normal` blend + full opacity that flat value fully replaces the composite beneath it. No data is actually lost (each layer's paint texture is untouched), but the compositing needs real per-layer coverage/alpha, not just opacity. Diagnosed, fix proposed, not yet implemented. See `ISSUES.md`, 2026-09-22.

---

#### Modifier architecture
> **Done:** —
>
> <span style="color:#0969da">📋 **To do:**</span> Ridged/Octaves/Terrace/Domain warp currently exist as separate selectable *noise types* rather than independently-toggleable modifiers layered onto a base type in a fixed order (Domain warp → generator/Octaves → Ridged → Terrace), the way a tool like Gaea structures it. A per-layer "height control" (amplitude, distinct from Opacity) was also requested (2026-09-15/16). Discussed, not implemented.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---
---

## Stage 04 — Terrain: Paint Authoring
🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜ 85%

#### 2D heightmap canvas
> <span style="color:#2da44e">✅ **Done:**</span> a flat 2D preview canvas (`map/MapView.tsx`, 1024×512, no WebGL context of its own) reflecting the composited terrain live (2026-09-14); wired to also capture paint input, reading back pixels from the shared `HeightmapPipeline` via `SceneCanvas`'s imperative handle (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> the "Expand" button above the canvas still opens a dark overlay on top of the 3D viewport — should instead *replace* the 3D viewport's content while keeping both side panels visible, since a richer expanded-mode brush toolset (strength, size beyond radius, shape) is planned to land there (requested 2026-09-16, not yet done).
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---

#### Brush system
> <span style="color:#2da44e">✅ **Done:**</span> an absolute "set to this gray" brush, not additive (2026-09-16 — a layer's noise type of `'none'` plus painting *is* the layer's content); a black-white "Brush" strength slider (-1 erase/black .. 1 paint/white) (2026-09-16); a Feather slider (0=hard edge, 1=fully soft — a fixed fraction of the brush radius, true Photoshop-Hardness-style: total brush size never changes with feather) (2026-09-16 — several earlier models tried and reverted first, full history in `ISSUES.md`); brush radius correctly converts px→UV using the fixed texture resolution (`HEIGHTMAP_WIDTH`), not the canvas's CSS display size (2026-09-16); strokes interpolate extra dabs along fast drag segments so they stay visually continuous (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> stroke-drag opacity buildup (found 2026-09-16, fixed 2026-09-22 — see `ISSUES.md`). **Still open, tabled 2026-09-22:** painted terrain still displaces as visibly jagged/faceted, and feather still isn't very noticeable, even after fixing the compositing math. Likely root cause: the sphere's mesh resolution (64×32 segments) is too coarse to smoothly represent a narrow painted feature — the GPU only displaces actual vertices and linearly interpolates between them per-triangle, so a sharp/narrow height gradient facets no matter how mathematically smooth the underlying paint data is. Dana's call: table this for now, come back to it — possibly erosion's own smoothing will help. See `ISSUES.md`, 2026-09-22.

---

#### Paint persistence pipeline
> <span style="color:#2da44e">✅ **Done:**</span> a persistent per-layer paint texture — a ping-pong pair of `HalfFloatType` render targets, since GPU blending into a float target isn't reliably supported, so each stroke computes the full new state in-shader instead (2026-09-16); Porter-Duff "over" compositing, fixing partial-opacity strokes reading as diluted/dark instead of correct-color-at-reduced-strength (2026-09-16); pole-snapped sampling to avoid a geometry tear at the sphere's poles (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> GLSL ES 1.00 (this material's default compile mode) forbids dynamic sampler-array indexing — worked around with 16 separately-named uniforms instead of a real array (2026-09-16). See `ISSUES.md`, 2026-09-16.

---
---

## Stage 05 — Terrain: Displacement & Lighting
🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ 95%

#### GPU heightmap → displacement pipeline
> <span style="color:#2da44e">✅ **Done:**</span> fragment shader → render-target texture (`HeightmapPipeline`), sampled by the planet's vertex shader for displacement (2026-09-14); CPU can read back specific texels on demand (`readRenderTargetPixels()`) for future agent/road placement rather than duplicating the noise algorithm in JS (approach agreed 2026-09-02, see `ISSUES.md`).
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> a sphere UV-seam artifact from Three.js's duplicated seam vertices sampling non-identical texels — fixed via `texture.wrapS = THREE.RepeatWrapping` (2026-09-14).

---

#### Surface normal / lighting
> <span style="color:#2da44e">✅ **Done:**</span> the fragment shader reconstructs the surface normal analytically from the sphere's own UV parametrization (`dPdu`/`dPdv`, exact calculus derivatives — winding verified by hand-computing a concrete point, not guessed) plus the heightmap's own central-difference gradient, sampled 16 texels away rather than the immediate neighbor to avoid amplifying per-texel noise into visible roughness, scaled into world-space units via a `uRadius` uniform (2026-09-16).
>
> <span style="color:#0969da">📋 **To do:**</span> a "flat/faceted" shading style as a deliberate `Display` mode option (alongside Shaded/Wireframe) — while fixing the faceting bug below, the low-poly look itself was liked as a future style *choice*, just not as the default (noted 2026-09-16). Not built.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> an initial screen-space-derivative normal approach faceted the *whole* sphere, mesh-resolution-dependent — replaced with the analytic approach above (2026-09-16); a `'normalMatrix' : undeclared identifier` compile error, since Three.js auto-*sets* that built-in but only auto-*declares* it in the vertex stage — fixed with an explicit `uniform mat3 normalMatrix;` (2026-09-16). See `ISSUES.md`, 2026-09-16.

---
---

## Stage 06 — Project Persistence
🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 65%

Right now nothing else in the app persists at all — everything else lives only in React state in `App.tsx`, and a refresh loses the whole project. Surfaced as a real problem (2026-09-22) by the Stage 03 layer-compositing bug, which made a newly-added layer *appear* to erase existing painted terrain.

**Decided architecture** (2026-09-16, refined 2026-09-22 — see `ISSUES.md` for the full reasoning):
- **Backend: Firebase (Auth + Firestore),** not browser-only storage — Dana wants the app to recognize her as a user and auto-load saved projects, which `localStorage`/IndexedDB can't do at all (no concept of identity, doesn't follow you across devices/browsers).
- **Auth: anonymous now, real sign-in later.** Firebase's anonymous auth gives zero-friction auto-recognition immediately (a persistent per-browser identity, no login UI). A later upgrade to real sign-in (Google, and/or a Touch-ID/Face-ID-backed passkey via WebAuthn) uses Firebase's account-*linking* feature — same underlying user ID, so every project already saved carries over with no migration.
- **Data model: stroke logs, not just a baked raster.** "This is a procedural system so even the painting should be retraceable, that means saving the strokes" (2026-09-22) — so a painted layer's saved source-of-truth is its stroke log (raw pointer path + brush settings per stroke), replayed on load through the same dab-interpolation logic already in `paintStrokeTo()` to reconstruct an identical raster. The rendered paint texture is still cached alongside the log for fast loading, but the log is authoritative — this also sets up a near-free future "undo/history" feature (see Potential Features / Ideas below).

#### Firebase setup & anonymous identity
> <span style="color:#2da44e">✅ **Done:**</span> Firebase project created (`PWBdashboard` — Firestore in Production mode, Anonymous auth enabled); `firebase` SDK installed; `app/src/state/firebase.ts` (SDK init, exports `auth`/`db` — the public web config is committed as plain source, it isn't a secret) and `app/src/state/useCurrentUser.ts` (signs in anonymously on load, tracks the resulting user), wired into `App.tsx` (all 2026-09-22). Verified: a real anonymous UID logs to console on load, and the user appears in the Firebase console's Authentication → Users list.
>
> <span style="color:#0969da">📋 **To do:**</span> —
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---

#### Save/load — layer settings
> <span style="color:#2da44e">✅ **Done:**</span> Firebase CLI installed and authenticated (`229999390+Dana-shachar@users.noreply.github.com`); `.firebaserc`/`firebase.json`/`firestore.rules` added to the repo root and deployed via `firebase deploy --only firestore:rules` — Firestore now enforces that a user can only read/write the `projects/{userId}` document matching their own auth UID (2026-09-22); `state/storage.ts` (`saveLayers`/`loadLayers`, one Firestore document per user under `projects/{uid}`, holding just the layer stack's settings — not paint pixel data, that's the feature below) wired into `App.tsx` — loads the saved stack on sign-in, debounced (1s) save on every layer change, guarded so a save can't fire before the initial load resolves (2026-09-22). Build passes; not yet tested live.
>
> <span style="color:#0969da">📋 **To do:**</span> live-test (reload the browser, confirm a change survives, confirm it's per-user not shared). Currently one project per user, not multiple named saves — that's a possible future extension, not planned yet.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---

#### Save/load — paint stroke logs
> **Done:** —
>
> <span style="color:#0969da">📋 **To do:**</span> extend the data model above to also save each painted layer's stroke log (see "Data model" note above) and replay it on load to reconstruct the paint texture. Planned 2026-09-22, not started.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---
---

## Stage 07 — Erosion Simulation
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

Hydraulic/thermal erosion applied to the terrain over time, with a way to scrub/visualize its progression rather than a single static end state (syllabus: "Map simulations - Erosion simulation - Biomes"). An empty placeholder "Erosion" tab is already reserved for it in the right panel.

---
---

## Stage 08 — Color / Biome Texturing
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

Biome-style surface texturing/coloring. An empty placeholder "Color" tab is already reserved for it in the right panel.

---
---

## Stage 09 — Design System & UI Polish
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

#### Design-system / config tokenization
> **Done:** —
>
> <span style="color:#0969da">📋 **To do:**</span> a pass to centralize the scattered `TODO(DS)` placeholder values (arbitrary colors, light direction, ambient level, planet radius/segments, grid size, camera distance, the km-to-scene-unit conversion) into real design-system/config files instead of inline magic numbers. Tracked since 2026-09-09, not urgent. See `ISSUES.md`, 2026-09-09.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---

#### Adjustable control panel
> **Done:** —
>
> <span style="color:#0969da">📋 **To do:**</span> make the control panel resizable/collapsible (e.g. a drag handle like `active-geometry-project`'s) rather than its current fixed `max-width`. Explicitly deferred by Dana (2026-09-09/14), raised again 2026-09-16 — whether this is its own step or bundled with other panel work is an open scope question, not yet answered.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---

#### Wireframe overlay accuracy
> **Done:** —
>
> <span style="color:#0969da">📋 **To do:**</span> the "Wireframe" display mode overlays a `THREE.LineSegments` built from the sphere's plain, undisplaced CPU geometry — it won't track the actual GPU-shader-displaced terrain surface once real height is applied (noted 2026-09-14, not visible as a problem yet only because it's easy to miss). Proper fix: give the overlay its own shader sampling the same heightmap/displacement as the planet's vertex shader. Not urgent.
>
> <span style="color:#cf222e">🐛 **Bugs:**</span> —

---
---

# 💡 Potential Features / Ideas

Not stages — nothing below is scheduled or committed to being built. Reference material only, pulled in here so it doesn't only live in chat history/Obsidian notes.

## Future Terrain Ideas

Design notes and feature ideas from the 2026-09-14 planning session, not yet decided how much of this actually gets built:

- **Chunk/tile terrain viewing** — inspired by World Machine's ability to view/work on a square chunk of terrain rather than the whole thing at once.
- **History/undo tracking** — noted for later; Stage 06's stroke-log persistence approach sets most of this up already.
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

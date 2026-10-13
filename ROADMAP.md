# Roadmap

`Last updated: 2026-10-13`

*Where the project stands and what gets built next, by stage and feature.*

> [!NOTE]
> Current status only. Weekly reports are in `WEEKLY-PUSHES.md`. Architecture and decisions are in `SPEC.md`; bugs are in `ISSUES.md`. Outside sources are in `REFERENCES.md`. Repo layout is in `README.md`.

Stages run in build order, and earlier ones finish before later ones start. Features are numbered under their stage, so 07.3 is the third feature of Stage 07. Each carries a bar; a stage's number averages its features. Every feature has the same three fields: **✅ Done**, **📋 To do**, **🐛 Issues to fix**.

Signs, each meaning one thing: ✅ done · 🟡 in progress · ⚪ not started · ⏸️ deferred · ❓ Dana's to decide · 💡 unconfirmed · ⚠️ risk · 🔴 open bug · 📌 small todo · 📚 from research · 🧭 a decision · 🖼️ image needed.

---

## Stage 01 · Foundation & Scene Setup
▓▓▓▓▓▓▓▓▓▓ 100%

#### 01.1 · Project scaffold · 100%
> **✅ Done**
> - Vite, React, TypeScript and Three.js, following `active-geometry-project`'s conventions rather than the class repo's OOP pattern (2026-09-09).
> - `App.tsx` is a composition root only. Each feature owns its state in its own hook (2026-09-22).

#### 01.2 · 3D scene, camera, controls, grid · 100%
> **✅ Done**
> - Scene, camera, orbit controls, and a shader-based infinite grid with spacing and visibility controls (2026-09-09 to 09-16).

#### 01.3 · Gumball navigation widget · 100%
> **✅ Done**
> - Orientation widget with axis indicator, zoom, view presets and reset, scoped to the viewport (2026-09-09 to 09-14).

#### 01.4 · Control panel UI system · 95%
> **✅ Done**
> - Component set: `Slider`, `ColorPicker`, `Toggle`, `Select`. Sections are accordions throughout (2026-09-09 to 09-30).
>
> **🧭 Left panel is the pipeline-stage menu** · 2026-10-07
> - General settings pinned at the top, then six stage rows: Terrain, Erosion, Climate, Biome, Population, Events.
> - Clicking a row's label selects that stage and drives the right panel. Clicking its chevron expands that row's own quick settings, currently an Enabled toggle. Any combination can be enabled at once.
> - The master-detail pattern, and the structural answer to the procedural-system feedback. See that section at the end of this file.
>
> **📋 To do**
> - **Timeline control**, pinned rather than inside a stage. Plays whichever stages are enabled. Needs real simulation content first, so it lands with Erosion.
> - **Gating**, disabling a stage until its input exists. Deferred.

---

## Stage 02 · Planet Base
▓▓▓▓▓▓▓▓▓░ 90%

#### 02.1 · Sphere geometry & radius control · 100%
> **✅ Done**
> - Geometry rebuilds on radius change alone, stays centered at the origin, range 1,000 to 100,000 km (2026-09-14 to 09-16).

#### 02.2 · Base color, ambient light, display mode · 80%
> **✅ Done**
> - Base color, ambient and light direction controls, and a Shaded/Wireframe/Voxel display mode (2026-09-09).
>
> **📋 To do**
> - **❓ Color-picker theming.** Still native browser chrome. Keep native, use `react-colorful`, or hand-build.

#### 02.3 · Cube sphere · 70%
🧭 The planet is six flat grids pushed onto a sphere rather than a longitude/latitude grid, because a lat/long grid converges at two fixed points and cannot be subdivided locally. Groundwork for detail that follows the camera. Reasoning and rejected alternatives in `ISSUES.md`.

> **✅ Done**
> - Cube-sphere geometry replaces `SphereGeometry` (2026-10-13).
> - **Fixed: black slit across the surface.** Lighting rebuilt its surface direction from map coordinates, which jump at the wrap line. It now works from each point's 3D position (2026-10-13).
> - **Fixed: terrain tearing at the poles.** The map's wrap line crosses both pole faces, so triangles sat astride it and read from both ends of the map. Each pole face is now split along that line (2026-10-13).
>
> **📋 To do**
> - **Planet renders as patches.** Subdividing near the camera, each patch displacing from its own heightmap. This is what removes the planet's detail ceiling. Deferred as not currently blocking.
>
> **🐛 Issues to fix**
> - **Soft blur and rough ridging at both poles.** 🔴 open, 2026-10-13. The rectangular map's own distortion rather than a mesh fault. Goes when the planet reads patches.

---

## Stage 03 · Terrain: Noise Generation
▓▓▓▓▓▓▓▓▓▓ 100%

#### 03.1 · Base noise types · 100%
> **✅ Done**
> - Random, Perlin, Simplex and Voronoi, plus None. All verified against canonical sources rather than reproduced from memory, which caught a wrong constant (2026-09-14).

#### 03.2 · Multi-layer stack & blend modes · 100%
> **✅ Done**
> - Photoshop-style stack up to 16 layers: add, delete, drag to reorder, rename, per-layer visibility (2026-09-16 to 09-30).
> - Seven blend modes, verified against Gaea's Combine node docs (2026-09-16).
> - Multi-select with batch edit. Editing a control applies to every selected layer (2026-09-23).

#### 03.3 · Modifier architecture · 100%
> **✅ Done**
> - **🧭 Modifiers are toggles, not types.** Domain warp, Octaves, Ridged and Terrace are independent toggles layered onto any base generator in Gaea's fixed order, rather than mutually exclusive types each secretly hardcoded to Perlin. Old saved layers migrate on load (2026-09-30).
> - **🧭 Per-layer Height is its own channel**, separate from Opacity and Blend Mode. Opacity governs the 2D composite; Height contributes to real elevation. See `ISSUES.md` for why they collapsed into one number at first.
> - Modifiers UI is one section of contained tabs, so enabling several does not produce a wall of controls (2026-09-30).

---

## Stage 04 · Terrain: Paint Authoring
▓▓▓▓▓▓▓▓▓░ 90%

#### 04.1 · 2D heightmap canvas · 95%
> **✅ Done**
> - Flat preview canvas that captures paint input, collapsible, and fills the panel width at the texture's real 2:1 proportions (2026-09-14 to 09-30).
> - Expand replaces the 3D viewport's content rather than overlaying the whole window (2026-09-24).
>
> **📋 To do**
> - **Richer brush toolset in expanded mode**: strength, size beyond radius, shape.
>
> **🐛 Issues to fix**
> - **Expand shows a black preview.** 🔴 open, 2026-10-13. Not yet diagnosed.

#### 04.2 · Brush system · 90%
> **✅ Done**
> - Absolute brush with a strength slider, Photoshop-style hardness feather, correct radius scaling, whole-stroke polyline rendering, and correct wrapping across the seam (2026-09-16 to 09-22).
>
> **🐛 Issues to fix**
> - **Terrain still jagged, feather subtle.** 🟡 open, tabled by Dana until after erosion. Likely the sphere's mesh resolution. See `ISSUES.md`, 2026-09-22.

#### 04.3 · Paint persistence pipeline · 95%
> **✅ Done**
> - Per-layer ping-pong paint textures with Porter-Duff compositing, pole-snapped sampling, and full stroke history saved and replayed to reconstruct exactly (2026-09-16 to 09-22).
>
> **📋 To do**
> - **Live-test stroke save and load.** Built and passing checks, not yet confirmed by reloading.

---

## Stage 05 · Terrain: Displacement & Lighting
▓▓▓▓▓▓▓▓▓▓ 95%

#### 05.1 · GPU heightmap → displacement pipeline · 100%
> **✅ Done**
> - Noise renders to a texture that the planet's vertex shader samples for displacement, with CPU readback available on demand (2026-09-14).
> - **🧭 Shape and elevation are separate channels.** Shape drives the 2D canvas and painting; elevation is a purely additive per-layer sum that drives real height. Stored as float so elevation can go negative (2026-09-24).
> - **🧭 Height is a percentage of its context**, not absolute scene units, so one value reads sensibly against both the planet's radius and the chunk's much smaller footprint (2026-09-24).

#### 05.2 · Surface normal / lighting · 90%
> **✅ Done**
> - Analytic tangent basis, so the normal is smooth and independent of mesh resolution, perturbed by the heightmap's own gradient for fine detail (2026-09-16).
>
> **📋 To do**
> - **💡 Flat/faceted display option**, alongside Shaded and Wireframe. Wanted as a style choice, not built.

---

## Stage 06 · Project Persistence
▓▓▓▓▓▓▓▓▓▓ 95%

🧭 Firebase (Auth and Firestore) rather than browser-only storage, anonymous now with real sign-in later. Painting is saved as a chronological stroke log rather than a baked image, which is what makes it retraceable and makes undo fall out almost free. Full reasoning in `ISSUES.md`.

#### 06.1 · Firebase setup & anonymous identity · 100%
> **✅ Done**
> - Project, SDK wiring and anonymous sign-in, verified against the Firebase console (2026-09-22).

#### 06.2 · Save/load, multi-project · 95%
> **✅ Done**
> - Named planets as a subcollection per user, with security rules, so several versions can be saved and switched between (2026-09-22).
> - Project Settings panel: inline-editable name, a list of saved planets to load or delete, new project, and a manual save (2026-09-23).
> - Projects are always named, never in an unnamed state.
> - Auto-save stays a debounce rather than a fixed timer, since a timer either saves needlessly or loses minutes of work right before a tick.
>
> **📋 To do**
> - **Live-test the multi-project flow** end to end.

#### 06.3 · Save/load, paint stroke logs · 90%
> **✅ Done**
> - Strokes recorded and replayed through the same path live painting uses, rather than a separate load-time renderer (2026-09-22).
> - **Fixed: replayed strokes didn't show until clicked.** A real ordering bug, fixed by reordering rather than adding a refresh signal. See `ISSUES.md`.
>
> **📋 To do**
> - **Live-test**: paint, reload, confirm it reconstructs identically.

#### 06.4 · Undo/Redo · 100%
> **✅ Done**
> - Cmd+Z and Cmd+Shift+Z plus Edit-panel buttons, rebuilding from the stroke log. Covers paint strokes only (2026-09-22 to 09-23).

---

## Stage 07 · Land Chunk
▓▓▓▓▓▓▓▓░░ 80%

A detail view into one piece of the planet, shown beside the globe, with a blocky or smooth render style. Syllabus-required, sequenced before Erosion at Dana's call.

#### 07.1 · Terrain patches · 90%
🧭 The chunk is a terrain patch drawn flat: the same unit the planet is made of, not a separate pipeline sampling a shared map. A patch is a cube face, a rectangle on it, and a depth, with its own heightmap. Follows how globe renderers work, where the whole surface is tiles and detail comes from descending rather than from bigger textures. Sources in `REFERENCES.md`.

> **✅ Done**
> - The chunk reads its own patch, so its Resolution reaches real detail instead of enlarging a small window of a shared map (2026-10-13).
> - **🧭 Resolution and footprint are separate.** Resolution is how finely a patch's ground is measured; depth is which ground it covers (2026-10-13).
> - **Picking.** Double-clicking the planet chooses which piece the chunk shows, replacing a hardcoded spot (2026-10-13).
>
> **📋 To do**
> - **❓ Footprint control.** How much ground the chunk covers has no control in the panel yet. Naming and placement are Dana's call. Not the same as the gumball's zoom, which moves the camera.

#### 07.2 · Voxel meshing pipeline · 90%
> **✅ Done**
> - **🧭 Cube/culled-face meshing, not Marching Cubes**, since the goal is a blocky look and Marching Cubes produces the opposite.
> - **🧭 Meshed on the CPU in a Worker**, so the main thread stays responsive. GPU compute deferred, as it would mean migrating the whole app's renderer.
> - **🧭 Column-based rather than a 3D grid.** With no caves, one height per column is a complete representation, which is square rather than cubic in cost and is what lifted the resolution ceiling (2026-09-23).
>
> **📋 To do**
> - **Editing**, digging and adding voxels live, remeshing only the changed region.
> - **⏸️ Greedy meshing**, deferred until performance calls for it.

#### 07.3 · Smooth render style · 100%
> **✅ Done**
> - **🧭 Voxel is a display style, not the chunk's only way to render**, so Shaded and Wireframe give a smooth continuously-displaced surface (2026-09-23).
> - Extruded into a solid slab rather than a floating sheet, with a base below zero so the surface does not z-fight against it (2026-09-23, 2026-10-13).

#### 07.4 · Viewport & lighting · 90%
> **✅ Done**
> - Side-by-side panes with a draggable split and a Planet/Chunk/Split control. Both stay mounted, so switching never rebuilds either scene (2026-09-23).
> - Radius and Size are one contextual slider that rebinds to whichever pane is in view (2026-09-24).
> - **🧭 The chunk shades through the planet's lighting model** rather than Three.js's standard material, so the Scene controls mean the same thing in both views and the intensity-rescaling hacks are gone (2026-10-13).
>
> **📋 To do**
> - **Cast shadows.** Implement once in GLSL, shared by both views, now that they share a lighting model.
> - **⏸️ Camera auto-framing.** Not a priority, since the gumball's zoom compensates.

#### 07.5 · Shared gumball · 95%
> **✅ Done**
> - One instance driving one or two cameras. Click a pane to target it, shift-click to drive both. Each target carries its own reference distance, so zoom scales correctly for either scale (2026-09-23).

---

## Stage 08 · Erosion Simulation
░░░░░░░░░░ 0%

Hydraulic and thermal erosion over time, with a way to scrub its progression. Syllabus-required.

> **📋 To do**
> - **🧭 Built as a general engine**, parameterized by intensity, duration, location and direction, so Stage 13 reuses it rather than needing separate hand-built disaster effects. Decided before building, since it shapes the scope.
> - **❓ Grid-based rather than droplet-based.** Research says droplets need scattered writes that WebGL handles badly, while grid models are designed for the GPU. This reverses the September decision and needs sign-off. See `REFERENCES.md`.
> - **Hydraulic first, thermal second.** Decided 2026-09-23.
> - **Manual trigger**, a Run button rather than live.
> - **Real controls** over water, sediment and the rest. Not a black box.

---

## Stage 09 · Climate
░░░░░░░░░░ 0%

🧭 Temperature, humidity, precipitation and wind across the terrain. The input Biome needs to mean anything, and a named stage in real tools and literature rather than invented here. Sequenced after Erosion, because rain-shadow effects depend on the eroded shape.

> **📋 To do**
> - Everything.

---

## Stage 10 · Biome
░░░░░░░░░░ 0%

🧭 Biome classification from elevation, slope and climate, the way Minecraft's multi-noise source or a Whittaker diagram does. Split from the old combined Color/Biome stage once colour turned out to need its own shader.

> **📋 To do**
> - Everything.

---

## Stage 11 · Color Texturing
░░░░░░░░░░ 0%

🧭 Terrain colour as a shader reading height, climate and biome, not a flat painted value. Surfaces as a general setting rather than a pipeline row, alongside lighting and planet controls. The planet's flat base colour is the placeholder for it.

> **📋 To do**
> - Everything.

---

## Stage 12 · Population
░░░░░░░░░░ 0%

🧭 Rule-driven placement of trees, rocks, water and eventually settlements from the terrain's own data, typically by Poisson-disc sampling for natural spacing. Not hand-painted. Depends on Biome.

> **📋 To do**
> - Everything.

---

## Stage 13 · Events / Natural Disasters
░░░░░░░░░░ 0%

🧭 The direct answer to the project's concept: very different worlds, each with natural disasters you can generate. Each disaster is a parameterized run of Erosion's engine rather than its own effect. A flood is extreme localized hydraulic erosion; drought is wind and thermal; an eruption is radial uplift; an earthquake is a fault discontinuity. Blocked on Stage 08's engine.

> **📋 To do**
> - Everything.

---

## Stage 14 · Design System & UI Polish
▓▓▓░░░░░░░ 30%

#### 14.1 · Design-system / config tokenization · 0%
> **📋 To do**
> - **Centralize placeholder values.** Colors, lighting, camera distance and the rest are scattered inline, each flagged `TODO(DS)`. Tracked since 2026-09-09, not urgent.

#### 14.2 · Adjustable control panel · 100%
> **✅ Done**
> - Both panels resize by dragging their inner edge, and width only ever changes on an explicit drag rather than with content (2026-09-30).

#### 14.3 · Wireframe overlay accuracy · 0%
> **📋 To do**
> - **Overlay doesn't track displacement.** It is built from undisplaced geometry, so it does not follow the real terrain. Fix is to give it its own shader sampling the same heightmap.

---

# 💡 Potential Features / Ideas

*Not scheduled. Reference material so it does not live only in chat.*

- **Voxel rendering generalized beyond the chunk**, including the planet itself.
- **Heightmap resolution as a user control.** Currently one fixed size for the whole shared pipeline.
- **Topography-line overlay**, contour lines on the surface as a guide. Standard in this category of tool.
- **❌ No node-based UI.** Explicit decision. The panel structure is correct; not building a node graph like World Machine or Gaea.
- **From World Machine's feature set**, kept as reference: richer selectors for masking by elevation, slope, wetness and curvature; weightmaps for material distribution; side-by-side and wipe comparison of two states; camera slots for rechecking the same vantage points; tiled builds for worlds larger than memory.

---

## 🧭 Procedural System Feedback

*Everything marked 🧭 above traces back to here, so the link between feedback and what changed stays visible.*

**The feedback**, 2026-09-30, from class: *"it's good as a software, but the procedural aspect isnt clear enough... there's a subtle difference between a 3d software to make planets and a procedural system."*

**The diagnosis.** The noise itself is already procedural. What read as a tool rather than a system is that a person has to assemble the pipeline by hand to get any result, and the stages were presented as parallel tabs rather than as one causal chain where each consumes the last one's output.

**What changed as a result**
- The pipeline and its stage list: Terrain, Erosion, Climate, Biome, Color, Population, Events. Matching convention in real tools rather than invented.
- The left panel became that pipeline, with the right panel showing the selected stage.
- Erosion is built as one reusable engine so disasters are parameter values rather than separate effects.
- Colour became its own shader-driven stage.
- A Timeline, playing whichever stages are enabled.

**❓ Still open**
- **Theme generation from continuous axes.** Wetness, tectonic activity, temperature and erosion age mapped to parameter ranges by one formula, so desert or volcano are labelled regions of one space rather than hand-authored presets. The axis set and the formulas are not designed.
- **Rule-driven placement** of water and vegetation, once Biome exists.
- **Gating**, disabling a stage until its input exists.

---

## Narrative Ideas

*Early brainstorm, 2026-09-02. Storytelling as another procedural system rather than authored content.*

- **Population growth.** Place population, choose a starting development level, let it progress along the timeline.
- **Apocalyptic scenarios**: nuclear strike with configurable radius and fallout, meteor impact, climate change as slow degradation, ice age, volcanic eruption.

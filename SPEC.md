# 📐 Spec

`Last updated: 2026-10-13`

*What the system is: its architecture and the decisions that define it.*

> [!NOTE]
> This file holds what gets built and why. `ROADMAP.md` holds when. `ISSUES.md` holds what is currently broken. Outside sources are in `REFERENCES.md`.
>
> The test for where something belongs: if removing it would change **what** gets built, it is spec. If it only changes **when**, it is roadmap.

Each decision keeps what was rejected and why, since that is the part the code cannot tell you later.

---

## 🏗️ Rendering foundation

### Mesh-based Three.js, not raymarching
**✅ Decided 2026-09-02, re-confirmed 2026-10-07**

- Raymarching and SDFs were the alternative, as used in `active-geometry-project`.
- Rejected because agents, vegetation, roads and level of detail all assume real geometry to attach to, while raymarching's advantage, cheap boolean operations without rebuilding topology, is not something this project needs.
- Re-examined for the planet's detail problem and rejected again: an SDF surface has no discrete pieces to click, which breaks picking a spot to view as a chunk.

### Terrain is computed on the GPU and read back only on demand
**✅ Decided 2026-09-02**

- Noise renders into an off-screen texture that the vertex shader samples, with CPU reads only where a value is genuinely needed.
- Keeps the shader as the single source of truth, never duplicated in JavaScript to keep CPU queries in step.

### The planet is a cube sphere
**✅ Decided 2026-10-07, built 2026-10-13**

- Six flat grids pushed onto the sphere, rather than a longitude and latitude grid.
- A lat/long grid converges at two fixed points however it is divided, and stretches without limit toward the poles, so it cannot be subdivided locally and one splitting rule cannot work everywhere.
- A bigger resolution number was rejected: a sphere's triangle count is already minimal for its segment count, and resolution is spent evenly over the whole surface, so a larger number multiplies the waste rather than removing it.

---

## 🪐 Terrain model

### A patch is the unit of terrain
**✅ Decided and built 2026-10-13**

- A patch is a cube face, a rectangle on it, and a depth, with a heightmap baked for it alone.
- The planet is patches drawn curved. The land chunk is a patch drawn flat. There is no separate chunk pipeline, so "the chunk is a piece of the planet, zoomed in" holds by construction rather than by two systems being kept in step.
- *Dana's framing from the start: "divide the planet's surface into x chunks and the chunk is one of them"*

### 📚 Detail comes from descending, not from bigger textures
**✅ Decided 2026-10-13**

- Globe renderers make the whole surface out of tiles and keep each tile's heightmap small and fixed. Cesium treats a plain sphere as a special case of terrain rather than something tiles sit on top of.
- Growing one texture instead is what stalled the chunk: cost rises with the square and every sample is copied back from the GPU.
- *Sources in `REFERENCES.md`*

### Resolution and footprint are separate
**✅ Decided 2026-10-13**

- Resolution is how finely a patch's ground is measured. Depth is which ground it covers.
- A first attempt drove depth from the Resolution slider, so raising it zoomed in and flattened the terrain, because a smaller area holds less relief.
- *Dana: "res and zoom shouldnt be the same thing. i can zoom in on something and it could still be low res"*

### Picking a patch from a point on the planet
**✅ Decided and built 2026-10-13**

- Take the direction from the planet's center, find which axis dominates to get the face, divide the other two by it to get the position on that face, then walk the tree to the depth wanted.
- The documented method, and the algebraic inverse of the cube-to-sphere projection, so picking and geometry cannot disagree.
- **⚠️ Known limitation:** plain normalization makes patches near a face's center cover more ground than those at its corners, so detail is not perfectly even across a face. A distortion-correcting projection fixes it.

### Shape and elevation are separate channels
**✅ Decided and built 2026-09-24**

- Shape is the opacity and blend-mode composite, driving the 2D canvas and painting. Elevation is a purely additive per-layer sum that drives real height, ignoring both.
- Height was first built as a multiplier inside the opacity crossfade, where it turned out indistinguishable from Opacity on a single layer. That is a property of the maths, not a coding mistake: the two only ever appeared multiplied together.
- Stored as float so elevation can exceed one or go negative.
- **Accepted consequence:** a layer at zero opacity still affects elevation, which follows directly from the two being unrelated.

### Height is a percentage of its context, not absolute units
**✅ Decided and built 2026-09-24**

- The same value looked reasonable against the planet's large radius and dwarfed the chunk's much smaller footprint.
- Converting the chunk through the planet's kilometre factor was worked through and rejected: it would make the same value proportionally more dominant, not less.
- A percentage self-normalizes with no unit bookkeeping and no change to either view's own units.

---

## 🧱 Noise and layers

### Modifiers are toggles on any base generator, not separate types
**✅ Decided and built 2026-09-30**

- Ridged, Octaves, Terrace and Domain warp used to be noise-type options, each secretly hardcoded to Perlin and mutually exclusive, so a Voronoi field could not be terraced.
- Now four independent toggles composed in Gaea's fixed order onto whichever generator is selected. Parameters persist while a toggle is off, so turning one off and on does not lose tuned values.
- Ridged had no natural amount control, unlike the other three, so it gained a blend from un-ridged to fully ridged.
- Old saved layers migrate on load at the boundary, rather than through defensive checks scattered through the code.

### A hidden layer is not computed
**✅ Decided 2026-09-23**

- Filtered out before any uniform is set, so its noise is never evaluated rather than evaluated and discarded.
- Forcing opacity to zero was rejected: it conflates a separate concept with an existing control and still costs the computation.

### Up to sixteen layers, each with its own named texture uniform
**✅ Worked around 2026-09-16**

- Older GLSL forbids indexing a sampler array with a variable, so each layer gets its own named uniform selected by constant comparison.
- A texture array would retire this, which matters only if more than sixteen layers are ever wanted.

---

## 🎨 Painting

### Painting is a stroke log, not a baked image
**✅ Decided and built 2026-09-22**

- One global chronological history rather than per-layer, so undo removes the most recent stroke whatever layer it is on, matching undo everywhere else.
- Reconstruction always replays the full history from scratch rather than patching state, so loading a project and undoing share one code path.
- A log rather than a raster is what makes painting genuinely retraceable, and undo falls out of the same data almost free.

### The brush is absolute, with feather as a percentage of a fixed radius
**✅ Decided 2026-09-16, after 4 attempts**

- Tried: percentage with a growing radius, additive, subtractive in pixels, then percentage with the radius held fixed.
- The last matches Photoshop's hardness behaviour, which is what was wanted. Each of the first three only revealed its problem once tested.

---

## 🧊 Land chunk

### Blocky meshing by culled faces, computed on the CPU in a Worker
**✅ Decided and built 2026-09-23**

- Marching Cubes was assumed necessary at first, but it produces a smooth isosurface, the opposite of the blocky look wanted. The wrong tool, not a harder version of the right one.
- Meshing runs on the CPU in a Worker so the main thread stays responsive. GPU compute would mean migrating the whole app's renderer, so it is deferred until CPU measures as insufficient.

### A column, not a 3D grid
**✅ Decided and built 2026-09-23**

- With no caves, a column is always solid from the ground to some height, so one height per column is a complete representation rather than an approximation. Square rather than cubic in cost.
- This, not a slider change, is what lifted the chunk's resolution ceiling.

### Voxel is a display style, not the chunk's only renderer
**✅ Decided and built 2026-09-23**

- Blocky is a stylistic choice that could apply to any geometry, so it sits in the Display dropdown alongside Shaded and Wireframe rather than being a property of one view.
- The smooth style is extruded into a solid slab rather than left as a floating sheet, so it reads as grounded.

### The chunk shades through the planet's lighting model
**✅ Decided 2026-10-07, built 2026-10-13**

- It previously used Three.js's standard material with hand-tuned intensity multipliers to approximate the planet's hand-written shader, and at shared lighting values it blew the top surface out to flat white.
- Now a sibling shader sharing the planet's lighting, taking the normal off the mesh rather than rebuilding it from sphere position.
- Sequencing: unify first, then implement shadow mapping once for both, rather than using Three.js's automatic system for one view and nothing for the other.

---

## 🖥️ Interface

### The left panel is the pipeline
**✅ Decided and built 2026-10-07**

- General settings pinned at the top, then one row per pipeline stage. Clicking a row's label selects that stage and drives the right panel; clicking its chevron expands that row's own quick settings.
- The master-detail pattern, and the structural answer to the procedural-system feedback. See that section in `ROADMAP.md`.

### The right panel is organized by technique, not by the planet's parts
**✅ Decided 2026-09-14**

- Noise, paint, erosion and colour all operate on the same data as sequential operations rather than as independent domains, which is also how World Machine and Gaea organize themselves.
- Organizing by planet part only makes sense once a feature has genuinely independent state.

### Panel width changes only on an explicit drag
**✅ Decided 2026-09-30**

- Panels previously auto-sized to whatever was visible, so they resized whenever an accordion opened. A hardcoded width was rejected in turn.
- Ports `active-geometry-project`'s drag-handle pattern.

### ❌ No node-based UI
**✅ Decided**

- The panel structure is correct for this project. Not building a node graph like World Machine, Gaea or Substance Designer.

---

## 💾 Persistence

### Firebase, with painting saved as its stroke log
**✅ Decided and built 2026-09-22**

- Firebase Auth and Firestore rather than browser-only storage. Anonymous now, with real sign-in later by account linking.
- Planets are a subcollection per user, so several named versions can be saved and switched between.
- Auto-save stays a debounce rather than a fixed timer, since a timer either saves needlessly or loses minutes of work right before a tick.

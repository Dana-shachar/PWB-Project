# 📐 Spec

`Last updated: 2026-10-13`

*What the system is: its architecture, and the decisions that define it.*

> [!NOTE]
> This file holds **what** gets built and why. `ROADMAP.md` holds **when**. `ISSUES.md` holds what is broken. Sources are in `REFERENCES.md`.
>
> The test for what belongs here: if removing it would change *what* gets built, it is spec. If it only changes *when*, it is roadmap.

```
✅ Decided    22
❓ Open         1
```

<details>
<summary>📋 <b>Format</b></summary>

```markdown
### [id] The decision, as a statement · `status`
**Decided:** YYYY-MM-DD · **Drove:** [bug id, if a bug forced it]

- what it means
- what was rejected, and why
- *source, if it came from one*
```

IDs are assigned in date order and never reused, so `ISSUES.md` and `ROADMAP.md` can cite a decision and keep citing it. Entries are grouped by topic, newest first within each group.

</details>

---

## 🏗️ Rendering foundation

*How the project draws anything at all, and why not some other way.*

### [S01] Mesh-based Three.js, not raymarching · `decided`
**Decided:** 2026-09-02 · **Re-confirmed:** 2026-10-07

- Real geometry with GLSL shaders on it, rather than raymarched SDFs as in `active-geometry-project`.
- Rejected because agents, vegetation, roads and level of detail all assume geometry to attach to, while raymarching's advantage, cheap booleans without rebuilding topology, is not something this project needs.
- Re-examined for the planet's detail problem and rejected again: an SDF surface has no discrete pieces to click, which breaks picking a spot to view as a chunk.

### [S02] Terrain is computed on the GPU, read back only on demand · `decided`
**Decided:** 2026-09-02

- Noise renders into an off-screen texture that the vertex shader samples. CPU reads happen only where a value is genuinely needed.
- Keeps the shader as the single source of truth, never duplicated in JavaScript to keep CPU queries in step.

### [S18] The planet is a cube sphere · `decided`
**Decided:** 2026-10-07 · **Built:** 2026-10-13

- Six flat grids pushed onto the sphere, rather than a longitude and latitude grid.
- A lat/long grid converges at two fixed points however it is divided, and stretches without limit toward the poles, so it cannot be subdivided locally and one splitting rule cannot work everywhere.
- A bigger resolution number was rejected: a sphere's triangle count is already minimal for its segment count, and resolution is spent evenly over the whole surface, so a larger number multiplies the waste.

---

## 🪐 Terrain model

*What terrain is made of, and how detail is organized.*

### [S19] A patch is the unit of terrain · `decided`
**Decided and built:** 2026-10-13

- A patch is a cube face, a rectangle on it, and a depth, with a heightmap baked for it alone.
- The planet is patches drawn curved. The chunk is a patch drawn flat. There is no separate chunk pipeline, so "the chunk is a piece of the planet, zoomed in" holds by construction rather than by two systems being kept in step.
- *Dana's framing from the start: "divide the planet's surface into x chunks and the chunk is one of them"*

### [S20] 📚 Detail comes from descending, not bigger textures · `decided`
**Decided:** 2026-10-13 · **Drove:** [B28]

- Each patch's heightmap stays small and fixed. More detail means a patch covering less ground, not a larger texture.
- Globe renderers work this way. Cesium treats a plain sphere as a special case of terrain rather than something tiles sit on top of.
- Growing one texture instead is what stalled the chunk: cost rises with the square and every sample is copied back from the GPU.
- *Sources in `REFERENCES.md`*

### [S21] Resolution and footprint are separate · `decided`
**Decided:** 2026-10-13

- Resolution is how finely a patch's ground is measured. Depth is which ground it covers.
- A first attempt drove depth from the Resolution slider, so raising it zoomed in and flattened the terrain, because a smaller area holds less relief.
- *Dana: "res and zoom shouldnt be the same thing. i can zoom in on something and it could still be low res"*

### [S22] Picking a patch from a point on the planet · `decided`
**Decided and built:** 2026-10-13

- Take the direction from the planet's center, find which axis dominates to get the face, divide the other two by it to get the position on that face, then walk the tree to the depth wanted.
- The documented method, and the algebraic inverse of the cube-to-sphere projection, so picking and geometry cannot disagree.
- **⚠️ Known limitation:** plain normalization makes patches near a face's center cover more ground than those at its corners, so detail is not perfectly even across a face.

### [S14] Shape and elevation are separate channels · `decided`
**Decided and built:** 2026-09-24 · **Drove:** [B18]

- Shape is the opacity and blend-mode composite driving the 2D canvas. Elevation is a purely additive per-layer sum driving real height, ignoring both.
- Height was first built inside the opacity crossfade, where it proved indistinguishable from Opacity on a single layer. A property of the maths, not a coding mistake: the two only ever appeared multiplied together.
- Stored as float so elevation can exceed one or go negative.
- **Accepted consequence:** a layer at zero opacity still affects elevation, which follows from the two being unrelated.

### [S15] Height is a percentage of its context · `decided`
**Decided and built:** 2026-09-24

- The same value looked reasonable against the planet's large radius and dwarfed the chunk's much smaller footprint.
- Converting the chunk through the planet's kilometre factor was worked through and rejected: it would make the same value proportionally more dominant, not less.
- A percentage self-normalizes with no unit bookkeeping and no change to either view's own units.

---

## 🧱 Noise and layers

*How terrain is generated and composed.*

### [S17] Modifiers are toggles on any base generator · `decided`
**Decided and built:** 2026-09-30

- Domain warp, Octaves, Ridged and Terrace are independent toggles composed in Gaea's fixed order onto whichever generator is selected.
- Previously they were noise-type options, each secretly hardcoded to Perlin and mutually exclusive, so a Voronoi field could not be terraced.
- Parameters persist while a toggle is off, so turning one off and on does not lose tuned values. Ridged gained an amount control, since unlike the other three it had none.
- Old saved layers migrate on load at the boundary, rather than through defensive checks scattered through the code.

### [S12] A hidden layer is not computed · `decided`
**Decided:** 2026-09-23

- Filtered out before any uniform is set, so its noise is never evaluated rather than evaluated and discarded.
- Forcing opacity to zero was rejected: it conflates a separate concept with an existing control and still costs the computation.

### [S07] Sixteen layers, each with its own named texture uniform · `decided`
**Decided:** 2026-09-16

- Older GLSL forbids indexing a sampler array with a variable, so each layer gets its own named uniform selected by constant comparison.
- A texture array would retire this, which matters only if more than sixteen layers are ever wanted.

---

## 🎨 Painting

*How a person authors terrain by hand, and what that produces.*

### [S10] Painting is a stroke log, not a baked image · `decided`
**Decided and built:** 2026-09-22

- One global chronological history rather than per-layer, so undo removes the most recent stroke whatever layer it is on, matching undo everywhere else.
- Reconstruction replays the full history from scratch rather than patching state, so loading a project and undoing share one code path.
- A log rather than a raster is what makes painting retraceable, and undo falls out of the same data almost free.

### [S08] The brush is absolute, with feather as a percentage of a fixed radius · `decided`
**Decided:** 2026-09-16, after 4 attempts

- Tried: percentage with a growing radius, additive, subtractive in pixels, then percentage with the radius held fixed.
- The last matches Photoshop's hardness behaviour, which is what was wanted. Each of the first three only revealed its problem once tested.

---

## 🧊 Land chunk

*A detail view into one piece of the planet, and how it is built.*

### [S23] The chunk shades through the planet's lighting model · `decided`
**Decided:** 2026-10-07 · **Built:** 2026-10-13

- A sibling shader sharing the planet's lighting, taking the normal off the mesh rather than rebuilding it from sphere position.
- It previously used Three.js's standard material with hand-tuned intensity multipliers, which at shared lighting values blew the top surface out to flat white.
- Sequencing: unify first, then implement shadow mapping once for both, rather than Three.js's automatic system for one view and nothing for the other.

### [S11] Blocky meshing by culled faces, on the CPU in a Worker · `decided`
**Decided and built:** 2026-09-23

- Marching Cubes was assumed necessary at first, but it produces a smooth isosurface, the opposite of the blocky look wanted. The wrong tool, not a harder version of the right one.
- Meshing runs on the CPU in a Worker so the main thread stays responsive. GPU compute would mean migrating the whole app's renderer, so it is deferred until CPU measures as insufficient.

### [S16] A column, not a 3D grid · `decided`
**Decided and built:** 2026-09-23

- With no caves, a column is always solid from the ground to some height, so one height per column is a complete representation rather than an approximation. Square rather than cubic in cost.
- This, not a slider change, is what lifted the chunk's resolution ceiling.

### [S13] Voxel is a display style, not the chunk's only renderer · `decided`
**Decided and built:** 2026-09-23

- Blocky is a stylistic choice that could apply to any geometry, so it sits in the Display dropdown alongside Shaded and Wireframe.
- The smooth style is extruded into a solid slab rather than left as a floating sheet, so it reads as grounded.

---

## 🖥️ Interface

*How the controls are organized, and the reasoning behind the layout.*

### [S24] The left panel is the pipeline · `decided`
**Decided and built:** 2026-10-07

- General settings pinned at the top, then one row per pipeline stage. Clicking a row's label selects that stage and drives the right panel; clicking its chevron expands that row's own quick settings.
- The master-detail pattern, and the structural answer to the procedural-system feedback. See that section in `ROADMAP.md`.

### [S03] The right panel is organized by technique, not by the planet's parts · `decided`
**Decided:** 2026-09-14

- Noise, paint, erosion and colour all operate on the same data as sequential operations rather than as independent domains, which is also how World Machine and Gaea organize themselves.
- Organizing by planet part only makes sense once a feature has genuinely independent state.

### [S05] Panel width changes only on an explicit drag · `decided`
**Decided:** 2026-09-30 · **Drove:** [B22]

- Panels previously auto-sized to whatever was visible, so they resized whenever an accordion opened. A hardcoded width was rejected in turn.
- Ports `active-geometry-project`'s drag-handle pattern.

### [S04] ❌ No node-based UI · `decided`
**Decided:** 2026-09-14

- The panel structure is correct for this project. Not building a node graph like World Machine, Gaea or Substance Designer.

---

## 💾 Persistence

*Where a project lives between sessions.*

### [S09] Firebase, with painting saved as its stroke log · `decided`
**Decided and built:** 2026-09-22

- Firebase Auth and Firestore rather than browser-only storage. Anonymous now, with real sign-in later by account linking.
- Planets are a subcollection per user, so several named versions can be saved and switched between.
- Auto-save stays a debounce rather than a fixed timer, since a timer either saves needlessly or loses minutes of work right before a tick.

---

## ❓ Open

*Decided direction, detail not settled. Dana's to resolve.*

### [S25] Erosion: grid-based or droplet-based · `open`
**Raised:** 2026-10-13

- The September decision was droplet-based, following Sebastian Lague. Research since says grid-based, following Mei, Decaudin and Hu, because droplets need scattered writes that WebGL handles badly while grid models are designed for the GPU.
- Reverses a logged decision, so it needs sign-off before Stage 08 starts.
- *Sources in `REFERENCES.md`*

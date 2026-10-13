# 🧭 Decisions & Issues

`Last updated: 2026-10-13`

*Why the project is built the way it is, and what is currently broken.*

> [!NOTE]
> Decisions keep their reasoning, including what was rejected and why, since that is the part not recoverable from the code. Implementation detail is not repeated here. Status by stage is in `ROADMAP.md`; outside sources are in `REFERENCES.md`.

Each entry is a decision 🧭, a bug 🐛, or something open 📋, with its status and date.

---

## 🏗️ Foundation & Architecture

### 🧭 Mesh-based Three.js, not raymarching
**✅ Decided 2026-09-02**

- Raymarching and SDFs were the alternative, as used in `active-geometry-project`.
- Rejected because agents, vegetation, roads and level of detail all assume real geometry to attach to, while raymarching's advantage, cheap boolean operations without rebuilding topology, is not something this project needs.
- Revisited 2026-10-07 for the planet's detail problem and rejected again: an SDF surface has no discrete pieces to click, which breaks picking a spot to view as a chunk.

### 🧭 Heightmap as a GPU texture, read back only on demand
**✅ Decided 2026-09-02**

- Noise renders into an off-screen texture that the planet's vertex shader samples, with CPU reads only where a value is genuinely needed.
- Keeps the shader as the single source of truth, never duplicated in JavaScript to keep CPU queries in step.

### 📋 GPU compute for voxel meshing
**🔴 Open, tracked, not scheduled · 2026-09-23**

- CPU meshing has a real ceiling: worst-case triangle counts at very high resolution risk crashing the tab from raw buffer size.
- Not adopted because Three.js cannot run both renderers at once, so it would mean migrating the entire app and porting every hand-written shader to a different shading language.

### 🐛 App.tsx became a five-feature monolith
**✅ Fixed 2026-09-22**

- Lighting, planet appearance, layers, painting and persistence had all accumulated as loose state directly in `App.tsx`, each wired in as it was built.
- Split into one hook per feature, with `App.tsx` reduced to composition only.
- The standing rule came out of this: give a feature its own hook the moment it adds state, rather than accumulating and splitting later. Caught by Dana rather than done proactively.

### 📋 Design-system tokenization
**🔴 Open, not urgent · 2026-09-09**

- Colors, lighting, camera distance and similar are scattered inline with no central place to adjust them. Each is flagged `TODO(DS)` until they move into CSS custom properties and a scene-config file.

---

## 🖥️ UI & Panel Architecture

### 🧭 Right panel organized by technique, not by the planet's parts
**✅ Decided 2026-09-14**

- Noise, paint, erosion and colour all operate on the same data as sequential operations rather than as independent domains, which is also how World Machine and Gaea organize themselves.
- Organizing by planet part only makes sense once a feature has genuinely independent state, which nothing did at the time.

### 🐛 Panel width changed with content
**✅ Fixed 2026-09-30**

- Panels auto-sized to whatever was visible, so they resized whenever an accordion opened or a tab switched.
- A hardcoded width was rejected by Dana. The fix ports `active-geometry-project`'s drag-handle pattern: width changes only on an explicit drag.
- Follow-up: at narrower widths, slider and select rows overflowed rather than shrinking, because browsers give those inputs an intrinsic minimum that `flex: 1` alone cannot override.

---

## 🪐 Planet mesh and adaptive resolution

*Why the planet moved from a lat/long sphere to a cube sphere, what broke, and the fix.*

### The problem

The planet had one level of detail spread evenly over the whole globe, so zooming in could never show more than the planet already carried, and raising it meant paying that cost on the far side nobody is looking at. The goal is detail that follows the camera.

### 🧭 Quadtree patches on a cube sphere
**✅ Decided 2026-10-07**

**Rejected: a bigger resolution slider**
- A sphere's triangle count is already minimal for its segment count, so unlike the chunk's old cubic voxel grid there is no hidden waste to reclaim.
- Resolution is spent evenly over the whole surface, so a bigger number multiplies the waste rather than removing it.

**Rejected: raymarching and SDFs**
- Resolution-free, but an SDF surface has no discrete pieces to click, which breaks the planned "pick a spot to open as a chunk".

**Chosen: a cube inflated into a sphere, each face a quadtree**
- Six flat grids pushed onto the sphere. A face near the camera splits into four, repeatedly, and only the undivided ones draw.
- A lat/long grid cannot do this: its lines converge at two fixed points however it is divided, and it stretches without limit toward the poles, so one splitting rule cannot work everywhere.
- *Ulrich's chunked LOD, plus the cube-sphere variant used in production planet engines. See `REFERENCES.md`*

### 🧭 Patches are the unit of terrain
**✅ Built and tested 2026-10-13 · covers the chunk; the planet still reads the shared map**

- A patch is a cube face, a rectangle on it, and a depth, with a heightmap baked for it alone.
- The planet is patches drawn curved; the chunk is a patch drawn flat. There is no separate chunk pipeline, so "the chunk is a piece of the planet, zoomed in" holds by construction rather than by two systems being kept in step.
- *Dana's framing from the start: "divide the planet's surface into x chunks and the chunk is one of them"*

**📚 Why this and not a bigger map**
- Globe renderers make the whole surface out of tiles and get detail by descending, not by growing textures. Cesium treats a plain sphere as a special case of terrain and keeps tile heightmaps small and fixed.
- Growing one texture is what stalled the chunk: cost rises with the square and every sample is copied back from the GPU.

**Resolution and footprint are separate**
- Resolution is how finely a patch's ground is measured; depth is which ground it covers.
- A first attempt drove depth from the Resolution slider, so raising it zoomed in and flattened the terrain, because a smaller area holds less relief.
- *Dana: "res and zoom shouldnt be the same thing. i can zoom in on something and it could still be low res"*

**Picking**
- Double-clicking the planet chooses which patch the chunk shows: take the direction from the planet's center, find which axis dominates to get the face, divide the other two by it to get the position on that face.
- The documented method, and the algebraic inverse of the cube-to-sphere projection, so picking and geometry cannot disagree.

**⚠️ Known limitation**
- Plain normalization makes patches near a face's center cover more ground than those at its corners, so detail is not perfectly even across a face. A distortion-correcting projection fixes it. Recorded rather than discovered later.

### 🐛 Terrain tore into streaks at both poles
**✅ Mostly fixed 2026-10-13**

- The map wraps at longitude 180°, and that line crosses both pole faces, so triangles sitting on it read from both ends of the map at once and smeared the whole map width across themselves.
- Each pole face is now generated as two halves split along that line, so no triangle spans it. The same approach `SphereGeometry` uses at its own seam, which is why the old sphere never showed this.
- A separate symptom, a black slit, had a different cause: lighting rebuilt its surface direction from map coordinates, which jump at the wrap line. It now works from each point's 3D position.
- **Still open:** soft blur and rough ridging at both poles, which is the rectangular map's own distortion, covered by the detail ceiling below.

### ⚠️ Wrong diagnosis, and what it cost
**Reverted 2026-10-13 · kept deliberately**

- **The claim:** that reading height out of the rectangular map is lossy at the poles. It is the reverse. An equirectangular map over-samples near the poles, so there was no detail being lost.
- **What was built on it:** the layer stack split into a shared module so the planet could evaluate terrain from 3D position. That meant the vertex shader sampling sixteen paint textures, which exhausted the GPU's texture slots, so no height reached the planet and it rendered perfectly smooth. All reverted.
- **How it went unnoticed:** the texture limit was a warning in the dev server log the whole time and was not read; "the shader compiled" was treated as proof the approach worked, when the failure was at bind time; and several rounds went into reasoning about what should happen rather than looking at the rendered data. What found it was drawing the height value on screen.

### 📌 The planet's own detail is capped by the map
**⚪ Not started · raised 2026-10-13**

- The planet still displaces from one 1024x512 map, so zooming into it reveals nothing past what that holds, and the pole blur is the same cause.
- The chunk no longer has this problem. The planet gets the same treatment by rendering as patches.
- **The documented answer:** evaluate terrain from a function of 3D position rather than storing it, and render per-patch heightmaps as patches subdivide. Sources in `REFERENCES.md`.

---

## 🧱 Layer Compositing & Noise

### 🐛 A new layer visually erased painted terrain beneath it
**✅ Fixed 2026-09-22, after 2 wrong attempts**

- An empty layer's flat gray placeholder read as real opaque content at full opacity, replacing everything under it. No data was lost; purely a compositing bug.
- The fix applies the paint mask exactly once as coverage, with the composite starting at neutral gray rather than black. Starting at black had made painted black indistinguishable from nothing painted.

### 🧭 GLSL ES 1.00 forbids dynamic sampler-array indexing
**✅ Worked around 2026-09-16**

- Looping over paint textures with a variable index will not compile, so each layer gets its own named uniform selected by constant comparison.
- Still in place. A texture array would retire it, which matters only if more than sixteen layers are ever wanted.

### 🧭 Per-layer visibility hides without computing
**✅ Decided 2026-09-23**

- A hidden layer is filtered out before any uniform is set, so its noise is never evaluated rather than evaluated and discarded.
- Forcing opacity to zero was rejected: it conflates a separate concept with an existing control and still costs the computation.
- Old saved layers lack the field, so every check treats missing data as visible rather than relying on truthiness.

### 🧭 Height is a separate channel from Opacity and Blend Mode
**✅ Decided and built 2026-09-24**

- Built first as a multiplier inside the existing opacity crossfade, where it turned out indistinguishable from Opacity on a single layer. That is a property of the maths, not a coding mistake: the two only ever appeared multiplied together.
- What was actually wanted is an amplitude control, so real elevation stays stable while only the variation scales.
- **The fix:** two independent channels. Shape is the opacity and blend-mode composite driving the 2D canvas; elevation is a purely additive per-layer sum ignoring both. Stored as float so elevation can exceed one or go negative.
- **Accepted consequence:** a layer at zero opacity still affects elevation, which follows directly from the two being unrelated.

### 🧭 Modifiers are toggles on any base generator, not separate types
**✅ Decided and built 2026-09-30**

- Ridged, Octaves, Terrace and Domain warp used to be four of the noise-type options, each secretly hardcoded to Perlin and mutually exclusive, so a Voronoi field could not be terraced.
- Now four independent toggles composed in Gaea's fixed order onto whichever generator is selected. Their parameters persist while a toggle is off, so turning one off and on again does not lose tuned values.
- Ridged had no natural amount control, unlike the other three, so it gained a blend from un-ridged to fully ridged.
- Old saved layers migrate on load at the boundary, rather than through defensive checks scattered through the code.

### 🐛 Ridged noise inflated the whole planet rather than its peaks
**✅ Fixed 2026-09-24**

- `ridge(x) = 1 - abs(x)` peaks where its input is most common, so its output sat near maximum almost everywhere. Every other noise type here is symmetric around zero; Ridged alone carried a strong positive bias.
- Invisible while the old pipeline clamped everything, but once Height applied the raw value as unclamped additive elevation, the bias scaled with it.
- Fixed by re-centering `ridge` itself rather than special-casing one noise type downstream.

---

## 🎨 Paint & Brush System

### 🐛 Stroke drag hardened soft edges, then left ridged terrain
**🟡 Partly fixed, tabled · 2026-09-16 to 09-22**

- Compositing each dab over the last saturated a soft edge into a hard one within a single drag.
- A max-accumulation buffer fixed the hardening but left a crease in the falloff wherever two dabs were equidistant, invisible in flat colour but visible once it drove displacement.
- The fix computes distance to the whole stroke path at once, one smooth shape with no crease, which also removed a separate buffer and pass.
- **Still open:** terrain is still jagged and the feather still subtle, likely the sphere's mesh resolution being too coarse for a narrow painted feature. Dana's call to revisit after erosion.

### 🐛 Brush strokes cut off at the seam
**✅ Fixed 2026-09-22**

- Falloff used a plain distance in map coordinates, which does not know the left and right edges are the same place. Wrapping the horizontal component fixed it. Does not retroactively repair strokes painted before the fix.

### 🐛 Painting toward black did nothing
**✅ Fixed 2026-09-16**

- WebGL clamps shader output before blending, which silently zeroed a negative erase value, and blending into a float target needs an extension that is not reliably supported.
- Replaced GPU blending with ping-pong targets, where each stroke computes the complete new frame in the shader.

### 🧭 Brush feather is a percentage of a fixed radius
**✅ Decided 2026-09-16, after 4 attempts**

- Tried: percentage with a growing radius, additive, subtractive in pixels, then percentage with the radius held fixed.
- The last matches Photoshop's hardness behaviour, which is what was actually wanted. Each of the first three only revealed its problem once tested.

### 🧭 Painting is a stroke log, not a baked image
**✅ Decided and built 2026-09-22**

- One global chronological history rather than per-layer, so undo removes the most recent stroke whatever layer it is on, matching undo everywhere else.
- Reconstruction always replays the full history from scratch rather than patching state, so loading a project and undoing share one code path.
- A log rather than a raster is what makes painting genuinely retraceable, and undo falls out of the same data almost free.

### 🐛 Replayed strokes and undo didn't update until clicked
**✅ Fixed 2026-09-22, two different causes**

- **On reload:** a real ordering bug. React runs a child's effects before its parent's, so the views read the texture before the parent had replayed into it. Fixed by reordering so replay happens before state is set, and the earlier workaround was deleted rather than left alongside.
- **On undo:** not ordering but a missing connection. The 2D canvas only watched layers, and undo only changes history, so no ordering fix could help. A small counter threaded down as a prop is the legitimate use of a signal here.
- Worth distinguishing: fix the order when it is an ordering bug, add a signal only when there is genuinely no connection.

---

## 💡 Lighting & Normals

### 🐛 Terrain bumps didn't show in lighting
**✅ Fixed 2026-09-16**

- A screen-space-derivative normal was tried first and faceted the whole sphere, since derivatives are near-constant per triangle. Dana liked the look enough to keep it as a possible future style option.
- The fix computes the sphere's tangent basis analytically, so the normal is smooth and independent of mesh resolution, perturbed by the heightmap's gradient sampled several texels away to avoid amplifying noise.
- Two follow-ups: tangents were unit-sphere-relative while displacement was world-scaled, and `normalMatrix` is auto-set by Three.js but not auto-declared in the fragment stage.

---

## 🧊 Land Chunk & Voxel Terrain

### 🧭 Cube/culled-face meshing, computed on the CPU in a Worker
**✅ Decided and built 2026-09-23**

- Marching Cubes was assumed necessary at first, but it produces a smooth isosurface, the opposite of the blocky look wanted. The wrong tool, not a harder version of the right one.
- Meshing runs on the CPU in a Worker so the main thread stays responsive. GPU compute would mean migrating the whole app's renderer, so it is deferred until CPU measures as insufficient.
- Scoped to one chunk rather than a volumetric planet, which is not tractable at any reasonable resolution.

### 🧭 Column-based, not a 3D solid/empty grid
**✅ Decided and built 2026-09-23**

- The original density field was a full 3D grid, cubic in both memory and meshing cost, hitting a wall well before high resolution.
- With no caves, a column is always solid from the ground to some height, so one height per column is a complete representation rather than an approximation. Square rather than cubic.
- This, not a slider change, is what lifted the resolution ceiling. Surfaced when Dana pushed the slider repeatedly and then asked why it was capped at all.

### 🧭 Voxel is a display style, not the chunk's only renderer
**✅ Decided and built 2026-09-23**

- The Display dropdown gained Voxel alongside Shaded and Wireframe, since blocky is a stylistic choice that could apply to any geometry rather than a property of one view.
- The smooth style is extruded into a solid slab rather than left as a floating sheet, so it reads as grounded.
- The slab's base sits below zero. With both at zero, every flat-bottomed area put the top surface and the base at identical depth, which the GPU cannot order, and the surface speckled.

### 🐛 Smooth-mesh walls were missing on some sides
**✅ Fixed 2026-09-23**

- Four walls each had their winding derived independently, so there were four chances to get the sign wrong, and a wrong winding makes a face invisible.
- Replaced with one boundary walk using a single formula, verified once rather than four times.

### 🧭 The chunk shades through the planet's lighting model
**✅ Decided and built 2026-10-13**

- The chunk used Three.js's standard material with hand-tuned intensity multipliers to approximate the planet's hand-written shader. At shared lighting values it blew the top surface out to flat white, so no detail was readable.
- Now a sibling shader sharing the planet's lighting, taking the normal off the mesh rather than rebuilding it from sphere position. The Scene controls mean the same thing in both views and the multipliers are gone.
- Sequencing per Dana: unify first, then implement shadow mapping once for both, rather than using Three.js's automatic system for one view and nothing for the other.

### 🧭 One shared gumball driving a list of targets
**✅ Decided and built 2026-09-23**

- One instance retargeted rather than one per viewport, since two widgets waste space and neither could drive both cameras together.
- Click a pane to target it, shift-click to add the other, matching multi-select convention.
- Each target carries its own reference distance, since one global distance calibrated for the planet left the much smaller chunk unable to zoom in at all.

### 🧭 Height as a percentage of its context, not absolute units
**✅ Decided and built 2026-09-24**

- The same Height value looked reasonable against the planet's large radius and dwarfed the chunk's much smaller footprint.
- Applying the planet's kilometre conversion to the chunk was worked through and rejected: it would make the same value proportionally more dominant, not less.
- Dana's suggestion, adopted: a percentage of whichever context it applies to. It self-normalizes with no unit bookkeeping and no change to either view's own units.

---

## Early notes, 2026-09-02

- **The grid** started as Three.js's built-in helper, since `active-geometry-project`'s procedural grid depends on its raymarching pipeline and was not portable. Replaced 2026-09-14 by a shader plane, because the helper read as a bounded CAD floor rather than open space.
- **An Entity/World OOP layer** was tried and removed, in favour of the conventions the rest of the project follows.

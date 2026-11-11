# 📐 Spec

`Last updated: 2026-11-11`

*What the system is: its architecture, and the decisions that define it.*

> [!NOTE]
> This file holds **what** gets built and why. `ROADMAP.md` holds **when**. `ISSUES.md` holds what is broken. Sources are in `REFERENCES.md`.
>
> The test for what belongs here: if removing it would change *what* gets built, it is spec. If it only changes *when*, it is roadmap.

```
✅ Decided    25
❓ Open         0
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

### [S34] A patch's lifetime follows need, not visibility · `decided`
**Decided and built:** 2026-10-21 · untested on screen

- A patch that only turns out of view is hidden and cached, not destroyed, so rotating does not rebuild the planet.
- A replaced patch stays drawn until its replacements are built, so a split or merge leaves no holes.
- Merging back happens farther out than splitting, so a camera near a boundary does not flip patches.
- *Dana, 2026-10-21: detail should be added only where needed, not erased and rebuilt.* 📚 The conventions are two thresholds per switch and refinement that replaces a tile only when needed. Keeping a parent until its children are ready, and the cache eviction rule, are common practice but unverified. Sources in `REFERENCES.md`.

### [S32] 📚 Planet detail follows screen-space error, and Resolution is a pixel threshold · `decided`
**Decided:** 2026-10-21 · **Built:** 2026-10-21, untested on screen · **Drove:** [B38], [B45], [B47] · **Replaces:** the earlier uniform minimum floor

- *A patch splits when its error, measured in pixels on screen, passes a threshold.* This is how Cesium drives detail (a tile's geometric error in meters becomes a screen-space error in pixels, compared with a maximum). 📚 The formula used (error times screen height over distance times twice the tangent of half the field of view) is the widely used form, medium trust, not confirmed from an official page. The CDLOD paper is unread.
- The Resolution slider is that threshold, stored in pixels (Cesium's `maximumScreenSpaceError` convention, 0.5 to 32 px) but shown as Resolution 128 to 8192, higher is sharper (2026-10-26, `[B50]`). It is a display setting, so it lives in the Scene panel behind an **Auto detail** toggle that is on by default and uses 8 px; turning Auto off reveals the slider (Unity's terrain Pixel Error, games' Auto quality). Zooming in sharpens on its own either way. Saves migrate from the earlier multiplier and per-face values.
- Zoomed out, nothing exceeds the threshold, so raising the slider builds nothing extra and costs nothing.
- The triangle budget and the depth cap stay as safeguards. Over budget, the pixel threshold rises by one step instead of lowering depth.
- A bias change only adds or merges patches through the lifecycle in `[S34]`, so the planet is never rebuilt from scratch. A radius change still flushes everything.
- **Why it replaced the floor:** forcing one minimum depth everywhere meant up to 384 patches at startup, made zoom stop sharpening (the floor already matched what zoom reached), and made every slider change look like a rebuild.
- **Close-up budget (Dana, 2026-10-21: "the more I zoom the more you could allow res to go way up, you're only loading this specific patch"):** the total work is shared across visible patches. With few patches in view, each may bake up to 1025 samples (built small first, upgraded one per frame). Every patch mesh is a fixed 64 cells (`PATCH_GRID`, like Cesium's 65-sample tiles): the earlier 128 and 256 cell tiers made close-up patches 16 times as costly, so the triangle budget stopped them splitting (`[B50]`, measured 2026-10-26). The texel budget is `PATCH_BAKE_TEXEL_BUDGET` (8M, about 128 MB).
- **Depth cap 11,** set by float precision, not by an arbitrary count: past it a float step becomes a visible part of a sample. Going deeper needs per-tile local origins (AGI, "Precisions, Precisions"; CESIUM_RTC), which means changing the bake shader.
- ⚠️ The threshold of 8 pixels, the bake size rule, the texel budget, the grid tiers and the 1.25 step are tunable guesses.

### [S14] Shape and elevation are separate channels · `decided`
**Decided and built:** 2026-09-24 · **Drove:** [B18]

- Shape is the opacity and blend-mode composite driving the 2D canvas. Elevation is a purely additive per-layer sum driving real height, ignoring both.
- Height was first built inside the opacity crossfade, where it proved indistinguishable from Opacity on a single layer. A property of the maths, not a coding mistake: the two only ever appeared multiplied together.
- Stored as float so elevation can exceed one or go negative.
- **Accepted consequence:** a layer at zero opacity still affects elevation, which follows from the two being unrelated.

### [S15] Height is a percentage of its context · `decided`
**Decided and built:** 2026-09-24 · **To be superseded:** by `[S33]`, not yet changed in code

- The same value looked reasonable against the planet's large radius and dwarfed the chunk's much smaller footprint.
- Converting the chunk through the planet's kilometre factor was worked through and rejected: it would make the same value proportionally more dominant, not less.
- A percentage self-normalizes with no unit bookkeeping and no change to either view's own units.

### [S33] 📚 Height is a max elevation in meters, with a display-only Exaggeration · `decided`
**Decided:** 2026-10-21 · **Built:** not yet

- Dana's call: the Height setting becomes a max elevation in meters, and Exaggeration is a separate multiplier that only stretches the drawing. It replaces `[S15]` when the height scale step is built.
- Reason: meters are physically consistent between the planet and the chunk, since a chunk is a slice of the same planet, and they match the meters on the color ramp.
- At planet scale a real mountain is a tiny share of the radius, so the planet view needs Exaggeration to stay readable. The ramp's meters use the true height, not the exaggerated one.
- Sources in `REFERENCES.md`.

---

## 🧱 Noise and layers

*How terrain is generated and composed.*

### [S31] 📚 A layer owns its own mask pattern · `decided`
**Decided:** 2026-10-21 · **Built:** 2026-10-21, untested on screen · **Drove:** [B48]

- Each layer can carry a mask: a pattern of its own (noise type, seed, frequency) where bright means fully affected and dark means untouched, the convention in Gaea. The layer's strength is multiplied by the mask at each point.
- Controls: Coverage, Softness, Invert, and a Shuffle that rerolls the mask's own seed. A wider Softness is a gentler edge. Invert is a convenience that is not in Gaea's docs. Defaults are ours, since Gaea documents none.
- Coverage is the share of the planet the mask lets through. It is measured as a percentile of the pattern's real values on a 64 by 64 grid per cube face, cached by pattern (32 entries).
- 🧭 **Why a layer owns its pattern, decided by Dana 2026-10-21:** a mask that pointed at another layer left an empty source list, a mixed-up layer and a guard to maintain. A mask on one layer and the same mask on every layer differ only in how many layers are selected, so the noise-menu Mask section was dropped.
- It is edited from a mask icon beside the eye on each layer row, which opens a popup. Opening it with several layers selected edits all of them with the same values, so the masks line up.
- One mechanism covers calm swathes (a slow pattern on the detail layers) and merged terrain types (one terrain uses a mask, another its inverse).
- Old masks migrate: a mask that pointed at a layer takes that layer's noise type, seed and frequency as its own. Its modifiers are not copied, so the look can shift.
- ⚠️ The mask pattern has no octave fade, so a high mask frequency may shimmer at a distance.
- 📚 Photoshop, Procreate and Substance Painter attach a mask to the layer with a thumbnail on its row. A group mask reaches every layer inside the group, but a mask on the top layer alone does not reach the layers below it. A group mask is a possible later addition.
- Sources in `REFERENCES.md`.

### [S35] Noise control ranges live in one table; Randomize builds the stack by role · `decided`
**Decided:** 2026-10-21 · **Built:** 2026-10-21 · **Changed:** 2026-10-30 (`[B77]`)

- **Randomize (2026-10-30), what replaced the full-range rolls below:**
  - Layers get roles, after Sebastian Lague's procedural planets: broad continents at the bottom (unmasked, Normal), masked ridged mountains, fine detail, and sometimes a stepped feature layer (each above the base set to Add). One to four roles per press; existing layers take them bottom up and keep their paint, missing ones are added, extra ones become detail, none are deleted.
  - Each control has a narrower Randomize range beside its slider range (the slider stays wide for working by hand). Height shrinks as Frequency grows, so fine noise never gets tall (the "bounded heights" rule of 2026-10-21).
  - Two hidden drivers, ruggedness and relief, set related controls together, mild by default, sometimes one extreme: the same method as the atmosphere (`[S45]`).
  - The white-noise type and random blend modes are never picked. Ranges are inferred, tunable.
- Earlier rule, kept for the sliders:
- Every noise control's minimum, maximum, step and scale lives in one shared table. The sliders and Randomize both read it, so a range is changed in one place.
- Randomize reads the same table (its own narrower range per control), on the control's own scale, so a log slider such as Frequency is sampled logarithmically.
- Why: the sliders were too tight to show what the shader can resolve (Frequency stopped at 20), and Randomize had copied those limits.
- Ranges set 2026-10-21: Frequency 0.1 to 500 (log), Octaves 1 to 12, Persistence 0 to 1.5, Lacunarity 1 to 6, Warp 0 to 10, Terrace 2 to 64, layer Height -10 to 10. The seed range stays 0 to 1000 even with the new hash.
- The table gained seven keys for the new per-layer controls (see `[S36]`). The Slider gained a log scale option.
- Layer Height -10 to 10 is our own audit recommendation, not a sourced range; negative values carve. Revisit it when the bounded-heights step normalizes the total.

### [S36] The noise engine fades detail by sample spacing, with a better hash · `decided`
**Decided:** 2026-10-21 · **Built:** 2026-10-21, untested on screen

- *The rule for how a deeper patch shows finer detail without the terrain's large shape changing.*
- The noise stays a pure function of world position, so every patch and depth agrees on the coarse shape. Deeper patches only add octaves. The sum is divided by the full series' amplitude, not by the octaves used, so the coarse octaves stay identical at every depth.
- Each octave fades out as its wavelength approaches the patch's sample spacing, using a smooth weight against the Nyquist limit (half the sample rate). The starting constants, `NYQUIST_FADE_MIN` 0.25 and `NYQUIST_FADE_MAX` 0.95, come from a paper tuned for pixel shading, so they are tunable here, not proven for vertex grids.
- A new `uSampleSpacing` uniform carries the spacing. Zero means no fade, so the 2D noise canvas is unchanged. Every planet patch bake already sets it for its own depth.
- The octave is faded before the Ridged fold. That placement is an unsourced forum hint, not a documented recipe.
- 📚 The bake grid stays a fixed size per patch, and detail comes from depth, as in CDLOD and Cesium.
- 💡 A patch bakes more samples when it shows more octaves: 65 until depth 5, then 129, then 257, capped by a texel budget (`PATCH_BAKE_SAMPLES_MIN`, `PATCH_BAKE_SAMPLES_MAX`, `PATCH_BAKE_GROW_FROM_DEPTH`). This is Dana's inference, not sourced, and the values are tunable.
- The sin-based hash is replaced by Hoskins' "hash without sine", which uses floats only and is safe in this app's shader language (GLSL ES 1.00 has no integers). ⚠️ Its constants were typed from memory because the source page was unreachable, so they need checking. Saved planets look different, which Dana accepted.
- Float precision: the loss came from the seed shifting the coordinates by up to about 60,000, which left a resolution coarser than a deep patch's spacing. The seed is now a whole-cell shift on the lattice index. That may have been part of the stair-stepping Dana saw. A local origin per patch is not needed at depth 8, where the spacing is about 1000 times the float step.
- New per-layer controls built: noise Offset, Stretch X, Y and Z, Voronoi Jitter and Distance, warp scale, warp octaves, and ridged Offset and Gain.
- Left out: rotation (not needed) and a clamp on a layer's output, which belongs to the bounded-heights step.
- ❓ Fractal type selector: Blender's Multifractal, Hybrid, Hetero terrain and Ridged multifractal recurrences are documented, and Hybrid and Hetero give smooth valleys and rough peaks. Planned after the builds settle, awaiting Dana's go.
- Second pass, approved by Dana: fade Ridged, Terrace, domain warp and Voronoi. Amplitude fade alone is not enough after a nonlinear step, because a crease or a hard edge carries energy at every higher frequency. The plan is to fade the octave before the nonlinearity and to soften step edges only as wide as the sample spacing, so they sharpen as the grid gets finer. Terrace is the best supported. Warp and Voronoi are inferred. All of it is tunable.
- Sources in `REFERENCES.md`.

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
- The last matches Photoshop's hardness behavior, which is what was wanted. Each of the first three only revealed its problem once tested.

---

## 🧊 Land chunk

*A detail view into one piece of the planet, and how it is built.*

### [S23] The chunk shades through the planet's lighting model · `decided`
**Decided:** 2026-10-07 · **Built:** 2026-10-13

- A sibling shader sharing the planet's lighting, taking the normal off the mesh rather than rebuilding it from sphere position.
- It previously used Three.js's standard material with hand-tuned intensity multipliers, which at shared lighting values blew the top surface out to flat white.
- Sequencing: unify first, then implement shadow mapping once for both, rather than Three.js's automatic system for one view and nothing for the other.

### [S28] 📚 One renderer for the planet and the chunk · `decided`
**Decided and built:** 2026-10-17 · **Drove:** [B32]

- A `WebGLRenderTarget`'s texture belongs to whichever renderer/context created it and cannot be bound in a different one. The planet and the land chunk each owning a separate renderer, on a separate canvas, is what made handing a patch's baked texture across read as a flat, black, undisplaced chunk.
- One shared renderer on one shared canvas instead, each pane drawn into its own rectangle every frame (`setViewport`/`setScissor`), the documented technique for multiple simultaneous views. Each pane's own layout box is now also its viewport rect and its camera controls' DOM target, neither owns a `<canvas>` of its own anymore.
- This is also the real fix for the chunk's own resolution ceiling ([S20]'s same reasoning, one level up): with one shared context, a patch's GPU texture can be handed to the chunk directly again, no CPU readback, no cap tied to readback cost.
- *Sources in `REFERENCES.md`*

### [S29] 📚 One shared elevation range, not one per patch · `decided`
**Decided and built:** 2026-10-18 · **Drove:** [B32]

- The land chunk's color ramp used to compute its own low/high fresh from each patch (first the literal min/max, then a percent-clipped version of it), which means the same real elevation could read as a different color depending on which patch is on screen, and recomputes something the planet already has.
- The planet already computes its own global elevation range once whenever its heightmap changes, and already keeps it live for every planet patch. The chunk now reads that same value instead of computing a local one, voxel mode's own CPU elevation data stays needed for its mesh, just not for the ramp anymore.
- Matches the GIS convention of a stretch computed once per dataset and applied everywhere (QGIS's `WholeRaster` option), not recomputed per tile (`CurrentCanvas`), and restores this project's own earlier decision that the ramp "should encompass all terrain levels that exist in the planet," which the chunk's own per-patch work had drifted away from.
- Expected consequence, not a bug: a small, flat-looking close-up patch may show mostly one color if the planet's full range is much wider than what's visible in that one patch.
- *Sources in `REFERENCES.md`*

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

### [S47] Panels: one hierarchy everywhere · `decided`
**Decided:** 2026-10-30

- Every section is an accordion, closed by default; parts inside it are a divider and a small title, colors last in a "Color" part. Nested sections use horizontal dividers only.
- A section that can be turned off carries its switch in its header (or its title line), never a separate on/off row. The noise modifiers are nested sections, not tabs.
- Color swatches line up at the right edge of their rows, with a lock (when there is one) on the edge side. A color bar (ramp, hue slider) always gets its own row: title and swatches above, the bar full width below.
- Clouds and Moons each have a header switch; off hides them and keeps their settings.
- The full rules live in the `ui-design` skill.

### [S24] The left panel is the pipeline · `decided`
**Decided and built:** 2026-10-07

- General settings pinned at the top, then one row per pipeline stage. Clicking a row's label selects that stage and drives the right panel; clicking its chevron expands that row's own quick settings.
- The master-detail pattern, and the structural answer to the procedural-system feedback. See that section in `ROADMAP.md`.

### [S03] The right panel is organized by technique, not by the planet's parts · `decided`
**Decided:** 2026-09-14

- Noise, paint, erosion and color all operate on the same data as sequential operations rather than as independent domains, which is also how World Machine and Gaea organize themselves.
- Organizing by planet part only makes sense once a feature has genuinely independent state.

### [S30] 📚 One shared undo history over the project's settings · `decided`
**Decided:** 2026-10-21 · **Built:** not yet

- Cmd+Z and Cmd+Shift+Z move through one snapshot history, not a separate stack per feature, so the order of actions is a single timeline. It covers layers, planet settings (including ramp stops), lighting and erosion parameters, with paint strokes folded in.
- A drag is one step, an instant action (delete, toggle) is one step at once, and a typed value is one step on Enter or blur.
- Not undoable: camera, view mode, panel widths, selection, accordion state, switching projects, and saving.
- Undoing an erosion setting restores its saved parameter data, never the simulation result, which is recomputed.
- Randomize (terrain and colors) and a layer's mask Shuffle are each one undo step, so Cmd+Z returns to randomized settings Dana liked.
- Priority goes to actions that change the planet's look. Snapshots suit this because every setting is already plain data, the same data a project saves.
- Sources in `REFERENCES.md`.

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

## 🌊 Erosion and time

*Decided ahead of Stage 08, since each shapes that stage's scope from the start.*

### [S25] Erosion is grid-based, not droplet-based · `decided`
**Decided:** 2026-10-13 · **Supersedes** the September droplet decision

- Water and sediment live per cell on a grid and move between neighbors, following Mei, Decaudin and Hu, rather than particles running downhill.
- Droplets need scattered writes that WebGL handles badly, so they would have to run on the CPU with the heightmap copied back every step. Grid models are designed for the GPU, which is where the rest of this project already runs.
- *Dana, 2026-10-13: "obvs adjust to fit the current stack." Sources in `REFERENCES.md`*

### [S26] The timeline's unit follows its zoom · `decided`
**Decided:** 2026-10-13

- Zooming the timeline changes the unit automatically, from days through to millions of years, with a manual override.
- At coarser units the time resolution drops accordingly, so a million-year view does not need to resolve days.
- *Dana, 2026-10-13: "depends on the zoom level in the time line. or what the user sets up."*

### [S27] Scrubbing plays back recorded frames · `decided`
**Decided:** 2026-10-13

- Nothing runs in reverse. Frames are recorded as the simulation runs and played back, so scrubbing backwards is replay rather than inverse simulation.
- Not every frame: one heightmap is around 2MB, so recording is periodic with a rolling window, re-running the few steps between to land exactly.
- *Dana's framing, drawing on how After Effects loads video in chunks rather than all at once.*

---

## 🌊 Water

*Decided 2026-10-26, when the project's direction moved toward story and the water came first.*

### [S37] Sea level is one raw height shared by both views · `decided`
**Decided and built:** 2026-10-26

- Sea level is stored as a raw height, the value both views read from the height texture, so the planet and the chunk draw the same coastline. The slider shows it in planet meters with a live "% land" readout, area-weighted on the GPU.
- With water on, Roughness is kept out of the water and fades in over the coast, so the coastline never moves with zoom and the readout is exact.
- *Dana: coastlines "need to match". The meters still differ between views (`[B59]`).*

### [S38] Land and water get separate color ramps, split at sea level · `decided`
**Decided and built:** 2026-10-26

- Hypsometric tints above sea level, bathymetric below, the cartographic convention: with water on, the land ramp starts at sea level and the water ramp colors everything below, spaced by light remaining rather than meters.
- Randomize colors rolls both, the water in hues the land left unused.
- *Sources in `REFERENCES.md`.*

### [S39] The water copies a tested shader, then extends it · `decided`
**Decided:** 2026-10-26

- Both views use a port of TDM's Seascape, recolored by the water ramp, with documented extensions (band-limiting, halftone foam, currents, shore bands), each sourced.
- Hand-built water was tried first and replaced: a tested shader is the starting point, custom code only fills its gaps.
- ⚠️ Seascape is CC BY-NC-SA 3.0: its port (`oceanWaves.glsl`) keeps that license; a commercial use needs the author's permission or a replacement.
- *Dana: "there must be water shader in good enough quality you can look up and copy from."* Extensions are layered onto Seascape, never a replacement (a hand-written Gerstner replacement failed and was reverted, 2026-10-27).

### [S40] The atmosphere is a stage, minimal and built from existing assets · `decided`
**Decided:** 2026-10-27

- Atmosphere replaces the Climate stage: a sky dome on the chunk, haze, a rim glow and surface haze on the planet, clouds, wind and an optional moon. General controls on the left, detail controls on the right panel.
- One wind drives both the clouds and the water's waves.
- Each piece starts from a tested source (three.js's sky dome, Stemkoski's glow, Horizon Zero Dawn's cloud lighting).

### [S41] One light, in world space, optionally following the camera · `decided`
**Decided:** 2026-10-27

- Every surface (land, water, clouds, haze, sky) is lit from the same direction, in world space, with normals that face outward.
- "Light follows camera" (on by default) turns that direction with the camera, as modeling tools do; off gives a fixed sun with a day and night side.

### [S42] Art direction: 2.5D · `decided`
**Decided:** 2026-10-27

- Real 3D, slightly flat: soft wrapped light, little shine, depth from haze layers, limited palettes. Between No Man's Sky (palettes, hazy light) and Sable (soft gradients, simple shapes), not toon. References in `REFERENCES.md`.

### [S43] The land chunk bakes its own height map · `decided`
**Decided:** 2026-10-28

- The chunk's terrain is baked once from the planet's noise into its own 4096 by 4096 height map, and every close-up patch resamples it smoothly (cubic B-spline). Finer detail comes from Roughness, computed in the chunk's own local numbers.
- Why: a 32-bit float can't place points on a 6000 km planet closer than about 0.5 m, so computing the noise per patch up close made a regular staircase (`[B66]`). The established approach (geometry clipmaps, Proland) upsamples a coarser level and adds detail.
- Tradeoff: the noise layers' shapes are only as fine as the map (about 4 m on a 16 km chunk).

### [S44] Moons are randomized landscape elements, baked by the noise engine · `decided`
**Decided:** 2026-10-28

- One to five moons in the chunk's sky, each with its own size, place, two colors, crescent, crescent angle, texture, halo, inner glow and simple noise layers baked by the engine. Randomize is the main control; per-moon controls are there only for adjusting (Dana: not a burden on the user).
- Moons are added and removed like layers (2026-10-30): all five are stored, so removing one keeps its settings out of view. One moon shows its controls directly; two or more get a section each.
- The look (Dana's references, No Man's Sky and moon photos): screened over the sky so the shadow dissolves into it, split-toned in two tones set by the sky (`[S48]`), a crescent turned from the sun's side, and one soft glow across the edge on the lit side.
- Their sizes set the chunk's tides (`[S76]`).
- They set behind the sea and fade into the air toward the horizon, by the air they're seen through (2026-10-30, three.js `Sky.js`: Kasten-Young airmass, Beer-Lambert). Each moon's Blend fades it into the sky at any height.

### [S45] Randomize changes everything; locked colors stay and anchor the palette · `decided`
**Decided:** 2026-10-30

- The Atmosphere's Randomize changes every atmosphere setting on both panels. A lock icon before a color keeps it, and the unlocked colors are hue turns from a locked one (Sky first), using the moons' color rules.
- Every lock in the app is this icon, never a "Lock ..." toggle.
- **Hidden drivers (2026-10-30).** The sliders aren't rolled one by one. Randomize rolls three hidden values from 0 to 1, and each slider follows one of them along its own range, plus a small wobble so no two worlds match:
  - **Storminess:** Wind, cloud Coverage, Feather, Banding and Detail rise together, and Softness falls.
  - **Air thickness:** Haze and Glow rise, the sky's colors wash out, and the moons blur into glow (less Texture, more Halo and Inner glow).
  - **Cloud climate:** how large the cloud systems are, and how strongly latitude places them.
- Each driver is usually mild; half the time one of them goes extreme. So a world can be a storm planet or a fog planet, with the rest staying calm, and the extremes never stack.
- Why: rolling every slider independently gave incoherent mixes (calm wind under ragged storm clouds). Letting a few high-level controls drive many parameters is the documented way to keep a generator's output coherent (a dimensionality-reduction patent, US 10552730; Kate Compton, "So you want to build a generator", on constraints and dealbreakers). Only summaries were read; the couplings and ranges are our own, tunable.

### [S46] The haze is air from the visible ground up, deep on purpose · `decided`
**Decided:** 2026-10-30

- Haze is the air's density at the ground, in the Horizon color; the air thins with height (O'Neil, GPU Gems 2), measured from the air's ground (`[S49]`).
- Each surface pixel hazes only the air between the eye and itself, so peaks get the air in front of them and no line forms around them; the shell covers only the sky around the planet (2026-10-31). The rule is Lague's ray length, `min(sceneDepth, dstToOcean)`, done inside each surface's shader as iTwin.js does, which needs no depth texture or extra pass.
- The air is about 4 times deeper than Earth's in proportion (0.03 of the radius), so its rim reads as a soft glow rather than a stripe: these are alien worlds, not realistic ones (Dana). The separate Glow stays, in the Sky color.
- The camera's far limit always contains the atmosphere (`[B75]`).

### [S48] A moon's colors come from the sky and a harmony rule · `decided`
**Decided:** 2026-10-30

- Each moon has one hue, a turn from the sky's hue, so changing the sky carries the moons with it and no color can clash. Its shadow tone sits at a set distance from it, picked from a color-harmony rule (complementary, split complementary, triadic, analogous, monochrome) or dragged freely, and drawn a little darker.
- Saturation is the moon's own (0 to 1), and Randomize sets it from the sky. Lightness comes from the sky's stronger color, kept between 0.25 and 0.9 so a moon never turns black or white.
- Why: two free color pickers allowed clashing colors, and averaging the sky's two colors washed every moon out (Dana: keep it simple, but keep the two tones).

### [S49] The atmosphere follows the planet's broad shape · `decided`
**Decided:** 2026-10-30

- The haze, glow and clouds stand on the air's ground: the visible surface (the sea over water) averaged over about 17° around each direction, kept as a small cube map and re-baked only when the terrain or sea level changes.
- Broad shapes (continents, plateaus, wide ranges) lift the air; a lone jagged peak barely moves the average, so it rises through the haze and past the glow. This replaces sizing the air to the tallest peak, which left a wide empty ring on jagged planets (`[B80]`).
- The glow starts a fixed 1.8% of the radius above the air's ground, plus more on a jagged planet (how far its surface typically rises above the average), so the gap reads the same on every planet. The clouds move out by the same jagged extra.
- Clouds are three stacked shells, each higher one more see-through and showing only the denser cores (Lohmüller's stacked-plane clouds, POV-Ray). More shells would cost a full cloud pass each.
- Why: Dana, "the atmosphere is a derivative of the planet's shape". Height fog over a non-flat ground is the sourced part (Quilez); the averaging width and the gaps are inferred, tunable.

### [S50] The chunk's water is a block, not a sheet · `decided`
**Decided:** 2026-10-30

- See-through side walls run from the chunk's base up to the water surface, colored by the water ramp by depth and clearer near the top, so the water reads as a block with the land's cut visible through it.

### [S51] The planet itself spins, at any tilt · `decided`
**Decided:** 2026-11-01

- Left alone, the planet turns about an axis at any tilt (0 to 180°: upright, Earth-like, Uranus on its side, Venus upside down) and any direction; Randomize rolls all three. A press on the planet pauses it, and it eases back in over a second on release; scrolling and zooming don't pause it.
- The planet is one group (surface, clouds, air), leaned onto the axis and turned about it: the standard object rotation. Camera, grid, sun and controls don't move, and whatever measures in world space turns into the planet's frame first (patch detail, clicking, the air's ground, the ocean's local frame).
- Why: moving the camera instead looked cheaper but kept breaking things (the grid moved, dragging mirrored, the view swung over the poles, clouds didn't match the spin), all from one root cause. Dana: a holistic fix, not one patch at a time.
- Clouds ride on the planet, so their bands run parallel to its equator as real ones do, and they drift against the spin at the equator (the trade winds' direction), so wind and spin read as different motions.

### [S52] Terrain Randomize picks a world type first · `decided`
**Decided:** 2026-11-01

- Randomize first picks one of nine types, then rolls within it: ranges, archipelago, supercontinent, highlands, rolling, cellular, shattered, rifted and wild. Each uses a different part of the noise engine, so worlds differ in kind, not only in numbers; wild is the free mix.
- Continents are the broadest layer; mountains, plateaus and detail are masked by the continents' own noise, so they stay on land (after Lague, who masks mountains by the first layer). Low ground stays smooth through Musgrave's hetero terrain.
- Terraces are rare and small: highlands or a fifth of wild worlds, 8 to 15% of the surface, 3 to 6 steps. Dana: they look uniform, so only in specific areas.
- Planets stay round: the shown layers' Heights together are capped at 1.5, and a layer carves by a negative Height, since elevation is their sum with no blend mode. Blend modes shape only the 2D map.
- ❓ Open: canyons (no documented recipe found; Gaea's is "drainage based"). Rivers now erode the land by `[S55]`.

---

## 🏞️ Rivers and climate

*Decided 2026-11-01. The drainage tree (`[S53]`, `[S55]`, `[S60]` to `[S64]`) was replaced on 2026-11-03 by water from erosion (`[S65]` to `[S70]`); those decisions are kept for their reasons, which the river research reuses.*

### [S53] Rivers are a tree grown from the coast · `deferred`
**Superseded:** 2026-11-03 by `[S65]`
**Decided:** 2026-11-01

- A tree of jittered nodes grows inland on a 4096 by 2048 map (about 9 km a cell), lower ground first, so every land node reaches the sea and flow is summed from the springs (Frampton's Sapiens).
- Pits are filled first (Priority-Flood, as Peytavie et al. do), and growth only steps onto equal or higher fill levels, so rivers cross a ridge only at its lowest pass and each lake has one outlet.
- The tree lives in a worker, and river data never passes through React props, since its dev timing copies them and ran out of memory.
- A control updates only what it affects: terrain or sea level regrow the tree, climate reruns only the balance, and Erosion only re-bakes.

### [S54] Lakes come from a water budget, not from filling every pit · `decided`
**Built:** 2026-11-03 as `[S67]`
**Decided:** 2026-11-01 · **Reopened:** 2026-11-02, every pit is filled for now (`[S64]`)

- A lake grows until evaporation from its surface meets what flows in, computed directly, with no time stepping. Short of its rim it stays closed; at the rim it spills the rest downstream (Braun and Willett's sill).
- Runoff uses Budyko's framework in Fu's form. The closed-lake balance is from search summaries, not a paper read in full.
- A catchment under `RIVER_MIN_LAKE_CATCHMENT` gets no lake: its water sinks into the ground.
- Water at every point has its own height (Derzapf 2011, section 3.3), stored per texel, and shows where it stands above the ground. Lakes draw their shores from the terrain.

### [S55] Stream power shapes the land · `deferred`
**Superseded:** 2026-11-03 by `[S65]`
**Decided:** 2026-11-01

- Noise is the input, not the final terrain: it sets how fast each place rises, and rivers cut it down with the stream power law, `n = 1`, `m = 0.5` (Braun and Willett 2013, Cordonnier et al. 2016).
- Those papers step through time and let rivers move, 100 to 300 steps. With a fixed tree the same equation settles directly, so one pass from the sea up is enough. That direct form is inferred, and the cost is that routes stay as the noise set them.
- Slopes are capped, as Cordonnier caps them at 30 degrees, so low-drainage peaks don't spike.
- The Erosion slider blends noise and eroded land; 0 is the plain noise. Whole-globe bakes stay uneroded, so rivers never read their own result and readouts stay exact.
- With Water or Atmosphere off, nothing erodes, so the terrain is the plain noise.

### [S56] Climate is one set of values for the whole planet · `decided`
**Changed:** 2026-11-08: Climate is its own section, placed by `[S81]`. 2026-11-03: turning Atmosphere off no longer removes water (`[S69]`).
**Decided:** 2026-11-01

- Climate holds Liquid, Rainfall and Temperature, one value per planet until Stage 09 gives each place its own.
- Both Randomize buttons roll the climate, mostly water worlds.

### [S57] Worlds can run on other liquids · `decided`
**Decided:** 2026-11-01

- Water, Nitrogen, Methane, Ethane, Ammonia, Sulfuric acid, Sulfur, Lava and Iron, or Dry. Ice is cold Water, not its own material.
- The liquid sets the Temperature and Rainfall ranges. Each differs in evaporation, viscosity (speed falls with it, Jeffreys), cooling, channel width and branching. Sulfur's viscosity peaks near 187 C, as real sulfur's does.
- The worlds don't need to be scientific: bizarre results are welcome, as long as they don't read as bugs. Numbers are chosen for the look.

### [S58] Shaders compile with a real compiler before every reload · `decided`
**Decided:** 2026-11-01

- A passing type check can't see inside shader text, so `app/scripts/checkShaders.mjs` compiles every material with Khronos's glslangValidator, using three.js's own header.
- It runs after any shader edit, and new shader pieces join its list.

### [S59] At most 15 noise layers · `decided`
**Decided:** 2026-11-01

- A fragment shader commonly gets 16 texture slots, counted by what's declared, not by what's in use. Paint took all 16, so the river map takes the last one.
- Layers past 15 are ignored, so the bake can't crash.

### [S60] River nodes neighbor by triangulation · `deferred`
**Superseded:** 2026-11-03 by `[S65]`
**Decided:** 2026-11-02

- Each node's neighbors come from a Delaunay triangulation of the nodes, not the grid's row pattern, so water can flow in any direction (Cordonnier et al. 2016, section 4.1; Derzapf et al. 2011 on grids giving parallel rivers).
- The nodes stay on the map's rows, so the valley map still finds a pixel's node by its row. The triangulation depends only on the grid and seed, so it's built once when the worker starts.

### [S61] River levels come from the shown terrain · `deferred`
**Superseded:** 2026-11-03 by `[S65]`
**Decided:** 2026-11-02

- A river's level is the shown coarse height, noise mixed with eroded land by Erosion, lowered wherever it would climb, so rivers only run downhill (Peytavie et al. 2019, 5.1; Plate-Local River Generation). A lake lies at its outlet's height.
- *Measured: an invented stream power profile had put tributaries above the ground and main rivers below it (`[B96]`).*

### [S62] Rivers replace the land near them, and only cut · `decided`
**Decided:** 2026-11-02

- Near a river the bake applies Génevaux et al. 2013's replace operator, h = (1 − w) land + w river, w = (1 − d²/r²)², measured per patch texel from the river's curve, so rivers are sharp at any zoom.
- A river never raises land: raised banks dammed rivers at the coast.

### [S63] Basins grow by priority · `deferred`
**Superseded:** 2026-11-03 by `[S65]`
**Decided:** 2026-11-02

- The tree grows from the coast taking, among waiting nodes within ζ of the lowest, the one with the highest Horton-Strahler priority (Génevaux et al. 2013, section 5), so a few rivers gather big basins. Mouth priorities follow Horton's law.
- ζ, the branching odds and the drawing threshold are the papers' user settings; they're meant to become sliders.

### [S64] Every pit is filled, for now · `deferred`
**Superseded:** 2026-11-03 by `[S67]`
**Decided:** 2026-11-02 · Dana chose this over keeping only large lakes

- Pits are filled with a slight slope so water always flows on (Priority-Flood + ε, Barnes et al. 2014, as Peytavie does), so rivers never break up and there are no lakes.
- Dana wants some lakes back: Fill-Spill-Merge (Barnes, Callaghan and Wickert 2020) is to decide which dips hold water. See the `ROADMAP.md` handover.

### [S65] The planet's water and land come from erosion on the GPU · `decided`
**Decided:** 2026-11-03

- Every terrain tool takes water from the height map it shows (World Machine, Gaea, Houdini), so the land is eroded first and the water read from it.
- Pits are filled first (Priority-Flood + ε, in a worker), then Schott et al. 2023's stream power runs on the GPU on a 2048 × 1024 globe grid: drainage with erosion off, saved, then erosion on top. Duration continues from where the land is or restarts from the save; Strength restarts from the save.
- Only drainage and lakes are global, since a river depends on its whole catchment; everything shown is built per patch (Derzapf: erosion simulation under adaptive level of detail changes the terrain as you zoom).
- The ocean is the outlet, held at its height (Braun and Willett's base level).

### [S66] An erosion filter shapes the surface · `decided`
**Decided:** 2026-11-03

- Rune Skovbo Johansen's filter, in 3D as Estqes ports it, adds branching gullies and ridges per point, so patches stay seamless at any zoom.
- It reads only the smooth coarse eroded ground, never the detailed terrain ("a chaotic mess" otherwise), with no lowering offset (as Bevy's port), in the proportions of Rune's demo (the land's valley spacing to his hills, its relief to his).
- Strength fades from the noise terrain to the eroded one; Shape (Gully Size, Gully Depth up to Bevy's 0.5, Ridge Sharpness, Detail) only re-bakes patches.
- Coasts move with erosion (Dana: real erosion does).

### [S67] Lakes fill by the climate on the eroded ground · `decided`
**Decided:** 2026-11-03

- Fill-Spill-Merge (Barnes, Callaghan and Wickert 2021) fills each basin with the water Rainfall and Temperature leave it (`waterBudget`, Langbein's balance); a climate change refills only the lakes.
- Basins are found on the eroded ground, so carved rims let them drain (Braun and Willett: sills erode as water passes).
- Water is drawn per point where the lake level stands above the ground, so shores follow the terrain (Cordonnier et al. 2016, 6.2).

### [S68] Erosion has one set of settings for the planet and the chunk · `decided`
**Changed:** 2026-11-08: the Climate System section is gone; Erosion stays in the Atmosphere stage's right panel.
**Decided:** 2026-11-03

- Erosion sits in the Atmosphere stage's right panel, under the moons: one switch and one set of settings for the planet and the land chunk. Sea level comes from Water and rain from Climate, never set twice.
- There is no Run button: a change reruns only what it affects.

### [S69] Ocean is only the sea · `decided`
**Changed:** 2026-11-08: Ocean became the Water section, with the sea and lakes as separate parts (`[S81]`); the rule below still holds.
**Decided:** 2026-11-03

- Lakes and rivers follow the Climate's liquid (Dry has none), not the Water switch, as Gaea and World Machine keep the sea apart from lakes.

### [S70] Time has its own World Clock · `decided`
**Decided:** 2026-11-03

- The timeline dock moved out of Erosion into its own World Clock section, the one clock every time-based system will share.

### [S71] A chunk area is drawn on the planet · `decided`
**Decided:** 2026-11-03, refined 2026-11-04

- Selection mode: drag a square from one corner, on one cube face. It turns off on release, Esc cancels it, and the new square opens framed.
- The outline shows only after a square is drawn, not on load. A saved square still drives the chunk.

### [S72] Chunk height is actual, with a proportion cap · `decided`
**Decided:** 2026-11-03

- The chunk uses the planet's km per height unit, drawn from its own lowest ground, with its height range capped at a share of its width (`CHUNK_MAX_HEIGHT_SHARE`, tunable).

### [S73] An erosion change shows only its final state · `decided`
**Decided:** 2026-11-04

- A change that needs carving keeps the old image, with the progress bar, then the filter and carved map land together. A gully slider alone applies at once.
- With Erosion off there are no lakes, on the planet or anywhere else.

### [S74] What a project saves of erosion · `decided`
**Decided:** 2026-11-04

- Duration, Strength, the gully sliders and the chosen square save with the project. The Erosion switch doesn't, so it starts off on load.
- The chunk erosion run belongs to the voxel style only.

- Update 2026-11-04 (Dana: "start saving the erosion settings"): the Erosion switch saves too. A new planet and older saves start with it off.

### [S75] Lakes on the chunk · `decided`
**Decided:** 2026-11-04

- The chunk solves its own lakes from the ground it draws, with the planet's depression hierarchy and Fill-Spill-Merge and the climate's `lakeShare`. Reason: a level stored from the coarse ground stood above land the erosion filter had lowered. A level found from the drawn ground can't pass its rim.
- Water is a flat sheet at each lake's level, and the land stops it, so shores follow the fine ground.
- The square's cut sides are outlets, as the sea is, so water drains through them and valleys don't fill against a cut. Dana: water sinking away there is fine.
- Lakes show only with Erosion on. Solving waits for the carving, and old levels clear the moment the ground changes, so wrong water never shows. A chunk's lake can differ from the planet's view of it (Dana: fine).

- Update 2026-11-04: the planet's lakes also flood over the chunk's ground at their level, since a lake larger than the square has its rim outside it (`[B127]`). Each point takes the higher of the two.
- Lakes always ripple, sized as a ratio of the view, so even a small lake moves at any zoom (Dana).

### [S76] Tides scale by ratios · `decided`
**Decided:** 2026-11-04

- Tide = each moon's size cubed × the planet's radius over the default planet's ÷ the liquid's viscosity, capped. The radius factor is for the look: terrain already scales with radius, so a true tide would look the same against the land on any planet. The viscosity factor is inferred.
- A lake takes a share of the sea's tide: its width over the planet's radius, boosted so large lakes show a subtle shift. A lake only drops from its full level, since it can't stand above its rim.
- No value is tied to Earth. Dana: keep it a ratio, her planet is smaller.

### [S77] Every cut surface ends in a wall · `decided`
**Decided:** 2026-11-04

- Anywhere a water or land surface is cut, it ends in a wall, never open in the air. Dana's rule.
- At the square's sides, the true cross-section (Dana, 2026-11-04): the land wall runs from the base to the ground, and the sea or a lake fills from the ground to its surface (`[B131]`). This replaces the earlier whole-column water.

### [S78] A new planet starts bare · `decided`
**Decided:** 2026-11-04

- A new planet starts with every system off (Atmosphere, Water, Erosion) and every panel closed. Dana.

### [S80] Walk mode's eye height · `decided`
**Decided:** 2026-11-04

- No new slider (Dana: "too many sliders"): in walk mode the Zoom slider becomes Eye height, from a person's 1.7 m to 200 m on a log scale, and turns back into Zoom on leaving. Both views keep the camera above the ground and the water.

### [S79] Every detail has a real size · `decided`
**Decided:** 2026-11-04

- Rivers, plants and animals have real sizes (a river's width from its flow), and a view draws a thing only once it's large enough on screen; smaller things add to the ground's color. So the planet shows only Amazon-scale rivers and forests as color, and the chunk shows the rest. The same rule as the terrain's band-limited detail. Dana.

### [S81] Water holds the sea and the lakes, each with its own look; Climate is its own section · `decided`
**Decided:** 2026-11-08

- The Water section (once Ocean) has Sea, Lakes and Color parts. Lakes have their own clarity, foam, waves, ripples, shine, reflection and color ramp, so a lake can read apart from the sea. One switch turns all water on or off.
- Climate (Liquid, Rainfall, Temperature) sits right after Water, since it decides how much water the planet has; Atmosphere follows with the air's own controls, including haze Layers.
- Randomize colors rolls land, sea, lakes, rock and sky from the land's hue in one go, so a planet keeps one strong hue. Dana.

### [S82] A per-planet color grade, as a post pass · `decided`
**Decided:** 2026-11-10

- The finished frame is graded once, the way engines do it (Unity's Volume, Unreal's Post Process Volume, Godot's Environment): split toning, lift, gamma, gain and saturation, in Unity's math and order. It lives in Scene with its own switch, is saved with the planet, and Randomize colors rolls it gently by the palette's color rules.
- The scene draws into a 2-sample multisampled image so edges stay smooth; 4 samples dropped frames in walk mode. Dana.

### [S83] Toon shading on the land chunk · `decided`
**Decided:** 2026-11-10

- Shade is a color of its own, not the lit color darkened (Monument Valley's look), built on Unity Toon Shader's model: a shade mask by step and feather on half-Lambert light from the smooth landform normal, times the cast shadow. Scene > Shading holds it with its own switch; the chunk first, the planet once the look is approved.

### [S84] Templates: planets kept as starting points · `decided`
**Decided:** 2026-11-10

- A template changes only by Save Template; while one is being edited, autosave is off. "+ Project from" makes a new project copied from it, leaving it untouched. The vertical slice's planets start as templates (Flora from Dana 01). Dana.

### [S85] Life is simulated on a grid and drawn as a tint of the ground · `decided`
**Decided:** 2026-11-10

- Algae and moss grow on a cell grid by Cordonnier 2017's rules (viability by hat functions, the worst input wins, growth into free space, die-back by stress), regrown only when inputs change. Inputs are relative to the planet's own relief, since Earth's per-km rules break on its heights.
- Drawn only as what shows from walking height: placement from the terrain (per-pixel suitability on the smoothed landform), the ground tinted toward a palette color with its own lightness and texture kept. No life texture, relief or velvet of its own. Algae is aquatic (waterline only). Four controls per type. Dana.

### [S86] Reopen what was open · `decided`
**Decided:** 2026-11-10

- A reload reopens the last open project or template, back in template mode for a template, so a reload never silently switches which planet is being edited. Dana.

### [S87] Life evolves: variants compete, eras mutate · `decided`
**Decided:** 2026-11-11

- Each life type has 4 variants side by side in every cell, sharing its free space (JeDi-DGVM, Pavlick et al. 2013). Each era the least abundant is replaced by a mutant of the most abundant (Sims 1991), and the mutant starts from nothing and grows in. Seeded, so the same settings always give the same result.
- Genes are only visible traits, stored 0 to 1: hue, brightness, moisture need, shade need. Variation scales only hue and brightness, so it changes the look instantly without a regrowth; Mutation rate, Shuffle and the switch regrow.
- A regrowth runs out of sight and swaps in when done, with a progress bar in the Biome section. Algae needs the shore by height and by distance (Shore reach, by jump flooding). Dana.

### [S88] Lighting is saved with the planet · `decided`
**Decided:** 2026-11-11

- Ambient, light direction, Intensity, Specular, Shininess, Wrap and Light follows camera save, load and undo with the planet. View settings (grid, walk field of view, debug view) do not. Dana.

### [S89] Climate and Terrain have switches · `decided`
**Decided:** 2026-11-11

- Climate off makes the planet dry, as Liquid Dry does: no lakes, rivers or rain; the ocean stays with Water's switch. Terrain off draws the land flat in its base color. Both keep their values for when they're turned back on. Dana.

### [S90] A debug view for the chunk · `decided`
**Decided:** 2026-11-11

- A Debug view dropdown under the view pill, shown with the chunk. Patches tints each ground patch its own bright color, a debug exception to the palette, so seams and patches at the wrong height show. Dana.


# Weekly Pushes

`Last updated: 2026-10-13`

Graded Weekly Push report per the syllabus — what was attempted/completed, how AI-assisted tools were used, what worked/didn't/next. Chronological, newest entry on top (unlike `ROADMAP.md`, which is organized by stage/feature, not by week).

---

## 📅 2026-10-13

🖼️ IMAGE NEEDED: a current screenshot of the app in Split view, planet on the left with terrain and octaves on, land chunk on the right, showing the two side by side. Save as `images/2026-10-13-split-view.png` and link it here.

### 🛠️ What was done
- Replaced the planet's lat/long sphere with a cube sphere: six flat grids pushed out onto the sphere. A lat/long grid converges at two fixed points and cannot be subdivided locally, so it cannot support detail that follows the camera.
- Fixed two seam bugs the switch exposed. A black slit, where the lighting rebuilt its surface direction from map coordinates that jump at the wrap line, now taken from each point's 3D position instead. And terrain tearing at both poles, where the map's wrap line crosses both pole faces so triangles sat astride it and read from both ends of the map at once; each pole face is now generated as two halves split along that line, the same approach `SphereGeometry` uses at its own seam.
- Introduced the patch as the single unit of terrain: one piece of the planet's surface, defined by a cube face, a rectangle on it and a depth, with a heightmap baked for it alone. Everything showing terrain consumes patches.
- Rebuilt the land chunk as a patch drawn flat rather than a separate pipeline sampling a window of the shared map. Its Resolution control now reaches real detail instead of enlarging a small piece of a 1024x512 map, and double-clicking the planet picks which piece the chunk shows, replacing a hardcoded spot.
- Separated resolution from footprint after getting it wrong first: resolution is how finely a patch's ground is measured, depth is which ground it covers. A first attempt drove depth from the Resolution slider, so raising it zoomed in and the terrain flattened.
- Moved the chunk off `MeshStandardMaterial` onto the same hand-written lighting model as the planet, so the Scene controls mean the same thing in both views and the intensity-rescaling multipliers are gone. Closes the first half of Stage 07's cast-shadow item.
- Adopted the documentation conventions from the procedural-creative-coding-tool project, added `REFERENCES.md`, and recorded the research behind every architectural choice along with one wrong diagnosis that was reverted.

### 🤖 AI-assisted process
- A wrong diagnosis cost most of a session. The claim was that reading height out of the rectangular map is lossy at the poles; it is the reverse, since an equirectangular map over-samples there. A whole pipeline rebuild was built on that and reverted. The real cause was a texture coordinate seam on two faces, fixed in one file.
- What eventually found it was drawing the data on screen rather than reasoning about it: colouring the six faces flat ruled out a broken mesh, then drawing the height value as greyscale showed exactly where it jumped.
- Two failures worth recording. A GPU texture-limit warning sat in the dev server log unread for the whole time it was breaking things. And "the shader compiled" was treated as proof an approach worked, when the failure was at bind time rather than compile time.
- New standing rules written into `CLAUDE.md` at Dana's instruction: research established methods before writing a plan rather than after one fails, and fix infrastructure-level defects properly rather than logging them.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> building a diagnostic view instead of reasoning further. Each one ruled out a whole class of cause in a single screenshot, after several rounds of argument had failed to.
- <span style="color:#2da44e">✅ **Worked:**</span> checking conventions before committing to an architecture. Cesium's tile model and Outerra's per-patch heightmaps directly shaped the patch unit, and the picking method is the documented inverse of the cube-to-sphere projection rather than something derived here.
- <span style="color:#cf222e">❌ **Didn't work:**</span> reasoning from first principles about what should be happening. It produced a confident wrong diagnosis, a reverted rebuild, and several fixes aimed at the wrong layer.
- <span style="color:#cf222e">❌ **Didn't work:**</span> proposing small fixes that were known to need replacing later. Called out directly and corrected toward building the durable unit once.
- <span style="color:#0969da">⏭️ **Next:**</span> Stage 08, erosion, as a general reusable engine, plus the Timeline control. Research so far points to grid-based erosion rather than the droplet approach logged in September, since droplets need scattered writes that WebGL handles badly while the grid model is designed for the GPU.

## 📅 2026-10-07

### 🛠️ What was done
- Worked through class feedback ("it's good as a software, but the procedural aspect isn't clear enough" — a 3D terrain tool vs. a procedural *system*) in depth rather than reacting with a quick fix: researched real procedural-terrain tools/literature (World Machine, Gaea, academic multi-biome pipelines) to ground every naming/ordering decision in actual convention instead of inventing one.
- Decided a concrete pipeline: Terrain → Erosion → Climate → Biome → Color Texturing → Population → Events — splitting the former single "Color / Biome Texturing" placeholder stage into two (Color becomes its own shader-driven stage, reading height/climate/biome as inputs, not a biome byproduct), and adding Population and Events (natural disasters) as new tracked stages.
- Decided Erosion gets built as one general, reusable simulation engine (intensity/duration/location/direction) specifically so Events/disasters reuse it at different parameter values later, instead of needing separate hand-built effects per disaster type.
- Decided the land chunk gets converted off its standalone `MeshStandardMaterial` onto the planet's own hand-written shader, so the two views share one lighting system instead of two that need separate calibration — and so shadow mapping (already an open to-do) gets implemented once, by hand, shared by both, instead of only for the chunk via Three.js's automatic system.
- Planned the UI fix for the original feedback: the left panel becomes a pipeline-stage menu (one real accordion per stage, each independently expandable for a few quick settings, clicking its label driving which stage's full detail shows on the right) instead of the right panel's own separate tab bar — an established "master-detail" pattern, not an invented one.
- Logged a Timeline concept (plays whichever stages are currently enabled, needs a wide unit range from hours to millions of years) and a procedural theme-generation approach (continuous axes mapped to parameter ranges by one generic formula, so "desert"/"volcano" become labeled regions of one system, not hand-authored presets) for later.
- Updated `ROADMAP.md`, `README.md`, and this file to reflect all of the above, labeled explicitly as the response to the procedural-system feedback rather than buried in unlabeled edits.

### 🤖 AI-assisted process
- Searched and cited real sources for every naming/ordering/pattern decision (Climate's name and position, the master-detail pattern, the Unity Inspector precedent) instead of asserting a personal preference, per direct instruction to always check convention first.
- Corrected scope twice on direct pushback: initially proposed the easier "just add Three.js shadows to the chunk" path and was told not to take the easy way when the real fix (unifying the chunk and planet's shading) would need doing eventually anyway; initially proposed moving Radius/Display/Color into the Terrain detail panel and was corrected that they're general display settings, not terrain-specific.
- Flagged an unverified claim explicitly (couldn't confirm a specific academic citation floated mid-discussion) rather than presenting it as sourced when it wasn't.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> searching for real conventions before deciding on stage names/ordering/UI pattern — it directly overturned one of two first instincts (stage ordering) and confirmed the other (Climate's name), instead of just asserting a guess either way.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> defaulted to the lower-effort technical path for shadows and for where general settings should live, in both cases corrected directly rather than caught by testing.
- <span style="color:#0969da">⏭️ **Next:**</span> implement the left-panel pipeline-menu restructure (plan finalized, not yet built); the chunk/planet shader-unification + shared shadow-map work; begin Stage 08 (Erosion) as a general engine.

## 📅 2026-09-30

### 🛠️ What was done
- Split terrain Height from the existing Opacity/Blend-Mode shape composite into a genuinely separate, purely additive elevation channel (shape and elevation as two independent channels of the same texture) — after discovering the first pass made Height mathematically indistinguishable from Opacity on a base layer. Fixed a real bug where Ridged noise wasn't zero-mean, inflating the whole planet/chunk uniformly once Height went unclamped. Made Height a percentage of context size (radius for the planet, footprint for the chunk) instead of an absolute number, so the same value reads proportionally on both views.
- Unified Radius/Size into one contextual slider that relabels/rebinds depending on which pane is active; renamed "Land Chunk" to "Chunk" (the actual industry term for this).
- Made both side panels user-resizable (ported `active-geometry-project`'s drag-handle pattern) instead of a fixed/auto-sizing width; fixed slider/select rows not shrinking into narrower panel widths; fixed the 2D noise canvas being a fixed-size square (now fills its container at the correct aspect ratio) and wrapped the Noise canvas section in a collapsible Accordion; fixed "Expand" to replace the viewport in place instead of a dark overlay.
- Added layer naming (auto "Layer 01"/"Layer 02", ever-incrementing, double-click to rename inline) and restructured noise modifiers from mutually-exclusive types into independent, composable toggles (Domain warp/Octaves/Ridged/Terrace) layered onto any base generator, matching Gaea's actual structure — previously these were secretly hardcoded to Perlin only. Added a Ridge-amount slider, since Ridged was the one modifier with no natural continuous "how much" control, unlike the other three.
- Redesigned the Modifiers UI three times based on live feedback: from plain checkboxes to a contained-tab system (one row, all tabs in one line), moved the enable checkbox off the tab into its own expanded panel, connected the active tab visually to its panel with no seam, and removed a stray divider stroke between tabs.
- Received direct class feedback: "it's good as a software, but the procedural aspect isn't clear enough" — a 3D terrain tool vs. a procedural *system*. Began a structured response rather than a quick UI tweak (continued the following week).

### 🤖 AI-assisted process
- Caught and corrected for implementing before an explicit go-ahead on the Height/Opacity fix — same standing workflow violation pattern, logged to memory again.
- Verified the actual root cause of the Height/Opacity collapse mathematically (a linear crossfade onto a flat base multiplies the two sliders together) before proposing a fix, rather than patching the symptom.
- Diagnosed the Ridged-noise bug from a screenshot by checking each noise type's mean individually, not guessing which one was at fault.
- Misdiagnosed a separate UI complaint once (assumed a stray blue border was a browser focus-ring artifact) and was corrected directly — asked a precise clarifying question afterward instead of guessing again.
- Loaded a dedicated frontend-design skill specifically for the modifier-tab redesign rather than winging the interaction pattern.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> working out the elevation-vs-opacity math explicitly before rebuilding it — the first instinct (scale height before the existing blend) looked reasonable until tested live, and the actual formula showed exactly why it collapsed. Asking directly what a confusing screenshot artifact actually was, instead of re-guessing after getting the first diagnosis wrong.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> the Height/Opacity split needed a second full rebuild once live testing showed they were indistinguishable; the panel-width fix also needed a second pass (a single fixed width wasn't actually what was wanted, a user-draggable one was); the Modifiers UI took 3 live-feedback iterations to land.
- <span style="color:#0969da">⏭️ **Next:**</span> work through the procedural-system feedback properly — what actually needs to restructure, not just a cosmetic pass.

## 📅 2026-09-24

### 🛠️ What was done
- Rearchitected voxel meshing from a 3D solid/empty density grid (O(resolution³)) to a column-based height grid (O(resolution²)) — the real ceiling that was blocking the Resolution slider; raised its max from 64 to 2048 as a direct result.
- Unified perimeter and internal height-step wall cases into one boundary rule (outside-the-grid treated as height 0); fixed smooth-mesh walls missing on some sides via a single boundary-walk formula, replacing 4 independently hand-derived cases.
- Added noise-layer multi-select (shift+click, batch-edit applies to all selected), a real visible drag-to-reorder (the actual row follows the cursor instead of reordering instantly with no feedback), and a Photoshop-style per-layer visibility toggle that genuinely skips a hidden layer's computation rather than just zeroing its opacity.
- Laid the Edit section's Undo/Redo/Reset out in an even-width row.

### 🤖 AI-assisted process
- Verified the column-based meshing rewrite's winding (top faces, walls, bottom cap) by hand via the right-hand-rule cross product rather than guessing, same method already used for the smooth mesh.
- Added defensive `!== false` checks (not plain truthiness) for the new per-layer `visible` field, so layers saved before the field existed default to visible instead of hidden.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> tracing the Resolution slider's real ceiling to the O(resolution³) density grid, not just raising the slider's max again, which is what had been tried first.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> none this session — a clean rearchitecture once the real bottleneck was identified.
- <span style="color:#0969da">⏭️ **Next:**</span> per-layer Height, contextual Resolution unification, shadow map for the land chunk.

## 📅 2026-09-23

### 🛠️ What was done
- Added Redo (Cmd+Shift+Z), mirroring Undo's existing architecture.
- Reworked project naming/deletion UX: naming separated from switching (inline-editable name via `EditableText`), a nested "My Projects" accordion with delete, "+ New Project" auto-names and saves immediately instead of prompting — no more unnamed/in-between project state.
- Planned Stage 07 (Land Cube / Voxel Terrain) ahead of Erosion in `ROADMAP.md`/`ISSUES.md`, then built it: a side-by-side planet+chunk detail view with a resizable split and a Planet/Land Chunk/Split mode button.
- Two render styles for the chunk, both reading the same sampled heightmap region: cube/culled-face voxel meshing (in a Web Worker, so the main thread/3D view stays responsive) and a smooth continuously-displaced surface extruded down to a grounded slab.
- Chunk-specific Resolution and Size controls, decoupled from each other (resolution = detail only, size = physical footprint); one shared Height control driving both the planet's own terrain displacement and the chunk's height directly — the same value, not two independently scaled ones.
- A single shared Gumball instance instead of one per viewport: click a pane to target it, shift+click to drive both cameras together; each target carries its own reference distance so zoom/reset scale correctly per camera.
- Fixed: both viewport panes now stay mounted permanently, toggled via CSS only — previously switching view mode rebuilt each pane's whole Three.js scene, resetting the camera position and the planet's color every time.

### 🤖 AI-assisted process
- Corrected twice for implementing before an explicit go-ahead (a render-mode wiring, and a gumball-sharing design) — same standing workflow violation pattern, logged to memory each time.
- Hand-verified the smooth mesh's wall winding via the right-hand-rule cross product rather than copying from an external source, since it's a directly-derivable geometric fact, not a citable reference algorithm.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> designing the shared Gumball around a list of camera targets (not a single fixed one) from the start, once it was clear two separate gumball instances was the wrong direction.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> the gumball's zoom/reset math used one fixed reference distance calibrated for the planet's scale, which didn't work for the much-smaller chunk — needed a second pass giving each target its own reference distance.
- <span style="color:#0969da">⏭️ **Next:**</span> rearchitect the voxel meshing's real resolution ceiling; layer multi-select/visibility.

## 📅 2026-09-22

### 🛠️ What was done
- Set up real project persistence: a Firebase project (Auth + Firestore), anonymous sign-in (auto-recognizes the user, no login screen), Firestore security rules (a user can only read/write their own document) written to `firestore.rules` and deployed via the Firebase CLI, and a `state/storage.ts` module wired into `App.tsx` — the layer stack now saves/loads per user.
- Fixed a real layer-compositing bug: adding a new layer visually erased existing painted terrain beneath it (no data was actually lost — purely a compositing bug). Took two attempts to get the fix mathematically right.
- Fixed brush strokes cutting off at the sphere's UV seam instead of wrapping across it.
- Rewrote stroke rendering: replaced the per-dab MAX-accumulation approach (which left a crease artifact, visible as jagged 3D ridges) with a true distance-to-polyline computation — one smooth shape along the whole stroke path.
- Restructured `ROADMAP.md` (numbered stages, each feature in a Done/To do/Bugs template, progress bars) and `ISSUES.md` (categorized instead of chronological, same scannable template) per Dana's explicit design direction.

### 🤖 AI-assisted process
- Same confirm-before-acting workflow as prior weeks; slipped once more (reverted a shader formula without waiting for a fresh go-ahead) — caught, corrected, logged to persistent memory.
- Walked Dana step-by-step through the Firebase console/CLI setup — account/infra steps only she could do (project creation, enabling Auth/Firestore, the CLI login flow).
- Diagnosed two separate rendering bugs from screenshots before proposing fixes (a double-application of the same paint mask causing a ridged edge; the MAX-accumulation crease causing jagged 3D terrain) — root-caused via the actual math, not guessed.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> screenshots + live testing surfaced two subtle math bugs (the double mask-blend, the MAX-accumulation crease) that weren't obvious from reading the shader code alone.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> the layer-persistence-erasing fix took two real attempts — the first was mathematically incomplete (applied the same mask twice).
- <span style="color:#0969da">⏭️ **Next:**</span> erosion simulation (next syllabus topic — hydraulic vs. thermal and timeline-scrubbing are open questions); revisit the still-jagged painted-terrain issue (tabled, likely a mesh-resolution limitation), possibly after erosion.

## 📅 2026-09-16

### 🛠️ What was done
- Built a real multi-layer noise system: a Photoshop-style layer stack (add/delete/drag-to-reorder, up to 16 layers), each with its own noise type, parameters, opacity, and blend mode.
- Built a full paint-brush system on the 2D heightmap: an absolute "set to this value" brush with a black-white strength slider and a feather/hardness control, persisted per-layer, live on both the 2D preview and the 3D planet.
- Fixed a major lighting gap: the planet had no real per-pixel normal, so terrain bumps didn't show at all — replaced with an analytic sphere tangent basis.
- Fixed several real bugs along the way: paint erase doing nothing, partial-opacity strokes reading as diluted/dark, a pole-geometry tear, a faceted/low-poly regression from an initial (wrong) normal approach, and a brush-radius unit-conversion bug.
- Iterated the brush's feather/hardness design through 4 models based on live testing (full history in `ISSUES.md`).
- Various scale/UX fixes: planet radius slider range, grid fade distance, ambient lighting, base color, removed the redundant "Enable noise" toggle.

### 🤖 AI-assisted process
- Same confirm-before-acting workflow; slipped a couple of times (a bug fix and a design revert without a fresh go-ahead) — caught and logged to persistent memory each time.
- Verified before implementing, not assumed: GPU float-blending support (web search) before choosing ping-pong render targets; Gaea's actual blend-mode formulas (its own docs); the analytic normal's cross-product winding (hand-computed a concrete point).
- Diagnosed the stroke-opacity-buildup bug from a screenshot (fix landed the following week).

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> testing live and iterating from what's actually on screen — several bugs (paint erase, the faceting regression, the brush-radius scale) only made sense once rendered.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> the feather/hardness design took 4 attempts — the underlying design *intent* needed pinning down before implementing, not after.
- <span style="color:#0969da">⏭️ **Next:**</span> the stroke-opacity fix; rebuild "Expand" to replace the viewport instead of overlaying it; restructure noise modifiers; erosion simulation.

## 📅 2026-09-09

### 🛠️ What was done
- Scaffolded the project: Vite + React + TypeScript + Three.js.
- Built the base 3D scene (canvas, camera, orbit controls, grid) following `active-geometry-project`'s conventions, not the class repo's Entity/World pattern.
- Built the planet: real sphere geometry with a custom GLSL vertex/fragment shader (basic diffuse lighting).
- Built a UI system matching active-geometry's actual design (blended slider, color picker), consolidated into one CSS source of truth including its real licensed Helvetica font files.
- Built the sectioned left control panel (Scene controls, Planet controls).
- Ported and debugged the gumball navigation widget, reusing active-geometry's camera-calibration math.
- Set up the project's documentation structure (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `ISSUES.md`, this file), each with a distinct scope.

### 🤖 AI-assisted process
- Strict step-by-step, confirm-before-acting workflow from the start — nothing implemented without explicit go-ahead first.
- Researched and ported real code/values from `active-geometry-project` rather than inventing new conventions; architecture/tradeoff discussion (raymarching vs. mesh-based Three.js, the GPU-heightmap-texture approach); debugged a React StrictMode leak, an off-center 3D view, and a `pointer-events` cascade blocking the gumball's axis-line drags.

### 📊 Worked / didn't / next
- <span style="color:#2da44e">✅ **Worked:**</span> going back to active-geometry's actual source values (not memory/assumption) — once real font files and exact CSS values were used, the UI actually matched. The confirm-before-acting workflow caught wrong turns early.
- <span style="color:#bf8700">⚠️ **Didn't work initially:**</span> a few first-pass implementations drifted from the real source without being flagged (an invented slider width, a missing `@font-face`, an inverted camera-matrix ordering) — caught via direct side-by-side comparison, not memory.
- <span style="color:#0969da">⏭️ **Next:**</span> color-picker theming decision, terrain generation (GPU heightmap approach, already agreed in `ISSUES.md`), design-system tokenization pass.

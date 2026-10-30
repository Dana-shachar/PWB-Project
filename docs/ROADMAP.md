# Roadmap

`Last updated: 2026-10-30`

*Where the project stands and what gets built next, by stage and feature.*

> [!NOTE]
> Current status only. Weekly reports are in `WEEKLY-PUSHES.md`. Architecture and decisions are in `SPEC.md`; bugs are in `ISSUES.md`. Outside sources are in `REFERENCES.md`. Repo layout is in `README.md`.

> [!IMPORTANT]
> **Start from here (2026-10-30, tenth handover):** *a fresh session reads `.claude/CLAUDE.md` (it loads automatically), then this block, then `docs/CODE-INDEX.md` before searching the code. Every doc but the README lives in `docs/`. Search for a name, then read only the range around it.*
>
> **State.** Everything is committed and pushed: the Shadow hue slider (now in Atmosphere > Color, saved per planet), the panel cleanup (`[S47]`: accordions everywhere, header switches, modifiers as nested sections, swatches on the right), lock icons and the Atmosphere's Randomize (`[S45]`), per-moon Crescent, moons added and removed like layers, the haze fix (`[B74]`, `[S46]`), the glow cut-out fix (`[B75]`), Space + drag to pan, walk speed up to ×10. The dev server runs on **localhost:5173**; run it from `app/` with `npx vite`. After shader or engine changes, a **hard reload** (Cmd+Shift+R) is needed. There is no GLSL compiler here: a blank view means a shader error in the console.
>
> **Right now:** stage 2 of the land shader, slope rock (plan below, needs Dana's go). Both Randomize buttons now work by hidden drivers: the atmosphere's (`[S45]`, not yet tuned by Dana) and the terrain's, which builds layers by role (`[S35]`, `[B77]`, Dana: "much better"). Tune either from her notes when she asks.
>
> **Also this session (committed):** Clouds and Moons header switches; each moon's own Texture, Halo and Inner glow (one moon shows its controls inline); the hue bar on its own row with a dark handle; locks at the row's edge.
>
> **Not retested by Dana:** the UI batch as a whole (hue bar, locks, Randomize, Moons layout, header switches, modifier sections, Space-to-pan); Dana approved the haze and glow fixes on screen. `[B73]`'s eye floor and stage 1's brighter fill are also still unchecked.
>
> **Stage 2 plan, as given to Dana (needs her go before building):**
> 1. `shaders/terrain/landLayers.glsl`: add `landSurfaceColor(rampColor, normal, up, elevationFraction)`. Rock blends in by `1 − dot(normal, up)` through a `smoothstep`, colored by the rock ramp by height (`terrainRampColor`, reused). Optional height term so flat summits can be rocky.
> 2. `planetPatch.frag.glsl` and `chunk.frag.glsl`: call it right after the ramp color.
> 3. `planet/planetControls.ts`: `rockStops`, `slopeStart`, `slopeSoftness` in `PlanetSettings`, plus `migrateRock` for old saves (these are saved, unlike Scene settings).
> 4. `planet/planetPatchMesh.ts` and `voxel/LandChunkCanvas.tsx`: uniforms `uRockColors`, `uRockPositions`, `uRockCount`, `uSlopeStart`, `uSlopeSoftness`, filled through `buildPatchRampArrays`, set only on change.
> 5. `ui/Panel.tsx`: a "Rock" group in the Color section: a second `ColorRampEditor` plus Slope and Softness sliders.
> - Test: the chunk on a mountain spot (cliffs turn to rock, Slope moves where it starts); the planet zoomed into a range (less rock than the chunk, since the planet draws coarser shapes).
>
> **Open questions for later stages:** stage 3 measures first that the height texture's blue channel survives every texture the land reads (planet patches, the chunk's 4096 map, the patch resample), or it is re-planned; stage 4, whether the palette rule gets its own control (a "Rule" select next to Randomize colors) or only works inside Randomize; stage 5, live or baked ambient occlusion.
>
> **Brighter fill, still open:** stage 1's fill is scaled to white's luminance with Ambient light up to 1; Dana liked the colors and wants it brighter.
> - ⚠️ The luminance scaling can push shadows strongly toward a very saturated sky color (a pure blue sky makes very blue shadows).
> - Expected, not a bug: steep shaded faces get half the fill of flat ground (Quilez's sky term), so cliffs in shadow read darker.
>
> **Agreed, queued:**
> - 📌 Erosion's on/off switch moves to its header when Erosion is un-paused (`[S47]`); Dana is unsure Erosion stays.
> - 📌 The regular Slider has no visible keyboard focus state (only the hue slider has one); adding it is Dana's call.
> - 💡 Haze through the depth buffer (`[B74]`), only if mountains look too hazy.
> - 📌 Water reads as water from walk mode: Fresnel on the chunk water's opacity, sky reflection and sun highlight (`[B67]`, `waterFresnel` exists in `water.glsl`), after the land shader plan.
> - 📌 Moon look (Dana, 2026-10-28, "good enough" with room to improve): a more intense glow, less halo distance, more inner glow. A plan waits for Dana's go: in `drawMoon` (`shaders/atmosphere/skyDome.frag.glsl`), `MOON_HALO_STRENGTH` 0.6 to 1.0, `MOON_HALO_MIN_SHARE` 0.17 to 0.10, `MOON_HALO_SHARE_PER_UNIT` 0.33 to 0.20, `MOON_HALO_MIN_ANGLE` 0.03 to 0.02, `MOON_GLOW_SHARE_PER_UNIT` 0.12 to 0.25, `MOON_GLOW_STRENGTH` 0.8 to 1.2; and maybe reword Halo's hover text ("meant to stay subtle").
> - 💡 From Quilez's rig, not planned: a warm bounce light opposite the sun (brightens steep shaded faces), and colored shadow edges.
>
> **Interaction notes (Dana, 2026-10-28).** Dana uses a trackpad, no mouse: a two-finger scroll still sends wheel events, which change walk speed (`travelScale`). Keep chat answers short and precise: no repeated questions she already answered, exact token counts (an estimate is labeled as one), and logs are added without asking.
>
> **Moons, how they stand** (so tuning doesn't restart from zero): the target spec Dana approved, built in `drawMoon` (`shaders/atmosphere/skyDome.frag.glsl`): color clearly visible and never bleached by the glow; texture as gentle tone; a full moon solid to its edge; the shadow (Crescent) dissolving fully into the sky, with no outline; one rounded glow across the edge, lit side only (all round at Crescent 0); Texture 0 translucent, 1 solid, 2 strongest; split toning (Second color the darks by multiply, Color the brights by screen). Change only what Dana approves: tuning by screenshot made colors swing neon and pale.
>
> **Temporary diagnostics still in the code (remove when their bugs close; the haze and glow ones are already gone):**
> - `[TEMP water]` logs and the shore-search logs in `scene/walkMode.ts`.
> - Alt+click on the chunk: the `[TEMP B55]` height row table (`logCliffRow` in `LandChunkCanvas.tsx`, `lastSampleDepth` in `ChunkPatchRenderer.ts`).
>
> **Open decisions for Dana**
> - ❓ **A real moon orbiting the planet** (plan given, waiting for a go): a 3D moon sharing the sky moons' texture and look, orbiting slowly (`atmosphere/planetMoon.ts`, `shaders/atmosphere/planetMoon.frag.glsl`); later the chunk's sky moons following the orbit, and tides that follow it.
> - ❓ **General undo history** for every setting (Dana asked 2026-10-28; undo now covers paint strokes only; undo/redo is paused on the roadmap, so un-pausing it is her call).
> - ❓ **Planet spin** (Dana's idea, proposed, not approved): spin speed, axis tilt 0 to 180° (Uranus about 98°), axis direction.
> - ❓ **Endless-looking chunk:** (a) fade its edges into the haze, now; (b) real terrain to the horizon at lower detail, later.
> - ❓ Swirl as Musgrave's Coriolis twist (researched, waiting).
> - 📌 The Texture slider's hover text (now under Moons) still says "above 1 the pattern grows stronger"; Texture now scales the contrast from 0. Rewording waits for Dana's yes.
>
> **Working rules (Dana; most are saved as memories).** A numbered plan and an explicit go before any change (temporary console logs excepted, `console-logs-need-no-permission`); an answer or "ok" to a question is not a go (`strict-confirm-before-acting`; Dana, 2026-10-27: unapproved actions will be blocked). Measure before naming a cause, and say plainly how sure a claim is. Build new visuals on the app's own engines, never hand-rolled or copied (`reuse-app-systems`). Fix structural bugs at the root. Sourced methods only, verified by reading the source; say when only a summary was read. Docs change only in the docs pass that goes with a commit, recording the final result (`docs-only-final`). Check Dana's proposed mechanism against established tools before inventing one, and build only on a measured cause (`.claude/CLAUDE.md`, "How to fix bugs"). No attribution anywhere. No agents without a yes and a cost; page readers are reported with their tokens.
>
> **Also open:** `[B67]` water barely visible from walk mode; `[B68]` straight shoreline; `[B69]` color line at the shore; `[B55]` a wall seen close to the ground (hypothesis: the old mirrored camera collision, check now that it's fixed); `[B54]` the smooth chunk never shows erosion; `[B64]` timeline panel; `[B59]`; `[B60]`; `[B57]`; `[B58]` stalling.
>
> **🧭 Direction (Dana, 2026-10-26)**
> *The story drives the order; infrastructure pauses.*
> - Anchor reference: Ian Cheng, *Emissaries* (simulations that play themselves). Karl Sims, *Panspermia* (evolved alien plants) is a second.
> - Erosion (`[B54]`), Terrace (`[B57]`), undo/redo and patch polish are paused. Walk mode stalling (`[B58]`) is fixed only as far as walking needs.
>
> **Next, in this order**
> 1. ✅ **Sea level and water** (2026-10-27). Sea level is a raw height so both views share the coastline; the water ramp is spaced by light remaining; Seascape waves on both views.
> 2. 🟡 **Atmosphere** (replaces the Climate stage): built 2026-10-27, being tested. Left: on/off, Horizon and Sky colors, Haze, Glow. Right panel (select the Atmosphere header): Wind, Clouds (coverage, softness, color, scale, detail, feather, banding, latitude distribution), Moon. 📌 Still to do: Swirl as Musgrave's Coriolis twist (researched, waiting for Dana's go); rain or snow particles (copy a tested library such as three.quarks, verify first); poles' ice belongs to step 3.
>    - 🟡 Reworked after Dana's tests (2026-10-27): the planet glow is an edge-distance fade sized by Glow; the planet haze thins with height (no rim); the chunk haze is Quilez's height fog with sky and sun hues and a fine grain, Haze up to 10; Wind up to 40 (waves stop at 12); clouds have a second color. Waiting on Dana's retest of the glow and haze.
   - ✅ Moons and tides (2026-10-28): one to five randomized moons baked by the noise engine, split-toned, with a crescent dial; the chunk's water rises and falls with their size (`[S44]`).
> 3. **Terrain shading and volcanoes:** rock by slope, snow by height and latitude (poles), glowing lava, cones placed at Voronoi cell centers, rock strata on cliffs (Sable).
>    - 🧭 Art direction (Dana, 2026-10-27): 2.5D, real 3D but flatter: soft wrapped light, little shine, depth from haze layers, limited palettes; between No Man's Sky and Sable, not toon. Images in `docs/references/`, listed under 🎨 Visual in `REFERENCES.md` (No Man's Sky, Sable, Outer Wilds, Gris, Monument Valley).
>    - 🧭 Color direction (Dana, 2026-10-26): No Man's Sky, alien and unexpected, with rules. Monument Valley as a reference for good coloring rules, but less simple.
>    - 🧭 Look (Dana, 2026-10-28): No Man's Sky's one strong hue per planet, softened by the gentle layered landscapes of Gris and Sable, with unexpected shading colors (Monument Valley) set by procedural rules, not a hand-picked palette.
>    - 🟡 **Land shader layers** (plan agreed 2026-10-28), each built, tested by Dana and committed before the next. All live in one shared land-layers shader used by both the planet and the chunk.
>      1. 🟡 Colored shadows (built 2026-10-28): the ambient is a sky fill, brighter on faces turned up to the sky, tinted by the sky's color turned by Shadow hue (Scene > Shadows) and kept at white's brightness. The sun is untouched; Ambient light now reaches 1. ✅ Shadow hue is a hue slider showing its color, in Atmosphere > Color (2026-10-30). 💡 From Quilez, not planned: a warm bounce light opposite the sun, and colored shadow edges. 📚 three.js hemisphere light; Quilez, outdoor lighting.
>      2. ⚪ Slope rock: steep faces blend to a rock ramp of their own, by height (room for Sable's strata later), with Slope and Softness sliders. 📚 Slope by the normal against "up", the standard terrain method.
>      3. ⚪ Large-scale variation: a slow noise from the app's own noise engine, baked into the height texture's free blue channel, shifts hue and lightness. Measure first that the channel survives every texture the land reads.
>      4. ⚪ Rule-based palettes: Quilez's cosine palette plus No Man's Sky style rules (complementary, analogous, split-complementary), each also choosing the shadow hue. Randomize colors sets the land ramp, rock, variation and shadow hue from one rule; a Softness slider lowers contrast toward Gris and Sable. 📚 Quilez, palettes; Kill Screen and Engadget on Grant Duncan's talk.
>      5. ⚪ Ambient occlusion on the fill light only, never the sun. ❓ Computed live or baked with the height map (the performance rules favor baked). 📚 Quilez.
>      6. 💡 Layered haze per planet: the chunk's haze takes its colors from the palette (Sable called distance fog its biggest single improvement).
> 4. **Planet types** (desert, forest, water, volcano, ice, each with variations): a tuned start plus "reroll within this type" (Dana chose option C). 🧭 Moved after terrain shading (Dana, 2026-10-27): profiles save every look setting, so they come once those exist. Profiles: save a planet you like, "Generate" makes variations within ranges around it.
> 5. **Storms** (dust storms, hurricanes, ash plumes, blizzards); the base clouds are now part of step 2. 📌 Storm spirals (Dana, 2026-10-27): a local swirl of the clouds around each storm's eye; research a sourced method here. 📌 Look at the day-and-night Shadertoy's layered snow and aurora first (under Shadertoy candidates in `REFERENCES.md`).
> 6. **Evolving plants on the land chunk:** 📚 parametric L-systems (`nylki/lindenmayer`, MIT; *The Algorithmic Beauty of Plants*) and space colonization for coral, genes mutated per Sims 1991. One shared visual style across all plants. EZ-Tree considered for earth-like trees.
> 7. If time allows: population agents, then cataclysms (more than one, Dana 2026-10-27). A tsunami is one: about 50 cm high and 800 km long in open ocean, seen from orbit only in the sun glint, rising at the coast (📚 NASA MISR, Sri Lanka 2004). Final Review exhibition Dec 2.
>
> **Open threads for Dana (not code)**
> - 📌 **Firebase key:** restrict it in Google Cloud Console (console.cloud.google.com/apis/credentials, the "Browser key (auto created by Firebase)": Application restrictions = Websites, add `http://localhost:*/*` and any hosted address).
> - 📌 **Deploy host,** if there is one: set the six `VITE_FIREBASE_*` values there.
> - 📌 **Before submitting for class:** add a copy of the user-scoped `ui-design` skill to the repo, placement Dana's call.
> - ⏸️ **Run instructions** belong in the final README the syllabus requires.
> - 📌 **README opening** (Dana, 2026-10-28): the README opens with an intro to the project, its concept and its inspiration. A placeholder section waits at the top for it.
> - 📌 **Doc navigation** (Dana, 2026-10-28): every doc opens with a row of links to the other docs, for easy review.
>
> **Known risks.** No GLSL compiler on this machine: shader changes are only checked on screen, so a blank view usually means a shader compile error in the console. The planet's cloud shader samples noise up to about 18 times a pixel; lower Detail if it lags. Many atmosphere and water values are inferred and tunable (marked in the code). Planet waves use meter-scale coordinates across the whole planet, so very close up they may show float precision blockiness.

**Overall** ▓▓▓▓▓▓░░░░ 62%

Stages run in build order, and earlier ones finish before later ones start. Features are numbered under their stage, so 07.3 is the third feature of Stage 07. Each carries a bar; a stage's number averages its features. Every feature has the same three fields: **✅ Done**, **📋 To do**, **🐛 Issues to fix**.

Signs, each meaning one thing: ✅ done · 🟡 in progress · ⚪ not started · ⏸️ deferred · ❓ Dana's to decide · 💡 unconfirmed · ⚠️ risk · 🔴 open bug · 📌 small todo · 📚 from research · 🧭 a decision · 🖼️ image needed.

---

## Stage 01 · Foundation & Scene Setup
▓▓▓▓▓▓▓▓▓▓ 100%

*The scaffold, the 3D scene, and the control panel everything else hangs off.*

#### 01.1 · Project scaffold · 100%

*The project the rest of the app is built in.*

> **✅ Done**
> - Vite, React, TypeScript and Three.js, following `active-geometry-project`'s conventions rather than the class repo's OOP pattern (2026-09-09).
> - `App.tsx` is a composition root only. Each feature owns its state in its own hook (2026-09-22).

#### 01.2 · 3D scene, camera, controls, grid · 100%

*The 3D scene, its camera and controls, and the reference grid.*

> **✅ Done**
> - Scene, camera, orbit controls, and a shader-based infinite grid with spacing and visibility controls (2026-09-09 to 09-16).

#### 01.3 · Gumball navigation widget · 100%

*The on-screen widget for orienting and zooming the view.*

> **✅ Done**
> - Orientation widget with axis indicator, zoom, view presets and reset, scoped to the viewport (2026-09-09 to 09-14).

#### 01.4 · Control panel UI system · 95%

*The panel system every control sits in, and the stage menu.*

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

*The planet itself: its geometry, its scale, and how its surface is divided.*

#### 02.1 · Sphere geometry & radius control · 100%

*The base sphere and the control for its size.*

> **✅ Done**
> - Geometry rebuilds on radius change alone, stays centered at the origin, range 1,000 to 100,000 km (2026-09-14 to 09-16).

#### 02.2 · Base color, ambient light, display mode · 80%

*The planet's flat color, the ambient light and the display mode.*

> **✅ Done**
> - Base color, ambient and light direction controls, and a Shaded/Wireframe/Voxel display mode (2026-09-09).
>
> **📋 To do**
> - **❓ Color-picker theming.** Still native browser chrome. Keep native, use `react-colorful`, or hand-build.

#### 02.3 · Cube sphere · 70%

*The sphere built from six flat grids, one per cube face.*

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

*Generating terrain: noise types, the layer stack, and composable modifiers.*

#### 03.1 · Base noise types · 100%

*The base noise generators the terrain starts from.*

> **✅ Done**
> - Random, Perlin, Simplex and Voronoi, plus None. All verified against canonical sources rather than reproduced from memory, which caught a wrong constant (2026-09-14).

#### 03.2 · Multi-layer stack & blend modes · 100%

*Stacking noise layers and blending them.*

> **✅ Done**
> - Photoshop-style stack up to 16 layers: add, delete, drag to reorder, rename, per-layer visibility (2026-09-16 to 09-30).
> - Seven blend modes, verified against Gaea's Combine node docs (2026-09-16).
> - Multi-select with batch edit. Editing a control applies to every selected layer (2026-09-23).

#### 03.3 · Modifier architecture · 100%

*Optional modifiers that layer onto any generator.*

> **✅ Done**
> - **🧭 Modifiers are toggles, not types.** Domain warp, Octaves, Ridged and Terrace are independent toggles layered onto any base generator in Gaea's fixed order, rather than mutually exclusive types each secretly hardcoded to Perlin. Old saved layers migrate on load (2026-09-30).
> - **🧭 Per-layer Height is its own channel**, separate from Opacity and Blend Mode. Opacity governs the 2D composite; Height contributes to real elevation. See `ISSUES.md` for why they collapsed into one number at first.
> - Modifiers UI is one section of contained tabs, so enabling several does not produce a wall of controls (2026-09-30).

---

## Stage 04 · Terrain: Paint Authoring
▓▓▓▓▓▓▓▓▓░ 90%

*Authoring terrain by hand: the 2D canvas, the brush, and how strokes persist.*

#### 04.1 · 2D heightmap canvas · 95%

*The flat 2D map terrain is painted on.*

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

*The brush used to paint on that map.*

> **✅ Done**
> - Absolute brush with a strength slider, Photoshop-style hardness feather, correct radius scaling, whole-stroke polyline rendering, and correct wrapping across the seam (2026-09-16 to 09-22).
>
> **🐛 Issues to fix**
> - **Terrain still jagged, feather subtle.** 🟡 open, tabled by Dana until after erosion. Likely the sphere's mesh resolution. See `ISSUES.md`, 2026-09-22.

#### 04.3 · Paint persistence pipeline · 95%

*Saving and replaying paint so it survives a reload.*

> **✅ Done**
> - Per-layer ping-pong paint textures with Porter-Duff compositing, pole-snapped sampling, and full stroke history saved and replayed to reconstruct exactly (2026-09-16 to 09-22).
>
> **📋 To do**
> - **Live-test stroke save and load.** Built and passing checks, not yet confirmed by reloading.

---

## Stage 05 · Terrain: Displacement & Lighting
▓▓▓▓▓▓▓▓▓▓ 95%

*Turning the heightmap into visible relief, and lighting it.*

#### 05.1 · GPU heightmap → displacement pipeline · 100%

*Turning the heightmap into real surface displacement on the GPU.*

> **✅ Done**
> - Noise renders to a texture that the planet's vertex shader samples for displacement, with CPU readback available on demand (2026-09-14).
> - **🧭 Shape and elevation are separate channels.** Shape drives the 2D canvas and painting; elevation is a purely additive per-layer sum that drives real height. Stored as float so elevation can go negative (2026-09-24).
> - **🧭 Height is a percentage of its context**, not absolute scene units, so one value reads sensibly against both the planet's radius and the chunk's much smaller footprint (2026-09-24).

#### 05.2 · Surface normal / lighting · 90%

*How the surface is lit and shaded.*

> **✅ Done**
> - Analytic tangent basis, so the normal is smooth and independent of mesh resolution, perturbed by the heightmap's own gradient for fine detail (2026-09-16).
>
> **📋 To do**
> - **💡 Flat/faceted display option**, alongside Shaded and Wireframe. Wanted as a style choice, not built.

---

## Stage 06 · Project Persistence
▓▓▓▓▓▓▓▓▓▓ 95%

*Keeping a project between sessions, and undoing within one.*

🧭 Firebase (Auth and Firestore) rather than browser-only storage, anonymous now with real sign-in later. Painting is saved as a chronological stroke log rather than a baked image, which is what makes it retraceable and makes undo fall out almost free. Full reasoning in `ISSUES.md`.

#### 06.1 · Firebase setup & anonymous identity · 100%

*Connecting to Firebase and identifying each visitor without a login.*

> **✅ Done**
> - Project, SDK wiring and anonymous sign-in, verified against the Firebase console (2026-09-22).

#### 06.2 · Save/load, multi-project · 95%

*Saving and loading several named projects.*

> **✅ Done**
> - Named planets as a subcollection per user, with security rules, so several versions can be saved and switched between (2026-09-22).
> - Project Settings panel: inline-editable name, a list of saved planets to load or delete, new project, and a manual save (2026-09-23).
> - Projects are always named, never in an unnamed state.
> - Auto-save stays a debounce rather than a fixed timer, since a timer either saves needlessly or loses minutes of work right before a tick.
>
> **📋 To do**
> - **Live-test the multi-project flow** end to end.

#### 06.3 · Save/load, paint stroke logs · 90%

*Saving paint as a log of strokes.*

> **✅ Done**
> - Strokes recorded and replayed through the same path live painting uses, rather than a separate load-time renderer (2026-09-22).
> - **Fixed: replayed strokes didn't show until clicked.** A real ordering bug, fixed by reordering rather than adding a refresh signal. See `ISSUES.md`.
>
> **📋 To do**
> - **Live-test**: paint, reload, confirm it reconstructs identically.

#### 06.4 · Undo/Redo · 100%

*Stepping back and forward through paint strokes.*

> **✅ Done**
> - Cmd+Z and Cmd+Shift+Z plus Edit-panel buttons, rebuilding from the stroke log. Covers paint strokes only (2026-09-22 to 09-23).

---

## Stage 07 · Land Chunk
▓▓▓▓▓▓▓▓░░ 80%

*A detail view into one piece of the planet, flattened, beside the globe.*

A detail view into one piece of the planet, shown beside the globe, with a blocky or smooth render style. Syllabus-required, sequenced before Erosion at Dana's call.

#### 07.1 · Terrain patches · 95%

*Terrain split into patches, the unit both views are built from.*

🧭 The chunk is a terrain patch drawn flat: the same unit the planet is made of, not a separate pipeline sampling a shared map. A patch is a cube face, a rectangle on it, and a depth, with its own heightmap. Follows how globe renderers work, where the whole surface is tiles and detail comes from descending rather than from bigger textures. Sources in `REFERENCES.md`.

> **✅ Done**
> - The chunk reads its own patch, so its Resolution reaches real detail instead of enlarging a small window of a shared map (2026-10-13).
> - **🧭 Resolution and footprint are separate.** Resolution is how finely a patch's ground is measured; depth is which ground it covers (2026-10-13).
> - **Picking.** Double-clicking the planet chooses which piece the chunk shows, replacing a hardcoded spot (2026-10-13).
> - **The planet itself now renders as patches too** (`[B28]` in `ISSUES.md`), not just the chunk: camera-distance-based subdivision (CDLOD-style), per-patch baking, same-face seam balancing plus edge skirts. Built 2026-10-17, not yet visually verified by Dana. Cross-face seam balancing was built 2026-10-21 (untested). A patches-aware Wireframe mode is a known, deferred gap.
>
> **📋 To do**
> - **❓ Footprint control.** How much ground the chunk covers has no control in the panel yet. Naming and placement are Dana's call. Not the same as the gumball's zoom, which moves the camera.
> - **A patches-aware Wireframe overlay**, deferred, see `[B28]`. Cross-face seam balancing is built, awaiting Dana's test.
> - **`USE_PLANET_PATCHES` is back on** (2026-10-19), the near-black-render/freeze regression didn't reproduce once actually tested; see `[B28]`'s own notes. Fixed along the way: the chunk/planet light-direction mismatch, the Scene panel's too-dark defaults, and choppy loading (patch bakes now budgeted per frame).
> - **The patch seams** (`[B28]`): both causes fixed. A half-texel edge misalignment, and different vertex counts across an LOD boundary, the latter built in testable stages (Stage 1, the top edge alone, 2026-10-20; Stages 2+3, all four edges plus the corner case, 2026-10-20/21), verified watertight by an automated topology check across representative stitch-flag combinations. Still open: whether a patch should rebuild when a *neighbor's* depth changes later, not just on its own first build, Dana's call. See `[B28]` for the full technical detail.

#### 07.2 · Voxel meshing pipeline · 90%

*Turning terrain into blocky cube geometry for the land chunk.*

> **✅ Done**
> - **🧭 Cube/culled-face meshing, not Marching Cubes**, since the goal is a blocky look and Marching Cubes produces the opposite.
> - **🧭 Meshed on the CPU in a Worker**, so the main thread stays responsive. GPU compute deferred, as it would mean migrating the whole app's renderer.
> - **🧭 Column-based rather than a 3D grid.** With no caves, one height per column is a complete representation, which is square rather than cubic in cost and is what lifted the resolution ceiling (2026-09-23).
>
> **📋 To do**
> - **Editing**, digging and adding voxels live, remeshing only the changed region.
> - **⏸️ Greedy meshing**, deferred until performance calls for it.

#### 07.3 · Smooth render style · 100%

*Drawing the land chunk as a smooth surface.*

> **✅ Done**
> - **🧭 Voxel is a display style, not the chunk's only way to render**, so Shaded and Wireframe give a smooth continuously-displaced surface (2026-09-23).
> - Extruded into a solid slab rather than a floating sheet, with a base below zero so the surface does not z-fight against it (2026-09-23, 2026-10-13).

#### 07.4 · Viewport & lighting · 90%

*The planet and chunk views, the lighting, and the color ramp.*

> **✅ Done**
> - Side-by-side panes with a draggable split and a Planet/Chunk/Split control. Both stay mounted, so switching never rebuilds either scene (2026-09-23).
> - Radius and Size are one contextual slider that rebinds to whichever pane is in view (2026-09-24).
> - **🧭 The chunk shades through the planet's lighting model** rather than Three.js's standard material, so the Scene controls mean the same thing in both views and the intensity-rescaling hacks are gone (2026-10-13).
> - **Gradient color-ramp picker** (2026-10-20): a real multi-stop editor for the elevation ramp (`ui/panels/ColorRampEditor.tsx`), replacing the old fixed low/mid/high three-stop control, the Blender Color Ramp convention (drag a stop, click the bar to add one, delete the selected one), up to 8 stops total. Shared by the planet (old mesh and patches) and the land chunk alike, one ramp, same as before. See `ISSUES.md`.
> - **Delete UX fixed the same day** (Dana: "deleting needs to be by hitting delete (backspace) or dragging that color away"): the delete button alone wasn't enough. Added Backspace/Delete (a document-level listener, not the handle's own focus, since a click doesn't reliably focus a button in every browser) and drag-the-handle-away-from-the-bar (`DELETE_DRAG_DISTANCE`, the same convention Blender/After Effects use for removing a stop/keyframe), with a faded/shrunk handle while a drag is far enough to delete on release. The delete button itself stays too, not replaced.
> - **Pin-style handles, 2026-10-21**: the circular handles became Figma-style pins sitting above the bar, filled with each stop's own real color, doubling as the drag handle; clicking one (not dragging it) opens a native color picker for that stop directly.
> - **Five fixes from testing, same day:**
>   - The drag-away-to-delete pin used to dim and shrink mid-drag, then vanish abruptly on release, Dana: "would be better if it just disappeared (fade)." Now it tints with a warning-colored ring during the drag (no dimming, the real color stays visible) and only fades on the actual release-triggered removal, same fade applied everywhere a stop is deleted (drag-away, the list's delete button, Backspace).
>   - The color-code list's text didn't follow this design system's own font convention at all (`font: <weight> var(--font-size-sm) var(--font-ui)`, used without exception everywhere else), it used a monospace font with no explicit size, falling back to the browser default. Fixed to match exactly.
>   - The code format selector and color list now sit above the gradient bar, not below it.
>   - Clicking a row in the color list now opens that stop's own color picker directly, not just selects it.
>   - Switching the code format to RGB/HSL no longer repeats the format name in the code itself (e.g. `91, 159, 101`, not `rgb(91, 159, 101)`), the dropdown already says which format it is.
> - **Reorganized again, same day** (Dana: "it doesnt make sense for the base color to be separate from the rest... when ramp is active all colors should show as a part of it"): base color is no longer a standalone preview control above the list, it's just the list's own first row (position 0%), same template, same click-to-open-picker, as every stop. When "Color by elevation" is off, the ramp doesn't apply at all, so `ColorRampEditor` now takes a `rampActive` prop and renders *only* a plain base-color picker in that case, not the ramp machinery. The whole control (toggle, editor, randomize button) now lives in its own nested "Color" accordion inside Planet, not loose in Planet's own body.
> - **Two more from the same pass:**
>   - The format selector's own displayed value rendered in the browser's native text color instead of this design system's white, a real cross-browser `<select>` quirk affecting *every* dropdown in the app, not just this one, fixed at the shared `.ui-select` rule (`appearance: none` plus an explicit custom dropdown arrow, since that property removes the native one too), not patched locally.
>   - The position column had no label at all, Dana: "i'm also missing an indication for the elevation of the color." Added a small "Elevation" header above it.
> - **Scene section grouped** (2026-10-28): Light, Shadows, Shine, Grid and View, each under a bold title and a hairline divider.
> - **Walk mode, 2026-10-28:** long-press to walk (a still press of 250 ms walks forward, dragging then steers; a quick drag only looks), replacing click-to-walk; a Speed slider (×0.5 to ×5) under the gumball's Zoom, shown only while walking; the eye never sinks below the ground (`[B73]`).
> - **A column list of every color, plus pin-style indicators** (2026-10-21, Dana: "i would want to see all picked colors in a column with their color code," then, from a reference screenshot, "turn the color circles into ramp indicators, so they double as a color and adjusting the ramp... clicking on them the color picker should pop up"):
>   - New `.ui-ramp-list` below the bar: one row per color (base + every stop, ascending by position), each showing a swatch, its code (hex/RGB/HSL, picked via a shared format selector, `formatColorCode()`), and its position. Clicking a row selects that stop, same selection the bar's own pins use.
>   - The old plain circular handles are now Figma-style pins: a rounded-square head (filled with that stop's real color, not a generic indicator) with a small pointed tail touching the bar, sitting above it instead of hanging below. Selected pin gets an accent ring plus a light inset square.
>   - A plain click on a pin (distinguished from a drag by total pointer movement, `CLICK_MOVEMENT_THRESHOLD`) now opens that stop's own native color picker directly, via one shared hidden `<input type="color">` triggered programmatically, not a custom popup, the same real `<input>` `ui/UIElements.tsx`'s own `ColorPicker` already uses elsewhere. The earlier single "currently selected" `ColorPicker` above the bar stays too, now a secondary, always-available way to edit the same selection, not the only one.
>   - Also fixed in passing: `.ui-ramp-list-row`'s hover/selected background referenced an undefined `--color-input-bg` token (silently did nothing), corrected to the real `--color-input-fill`.
>
> **📋 To do**
> - **🧭 Build order, approved 2026-10-21.** Each step is tested by Dana before the next starts. Every new feature gets its controls in design-system components, and the noise menu gets new nested sections: Mask inside each layer next to Modifiers, Plateau at the Terrain level.
>   1. 🟡 **Finish the planet patches**: cross-face balancing, and screen-space-error detail with a Resolution bias and a triangle budget (`[B38]`, `[B39]`, `[S32]`). Built, awaiting Dana's on-screen test.
>   2. 🟡 **Layer masks** (in progress): grayscale mask with Source, Invert, Coverage %, Softness and a Shuffle button (built, untested), one mechanism for calm zones and merged terrain types (`[S31]`).
>   3. 🟡 **Bounded heights:** half built 2026-10-30: Randomize sets Height from frequency, a broad base plus masked layers (`[S35]`). Still to do: a smooth soft limit on total elevation, Randomize sets Height from frequency, a broad base layer plus a mask layer, and detail added by zoom depth against a fixed normalization total. Shape shifting a little with zoom is acceptable (Dana).
>   4. ⚪ **Plateau shaping**, modeled on Gaea's Clamp: Max level, Operation (Clamp or Clip) and Falloff, as a final step in its own Terrain-level section. Flat areas sit at a steady height so water later makes continents.
>   5. ⚪ **Real height scale:** Height as a percent of radius plus a separate Exaggeration dial, ramp meters use true relief.
>   6. ⚪ **Undo/redo last**, so every control is wired (`[S30]`). It tracks settings and the paint stroke log only, never baked heights or results, the way erosion data is handled.
>   7. ⚪ **Planet cast shadows last.**
> - **⚪ Cast shadows for the planet.** Land chunk side already built (`terrain.glsl`'s `heightmapShadow`, see `[B35]`). 🧭 Planned, not built, last in the build order above: reuse that march per patch, with the light converted into the patch's own flat frame (📚 Snyder and Nowrouzezahrai 2008). ⚠️ Shadows would stop at patch borders and ignore the planet's curvature, which could read as new seams, so judge by eye before considering a horizon map.
> - **⏸️ Camera auto-framing.** Not a priority, since the gumball's zoom compensates.
> - **🟡 Base color is now an ordinary ramp stop** (Dana, 2026-10-21: starts at 0 but can be dragged, "pretty standard"). The ramp is one list of equal stops (2 to 8, one color if just one is wanted via Base color). Base color is only the flat color used when Color by elevation is off. Old saves convert on load via `rampHasBase`. Built, not yet tested. Also: swatches have a minimum width and the elevation field hugs its number.
> - **🟡 From Dana's 2026-10-21 testing, all built, untested**, logged in `ISSUES.md`: Resolution seems fake past about 1024 (`[B45]`), the Frequency cap of 20 (`[B46]`), Resolution changes rebuilding the whole planet (`[B47]`), the mask problems (`[B48]`, redesigned) and tooltips (`[B49]`).
> - **🧭 Undo/redo for every action, not just paint strokes** (Dana, 2026-10-21: Cmd+Z must not leave a deleted ramp color gone). Agreed, not built: one shared snapshot history, see `[S30]` in `SPEC.md`. Actions that change the planet's look come first. Randomize and Shuffle are each one undo step. Last in the build order above, tracking settings and the stroke log only.
> - **🟡 Tooltips built** (2026-10-21, untested, `[B49]`): black through a new design-system token, wrapped, and kept inside the window by one shared placement function.
> - **🟡 Noise slider ranges widened, built** (Dana approved 2026-10-21, untested). Frequency 0.1 to 500 on a log scale, Octaves 1 to 12, Persistence 0 to 1.5, Lacunarity 1 to 6, Warp 0 to 10, Terrace 2 to 64, layer Height -10 to 10, seed unchanged at 0 to 1000. Rule from Dana: Randomize follows these ranges and is never hardcoded (`[S35]`). The Slider has a log scale option. Layer Height -10 to 10 is an unsourced audit recommendation, to revisit after the total is normalized. 🧭 Unit decision (Dana fine with it): a layer's Height has no unit today, so when the bounded-heights step is built it is shown as a percent of the planet's maximum elevation, -100 to 100.
> - **🟡 Noise engine built** (Dana, 2026-10-21, `[S36]`, untested): Hoskins' float-only hash replaces the sin-based one (constants typed from memory, to verify), octaves fade by sample spacing (`NYQUIST_FADE_MIN` 0.25 and `NYQUIST_FADE_MAX` 0.95 as tunable values, applied before the Ridged fold), and the sum is normalized by the full series so coarse octaves stay identical at every depth. The seed is now a whole-cell lattice shift, which fixed a float loss that may have caused some stair-stepping. No local origin per patch is needed at depth 8. Saved planets look different, accepted.
>   - ⚪ Second pass, approved: fade Ridged, Terrace, domain warp and Voronoi. Amplitude fade alone is not enough after a nonlinear step, so the plan fades the octave before it and softens step edges only as wide as the sample spacing (Terrace best supported, warp and Voronoi inferred, all tunable). Dana: no change to the intended hard look.
>   - Build order now: Dana tests this batch, then fixes, docs and a commit, then the second pass, the fractal type selector, bounded heights, plateau shaping, height in meters, undo/redo and planet shadows.
> - **🟡 Missing standard noise controls built** (Dana, 2026-10-21, untested): noise Offset, Stretch X, Y and Z, Voronoi Jitter and Distance, warp scale, warp octaves, and ridged Offset and Gain, each in the shared ranges table with tooltips. Rotation is skipped. A clamp on a layer's output belongs to the bounded-heights step.
> - **❓ Fractal type selector** (awaiting Dana's go; a setting inside the Octaves modifier, not a separate modifier: Octaves sets how many stacked copies there are, the type sets how they combine): Blender's Multifractal, Hybrid, Hetero terrain and Ridged multifractal recurrences are documented, and Hybrid and Hetero give smooth valleys and rough peaks, a regional variation from one control. Billow and Strata formulas are not documented, so they are left out. These types are unbounded and need renormalizing, which ties into the bounded-heights step.
> - **⚪ Audit the Erosion sliders' ranges** after this round (Dana, 2026-10-21). Not started.
> - **🟡 Mask redesign built** (Dana, 2026-10-21, untested, `[S31]`, `[B48]`): each layer owns its mask pattern (type, seed, frequency, with Coverage, Softness, Invert and Shuffle), there is no layer picker, and the Mask section left the noise menu. Several selected layers are edited together with the same values. Coverage is a percentile of the pattern on a 64 by 64 grid per cube face. Old masks migrate, taking the old source's type, seed and frequency but not its modifiers. ⚠️ The mask pattern has no octave fade, so a high mask frequency may shimmer at a distance.
> - **🟡 Design-system additions built** (2026-10-21, untested): a reusable popup, accordion tooltips and a mask icon. ⚪ A generic preview thumbnail is not built, since there is no per-layer picture to show and it needs its own render. ❓ Dana: do you want it as a later design-system item?
> - **🟡 Mask editing on the layer row built** (decided 2026-10-21, untested): a mask icon beside the eye, lit in the accent color when the layer has a mask, opens a popup (`ui/MaskControls.tsx`) with the mask pattern, Seed, Frequency, Invert, Coverage, Softness and Shuffle. The title names the layer, or says how many layers are being edited. The old source guard is gone, see `[B41]`. A group mask or mask layer may come later, see the ideas section.
> - **🧭 Height becomes meters** (decided 2026-10-21, `[S33]`): a max elevation in meters plus a display-only Exaggeration, replacing `[S15]` when the height scale step is built.
> - **🟡 Patch cache and refinement built** (`[B44]`, 2026-10-21, untested): hidden patches are cached, not discarded, a replaced patch stays drawn until its replacements are built, and merging back happens farther out than splitting. ⚠️ Risks: neighbors can differ by up to 3 depth levels while old patches are retiring (skirts should hide it, unseen), and at Resolution 2048 the working set exceeds the cache, so rotating still rebuilds. The over-budget distance lowering has no hysteresis.
> - **🟡 Planet plumbing built** (`[B45]`, `[B47]`, 2026-10-21, untested): every patch bake already passed its sample spacing, so the octave fade takes effect. A Resolution change refines or coarsens patches in place and a radius change still flushes. A patch bakes 65 samples until depth 5, then 129, then 257, within a texel cap (`PATCH_BAKE_SAMPLES_MIN`, `PATCH_BAKE_SAMPLES_MAX`, `PATCH_BAKE_GROW_FROM_DEPTH` of 6, cache cap 4 million texels), Dana's unsourced inference, so all tunable. Verified in a Node harness: no holes, 66 of 66 patches held on refine, nothing baked on coarsening. ⚠️ Risks: brief cracks mid-change and between neighbors at different depths (skirts only), and Resolution 2048 memory is bounded only by the triangle budget.
> - **🟡 Higher-resolution baking by depth** is built as part of the planet plumbing above. The mesh grid stays at most 64 vertices, so the extra samples sharpen lighting, color and bump, not geometry.
> - **⚪ Frustum culling for planet patches.** Only horizon culling is built, so patches outside the camera's view still build at full detail.
> - **⏸️ Patch-aware Wireframe** stays deferred (Dana, 2026-10-21: "we're doing shaded for now").
> - **🟡 Planet detail follows screen-space error, Resolution is a detail bias** (Dana, 2026-10-21), `[B38]`, `[B45]`, `[B47]`, `[S32]`: zoom sharpens automatically, the slider (0.25x to 8x, default 1x) pushes further where pixels warrant it, and zoomed out costs nothing. Replaced the uniform minimum floor, which forced up to 384 patches at startup. Built, untested. First in the build order above.
> - **🟡 Stale stitching fixed, awaiting test** (`[B39]`): a kept patch now rebuilds its geometry when its neighbors' detail changes (`planet/PlanetPatchRenderer.ts`). Cross-face balancing is still to build, not conditional.
> - **🟡 Ramp elevation in meters** (2026-10-21), built, not yet approved. Stops now show and accept elevation in m, calibrated to the terrain's real range times Height % of Radius/Size. ❓ Open, Dana's call: the result reads as hundreds of km because the terrain is drawn about 100× Earth's proportions. Either keep it literal, or adopt vertical exaggeration (📚 CesiumJS's convention: real elevations, visual stretch only) with a new max-elevation setting. Also blocked on `[B36]`/`[B37]` in `ISSUES.md`.
> - **🧭 Realistic planetary height scale** (Dana, 2026-10-21: the scale is too much to reflect a planet, so the noise must match). Direction: normalize all height noise to a planet scale to tame extremes (it looks like a virus), and give the planet large-scale variance with masks, plateaus and merged terrain types. Folded into build order steps 2 to 5 above. The terrain is drawn at about 100× Earth's relief ratio. 📚 Earth is about 0.14% and Mars about 0.6%. Sources in `REFERENCES.md`.
> - **🟡 Planet and Terrain merged into "Planet Terrain"** (Dana, 2026-10-21: "all terrain does is trigger the contextual left menu for noise gen terrain"). Built, not yet tested. The Terrain stage row is gone, and any click on the Planet Terrain header shows the noise controls and highlights it as the active stage. ❓ Terrain's Enabled toggle went away with its row. Whether it should come back, and where, is unconfirmed.
> - **~~❓ The ramp's position shows as a bare 0-100%, not a real elevation number~~** (superseded by the line above) (Dana, 2026-10-21: "how's % reflect elevation? i need actual numbers").
>   - That percentage is a fraction of the planet's real elevation range, but that range (`sharedUniformsRef.current.elevationMin/Max`) currently only exists inside `scene/SceneCanvas.tsx`, it was never plumbed up to the React UI layer (`ui/Panel.tsx`/`ui/panels/ColorRampEditor.tsx`) at all.
>     - Real next step: expose the live range up to the panel (the existing `getElevationRange()` imperative-handle method already returns it, the gap is wiring it into UI state, not computing it fresh), then decide the actual open question, Dana's call: show the raw dimensionless elevation value, or convert it into a real physical unit (height is already tracked as a % of context elsewhere in this app, `heightScale`/`radius`/`effectiveHeightScale`, see `voxel/landChunk.ts` and `scene/SceneCanvas.tsx` for the existing conversion).
>   - Not started.

#### 07.5 · Shared gumball · 95%

*One navigation widget that drives one or two views.*

> **✅ Done**
> - One instance driving one or two cameras. Click a pane to target it, shift-click to drive both. Each target carries its own reference distance, so zoom scales correctly for either scale (2026-09-23).

---

## Stage 08 · Erosion Simulation
▓▓▓▓▓▓▓░░░ 70%

*Wearing the terrain down over time, as the first real simulation in the pipeline.*

Hydraulic and thermal erosion over time, with a way to scrub its progression. Syllabus-required.

> **✅ Done**
> - **Grid-based** `[S25]`, following Mei, Decaudin and Hu, since droplets need scattered writes that WebGL handles badly.
> - **Manual trigger**, a Run button rather than live.
> - **Real controls** over water, sediment rates and duration. Not a black box.
> - **Checkpointing and scrubbing**, both a basic run and recorded-frame checkpoints to scrub through, engine-side.

> **📋 To do**
> - **Generalize as a reusable engine** `[S??]`, parameterized by intensity, duration, location and direction, so Stage 13 reuses it rather than needing separate hand-built disaster effects. The core solver exists; this reuse hasn't been built or exercised yet.
> - **Thermal erosion.** Hydraulic first, thermal second, decided 2026-09-23; thermal itself isn't built.
> - **Timeline** `[S26]` `[S27]`: the actual bottom-strip UI, a zoom-aware unit ladder and cache bar, scrubbing the recorded frames the engine already supports rather than reversing the simulation. In progress now.

---

## Stage 09 · Climate
░░░░░░░░░░ 0%

*Temperature, humidity and wind, which Biome needs before it can mean anything.*

🧭 Temperature, humidity, precipitation and wind across the terrain. The input Biome needs to mean anything, and a named stage in real tools and literature rather than invented here. Sequenced after Erosion, because rain-shadow effects depend on the eroded shape.

> **📋 To do**
> - Everything.

---

## Stage 10 · Biome
░░░░░░░░░░ 0%

*Classifying each point of the terrain into a biome from its own conditions.*

🧭 Biome classification from elevation, slope and climate, the way Minecraft's multi-noise source or a Whittaker diagram does. Split from the old combined Color/Biome stage once color turned out to need its own shader.

> **📋 To do**
> - Everything.

---

## Stage 11 · Color Texturing
░░░░░░░░░░ 0%

*Terrain color as a shader reading height, climate and biome.*

🧭 Terrain color as a shader reading height, climate and biome, not a flat painted value. Surfaces as a general setting rather than a pipeline row, alongside lighting and planet controls. The planet's flat base color is the placeholder for it.

> **📋 To do**
> - Everything.

---

## Stage 12 · Population
░░░░░░░░░░ 0%

*Placing trees, rocks and settlements by rule rather than by hand.*

🧭 Rule-driven placement of trees, rocks, water and eventually settlements from the terrain's own data, typically by Poisson-disc sampling for natural spacing. Not hand-painted. Depends on Biome.

> **📋 To do**
> - Everything.

---

## Stage 13 · Events / Natural Disasters
░░░░░░░░░░ 0%

*Floods, droughts, eruptions and earthquakes, each a run of the erosion engine.*

🧭 The direct answer to the project's concept: very different worlds, each with natural disasters you can generate. Each disaster is a parameterized run of Erosion's engine rather than its own effect. A flood is extreme localized hydraulic erosion; drought is wind and thermal; an eruption is radial uplift; an earthquake is a fault discontinuity. Blocked on Stage 08's engine.

> **📋 To do**
> - Everything.

---

## Stage 14 · Design System & UI Polish
▓▓▓▓▓░░░░░ 50%

*Tokenizing the scattered placeholder values, and the interface polish pass.*

#### 14.1 · Design-system / config tokenization · 0%

*Moving scattered design values into named tokens.*

> **📋 To do**
> - **Centralize placeholder values.** Colors, lighting, camera distance and the rest are scattered inline, each flagged `TODO(DS)`. Tracked since 2026-09-09, not urgent.

#### 14.2 · Adjustable control panel · 100%

*Side panels whose width the user controls.*

> **✅ Done**
> - Both panels resize by dragging their inner edge, and width only ever changes on an explicit drag rather than with content (2026-09-30).

#### 14.3 · Wireframe overlay accuracy · 0%

*Making the wireframe overlay follow the displaced surface.*

> **📋 To do**
> - **Overlay doesn't track displacement.** It is built from undisplaced geometry, so it does not follow the real terrain. Fix is to give it its own shader sampling the same heightmap.

#### 14.4 · Icons and typography · 50%

*Real icons in place of emoji, and the type scale.*

> **✅ Done**
> - **Emoji icons replaced** (🎲 Randomize, 🎨 Randomize colors, 👁 visibility) with real flat SVG icons, no library (2026-10-14).

> **📋 To do**
> - **Organize typography.** Not yet scoped, needs its own plan before it's buildable (Dana, 2026-10-13: "typography needs organizing for sure").

#### 14.5 · One panel hierarchy · 100%

*Every panel built the same way (`[S47]`).*

> **✅ Done**
> - **Sections:** every section is an accordion, closed by default; on/off switches sit in headers (Atmosphere, Water, Moons, each modifier) or on a title line (Grid); the modifier tabs became nested sections; nested sections lost their left line (2026-10-30).
> - **New design-system pieces:** the hue slider (Shadow hue, styled as the color ramp's bar, on its own row), the lock icon (at the row's edge), the bare switch and the title line with a switch; color swatches aligned on the right; Clouds and Moons header switches; each moon's own Texture, Halo and Inner glow, inline when there is one moon (2026-10-30).
> - **Navigation:** Space + drag pans in both views, beside Shift + drag (2026-10-30).

---

# 💡 Potential Features / Ideas

*Not scheduled. Reference material so it does not live only in chat.*

- **Voxel rendering generalized beyond the chunk**, including the planet itself.
- **Heightmap resolution as a user control.** Currently one fixed size for the whole shared pipeline.
- **Topography-line overlay**, contour lines on the surface as a guide. Standard in this category of tool.
- **❌ No node-based UI.** Explicit decision. The panel structure is correct; not building a node graph like World Machine or Gaea.
- **Group mask.** Layers would gain groups: a folder row in the layer list that layers can be dragged into. The group row gets its own mask icon, opening the same mask popup, and the mask applies to everything inside the group. 📚 Photoshop's convention, with sources in `REFERENCES.md`. Not scheduled.
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
- Color became its own shader-driven stage.
- A Timeline, playing whichever stages are enabled.

**❓ Still open**
- **Theme generation from continuous axes.** Wetness, tectonic activity, temperature and erosion age mapped to parameter ranges by one formula, so desert or volcano are labelled regions of one space rather than hand-authored presets. The axis set and the formulas are not designed.
- **📌 Research other coloring techniques and methods for 3D world building** (Dana, 2026-10-21), so there are more interesting options than one elevation ramp. Research first, from real tools and papers, before proposing any. Not started.
- **⚪ Saved planet setups** (Dana, 2026-10-21: "desert planet, jungle planet, gas planet... procedurally created"). A setup is one saved bundle of settings (noise layers, height, color) that can be loaded in one click, and the generated ones come from the same "continuous axes" idea in the line below, not hand-authored. ❓ Whether to save color palettes as their own thing first: a palette is just a named ramp (the same stop list the ramp editor already edits), so a setup would point at one. Recommended yes, small and independent, once the ramp has settled. Not designed.
- **Rule-driven placement** of water and vegetation, once Biome exists.
- **Gating**, disabling a stage until its input exists.

---

## Narrative Ideas

*Early brainstorm, 2026-09-02. Storytelling as another procedural system rather than authored content.*

- **Population growth.** Place population, choose a starting development level, let it progress along the timeline.
- **Apocalyptic scenarios**: nuclear strike with configurable radius and fallout, meteor impact, climate change as slow degradation, ice age, volcanic eruption.

---

# 🧭 Code index

*The code map moved to `CODE-INDEX.md`, which is updated with every milestone and before every handover.*

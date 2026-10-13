# Procedural World Building

`Last updated: 2026-10-13`

Cornell Tech, DESIGN 6197/4197, a procedural planet-building tool: paint and generate terrain on a sphere, built with Three.js + GLSL. This README is written for anyone with zero context on the project, what it is, and where everything lives. Kept up to date as the project changes, not a dated log.

This will eventually grow into the fuller README the course's final deliverable requires (conceptual premise, procedural systems/algorithms used, AI-assisted process, run instructions, credits), for now, at build stage, it covers what actually exists.

![The planet on the cube sphere, with the pipeline-stage menu down the left panel.](Screenshots/2026-10-13-cube-sphere-terrain.png)
*Current state, 2026-10-13.*

**The other docs, and when to open them:**
> 🗺️ **`ROADMAP.md`**, current build status, organized by stage/feature. Start here to see what's done and what's next.
>
> 📐 **`SPEC.md`**, what the system is: architecture and the decisions that define it.
>
> 🐛 **`ISSUES.md`**, what is broken, what was broken and why.
>
> 📅 **`WEEKLY-PUSHES.md`**, the syllabus's graded weekly report, chronological.
>
> 📚 **`REFERENCES.md`**, every outside source the project relies on, grouped as conceptual, visual and computational.
>
> ⚙️ **`CLAUDE.md`**, working rules for how Dana and Claude collaborate on this repo (not project content).

---

## 📦 Repo structure

*Everything lives at the root, since this repo doubles as an Obsidian vault.*

| path | holds |
|---|---|
| `app/` | the Vite, React, TypeScript and Three.js project |
| `Screenshots/` | shots linked from the docs, named by date |
| `.obsidian/` | vault config. Any `.md` anywhere in the repo is part of it, with no sync step |
| `firebase.json`, `.firebaserc`, `firestore.rules` | Firebase config and security rules, deployed via its CLI |
| the `.md` files | see the doc map above |

---

## 🧩 Code organization conventions

*How the app is split up, and the rules in force.*

The app follows patterns from Dana's own `active-geometry-project`, not the class repo's Entity/World OOP pattern (tried and abandoned early, see `ISSUES.md`).

### 🗂️ File-by-feature, not file-by-component
One file per feature/concern, not one file per individual UI component, and not large multi-purpose files either. `active-geometry-project` groups related small pieces together by feature/UI-area (e.g. one file holds several related slider/panel-building functions) rather than splitting each small component into its own file/folder, that's followed here too, overriding the class's usual one-component-per-file-structure convention.

Current top-level folders under `app/src/`:
- **`ui/`**, React-rendered UI: `UIElements.tsx` (`Slider`, `ColorPicker`, `Toggle`, `Select`, `Accordion`, grouped together), `Panel.tsx` (left panel), `RightPanel.tsx` (right panel's tab bar), `NoisePanel.tsx` (the Noise tab's content).
- **`scene/`**, everything Three.js-scene-related that isn't the planet itself: `scene.ts`, `renderer.ts`, `camera.ts`, `controls.ts`, `grid.ts`, `SceneCanvas.tsx` (the React wrapper), `sceneControls.ts` (`useSceneControls`, the scene-wide lighting/grid state; distinct from `planet/planetControls.ts`, which is the planet, not the scene around it). `Gumball.tsx` lives here too, not in `ui/`, it's a plain imperative-DOM class driven by the render loop, not a React component, so it's grouped with the other Three.js-coupled files it's actually coupled to; it drives a list of 1-2 camera targets (`setTargets()`), not one fixed camera, so the same instance can be shared/retargeted across viewports (2026-09-23). `sharedGumball.ts` (`useSharedGumball`, the single shared instance driving whichever viewport pane(s) are currently selected; click a pane to select it, shift+click to add another).
- **`planet/`**, the planet mesh/shader and its own appearance state, split out of `scene/` (2026-09-22) once "planet" and "the scene around it" turned out to be two UI-distinct concerns: `mesh.ts` (`planet`/`planetGeometry`, the `SphereGeometry` + `ShaderMaterial`, was `scene/planet.ts`), `planetControls.ts` (`usePlanetControls`, radius/base color/display mode, plus the km↔scene-unit conversion).
- **`map/`**, the heightmap render-to-texture pipeline and its flat 2D preview, kept separate from both `scene/` and `planet/` since it's conceptually its own subsystem (produces a texture *consumed by* the 3D scene), see `ISSUES.md`, 2026-09-22, for why it isn't nested under `planet/` despite painting the planet's surface: `heightmap.ts` (`HeightmapPipeline`, the single shared instance for the whole app, owned by `SceneCanvas`'s renderer; also owns the per-layer paint textures), `MapView.tsx` (the 2D preview canvas, captures paint pointer input, forwards strokes to the shared pipeline), `noiseLayers.ts` (`useNoiseLayers`, the layer stack: add/delete/reorder/update), `2Dbrush.ts` (`useBrush`, brush radius/value/feather, the stroke history, undo/redo).
- **`voxel/`**, the land-chunk detail view (Stage 07): `chunkGrid.ts` (shared resolution/indexing constants + `sampleChunkHeight()`, read by both render styles below so they never drift apart), `density.ts` (`buildTestChunkDensity`, the solid/empty voxel grid, sampled from the existing heightmap), `meshWorker.ts` (cube/culled-face meshing, runs in a Web Worker), `smoothMesh.ts` (`buildSmoothChunkGeometry`, the alternative smooth, continuously-displaced render style, computed on the main thread), `landChunk.ts` (`useLandChunk`, view mode, resolution, split ratio, orchestrates generation), `LandChunkCanvas.tsx` (the second viewport, mirrors `SceneCanvas.tsx`'s renderer/camera/controls setup), `ViewModeControl.tsx` (the Planet/Land Chunk/Split button).
- **`firebase/`**, named after the actual technology, not a vague role, so there's no ambiguity (it's not "backend", there's no server, this is client-side code talking to Firebase's cloud services directly): `client.ts` (SDK init/the live Firebase client instance), `currentUser.ts` (`useCurrentUser`, anonymous auth), `storage.ts` (save/load, multi-project).
- **`projectSettings/`**, save/load/rename/delete/new/reset for the multi-project ("planet") model: `saveProject.ts` (`useSaveProject`, current project id/name, the project list, the load-on-mount and debounced-autosave effects, new/reset/select/save/rename/delete handlers; naming is inline-editable, not a separate prompt-based rename flow). Separate from `firebase/` since `firebase/` is the technology layer (talks to Firestore) and this is the feature built on top of it.
- **`shaders/`**, GLSL files, created once there's an actual shader to put in it, not scaffolded empty ahead of need.

### 🧵 `App.tsx` is a composition root, not a feature owner
`App.tsx` only calls each feature's hook and wires the results into JSX props, it never holds a feature's `useState`/`useEffect`/handler logic directly. That was violated once (2026-09-22, lighting, planet appearance, layers, brushing, and project persistence all accumulated as loose state directly in `App.tsx` until it became an unreadable five-feature monolith) and fixed by extracting `useSceneControls`, `usePlanetControls`, `useNoiseLayers`, `useBrush`, and `useSaveProject` into their own feature-scoped files, each new feature's state gets its own hook file in that feature's folder from the start, rather than living in `App.tsx`. See `ISSUES.md` for the incident and `CLAUDE.md` for the related process rule.

### 🎨 Styling: one CSS file
`app/src/design.css` is the single source of truth, design tokens, base layout, and every component's styling rules, imported exactly once at the app's entry point. No per-component stylesheets. Includes the actual licensed Helvetica font files ported from `active-geometry-project` (`app/public/fonts/`), without these, the UI silently falls back to a generic system sans-serif and nothing visually matches.

### 🧮 Shaders
Mesh-based Three.js (real `SphereGeometry`), not raymarching, GLSL shaders are still used, just applied to real mesh geometry via `ShaderMaterial` (see `ISSUES.md` for why raymarching was considered and rejected). Shader source loads via Vite's built-in `?raw` import suffix (no `vite-plugin-glsl` dependency added, revisit only if multiple shaders need to share GLSL code via `#include`). `heightmapBrush.vert.glsl` is a shared full-screen-quad pass-through used by multiple render-to-texture passes, named to reflect that rather than one specific feature.

### 📐 TypeScript conventions
All `.ts`/`.tsx` files use `.tsx`, even with no JSX currently, so nothing needs renaming later if JSX gets added (decided 2026-09-09).

> 🟡 **Still undecided:** the pure-logic `scene/` files with no JSX at all (`scene.ts`, `renderer.ts`, `camera.ts`, `controls.ts`, `grid.ts`, `planet.ts`) haven't been renamed to `.tsx` to match, open whether they should be for total consistency, or stay `.ts` since they'll structurally never contain JSX.

### 🏷️ Placeholder values
Arbitrary values with no design rationale yet (colors, lighting, radius, etc.) are flagged inline with `// TODO(DS): ...` comments, greppable, tracked for an eventual design-system/config-tokenization pass (see `ROADMAP.md`, Stage 14).

Current implementation state and progress live in `ROADMAP.md`, not here.

---

## 📚 References

*Sources this project builds on.*

Third-party reference code/algorithms used directly (not original work), credited here, and verified against the actual canonical source before use, not reproduced from memory (see `CLAUDE.md`'s working rules).

- **3D Perlin noise** (`app/src/shaders/noise.glsl`, `perlinNoise3D`, "cnoise"), Stefan Gustavson; permutation/gradient ideas: Ian McEwan of Ashima Arts. MIT license. Source: [github.com/stegu/webgl-noise](https://github.com/stegu/webgl-noise), `src/classicnoise3D.glsl`. Verified 2026-09-14, an earlier transcription had the wrong constant in `permute()` (`+1.0` instead of `+10.0`), caught by this verification.
- **3D Simplex noise** (`app/src/shaders/noise.glsl`, `simplexNoise3D`, "snoise"), Stefan Gustavson / Ian McEwan of Ashima Arts. MIT license. Source: [github.com/stegu/webgl-noise](https://github.com/stegu/webgl-noise), `src/noise3D.glsl`. Verified 2026-09-14; reuses `permute4` from the Perlin entry above.
- **fBm (fractal Brownian motion)** (`app/src/shaders/heightmap.frag.glsl`, `fbm3D`), the standard octaves/persistence/lacunarity summation loop, verified against [thebookofshaders.com/13](https://thebookofshaders.com/13/), 2026-09-14. Applied to `perlinNoise3D` above.

## 🌍 Inspiration / Further reading

**🧭 Gathered specifically in response to class feedback that the project reads more like 3D terrain software than a procedural *system*** (2026-09-30 → 2026-10-07), not code used in this project (unlike the References above), systems/talks/articles/conventions referenced while planning the resulting restructure (new Climate/Biome/Color/Population/Events stages, the left-panel pipeline menu, Erosion-as-reusable-engine). Full discussion and the decisions made from it in `ROADMAP.md`'s "🧭 Procedural System Feedback, and the Resulting Restructure" section.

- **[World Machine](https://world-machine.com/)**, node-graph terrain tool; changes upstream automatically recompute everything downstream live. The reference for "genuinely sequential/causal pipeline stages," not parallel independent panels. Its own documentation is also the source for naming the new Climate stage, below.
- **[Gaea docs](https://docs.quadspinner.com/Guide/)** (QuadSpinner), already this project's cited source for its blend-mode/Combine-node conventions. See also its [graph/node-category docs](https://docs.quadspinner.com/Guide/Graph/Graph.html).
- **[World Machine, climate/Wetness Selector documentation](https://help.world-machine.com/?p=92)**, confirms "Climate" (not Atmosphere/Weather) as the established name for the rainfall/humidity/wetness pipeline stage, sequenced after erosion, before biome.
- **[AutoBiomes (paper)](https://cgvr.cs.uni-bremen.de/papers/cgi20/AutoBiomes.pdf)** and **[a multi-biome procedural landscape pipeline](https://cgvr.cs.uni-bremen.de/theses/finishedtheses/multibiom/)**, both name and sequence a "Climate" phase after terrain/erosion and before biome classification, confirming the stage order adopted here (Terrain → Erosion → Climate → Biome).
- **[Sebastian Lague, Hydraulic-Erosion](https://github.com/SebLague/Hydraulic-Erosion)** (MIT license), the most-copied reference implementation of droplet-based hydraulic erosion; also see his [itch.io demo/writeup](https://sebastian.itch.io/hydraulic-erosion). Candidate source for Stage 08, which is now also the basis for Stage 13 (Events/Natural Disasters), see ROADMAP.
- **[Sebastian Lague, Procedural Planets](https://www.youtube.com/watch?v=QN39W020LqU&list=PLFt_AvWsXl0cONs3T0By4puYy6GM22ko8)** (YouTube playlist), noise layering → biomes → water, close to this project's own scope end-to-end.
- **[Red Blob Games, Polygonal Map Generation for Games](https://www.redblobgames.com/maps/polygon-map-generation/)**, biome/moisture/elevation classification, river placement.
- **[Minecraft Wiki, Noise generator](https://minecraft.fandom.com/wiki/Noise_generator)**, a real production biome system: 5 parameters per location (temperature, humidity, continentalness, erosion, weirdness) matched against each biome's ideal values, since 1.18.
- **Sean Murray, GDC, "Building Worlds Using Math(s)" / "Continuous World Generation in No Man's Sky"**, seed/theme-driven generation producing wildly different but coherent worlds. On GDC Vault; no single stable direct link found, search there.
- **Master-detail UX pattern** (confirmed as an established, named pattern for complex navigation, accordions are a recognized master-pane variant within it), the basis for the new left-panel pipeline-stage menu; see ROADMAP for the specific Unity Inspector precedent used for its per-item quick-settings.

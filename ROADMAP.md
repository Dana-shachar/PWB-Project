# Roadmap / Project Log

The main doc for planning and progress tracking on Procedural World Building — where work picks up from without needing to scan for context each time. New entries are added at the top, dated. (The syllabus's graded Weekly Push reports live in `WEEKLY-PUSHES.md`; technical decision *rationale* lives in `ISSUES.md`; external-facing structure/conventions reference lives in `README.md`.)

---

## 2026-09-09

### Purpose of this section
This is the main doc for tracking progress and planning — updated as work progresses, so Claude (or Dana) can pick up where things left off without scanning for context each time. `README.md` is the external-facing reference (repo structure, code-organization conventions, written for anyone with zero context on the project); `ISSUES.md` holds the *why* behind technical decisions; `WEEKLY-PUSHES.md` holds the syllabus's graded weekly progress reports; this file is where planning happens and progress gets tracked — current implementation state, staged plans, feature ideas.

### Current implementation state (`app/`)
Vite + React + TypeScript + Three.js app — **running and tested in-browser** (`npm run dev`, http://localhost:5173/). A blue placeholder-colored planet sits on a grid, orbit-controllable, with a left-side control panel (sections: Scene controls, Planet controls) and a top-right gumball (orientation axis indicator + zoom slider + view presets + reset), all live-wired to React state in `App.tsx`.

Files, all under `app/src/`:

- `App.tsx` — owns all settings state (radius in km, base color, ambient light, light X/Y, grid divisions), renders `Panel` + the viewport, in a flex layout (`app-layout`/`app-viewport` in `design.css`) so the 3D view centers on the actually-visible area next to the panel, not the whole window.
- `design.css` — the single CSS source of truth (see README.md's code-organization section) — design tokens, base layout, and every component's styling, including the actual licensed Helvetica font files ported from active-geometry (`app/public/fonts/`, loaded via `@font-face` — without these, everything silently falls back to a generic system sans-serif and nothing matches active-geometry's real look).
- `scene/` — `scene.ts`, `renderer.ts`, `camera.ts` (exports `DEFAULT_CAMERA_DISTANCE`, bumped from active-geometry's 80 to 200 — 80 was calibrated for small CAD shapes, not a 20-unit-radius planet), `controls.ts`, `grid.ts`, `planet.ts` (+ `planetGeometry()` split out for cheap radius-only rebuilds), `SceneCanvas.tsx` (the React wrapper — mounts everything in a `useEffect`, reactive per-prop effects for radius/grid-resolution/lighting-and-color, render loop, `ResizeObserver`), `Gumball.tsx` (the orientation/navigation widget — see below).
- `shaders/vertex.glsl` / `shaders/fragment.glsl` — the planet's shader pair; generic basic-lit shading, not planet-specific.
- `ui/` — `UIElements.tsx` (`Slider`, `ColorPicker` — generic, feature-grouped, not split per-component), `Panel.tsx` (the sectioned control panel).

`app/src/engine/Entity.ts` (an early, abandoned attempt at the class's Entity/World OOP pattern) was removed early on — not part of this project's architecture. See `ISSUES.md` (2026-09-02 entry) for why.

**Bugs found and fixed along the way** (see `ISSUES.md` for the technical detail on the trickier ones): a real StrictMode-related leak that duplicated the grid on resolution change (cleanup was tearing down a stale closure reference instead of the ref's current value); the planet rendering off-center (canvas was full-bleed behind the panel — fixed via the flex layout above); and the gumball's axis indicator not responding to drags directly on its lines (a `pointer-events` cascade issue — the container needed to be click-through with only its actual controls opted back in, not just the SVG).

### Plan / next steps, in order
1. ~~Slider UI component~~ — **Done.**
2. ~~Wire up the dev server~~ — **Done.**
3. ~~Sectioned control panel~~ (Scene controls: lighting, grid resolution; Planet controls: radius, base color) — **Done**, moved ahead of the gumball per Dana's request.
4. ~~Gumball~~ — **Done**, including debugging the pointer-events issue above.
5. **Noise generation** — procedural terrain height via noise functions (Session 3, Sep 9 class assignment). Computed via the already-agreed GPU-heightmap-texture approach (fragment shader → render target texture, sampled by the planet's vertex/fragment shaders for displacement + coloring; CPU reads back specific texels on demand for agent/road placement rather than duplicating the algorithm — see `ISSUES.md`, 2026-09-02 entry, for the full approach). **Not started.**
6. **2D mapping / texture creation** — the professor is using 2D maps to generate different textures from the noise data (biome-style texturing). Tied to item 5 above. **Not started.**
7. **Erosion simulation on a timeline** — hydraulic/thermal erosion applied to the terrain over time, with a way to scrub/visualize its progression rather than a single static end state (assigned for the Sep 16 class — "Map simulations - Erosion simulation - Biomes" per the syllabus). **Not started.**
8. **Paint-like board for user-authored noise** (Dana's own idea, not a class assignment) — a canvas/paint UI letting the user draw/influence their own custom terrain noise, rather than relying purely on procedural randomness. **Not started, concept stage.**
9. **Color picker refinement** — currently a plain native `<input type="color">` (works, follows the real swatch-opens-picker convention, but the picker panel itself is generic OS/browser chrome, not themed to match the app). Open decision from earlier discussion, not yet made: keep native, add a small dependency (e.g. `react-colorful`) for a themed picker, or hand-build one. **Not started.**
10. Design-system/config tokenization pass for the various `TODO(DS)` placeholder values scattered through the code (arbitrary colors, light direction, ambient level, planet radius/segments, grid size, camera distance, the km-to-scene-unit conversion). **Not started**, tracked as an open item (see `ISSUES.md`, 2026-09-09 entry).
11. Make the control panel adjustable/flexible (e.g. resizable width, possibly collapsible) rather than its current fixed `max-width`. Dana's explicit call to defer this — noted so it doesn't get lost, not urgent. **Not started.**

## 2026-09-02

### 1. Project setup
- Set up the project: a Three.js canvas, 3D view, 3D grid.
- Use PHASE as a base (active geometry project).

### 2. Basic structure
- Decide on basic structure — side menu or not?
  - If so: are all functions available there, or spread out / divided into stages (basic world builder first, then continue to more detailed features once complete)?
- Cover all setup needed from the syllabus: terrain, plants, water, shaders.

### 3. Procedural narrative
Idea: insert storytelling into the builder — since this is a procedural building class, the narrative should also be procedural. Directions to explore:

- **Population growth** — choose an area to place population, let the project run and observe how it grows/develops. Choose their starting development level (cavemen, agricultural society, medieval, etc.) and let them progress along a timeline.
- **Apocalyptic scenarios**:
  - Nuclear bombing — destroys wide areas of the planet; configurable destructiveness (radius, number of bombs, destroyed areas, post-destruction radiation).
  - Meteor / space-related disaster.
  - Climate change / global warming — slow, gradual destruction.
  - Ice age.
  - Volcanic eruption.
  - Etc. — will keep adding as the project develops.

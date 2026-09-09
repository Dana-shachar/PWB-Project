# Roadmap / Project Log

The main doc for planning and progress tracking on Procedural World Building — where work picks up from without needing to scan for context each time. New entries are added at the top, dated, so this doubles as the weekly project log required by the syllabus. (Technical decision *rationale* lives in `ISSUES.md`; external-facing structure/conventions reference lives in `README.md`.)

---

## 2026-09-09

### Purpose of this section
This is the main doc for tracking progress and planning — updated as work progresses, so Claude (or Dana) can pick up where things left off without scanning for context each time. `README.md` is the external-facing reference (repo structure, code-organization conventions, written for anyone with zero context on the project); `ISSUES.md` holds the *why* behind technical decisions; this file is where planning happens and progress gets tracked — current implementation state, staged plans, feature ideas.

### Current implementation state (`app/`)
Vite + React + TypeScript + Three.js app, scaffolded but **not yet wired up or tested in the browser** — nothing has been run via `npm run dev` yet, so none of this is confirmed working end to end.

Files that exist so far, all under `app/src/`:

- `scene/scene.ts` — plain `THREE.Scene` instance (no params needed).
- `scene/renderer.ts` — builds the `WebGLRenderer` given a canvas (antialiasing on, pixel ratio set). Sizing/resize handled elsewhere.
- `scene/camera.ts` — builds the `PerspectiveCamera`, positioned per active-geometry-project's defaults (distance 80, split evenly on x/y/z, looking at origin).
- `scene/controls.ts` — builds `OrbitControls` with active-geometry-project's config (damping 0.05, LEFT=rotate/MIDDLE=dolly/RIGHT=pan).
- `scene/grid.ts` — builds a plain `THREE.GridHelper` (size 200, divisions 50 by default) — not the shader-based grid from active-geometry, since this project isn't raymarching (see `ISSUES.md`).
- `scene/planet.ts` — builds the planet: `SphereGeometry` (radius 20, 64×32 segments, all placeholder values — see `TODO(DS)` comments) + a custom `ShaderMaterial` using `shaders/vertex.glsl` + `shaders/fragment.glsl` (basic diffuse/Lambertian lighting, no terrain/noise yet).
- `scene/SceneCanvas.tsx` — the React wrapper: mounts a `<canvas>` via ref, builds everything above inside a `useEffect` (never React state, per the class's React↔Three.js convention), runs the render loop, handles resize via `ResizeObserver`, disposes everything on unmount.
- `shaders/vertex.glsl` / `shaders/fragment.glsl` — the planet's shader pair; generic basic-lit shading, reusable by future objects, not planet-specific despite living alongside the planet work.

**Still needed before anything is visible:** `App.tsx` needs to render `<SceneCanvas />` instead of the current Vite template, and `index.css`/`App.css` need the old template's centered/max-width layout replaced so the canvas actually fills the viewport. This hasn't been done yet — it got deferred while UI-component work (the slider) took priority.

`app/src/engine/Entity.ts` (an early, abandoned attempt at the class's Entity/World OOP pattern) has been removed — not part of this project's architecture. See `ISSUES.md` (2026-09-02 entry) for why.

### Plan / next steps, in order
1. **Slider UI component** — a blended component: a visible draggable range track + an editable/scrubbable number field, wired together. Ported from two separate patterns in `active-geometry-project`'s `js/uiDesign.js`: `addSlider` (the range track) and `numInput`/`makeScrubber` (the click-drag-to-scrub, click-to-type text field). Goes in a shared `app/src/ui/UIElements.tsx` file (feature-grouped, not its own component folder), first used for planet radius in km (a narrative/fictional-scale value, mapped internally to the small render-scale radius the scene actually uses). **In progress.**
2. **Wire up the dev server** so Dana can actually test in-browser — includes finishing the `App.tsx` + CSS wiring noted above as a prerequisite. **Not started.**
3. **Gumball** — port the orientation/navigation widget from `active-geometry-project`'s `js/gumball.js`, as its own `app/src/ui/Gumball.tsx` file. Reuse the existing camera/OrbitControls calibration logic as-is rather than re-deriving it (it was hard-won in that project). Reposition to **top-right** of the viewport (active-geometry has it bottom-left, tucked under its left shape-library panel — doesn't fit here since this project's single control menu is going on the left instead). A detailed plan will be presented before implementation starts. **Not started.**
4. Broader control-panel structure (scene controls, lighting, general controls) ported from active-geometry, adapted to a single left-side menu instead of active-geometry's split left-library/right-properties layout. **Not started, not yet planned in detail.**

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

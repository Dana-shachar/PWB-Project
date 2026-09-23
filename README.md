# Procedural World Building

Cornell Tech, DESIGN 6197/4197 — a procedural planet-building tool: paint and generate terrain on a sphere, built with Three.js + GLSL. This README is written for anyone with zero context on the project — what it is, and where everything lives. Kept up to date as the project changes, not a dated log.

This will eventually grow into the fuller README the course's final deliverable requires (conceptual premise, procedural systems/algorithms used, AI-assisted process, run instructions, credits) — for now, at build stage, it covers what actually exists.

**The other docs, and when to open them:**
> <span style="color:#0969da">🗺️ **`ROADMAP.md`**</span> — current build status, organized by stage/feature. Start here to see what's done and what's next.
>
> <span style="color:#cf222e">🧭 **`ISSUES.md`**</span> — the *why* behind technical decisions, and bug root-causes/fixes.
>
> 📅 **`WEEKLY-PUSHES.md`** — the syllabus's graded weekly report, chronological.
>
> ⚙️ **`CLAUDE.md`** — working rules for how Dana and Claude collaborate on this repo (not project content).

---

## 📦 Repo structure

- **`app/`** — the actual Vite + React + TypeScript + Three.js project. (Course requires TypeScript; new student projects use Vite, not the older Create React App demo in the class repo.)
- **`.obsidian/`** — this repo root doubles as Dana's Obsidian vault; any `.md` file placed anywhere in the repo is automatically part of it, no extra sync step.
- **`firebase.json` / `.firebaserc` / `firestore.rules`** — Firebase project config and security rules (project persistence — see `ROADMAP.md`, Stage 06) at the repo root, deployed via the Firebase CLI.
- **`ROADMAP.md` / `WEEKLY-PUSHES.md` / `ISSUES.md` / `CLAUDE.md` / `README.md`** — see the doc map above.

---

## 🧩 Code organization conventions

The app follows patterns from Dana's own `active-geometry-project`, not the class repo's Entity/World OOP pattern (tried and abandoned early — see `ISSUES.md`).

### 🗂️ File-by-feature, not file-by-component
One file per feature/concern — not one file per individual UI component, and not large multi-purpose files either. `active-geometry-project` groups related small pieces together by feature/UI-area (e.g. one file holds several related slider/panel-building functions) rather than splitting each small component into its own file/folder — that's followed here too, overriding the class's usual one-component-per-file-structure convention.

Current top-level folders under `app/src/`:
- **`ui/`** — React-rendered UI: `UIElements.tsx` (`Slider`, `ColorPicker`, `Toggle`, `Select`, grouped together), `Panel.tsx` (left panel), `RightPanel.tsx` (right panel's tab bar), `NoisePanel.tsx` (the Noise tab's content).
- **`scene/`** — everything Three.js-scene-related: `scene.ts`, `renderer.ts`, `camera.ts`, `controls.ts`, `grid.ts`, `planet.ts`, `SceneCanvas.tsx` (the React wrapper). `Gumball.tsx` lives here too, not in `ui/` — it's a plain imperative-DOM class driven by the render loop, not a React component, so it's grouped with the other Three.js-coupled files it's actually coupled to.
- **`map/`** — the heightmap render-to-texture pipeline and its flat 2D preview, kept separate from `scene/` since it's conceptually its own subsystem (produces a texture *consumed by* the 3D scene): `heightmap.ts` (`HeightmapPipeline` — the single shared instance for the whole app, owned by `SceneCanvas`'s renderer; also owns the per-layer paint textures), `MapView.tsx` (the 2D preview canvas — captures paint pointer input, forwards strokes to the shared pipeline).
- **`firebase/`** — named after the actual technology, not a vague role, so there's no ambiguity (it's not "backend" — there's no server, this is client-side code talking to Firebase's cloud services directly): `client.ts` (SDK init/the live Firebase client instance), `useCurrentUser.ts` (anonymous auth), `storage.ts` (save/load).
- **`shaders/`** — GLSL files, created once there's an actual shader to put in it, not scaffolded empty ahead of need.

### 🎨 Styling: one CSS file
`app/src/design.css` is the single source of truth — design tokens, base layout, and every component's styling rules, imported exactly once at the app's entry point. No per-component stylesheets. Includes the actual licensed Helvetica font files ported from `active-geometry-project` (`app/public/fonts/`) — without these, the UI silently falls back to a generic system sans-serif and nothing visually matches.

### 🧮 Shaders
Mesh-based Three.js (real `SphereGeometry`), not raymarching — GLSL shaders are still used, just applied to real mesh geometry via `ShaderMaterial` (see `ISSUES.md` for why raymarching was considered and rejected). Shader source loads via Vite's built-in `?raw` import suffix (no `vite-plugin-glsl` dependency added — revisit only if multiple shaders need to share GLSL code via `#include`). `heightmapBrush.vert.glsl` is a shared full-screen-quad pass-through used by multiple render-to-texture passes, named to reflect that rather than one specific feature.

### 📐 TypeScript conventions
All `.ts`/`.tsx` files use `.tsx`, even with no JSX currently, so nothing needs renaming later if JSX gets added (decided 2026-09-09).

> <span style="color:#bf8700">🟡 **Still undecided:**</span> the pure-logic `scene/` files with no JSX at all (`scene.ts`, `renderer.ts`, `camera.ts`, `controls.ts`, `grid.ts`, `planet.ts`) haven't been renamed to `.tsx` to match — open whether they should be for total consistency, or stay `.ts` since they'll structurally never contain JSX.

### 🏷️ Placeholder values
Arbitrary values with no design rationale yet (colors, lighting, radius, etc.) are flagged inline with `// TODO(DS): ...` comments — greppable, tracked for an eventual design-system/config-tokenization pass (see `ROADMAP.md`, Stage 09).

Current implementation state and progress live in `ROADMAP.md`, not here.

---

## 📚 References

Third-party reference code/algorithms used directly (not original work) — credited here, and verified against the actual canonical source before use, not reproduced from memory (see `CLAUDE.md`'s working rules).

- **3D Perlin noise** (`app/src/shaders/noise.glsl`, `perlinNoise3D`, "cnoise") — Stefan Gustavson; permutation/gradient ideas: Ian McEwan of Ashima Arts. MIT license. Source: [github.com/stegu/webgl-noise](https://github.com/stegu/webgl-noise), `src/classicnoise3D.glsl`. Verified 2026-09-14 — an earlier transcription had the wrong constant in `permute()` (`+1.0` instead of `+10.0`), caught by this verification.
- **3D Simplex noise** (`app/src/shaders/noise.glsl`, `simplexNoise3D`, "snoise") — Stefan Gustavson / Ian McEwan of Ashima Arts. MIT license. Source: [github.com/stegu/webgl-noise](https://github.com/stegu/webgl-noise), `src/noise3D.glsl`. Verified 2026-09-14; reuses `permute4` from the Perlin entry above.
- **fBm (fractal Brownian motion)** (`app/src/shaders/heightmap.frag.glsl`, `fbm3D`) — the standard octaves/persistence/lacunarity summation loop, verified against [thebookofshaders.com/13](https://thebookofshaders.com/13/), 2026-09-14. Applied to `perlinNoise3D` above.

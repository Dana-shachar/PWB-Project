# Procedural World Building

Cornell Tech, DESIGN 6197/4197. This README is written for anyone with zero context on this project — what it is, and where everything is organized (repo structure, code-organization conventions). Kept up to date as the project changes, not a dated log. Planning and progress tracking happen in `ROADMAP.md`; technical-decision rationale lives in `ISSUES.md`.

This will eventually grow into the fuller README the course's final deliverable requires (conceptual premise, procedural systems/algorithms used, AI-assisted process, run instructions, credits) — for now, at setup stage, it covers what actually exists.

## Repo structure

- `app/` — the actual Vite + React + TypeScript + Three.js project (course requires TypeScript; new student projects use Vite, not the older Create React App demo in the class repo).
- `.obsidian/` — this repo root is also Dana's Obsidian vault; any `.md` file placed anywhere in the repo is automatically part of it, no extra sync step.
- `ROADMAP.md` — planning/progress log only (see below).
- `ISSUES.md` — running log of technical decisions, tradeoffs, and open problems (the *why*).
- `CLAUDE.md` — general working rules (how Dana and Claude work together), not project-specific content. Stays at the repo root specifically — that's the one location it auto-loads from each session.
- `README.md` (this file) — external-facing reference for current project structure and conventions.

## Code organization conventions in effect

Dana wants the app to use the patterns from her own `active-geometry-project`, not the class repo's Entity/World OOP pattern (see `ISSUES.md`, 2026-09-02 entry, for why the Entity/World pattern was tried and then abandoned). Specifically:

- **Separated files by feature, not by component.** One file per feature/concern — not one file per individual UI component, and not large multi-purpose files either. Dana's own `active-geometry-project` groups related small pieces together in one file by feature/UI-area (e.g. `js/uiDesign.js` holds `addSlider`, `numInput`, `xyzRow`, `buildLeftPanel`, etc. all together) rather than splitting each small component into its own file/folder. This explicitly overrides the class's `react-typescript-website` skill convention of splitting every component into its own structure/style/interaction files — that convention is not being followed here. Concretely, as of 2026-09-09: `app/src/ui/` holds the React-rendered UI (`UIElements.tsx` — `Slider`, `ColorPicker`, grouped together rather than split; `Panel.tsx` — the sectioned control panel) — a folder is justified now that it holds more than one file, the same reasoning that keeps single-file locations flat. The gumball (`Gumball.tsx`) lives in `app/src/scene/` instead, not `ui/` — it isn't a React component at all (a plain class with imperative DOM, driven by the render loop, not React state), so it's grouped with the other Three.js-coupled files (camera, controls, renderer) it's actually coupled to.
- **A dedicated `shaders/` folder** for GLSL shader files — created once there's an actual shader to put in it, not scaffolded empty ahead of need.
- **A single CSS source of truth: `app/src/design.css`.** Design tokens (colors, spacing, fonts) plus every component's styling rules live in this one file, imported exactly once at the app's entry point (`main.tsx`) — no per-component stylesheets, and component files don't import CSS themselves. Includes the actual licensed Helvetica font files ported from `active-geometry-project` (`app/public/fonts/`, loaded via `@font-face`) — without these, the `--font-ui` token silently falls back to a generic system sans-serif and nothing visually matches active-geometry's actual look (wrong metrics, wrong weights).
- **Generally an organized workspace** — mirroring the flat, per-feature-file layout Dana already uses in `active-geometry-project` (e.g. its `js/` folder of single-purpose files plus a `shaders/` folder), adapted to this app's React + TypeScript + Vite setup.
- Mesh-based Three.js (real geometry), not raymarching. GLSL shaders still used, applied to real mesh geometry via `ShaderMaterial`.
- Shader source loaded via Vite's built-in `?raw` import suffix (not `vite-plugin-glsl` — no dependency added; revisit only if/when multiple shaders need to share GLSL code via `#include`).
- All TypeScript files in `app/` use `.tsx` (not `.ts`), even when a file has no JSX currently, so there's no need to rename later if JSX gets added. (Decided 2026-09-09.) **Still open/undecided:** the six pure-logic `scene/` files with no JSX at all (`scene.ts`, `renderer.ts`, `camera.ts`, `controls.ts`, `grid.ts`, `planet.ts`) haven't been renamed to `.tsx` to match — undecided whether they should be for total consistency, or left as `.ts` since they structurally will never contain JSX.
- Arbitrary placeholder values (colors, lighting, radius, etc.) are flagged inline with `// TODO(DS): ...` comments, tracked for an eventual design-system/config-tokenization pass (not yet built).

Current implementation state and progress live in `ROADMAP.md`, not here.

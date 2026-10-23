# Procedural World Building

`Last updated: 2026-10-21`

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
> 🧭 **`CODE-INDEX.md`**, where every part of the code lives, by file and function name.
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
| `Screenshots/` | copies of the shots linked from the docs, named by date; the originals live outside the repo, in the course folder `Cornell/Fall 26/PWB/Screenshots/` |
| `.obsidian/` | vault config. Any `.md` anywhere in the repo is part of it, with no sync step |
| `firebase.json`, `.firebaserc`, `firestore.rules` | Firebase config and security rules, deployed via its CLI |
| the `.md` files | see the doc map above |

---

## 🧩 Code organization conventions

*How the app is split up, and the rules in force.*

Patterns come from Dana's own `active-geometry-project`, not the class repo's Entity/World OOP pattern, which was tried and abandoned early.

### 🗂️ File by feature, not by component

*One file per feature or concern. Not one per UI component, and not large multi-purpose files either.*

Related small pieces are grouped by the feature they serve, so one file can hold several related panel-building functions rather than each getting its own. This overrides the class's usual one-component-per-file convention.

| folder under `app/src/` | holds |
|---|---|
| `ui/` | React-rendered panels and the shared component set |
| `scene/` | the Three.js scene, camera, renderer, grid, and the gumball |
| `planet/` | the planet's geometry and shader, terrain patches and their lifecycle |
| `map/` | the heightmap pipeline, the shared noise ranges table, and its 2D preview, including the brush |
| `voxel/` | the land chunk: its two render styles and its own viewport |
| `shaders/` | GLSL, loaded as text |
| `firebase/` | the client, anonymous auth, and reads and writes |
| `projectSettings/` | saving, loading and naming projects, built on `firebase/` |

Three placements are worth knowing, because they look wrong otherwise:

- **The gumball sits in `scene/`, not `ui/`.** It is an imperative class driven by the render loop rather than a React component, so it belongs with the Three.js code it is coupled to.
- **`map/` is not nested under `planet/`**, even though it paints the planet's surface. It produces a texture the 3D scene consumes, which makes it its own subsystem rather than part of the planet.
- **`firebase/` is named for the technology, `projectSettings/` for the feature.** One talks to the service; the other is what is built on it.

### 🧵 `App.tsx` is a composition root

*It calls each feature's hook and wires the results into JSX. Nothing else.*

It never holds a feature's own state or handlers. When a feature gains state, it gets its own hook in its own folder at that moment, rather than accumulating in `App.tsx` and being split out later. See `[B11]` in `ISSUES.md` for the time that went wrong.

### 🎨 One CSS file

*`app/src/design.css` is the single source of truth, imported once.*

Tokens, layout and every component's rules live there. No per-component stylesheets. It also depends on the licensed Helvetica files in `app/public/fonts/`; without them the interface silently falls back to a system sans-serif and nothing matches.

### 🧮 Shaders

*Hand-written GLSL on real geometry, loaded as plain text.*

Shader source loads through Vite's `?raw` import rather than adding a GLSL plugin. Files with no `main()` are shared modules, concatenated ahead of whichever shader needs them, which is how the layer stack is reused.

### 📐 TypeScript

*`.tsx` everywhere, even without JSX, so nothing needs renaming later.*

> ❓ **Open:** the pure-logic files in `scene/` that will structurally never contain JSX are still `.ts`. Either rename them for consistency or keep the distinction deliberate.

### 🏷️ Placeholder values

*Anything arbitrary is flagged `// TODO(DS)` so it can be found later.*

Colors, lighting and distances with no design rationale yet are greppable and tracked for the tokenization pass in Stage 14.

---

## 📚 References and inspiration

*Every outside source, with what was taken from it, lives in `REFERENCES.md`.*

That covers the noise implementations used directly in the code, the methods behind the planet's terrain, and the tools and papers that shaped the pipeline's structure. Kept in one file so a source is cited once rather than repeated across docs.

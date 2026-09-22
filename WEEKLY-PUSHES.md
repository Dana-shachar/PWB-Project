# Weekly Pushes

Graded Weekly Push report per the syllabus — what was attempted/completed, how AI-assisted tools were used, what worked/didn't/next. Chronological, newest entry on top (unlike `ROADMAP.md`, which is organized by stage/feature, not by week).

---

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
- ✅ **Worked:** screenshots + live testing surfaced two subtle math bugs (the double mask-blend, the MAX-accumulation crease) that weren't obvious from reading the shader code alone.
- ⚠️ **Didn't work initially:** the layer-persistence-erasing fix took two real attempts — the first was mathematically incomplete (applied the same mask twice).
- ⏭️ **Next:** erosion simulation (next syllabus topic — hydraulic vs. thermal and timeline-scrubbing are open questions); revisit the still-jagged painted-terrain issue (tabled, likely a mesh-resolution limitation), possibly after erosion.

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
- ✅ **Worked:** testing live and iterating from what's actually on screen — several bugs (paint erase, the faceting regression, the brush-radius scale) only made sense once rendered.
- ⚠️ **Didn't work initially:** the feather/hardness design took 4 attempts — the underlying design *intent* needed pinning down before implementing, not after.
- ⏭️ **Next:** the stroke-opacity fix; rebuild "Expand" to replace the viewport instead of overlaying it; restructure noise modifiers; erosion simulation.

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
- ✅ **Worked:** going back to active-geometry's actual source values (not memory/assumption) — once real font files and exact CSS values were used, the UI actually matched. The confirm-before-acting workflow caught wrong turns early.
- ⚠️ **Didn't work initially:** a few first-pass implementations drifted from the real source without being flagged (an invented slider width, a missing `@font-face`, an inverted camera-matrix ordering) — caught via direct side-by-side comparison, not memory.
- ⏭️ **Next:** color-picker theming decision, terrain generation (GPU heightmap approach, already agreed in `ISSUES.md`), design-system tokenization pass.

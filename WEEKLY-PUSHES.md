# Weekly Pushes

As part of the class structure, this file is updated weekly with a short progress report per the syllabus's Weekly Push requirement: what was attempted or completed, how AI-assisted tools were used, and what worked, what didn't, and what's next. New entries are added at the top, dated.

---

## 2026-09-16

**What was attempted or completed this week:**
- Built a real multi-layer noise system: a Photoshop-style layer stack (add/delete/drag-to-reorder, up to 16 layers), each with its own noise type, parameters, opacity, and blend mode (Normal/Add/Subtract/Multiply/Max/Min/Screen).
- Built a full paint-brush system on the 2D heightmap: an absolute "set to this value" brush (not additive) with a black-white strength slider (erase to black .. paint to white) and a feather/hardness control, painted strokes reflected live on both the flat 2D preview and the 3D planet, persisted per-layer.
- Fixed a significant planet-lighting limitation: the surface had no real per-pixel normal, so terrain bumps didn't show in the shading at all. Replaced with an analytic sphere tangent basis (derived from the same UV parametrization already used for noise sampling) perturbed by the heightmap's own gradient.
- Fixed several real bugs surfaced along the way: paint erase doing nothing (GPU float-blending isn't reliably supported — switched to a ping-pong render-target technique instead), partial-opacity paint strokes reading as diluted/dark instead of correct-color-at-reduced-opacity (proper Porter-Duff "over" compositing), a pole-geometry tear in painted terrain, a severe "faceted/low-poly" regression from an initial (wrong) normal-reconstruction approach, and a brush-radius unit-conversion bug that made a small px radius affect a much bigger fraction of the sphere than intended.
- Renamed a shared shader file (`heightmap.vert.glsl` → `heightmapBrush.vert.glsl`) to reflect that it's used by two different features, not one.
- Iterated on the brush's feather/hardness design through several wrong turns (feather as % of radius → additive px → subtractive px, fixed size → back to % of radius) based on live testing — logged in full in `ISSUES.md` since the reasoning changed direction multiple times.
- Various scale/UX fixes: planet radius slider range retuned twice against the current camera/grid setup, grid fade-out distance widened, ambient lighting retuned for visible shading contrast, base planet color lightened, removed the left panel's "Enable noise" toggle (redundant once a layer's own noise type can be `None`).

**How AI-assisted tools were used:**
Claude Code was used for the entire build, under the same strict step-by-step, confirm-before-acting workflow as prior weeks — plan the specific step (what and how), wait for explicit go-ahead, implement, get tested, then update docs. That discipline slipped a few times this week (implementing a diagnosed bug fix, and a design revert, without waiting for a fresh go-ahead first) — caught and corrected each time, logged to Claude's own persistent memory so the same mistake doesn't recur. Also used for: researching and verifying technical approaches before implementing them rather than reproducing from memory (confirmed via web search that GPU float-render-target blending isn't reliably supported, before choosing the ping-pong-render-target alternative; verified Gaea's actual blend-mode formulas against its own docs rather than guessing); hand-verifying a geometry detail (cross-product winding for the analytic normal) against a concretely-computed point rather than guessing; and diagnosing a subtle stroke-opacity-buildup bug from a screenshot, though the fix for it is still pending approval, not yet implemented.

**What worked, what didn't, what's next:**
- *Worked:* testing each change live and iterating from what was actually visible on screen, rather than reasoning about the math in the abstract — several real bugs (the paint erase, the faceting regression, the roughness/grain, the brush-radius scale) were only fully understood once seen rendered.
- *Didn't work initially, needed correction:* the brush feather/hardness design took four attempts to land on the right model, each one only revealing its problem once actually tested (an additive model that grew the brush unexpectedly, a fixed-size model that made most feather values look identical, etc.) — a case where the underlying *design intent* (not just the code) needed to be pinned down more precisely before implementing, not after.
- *Next:* implement the diagnosed stroke-opacity-buildup fix (per-stroke MAX accumulation before compositing onto the persistent layer); rebuild the 2D canvas's "Expand" control to replace the 3D viewport's content instead of overlaying it; restructure noise modifiers (Ridged/Octaves/Terrace/Domain warp) from separate noise types into independently-toggleable modifiers on a base type, plus a per-layer height-control/amplitude; erosion simulation (next syllabus topic).

## 2026-09-09

**What was attempted or completed this week:**
- Scaffolded the actual project: Vite + React + TypeScript + Three.js.
- Built the base 3D scene (canvas, camera, orbit controls, grid), following `active-geometry-project`'s own conventions rather than the class repo's Entity/World pattern.
- Built the planet: real sphere geometry shaded with a custom GLSL vertex/fragment shader (basic diffuse lighting).
- Built a small UI system matching active-geometry's actual design (a blended slider — draggable track + scrubbable/typeable number field — and a color picker), consolidated into one CSS source of truth (`design.css`, including active-geometry's real licensed Helvetica font files, not a generic substitute).
- Built a sectioned left-side control panel (Scene controls: lighting, grid resolution; Planet controls: radius, base color).
- Ported and debugged the gumball — the orientation/navigation widget (live axis indicator, zoom slider, view presets, reset) — reusing active-geometry's already-solved camera-calibration math.
- Set up the project's own documentation structure and working conventions (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `ISSUES.md`, this file), each with a distinct, deliberately-scoped purpose.

**How AI-assisted tools were used:**
Claude Code was used for the entire build, under a strict step-by-step, confirm-before-acting workflow (nothing implemented without explicit go-ahead on that specific piece first). Concretely: researching and porting real code/values from `active-geometry-project` (camera/controls config, the slider/scrubber interaction pattern, the gumball's calibration math, actual CSS design tokens) rather than inventing new conventions; architecture discussion and tradeoff analysis (raymarching vs. mesh-based Three.js for the world, the GPU-heightmap-texture approach agreed for future terrain work); writing all scene/component code; and debugging several real bugs — a React StrictMode-related memory leak that silently duplicated the grid on resolution changes, the 3D view rendering off-center relative to the panel, and a `pointer-events` cascade issue that blocked dragging directly on the gumball's axis lines.

**What worked, what didn't, what's next:**
- *Worked:* going back to the actual source values in active-geometry (not memory/assumption) for design/behavior fidelity — once the real font files and exact CSS values were used instead of approximations, the UI actually matched. The confirm-before-acting workflow caught several wrong turns early (an abandoned Entity/World-pattern attempt, misplaced documentation content) before they compounded into bigger rework.
- *Didn't work initially, needed correction:* a few first-pass implementations drifted from the real source without being flagged as doing so (an invented slider-field width, a split panel border-radius, a missing `@font-face` setup, an inverted camera-matrix-read ordering in the gumball) — caught through direct side-by-side comparison against active-geometry's actual code rather than relying on memory of it.
- *Next:* a color-picker theming decision (native vs. a small themed-picker dependency vs. hand-built), terrain generation (GPU heightmap texture approach, already agreed in `ISSUES.md`), and a design-system tokenization pass for the scattered `TODO(DS)` placeholder values.

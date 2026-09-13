# Weekly Pushes

As part of the class structure, this file is updated weekly with a short progress report per the syllabus's Weekly Push requirement: what was attempted or completed, how AI-assisted tools were used, and what worked, what didn't, and what's next. New entries are added at the top, dated.

---

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

# Decisions & Issues

Running log of technical decisions, tradeoffs, and open problems for this project — separate from `ROADMAP.md`, which tracks weekly progress. Newest entry on top. Each entry: what was considered, what was decided (or is still open), and why.

---

## 2026-09-09

### Bug: gumball's axis lines didn't respond to direct drags, even though the underlying camera/update logic was correct
**Status:** Fixed.

Symptom: dragging in empty space near the gumball orbited the camera fine, and the axis indicator's SVG `x2`/`y2` values were provably correct (verified via DevTools — real, trigonometrically-consistent numbers matching the current camera orientation) — but dragging *directly on* a rendered axis line did nothing, and Dana didn't have this issue in `active-geometry-project`.

Root cause, in two parts:
1. The gumball's `<svg>` has `pointer-events: none` (ported from the original) so clicks pass through to the canvas underneath, letting drag-to-orbit work even where the widget visually overlaps the viewport. But `pointer-events: none` only excludes an element *and its descendants* from hit-testing — it doesn't affect ancestors. The `<line>`/`<text>` elements' rendered strokes were still being hit-tested as part of a check that apparently wasn't fully inherited in practice — fixed by setting `pointer-events: none` explicitly on the `line`/`text` elements themselves rather than relying on cascade from the parent `<svg>` alone.
2. Even after that, dragging on the gumball's container (not just the SVG) still didn't pass through — because `.gumball-container` (the outer `position: fixed` div holding the SVG + zoom slider + buttons) had no `pointer-events` override of its own, so it captured clicks over its whole bounding box regardless of what its SVG child opted out of. Fixed by setting `pointer-events: none` on `.gumball-container` itself, then explicitly opting the actually-interactive controls (`.gumball-zoom-input`, `.gumball-btn`) back in with `pointer-events: auto`.

**Note:** point 2 is a deliberate addition, not a strict port — active-geometry's own container doesn't have `pointer-events: none` either. Dana's theory for why the original never surfaced this: its gumball sits bottom-left, tucked under the left shape-library panel, likely just less overlapped by where she'd naturally start an orbit-drag than this project's top-right placement.

### Open item: arbitrary placeholder values need eventual design-system/config tokenization
**Status:** Open — tracked, not yet built (Dana: "don't run ahead of the class schedule" applies; this is a future cleanup pass, not urgent).

While building `scene/planet.ts` and its shaders, several numeric/color values were chosen arbitrarily (a placeholder base color, light direction, ambient light level, sphere radius, and segment counts) with no design rationale behind the specific numbers — they just needed *some* value to get a working first pass on screen. Dana wants these eventually tokenized/tracked centrally rather than left as scattered magic numbers, so they can be adjusted in one place instead of hunting through files.

Two different destinations, not one, since they're different kinds of values:
- **Visual/styling values** (colors, lighting levels) — natural fit for a CSS custom-property-based design-system file, the way `active-geometry-project` and the class demo app both already use CSS variables for their own styling.
- **Scene/geometry configuration values** (sphere radius, segment counts, camera distance, grid size/divisions, etc.) — not stylable via CSS (they feed directly into Three.js constructors, not the DOM/CSS), so these need their own scene-config/constants file instead.

**Convention adopted in the meantime:** flag every arbitrary placeholder value inline with a `// TODO(DS): arbitrary placeholder — ...` comment at the point it's defined, so they're all easy to find (grep for `TODO(DS)`) once it's time to build the actual tokenization/config file(s). First applied in `scene/planet.ts` (2026-09-09).

## 2026-09-02

### Rendering approach: mesh-based Three.js, not raymarching — GLSL shaders still used
**Status:** Decided (no raymarching; GLSL-shader terrain approach agreed in principle) — implementation not yet started, since terrain isn't being built yet.

- Considered whether to build the world using raymarching/SDFs (the technique Dana's `active-geometry-project` uses for its CSG boolean shape editor) versus traditional Three.js mesh geometry.
- **Decided against raymarching for the world as a whole.** It fits `active-geometry-project` specifically because SDFs make boolean union/subtract/intersect cheap without regenerating mesh topology. It doesn't fit this project: agents/populations, instanced vegetation, voxels, roads, and LOD/culling all assume real mesh objects — that's also what the class's own demo app and Three.js conventions use (real `SphereGeometry`, vertex displacement, `MeshStandardMaterial`).
- **Still using GLSL shaders**, just not for raymarching — custom `ShaderMaterial`/vertex+fragment shaders on real mesh geometry, per Dana's request and matching the syllabus (Session 3 covers shaders explicitly). Dana's reasoning: doing terrain/materials purely in Three.js (i.e., computing height/color in JavaScript on the CPU, the way the class demo app currently does) is a performance concern as the terrain gets more complex, so GLSL should be used to keep that work on the GPU.
- **Agreed combo for terrain (2026-09-02, confirmed by Dana — not yet built):** compute the heightmap in a fragment shader into an off-screen render target (texture). The terrain mesh's vertex shader samples that texture to displace vertices (GPU-side, fast regardless of noise/erosion complexity); the fragment shader samples it for coloring/biomes. When the CPU needs a height value — placing an agent, laying a road, painting erosion — it reads back the specific texel from that same texture via `renderer.readRenderTargetPixels()`, on demand, rather than recomputing anything in JavaScript. This avoids running the noise function twice in two languages (once in GLSL for rendering, once in JS/TS to keep CPU queries in sync) — the shader stays the single source of truth; the CPU just asks it "what's the value here" when it actually needs to know, not every frame.
- Revisit and confirm the concrete implementation details when terrain work actually starts (this entry records the agreed *approach*, not a finished design).

### Grid: plain `THREE.GridHelper`, not a ported shader grid
Dana's active-geometry project draws its grid procedurally inside its raymarching fragment shader (anti-aliased minor/major lines, distance fade) — not portable on its own since it depends on that project's ray-marching pipeline. Since this project isn't raymarching, using a plain built-in `THREE.GridHelper` instead.

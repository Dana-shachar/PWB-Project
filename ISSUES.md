# Decisions & Issues

Running log of technical decisions, tradeoffs, and open problems for this project — separate from `ROADMAP.md`, which tracks weekly progress. Newest entry on top. Each entry: what was considered, what was decided (or is still open), and why.

---

## 2026-09-16

### Paint accumulation: ping-pong render targets, not GPU blending
**Status:** Decided, implemented.

First attempt at persistent paint strokes used `THREE.CustomBlending` (toggling `blendEquation` between Add/ReverseSubtract for paint/erase) into a `HalfFloatType` render target. Erase did nothing — traced to WebGL clamping fragment output to [0,1] *before* blending, so a negative "erase" delta was silently clamped to 0. Switching the shader to always output a positive magnitude and using `ReverseSubtractEquation` for erase still didn't work: GPU blending into a float/half-float render target requires the `EXT_float_blend`/`EXT_color_buffer_half_float` extensions, which are not reliably supported across browsers/GPUs (verified via web search — not Baseline per MDN).

**Decided:** ping-pong render targets instead — each paint layer gets a *pair* of `HalfFloatType` targets. Each stroke samples the currently-active one as `uPrevious`, computes the complete new frame in-shader (not via GPU blending hardware), writes to the inactive one, then swaps which is "active". Portable, no extension dependency. See `map/heightmap.ts`'s `paintTargets`/`paintActiveIndex` maps and `paintStroke()`.

### Paint compositing: Porter-Duff "over", not naive linear blend
**Status:** Decided, implemented.

A first pass blended both `value` and `mask` toward the brush's target at the same rate per dab. Symptom: a partial-opacity touch read as diluted toward black/the unpainted placeholder instead of the correct color at reduced strength — e.g. a light gray dab at 50% strength looked dark, not light-gray-at-half-opacity.

**Fixed** with the standard Porter-Duff "over" formula: `newMask = falloff + previousMask*(1-falloff)`; `newValue = (targetValue*falloff + previousValue*previousMask*(1-falloff)) / newMask`. Weights by each side's *relative opacity contribution*, not raw falloff, so partial strokes read correctly regardless of what's underneath. See `shaders/paintbrush.frag.glsl`.

### GLSL ES 1.00 forbids dynamic sampler-array indexing — worked around with named uniforms
**Status:** Decided, implemented.

Three.js's `ShaderMaterial` compiles as GLSL ES 1.00 by default even on a WebGL2 context. Looping over an array of paint textures with `uLayerPaintTexture[i]` where `i` is a loop variable fails to compile: `'[' : array index for samplers must be constant integral expressions`. Worked around with `MAX_LAYERS` (currently 16) separately-named uniforms (`uLayerPaintTexture0`..`uLayerPaintTexture15`) plus an if/else chain to select by constant index (`samplePaintTexture()` in `shaders/heightmap.frag.glsl`, `paintTextureUniformName()` in `map/heightmap.ts`). `MAX_LAYERS` may need to go higher later — mechanical extension of the same pattern, not urgent now.

### Planet lighting: analytic sphere tangent basis, not screen-space-derivative normals
**Status:** Decided, implemented.

The planet's fragment shader had no real per-pixel normal — lighting couldn't show terrain bumps at all. First fix attempt used `dFdx`/`dFdy` of the interpolated vertex position (a real, generally-valid technique) to reconstruct a normal. Regression: since screen-space derivatives are ~constant within one triangle, this produced a severely faceted, "low-poly" look across the *whole* sphere, not just the painted terrain — mesh-resolution-dependent, not what was wanted as the default (Dana did note she likes that faceted look as a potential future style *option*, just not as the default — see `ROADMAP.md` item 13).

**Fixed** with an analytic tangent basis derived from the same `uvToSpherePosition`-style parametrization already used for noise sampling (`dPdu`, `dPdv` — exact calculus derivatives of the sphere's UV parametrization) — smooth and mesh-resolution-independent. Cross-product winding (`cross(dPdv, dPdu)` vs. `cross(dPdu, dPdv)`) was verified by hand-computing a concrete point (longitude=0, latitude=0), not guessed. Perturbed by the heightmap's own central-difference gradient (`dHdu`/`dHdv`, sampled 16 texels away rather than the immediate neighbor, to avoid amplifying per-texel noise into visible roughness) for fine per-texel bump detail on top of the smooth base. The analytic tangent vectors are unit-sphere-relative while the displacement amplitude is world-space-scaled (`radius * 0.15`) — without scaling the tangents by the actual world-space radius (new `uRadius` uniform, `planet.ts`/`fragment.glsl`), the height term dwarfed the smooth base term and caused exaggerated roughness, especially near the poles.

Also fixed along the way: `'normalMatrix' : undeclared identifier` — Three.js auto-*sets* this built-in uniform but only auto-*declares* it in the vertex stage, not the fragment stage; needs an explicit `uniform mat3 normalMatrix;` to use it in a fragment shader.

### Brush hardness/feather: which model, and why it took several tries
**Status:** Decided (fixed-radius, percentage-based) — logged in detail since the reasoning genuinely changed direction multiple times and shouldn't only live in chat history.

Four different models were tried, in order:
1. **Feather as a fraction of radius, radius fixed** (original): `innerRadius = radius*(1-feather)`. Bug found: since the *absolute* width of the soft ring scales with radius, the same feather value looked far less soft on a small brush than a large one ("the feathering should stay constant unrelated to brush size").
2. **Feather as an absolute px width, additive** (`radius+feather`, Dana's explicit request, citing Photoshop): grew the total brush footprint outward by the feather amount. Bug found on testing: at a small radius with a large feather, the brush ballooned far bigger than expected — flagged as a bug, even though it was the literally-requested behavior; testing it revealed it wasn't actually what was wanted.
3. **Feather as an absolute px width, subtractive, radius fixed** (`innerRadius = radius - feather`, capped at 0): total size locked to radius, feather only carves inward. This is what "feather shouldn't affect brush size at all" actually meant. Bug found on testing: since feather can't reduce `innerRadius` below 0, any feather value ≥ the current radius produces the identical "fully soft" result — different feather values "all looked the same" once past that point. Briefly extended to let feather > 1 grow the region past the radius again (to give small brushes a visibly bigger soft glow), but that reintroduced problem #2's "just increases size" complaint and was reverted.
4. **Feather as a fraction of radius, radius fixed** (`innerRadius = radius*(1-feather)`, outer edge always = radius) — **same formula as #1**, but explicitly chosen this time (via a direct fixed-size-vs-percentage question) over the absolute-px alternative, and left at that: total brush size never changes with feather; a given feather value's *absolute* softness naturally scales with brush radius (true Photoshop Hardness behavior — Hardness is itself a percentage of Size, not an absolute px value, which is why model #2 doesn't actually match Photoshop despite citing it).

**Open, unresolved by the above:** a small brush at feather=1 (fully soft) still barely reads as "soft" visually, since the entire soft transition only spans the (small) radius in the first place. Diagnosed as likely compounded by the stroke-overlap bug below (many overlapping dabs along a drag re-saturating what should be a soft edge) rather than purely the fixed-size formula itself — not yet confirmed/fixed.

### Open bug: stroke-drag opacity buildup on overlapping dabs
**Status:** Open — diagnosed, fix proposed, not implemented.

A stroke (`pointerdown` → drag → `pointerup`) places many dabs along the path (interpolated for continuity at fast drag speed — see `map/MapView.tsx`'s `paintStrokeTo()`), each composited "over" the paint layer's previous state via the Porter-Duff formula above. That's correct *across* separate, independent strokes (later strokes should layer on top of earlier ones). But *within* one continuous drag, with dabs spaced closer together than their soft radius, this same sequential-over compositing causes many weak/partial contributions to stack and saturate toward full opacity well before a single dab's own falloff would suggest — effectively flattening a soft/feathered edge into a hard one, even though each individual dab's math is a correct smooth gradient.

**Proposed fix** (standard technique — how real paint tools avoid "opacity buildup" on a single stroke): accumulate the *current* stroke's dabs into a separate temporary buffer via a MAX combine (not sequential "over"), so overlapping dabs within one drag never exceed what a single dab alone would contribute at that point; only composite that stroke's finished/live accumulated mask onto the persistent paint layer via the normal "over" blend. Requires a new per-stroke ping-pong buffer (reset at `pointerdown`) in `map/heightmap.ts`, plus a new MAX-combine shader pass. Not yet implemented.

### Bug: brush radius used the canvas's CSS display size instead of the actual texture resolution
**Status:** Fixed.

`MapView.tsx` converted brush radius from px to a UV fraction by dividing by the canvas's *displayed* CSS size (`sizePx` — 300 normally, larger when the noise-canvas expand mode ships). That's wrong: the paint texture's actual resolution is fixed at `HEIGHTMAP_WIDTH` (1024px) regardless of how big the preview canvas is drawn on screen, and regardless of the planet's own radius. A "20px" brush radius consequently covered a much bigger real fraction of the sphere than intended, and would have felt inconsistent between the compact and expanded canvas views. Fixed by exporting `HEIGHTMAP_WIDTH` from `map/heightmap.ts` and dividing by that fixed constant instead.

## 2026-09-14

### Right-side panel structure: tabs by technique/effect, not by the planet's parts
**Status:** Decided.

Question raised while designing the noise system's UI: should the right-side panel (and any future panel like it) be organized around the planet's *parts* (Terrain, Population, Climate, Vegetation, ...) or around *techniques/effects* (Noise, Paint, Erosion, Color, ...)?

**Decided: by technique/effect.** Everything currently planned — noise generation, paint-authored terrain, erosion, biome-style coloring — operates on the *same* underlying data (the heightmap + texture), composing as sequential operations rather than being independent domains with their own state. This mirrors why World Machine/Gaea (both already referenced as inspiration) organize around operations/nodes rather than planet-parts: their entire premise is a pipeline of techniques feeding into each other. "By the planet's parts" would only become the right structure once a feature is a genuinely independent system with its own data (e.g. a real population simulation, not just something that reads the heightmap) — nothing on the roadmap is that yet, including the mentioned future agent/road placement (see 2026-09-02 entry below), which reads values off the existing heightmap rather than maintaining separate state.

Implemented as `ui/RightPanel.tsx`'s tab bar, ported from active-geometry's `buildStageTabs`/`.ag-stage-tab` convention (`js/uiDesign.js`), reimplemented with React state instead of the original's imperative DOM class-toggling. Tabs so far: Noise (real), Paint/Erosion/Color (empty placeholders — ROADMAP.md items 7-9 — get real content when those features are built).

**Known cosmetic issue, not urgent (Dana: "it can be fixed later"):** the placeholder tabs don't currently match the Noise tab's width exactly.

### Bug: gumball widget rendered on top of the new right-side panel instead of the 3D viewport
**Status:** Fixed.

`.gumball-container` was `position: fixed` and appended to `document.body` — positioned relative to the whole browser window. That was correct while the 3D viewport extended to the window's right edge, but once the right-side `RightPanel` was added there, the widget's `bottom/right: 16px` offset landed on top of the new panel instead of the actual 3D view.

Fixed by mounting the widget inside `.app-viewport` (passed in as a constructor param, `canvas.parentElement`) instead of `document.body`, and switching `.gumball-container` from `position: fixed` to `position: absolute` against `.app-viewport` (given `position: relative`) instead of the window. The 16px bottom/right inset is unchanged — it now measures from the viewport's own corner, not the window's.

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

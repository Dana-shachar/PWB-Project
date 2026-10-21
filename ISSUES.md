# 🐛 Issues

`Last updated: 2026-10-18`

*What is broken, what was broken and why, and problems tracked but not scheduled.*

> [!NOTE]
> 🔴 open · 🟡 partial or tabled · ✅ fixed · 📋 tracked, not scheduled
> Severity is a text tag: `blocks work` · `wrong but workable` · `minor`
>
> Bugs only. Architecture and the decisions behind it are in `SPEC.md`. Status by stage is in `ROADMAP.md`.

```
🔴 Open        3
🟡 Partial     1
📋 Tracked     4
✅ Fixed      26
```

<details>
<summary>📋 <b>Format</b></summary>

```markdown
### [id] Short title · `severity`
**🔴 Open** · **Found:** YYYY-MM-DD · **Where:**

**What happens**
-

**Cause**
-
```

IDs are assigned in date order and never reused, so a reference stays valid once an entry moves between sections. Entries are grouped by topic, newest first within each group. When fixed, the status line gains the date and what it was.

</details>

---

## 🪐 Planet mesh

*The sphere itself, its seams, and the poles.*

### [B33] Planet near-froze when changing its Resolution · `wrong but workable`
**✅ Fixed:** 2026-10-18 · **Found:** 2026-10-18 · **Where:** `scene/SceneCanvas.tsx`

**What happened**
- Dragging the planet's own Resolution (mesh segments) control made the whole app go choppy, nearly freezing (Dana: "very choppy performance, nearly freezing"), not just a minor slowdown.

**Cause**
- The `[radius, meshSegments]` effect ran on every single change with no debouncing, rebuilding the planet's entire sphere geometry *and* a full `WireframeGeometry` overlay every time, the second one unconditionally, even when wireframe display mode wasn't active and nothing was showing it. A dragged slider fires many rapid changes, each one triggering this same expensive double rebuild back to back.
- This is the old single-mesh planet path specifically (`USE_PLANET_PATCHES` is currently `false`, the fallback from `[B?]`'s earlier black-planet regression), not the new patch system, which already picks up a radius change lazily, throttled, on its own.

**Fix**
- Debounced (150ms, same `setTimeout`/`clearTimeout` pattern `projectSettings/saveProject.ts` already uses for its own autosave): the geometry rebuild only runs once the value settles, not on every intermediate tick while dragging.
- The wireframe overlay only rebuilds when wireframe mode is actually selected; otherwise it's marked stale (`wireframeStaleRef`) and rebuilt lazily the moment wireframe mode is next chosen, in the existing `[displayMode]` effect, rather than paying that cost on every resolution change regardless of whether it's ever shown.

### [B26] Soft blur and rough ridging at both poles · `minor`
**🟡 Likely resolved by [B28]'s patch rendering, not yet visually confirmed** · **Found:** 2026-10-13 · **Where:** the heightmap's own format

**What happens**
- Improved but not solved. The hairline and the tearing are gone; a soft blur and some rough ridging remain at both poles.

**Cause**
- Every longitude converges to one point at each pole, so data stored in a rectangular map bunches up there. Visible directly in the 2D preview, whose top and bottom edges smear the same way.
- Not fixable while the map is where detail lives. Goes with [B28].
- More precisely: the noise itself is correct at every point, `heightmap.frag.glsl`'s `uvToSpherePosition()` samples the true 3D position, not the distorted flat map. The actual cause is in `fragment.glsl`'s per-pixel bump mapping. The analytic tangent `dPdu` correctly shrinks toward zero at the poles via its `cosLat` factor, but the finite-difference height gradient `dHdu` divides by a fixed UV-space `sampleOffset` (32/1024) with no equivalent tapering. Near a pole, that fixed UV offset spans an almost vanishing physical distance, so the gradient term comes to dominate the tangent exactly where the real tangent collapses toward zero. Blur and ridging are the same ill-conditioned normal basis read two ways, blur where neighboring texels' noise happens to land close, ridging where it diverges, both equally likely since nothing tapers the base noise amplitude near a pole on this path.

### [B24] Terrain tore into streaks at both poles · `blocks work`
**✅ Fixed:** 2026-10-13 · **Found:** 2026-10-13 · **Where:** `planet/mesh.ts`

**What happened**
- Terrain tore into thin stretched streaks at both poles once height was turned up. A separate symptom, a black slit across the surface, appeared at the same time.

**Cause**
- The map wraps at longitude 180°, and that line crosses both pole faces, so triangles sitting on it read from both ends of the map at once and smeared the whole map width across themselves.
- The black slit had a different cause: lighting rebuilt its surface direction from map coordinates, which jump at the wrap line.

**Fix**
- Each pole face is generated as two halves split along that line, so no triangle spans it. The same approach `SphereGeometry` uses at its own seam, which is why the old sphere never showed this.
- Lighting now works from each point's 3D position rather than from map coordinates.

### [B25] ⚠️ A wrong diagnosis, and what it cost · `blocks work`
**✅ Reverted:** 2026-10-13 · **Found:** 2026-10-13 · **Kept deliberately**

**The claim**
- That reading height out of the rectangular map is lossy at the poles. It is the reverse: an equirectangular map over-samples near the poles, so no detail was being lost.

**What was built on it**
- The layer stack was split into a shared module so the planet could evaluate terrain from 3D position. That meant the vertex shader sampling sixteen paint textures, which exhausted the GPU's texture slots, so no height reached the planet and it rendered perfectly smooth. All reverted.

**How it went unnoticed**
- The texture limit was a warning in the dev server log the whole time and was not read.
- "The shader compiled" was treated as proof the approach worked, when the failure was at bind time.
- Several rounds went into reasoning about what should happen rather than looking at the rendered data. What found it was drawing the height value on screen as color.

---

## 🎨 Painting & brush

*Authoring by hand, and what the strokes produce.*

### [B27] Expand shows a black preview · `wrong but workable`
**🔴 Open** · **Found:** 2026-10-13 · **Where:** the noise canvas's Expand view

**What happens**
- Expand renders black instead of the heightmap.

**Cause**
- Not diagnosed. Not established whether it predates the cube-sphere work or arrived with it. The 2D canvas reads the heightmap pipeline rather than the planet mesh, so a connection is not obvious either way.

### [B14] Terrain still jagged, feather still subtle · `minor`
**🟡 Tabled** by Dana until after erosion · **Found:** 2026-09-22

**What happens**
- Painted features displace with jagged edges, and the feather is hard to see.

**Cause**
- Likely the sphere's mesh resolution being too coarse for a narrow painted feature, since displacement only happens at vertices.

### [B13] Stroke drag hardened soft edges · `wrong but workable`
**✅ Fixed:** 2026-09-22, after one wrong fix · **Found:** 2026-09-16

**Cause**
- Compositing each dab over the last saturated a soft edge into a hard one within a single drag.
- A max-accumulation buffer fixed the hardening but left a crease in the falloff wherever two dabs were equidistant, invisible in flat color but visible once it drove displacement.

**Fix**
- Distance is computed to the whole stroke path at once, one smooth shape with no crease, which also removed a separate buffer and pass.

### [B12] Brush strokes cut off at the seam · `wrong but workable`
**✅ Fixed:** 2026-09-22 · **Found:** 2026-09-22

**Cause**
- Falloff used a plain distance in map coordinates, which does not know the left and right edges are the same place.

**Fix**
- Wrapping the horizontal component. Does not retroactively repair strokes painted before the fix.

### [B15] Replayed strokes and undo didn't update until clicked · `wrong but workable`
**✅ Fixed:** 2026-09-22 · **Found:** 2026-09-22 · **Two different causes**

**Cause**
- **On reload:** a real ordering bug. React runs a child's effects before its parent's, so the views read the texture before the parent had replayed into it.
- **On undo:** not ordering but a missing connection. The 2D canvas only watched layers, and undo only changes history, so no ordering fix could help.

**Fix**
- Reload: reordered so replay happens before state is set, and the earlier workaround was deleted rather than left alongside.
- Undo: a small counter threaded down as a prop, the legitimate use of a signal here.
- Worth distinguishing: fix the order when it is an ordering bug, add a signal only when there is genuinely no connection.

### [B07] Painting toward black did nothing · `blocks work`
**✅ Fixed:** 2026-09-16 · **Found:** 2026-09-16

**Cause**
- WebGL clamps shader output before blending, which silently zeroed a negative erase value, and blending into a float target needs an extension that is not reliably supported.

**Fix**
- Ping-pong targets instead of GPU blending, so each stroke computes the complete new frame in the shader.

### [B08] Partial-opacity strokes looked dark · `minor`
**✅ Fixed:** 2026-09-16 · Value and mask were blended at the same rate rather than by Porter-Duff "over".

### [B09] Brush radius used the canvas's display size · `minor`
**✅ Fixed:** 2026-09-16 · Converted against the texture's fixed resolution instead.

---

## 🧱 Layers & noise

*Generating terrain and composing it.*

### [B18] Ridged noise inflated the whole planet rather than its peaks · `wrong but workable`
**✅ Fixed:** 2026-09-24 · **Found:** 2026-09-24

**Cause**
- `ridge(x) = 1 - abs(x)` peaks where its input is most common, so its output sat near maximum almost everywhere. Every other noise type here is symmetric around zero; Ridged alone carried a strong positive bias.
- Invisible while the old pipeline clamped everything, but once Height applied the raw value as unclamped additive elevation, the bias scaled with it.

**Fix**
- Re-centred `ridge` itself rather than special-casing one noise type downstream.

### [B10] A new layer visually erased painted terrain beneath it · `blocks work`
**✅ Fixed:** 2026-09-22, after 2 wrong attempts · **Found:** 2026-09-22

**Cause**
- An empty layer's flat gray placeholder read as real opaque content at full opacity, replacing everything under it. No data was lost; purely a compositing bug.

**Fix**
- The paint mask is applied exactly once as coverage, with the composite starting at neutral gray rather than black. Starting at black had made painted black indistinguishable from nothing painted.

### [B17] Old saved layers defaulted to hidden · `wrong but workable`
**✅ Fixed:** 2026-09-23 · A missing field read as falsy rather than as visible.

---

## 🧊 Land chunk

*The flattened detail view and its two render styles.*

### [B32] Resolution slider goes past what the chunk can actually use · `minor`
**✅ Fixed:** 2026-10-17 · **Found:** 2026-10-14 · **Where:** `scene/sharedViewportRenderer.ts` (new), `scene/SceneCanvas.tsx`, `voxel/LandChunkCanvas.tsx`, `App.tsx`, `planet/patch.ts`, `voxel/landChunk.ts`, `shaders/chunk.vert.glsl`, `shaders/chunk.frag.glsl`, `shaders/terrain.glsl`

**What happened**
- The land chunk's Resolution slider went up to 2048, but values past roughly 513 changed nothing in either render style, capped by `MAX_PATCH_SAMPLES`'s GPU-readback cost guardrail in `planet/patch.ts`.

**First attempt, and the regression it caused**
- The smooth style's heightmap was made to stay entirely GPU-side, baked on the *planet's* own `WebGLRenderer` and handed directly to the land chunk's material. This rendered as a completely flat, black, undisplaced chunk (Dana, 2026-10-17: "the chunk isnt showing the planet"). Root cause: the land chunk rendered through its *own*, separate `WebGLRenderer` on its own canvas, and a `WebGLRenderTarget`'s texture is a GPU resource owned by whichever renderer/context created it, it cannot be bound and sampled directly by a different one.
- Reverted to a CPU readback to stop the regression (now superseded by the fix below), which also meant giving up the higher resolution ceiling the first attempt claimed, since avoiding the readback entirely requires the two renderers to actually be one.

**Real fix: one shared renderer for both panes**
- New `scene/sharedViewportRenderer.ts`: one `THREE.WebGLRenderer` on one shared `<canvas>`, each pane drawn into its own rectangle via `setViewport`/`setScissor` every frame, the documented Three.js technique for multiple simultaneous views (`examples/webgl_multiple_elements.html`). `SceneCanvas.tsx`/`LandChunkCanvas.tsx` no longer create their own canvas, renderer, resize observer, or animation loop, each registers its scene/camera/per-frame callback and renders into its own `.planet-viewport`/`.land-chunk-viewport` div (now also each pane's own element for click-picking and its OrbitControls' DOM target, replacing the canvas both used to be).
- With both panes genuinely on one renderer, the GPU-only hand-off is valid again: `getPatchRegionTexture` (not `getPatchRegionElevation`) bakes a patch's heightmap once and hands the texture straight to the chunk's material, no CPU round trip, `MAX_PATCH_TEXTURE_RESOLUTION`/`clampPatchTextureResolution` (1024, GPU-only) back in `planet/patch.ts`, distinct from `MAX_PATCH_SAMPLES` (513), which still governs whatever *does* get read back (the color ramp's min/max, voxel's own CPU mesh data, untouched by this).
- Smooth mode's texture is the planet's own multi-channel bake format (elevation in green); voxel's is still a plain single-channel CPU texture (red). `chunk.vert.glsl`/`chunk.frag.glsl`/`terrain.glsl`'s `heightmapShadow` all take a `uHeightMapGreenChannel` uniform (set per render style in `App.tsx`) to read the right one, rather than assuming either.
- Dana was explicit voxel mode is allowed to stay restricted regardless: its own mesh is genuinely built from CPU data (`density.ts`'s `buildChunkHeights`), not just shaded by it, a real constraint already tracked as `[B05]`, untouched by any of this.

**The remaining stall: a min/max reduction pyramid, not a bigger readback**
- Dana separately reported the whole app stalling briefly on every Resolution change (2026-10-17: "the whole software seems to get stuck for a bit"), traced to the color ramp's min/max calculation running a full synchronous CPU readback (`getPatchElevationData`) on every change, purely to find two numbers.
- Fixed for smooth/shaded style: a min/max reduction pyramid (Tevs, Ihrke & Seidel 2008, "Maximum Mipmaps," see `REFERENCES.md`) halves the baked patch over and over in `map/heightmap.ts`'s new `getRegionMinMaxAsync()`, each pass keeping the true min/max of every 2x2 block rather than blurring it away, down to one texel holding the patch's exact min/max. Only that one texel is ever read back, via the async PBO+fence method already built (`getRegionElevationDataAsync`, which had no caller until now). Guarded against the request race Dana flagged ("the color needs to be live or it will get stuck"): `landChunk.ts`'s `minMaxRequestIdRef` tags each request, and a slower, older request resolving after a newer one is silently discarded rather than overwriting the ramp.
- When an erosion run already has the elevation data in memory, that's used directly (free, no new readback of any kind), the reduction pyramid only runs for a fresh bake.
- Voxel style is unchanged and still pays the full synchronous readback, its own mesh is genuinely built from that CPU array, not just shaded by it, the same accepted `[B05]` constraint as the display-path fix above.
- **That open question was real: confirmed, then fixed.** The literal min/max above let one outlier pixel (this terrain's own spiky noise reliably produces one) set the ramp's range far wider than the terrain's real bulk variation, squeezing everything else into a narrow slice of it — Dana, 2026-10-18, saw this directly as repeating color bands following the terrain's contours, not a gradient, confirmed not the Terrace modifier. Fixed with a GPU-built histogram (same technique real-time HDR auto-exposure uses so one bright pixel can't blow out a whole frame's exposure, see `REFERENCES.md`, "GPU histogram"): `map/heightmap.ts`'s new `getRegionPercentileRangeAsync()` scatters a fixed 256x256 grid of sample points (`shaders/elevationHistogram.vert.glsl`/`.frag.glsl`) into a 256-bin, 1px-tall target via additive blending, bucketed against the reduction pyramid's own literal extremes, then reads back just those 256 values and walks them to the 1st/99th percentile with the exact same logic `map/elevationRange.ts`'s CPU version already used (`HISTOGRAM_BINS`/`CLIP_PERCENT` now exported from there and shared, not duplicated). Wired into `landChunk.ts`'s smooth-style branch in place of the literal min/max call, same request-id race guard as before. Voxel style is untouched, still correct, still uses the CPU histogram directly.

**The real fix was one level up: a shared range, not a better local one**
- Dana caught the actual inconsistency, 2026-10-18: "the chunk should be a part of the planet... it should use the planet's values." Computing any range fresh per patch, however correctly, means the same real elevation can read as a different color depending on which patch you're looking at, and duplicates work the planet already does. The GIS convention for this (QGIS's `WholeRaster` raster-symbology option, see `REFERENCES.md`, "Whole-dataset vs. current-view color stretch") is a stretch computed once per dataset, applied everywhere, not recomputed per tile, exactly this project's own earlier decision that the ramp "should encompass all terrain levels that exist in the planet," which the chunk's own percent-clip work had drifted away from.
- `SceneCanvas.tsx` gains `getElevationRange()`, returning the planet's own global range, already computed once whenever its heightmap changes and already kept live for every planet patch (`sharedUniformsRef`), nothing new to compute. `landChunk.ts`'s smooth and voxel branches both now read this instead of computing their own, voxel's CPU elevation data stays exactly as needed for its own mesh, only the ramp's range source changed. `minMaxRequestIdRef` and its race-guard, and the `computeElevationRange` import, are now dead and removed, nothing in this file computes a range anymore, it only reads one.
- The GPU histogram pass above is no longer called by the chunk, but stays in the codebase: it's still the right mechanism for a real, separate follow-up (making the planet's own `updateElevationRange()` cheaper, which still does a full CPU readback today), not required for this fix, not yet approved to build.
- Expected, not a bug: a small, flat-looking close-up patch may now show mostly one color if the planet's full range is much wider than what's visible in that one patch, that's the correct behavior for a whole-dataset stretch.

**The wall/cut face: layers, then a flat color by design**
- The chunk's vertical skirt walls showed repeating horizontal "layers" (Dana: "why does the chunk have layers"). Cause: the wall's bottom edge carried a placeholder uv of `(0,0)` while its top edge carried the real terrain uv, interpolated between the two down the wall's height, so the sampled point slid diagonally across the whole heightmap as you went down, reading unrelated elevation values and cycling the ramp into stripes. Fixed in `voxel/smoothMesh.ts`: the bottom edge now carries its own column's real uv too (not the placeholder), locking sampling to one real column the whole way down, no drift.
- Dana then decided the wall shouldn't read the elevation ramp at all: "the color of the cut area should be one color of that height, which is likely the low elevation color." A cut face has no single elevation of its own to color by. Fixed in `shaders/chunk.frag.glsl`: the ramp calculation is now gated to `vDisplace > 0.5` (the real top surface only), walls/the bottom cap keep `surfaceColor`'s own default, `uBaseColor`, untouched by the ramp entirely.
- Dana then reversed that too: "and if the ground is cut in the middle of a mountain?? is it still low elevation colors?" A flat base color for every wall regardless of what it's under was wrong. Fixed, first attempt: the ramp was extended to walls using a new `wallElevationRaw`, recovered from the fragment's own world-space height, picked via `vDisplace > 0.5 ? elevationRaw : wallElevationRaw`. Since `vDisplace` is a per-vertex attribute that interpolates smoothly across a wall fragment, this ternary switched height sources mid-wall, at the exact line where interpolated `vDisplace` crosses 0.5, a hard color seam across every wall (Dana, 2026-10-19, screenshot: "there's a clear color border between the land chunk inside and outside color... a harsh border that shouldn't exist"). **Real fix:** `wallElevationRaw` and the ternary were unnecessary, removed entirely. `elevationRaw` (the plain texture sample at `vUv`) already gives each wall fragment its own column's real terrain height, constant down the whole wall, because the uv-placeholder fix two steps above already made a wall's top and bottom vertices share one real uv — exactly the per-column coloring Dana wanted, with no second height source and no seam.
- **Reopened, 2026-10-19:** the "expected, not a bug" line below was Dana's own earlier decision described after the fact, not something she'd signed off on seeing in practice — her retest showed real flattening and she rejected it ("it might be a tradeoff to you, i never agreed to this"). Still open: whether to revert to a per-patch range (the percent-clip histogram work below, already built, currently unused), add a separate local-contrast-stretch display layer on top of the global range (a different, real GIS convention from `WholeRaster`, to be researched before proposing specifics), or something else. Dana's call.

**The wall ramp, take two: top and sides as two separate materials, not one shared value**
- Dana's actual ask, restated in her own words: "cutting a slice of cake, the sides show the inside only, the top is the frosting and it does not bleed into the sides." The top surface keeps the real elevation ramp (`elevationRaw`, full detail, unchanged). The walls/bottom cap get their own plain, direct world-height-to-color mapping, no blending with the top's value at the boundary, no "subtle"/strata treatment, just the same `terrainRampColor` fed a different height source.
- New `isTopSurface` attribute (`voxel/smoothMesh.ts`, threaded through `shaders/chunk.vert.glsl`/`chunk.frag.glsl` as `vIsTopSurface`), 1 for every vertex of a top-surface triangle, 0 for every vertex of a wall/cap triangle, always uniform within one triangle, unlike `displace` (which must stay mixed within a wall quad for vertex positioning). Confirmed against real GLSL documentation first (Khronos forum threads on `flat`/provoking-vertex): a per-triangle-constant attribute shows up with no interpolation artifact, because interpolating a constant returns the same constant, this project's chunk mesh already builds the top surface and the walls as separate, non-shared triangles, so this applies directly.
- `chunk.frag.glsl` now branches the ramp's elevation source on `vIsTopSurface` (not `vDisplace`, which is what caused the earlier mid-wall seam): top surface uses `elevationRaw`; walls/cap use a plain `(vWorldPosition.y / uMaxHeight) - 0.5`. The branch is safe this time because `vIsTopSurface` never takes an intermediate value within a triangle, so every fragment in a given triangle agrees on which side of the branch it's on.
- Voxel mode's own separate mesh (`voxel/meshWorker.ts`) also had to gain this attribute (shared shader), set uniformly to 1 for every face — voxel's own elevation-ramp coloring is already a known, accepted placeholder limitation (its `uv` is always `(0,0)`, unrelated to this fix), so this keeps its current behavior unchanged rather than silently improving or regressing it as a side effect.
- **Same bleed, a different block:** Dana still saw a divide "from certain angles" after the above (2026-10-19). The normal-reconstruction block and the shadow block in `chunk.frag.glsl` were still gated on `vDisplace > 0.5`, not switched over to `vIsTopSurface` with the ramp. Since `vDisplace` still interpolates smoothly across a wall quad (it has to, for vertex positioning), the upper half of every wall was still getting the top surface's heightmap-gradient normal formula wrongly applied to it, switching to the wall's own correct flat normal only below the crossover point — invisible at light angles where the two normals happen to produce similar brightness, a sharp seam at others. Fixed: both blocks now key off `vIsTopSurface` too, same as the ramp. `vDisplace` itself is untouched, still needed for vertex positioning in `chunk.vert.glsl`.

**The slider's own max still didn't match the real ceiling**
- Diagnosed while chasing a separate flattening report: the Resolution slider's max was still 2048, while `MAX_PATCH_TEXTURE_RESOLUTION` (the real GPU-texture ceiling restored above) is 1024, the same honest-UI mismatch this issue originally started as, recurring in the newer cap. Fixed in `ui/Panel.tsx`: max lowered to 1024.

**The last piece: a flash to flat while actually dragging the slider**
- Dana confirmed this wasn't flatness above some resolution, it was a brief flicker to flat on every single tick while dragging, in both render styles, masked above 1024 only because the clamp above meant nothing new was actually triggered up there, not because the flicker stopped happening. Two WebGL extension theories (float-texture linear filtering, rendering to a float target) were checked directly in Dana's own browser console and ruled out with certainty, neither was missing.
- Live instrumentation (temporary `console.log`s, since removed) confirmed the real cycle: a dragged slider fires a full rebake, geometry rebuild, and mesh/material rebuild on every intermediate value, dozens of times a second, exactly the pattern already fixed once tonight for the planet's own resolution control, just never extended to the land chunk's own effect.
- Fixed in `voxel/landChunk.ts`: the same 150ms debounce already used for the planet (`scene/SceneCanvas.tsx`), scoped specifically to `resolution` via a new `debouncedResolution` value, not the whole effect, a new patch, a layer edit, a finished erosion run, or a render-style switch all still run immediately through the effect's other dependencies, only continuous slider-dragging is delayed.
- **Closed:** `voxel/LandChunkCanvas.tsx` was still rebuilding a brand new `ShaderMaterial` on every geometry change instead of reusing one and updating its uniforms, the documented Three.js anti-pattern this same investigation surfaced, on top of (not replaced by) the debounce above. Fixed: the material and mesh are now built once and kept for the component's whole lifetime; a later geometry change only swaps `mesh.geometry`, never rebuilds the material, so no shader recompile happens past the first time.

### [B23] The chunk's surface speckled with flickering dark patches · `wrong but workable`
**✅ Fixed:** 2026-10-13 · **Found:** 2026-10-13 · **Where:** `voxel/smoothMesh.ts`

**Cause**
- Terrain height clamps at zero and the slab's base cap also sat at zero, so every flat-bottomed area put the top surface and the base at identical depth. The GPU cannot order two coincident surfaces.

**Fix**
- The base sits below zero, giving the slab real thickness.

### [B16] Smooth-mesh walls were missing on some sides · `wrong but workable`
**✅ Fixed:** 2026-09-23 · **Found:** 2026-09-23

**Cause**
- Four walls each had their winding derived independently, so there were four chances to get the sign wrong, and a wrong winding makes a face invisible.

**Fix**
- One boundary walk using a single formula, verified once rather than four times.

### [B19] Switching view mode reset the planet's color and camera · `wrong but workable`
**✅ Fixed:** 2026-09-23 · **Found:** 2026-09-23

**Cause**
- The view-mode control conditionally rendered each pane, so leaving a mode destroyed that pane's whole scene, camera and renderer. Returning built a new one, showing the shader's construction-time placeholder color.

**Fix**
- Both panes stay mounted and only their visibility toggles.

### [B20] Chunk sat half-buried under the grid · `minor`
**✅ Fixed:** 2026-09-23 · The mesh centred all three axes including the vertical one.

---

## 💡 Lighting

*How surfaces are shaded.*

### [B06] Terrain bumps didn't show in lighting · `wrong but workable`
**✅ Fixed:** 2026-09-16 · **Found:** 2026-09-16

**Cause**
- A screen-space-derivative normal was tried first and faceted the whole sphere, since derivatives are near-constant per triangle. Dana liked the look enough to keep it as a possible future style option.

**Fix**
- The sphere's tangent basis is computed analytically, so the normal is smooth and independent of mesh resolution.
- Two follow-ups: tangents were unit-sphere-relative while displacement was world-scaled, and `normalMatrix` is auto-set by Three.js but not auto-declared in the fragment stage.

---

## 🌈 Terrain color

*The elevation color ramp, a placeholder for Stage 11's real height+climate+biome shader.*

### [B29] Color contrast still appears too suddenly · `minor`
**✅ No longer reproducing:** 2026-10-19 (Dana: "it doesnt, its fine") · **Found:** 2026-10-13 · **Where:** `shaders/fragment.glsl`, `shaders/chunk.frag.glsl`

**What happened**
- The ramp's Mid/High contrast fades in as Height (%) rises, rather than always filling the full range — but Dana reported it still appeared too sudden even after that fix. Re-checked 2026-10-19 (after the unrelated chunk-color/[B32] work above), no longer seen. Left as-is, not re-diagnosed further, since there's nothing left to chase.

### [B30] Steep terrain went near-black with Cast shadows off · `wrong but workable`
**✅ Fixed:** 2026-10-14 · **Found:** 2026-10-14 · **Where:** `shaders/fragment.glsl`, `shaders/chunk.frag.glsl`, `shaders/terrain.glsl`

**What happens**
- With Color by elevation on, steep slopes read near-black even with Cast shadows off, crushing the ramp's own colors toward black instead of showing them (Dana, 2026-10-14: "the only darkening should be from shadows").

**Cause**
- `slopeAmbientOcclusion` cut the ambient term to as low as 0.4x of normal on any steep face, but only while Color by elevation was on. This terrain is almost entirely steep spike flanks, so ambient collapsed nearly everywhere; combined with faces turned away from the light, brightness bottomed out near black. Not a real shadow, a slope-based approximation standing in for one.

**Fix**
- Removed the slope darkening entirely, from both shaders and its now-unused definition in `terrain.glsl`. Brightness now comes only from the real ambient floor, real diffuse lighting, and actual cast shadows (land chunk only, for now).

### [B31] Terrain reads as unrealistically spiky · `minor`
**✅ Fixed:** 2026-10-14 · **Found:** 2026-10-14 · **Where:** `shaders/heightmap.frag.glsl`

**Cause**
- `ridge()` (`shaders/noise.glsl`) folded the *final*, already-summed fBm value once, rather than folding each octave individually the way real ridged-multifractal noise does (Musgrave's method, see `REFERENCES.md`). Folding a single high-frequency signal turns every zero-crossing into a sharp peak, which read as a few broad ridgelines at low frequency but as a dense field of small, isotropic spikes at high frequency. `randomizeTerrain()` (`map/noiseLayers.ts`) can independently roll `frequency` up to 20 (5x the default of 4), `heightScale` up to 10 (10x the default of 1), and `ridgedEnabled` true, all at the same time, this combination was a likely result of one randomize press, not a rare edge case.

**Fix**
- Added `ridgedFbm3D()`, a real per-octave ridged accumulation: each octave's own sample is folded via `ridge()` before being summed, weighted by the previous octave's own folded magnitude as a feedback term, matching the cited algorithm's structure rather than approximating it. Reuses the existing `ridge()` and `ridgeAmount`, no new uniforms. Only replaces the path when both Octaves and Ridged are enabled together, a single ridged sample with no octaves had nothing per-octave to fix.

### [B34] Harsh, noisy-looking lighting on dense chunk terrain · `minor`
**✅ Fixed:** 2026-10-19 · **Found:** 2026-10-19 · **Where:** `shaders/chunk.frag.glsl`

**Cause**
- The top surface's per-fragment normal is rebuilt from the heightmap's own central-difference gradient (`chunk.frag.glsl`), reading 1 texel to either side. On this terrain's typically high-frequency, high-amplitude noise, a 1-texel step reads the noise's own grain as if it were the real slope, producing a sharp, metallic, "faceted" look under lighting rather than a smooth one.

**Fix**
- Widened the gradient step to 32 texels, matching `fragment.glsl`'s (the planet's) own already-validated `sampleOffset` for the identical problem, same reasoning carried over rather than re-derived.

### [B35] Land chunk shadows look harsh · `minor`
**🔴 Open** · **Found:** 2026-10-19 · **Where:** `shaders/terrain.glsl` (`heightmapShadow`)

**What happens**
- Dana, pointing back at her earlier screenshots: "the shadows are harsh... in the land chunk."

**Cause**
- Not yet diagnosed against real technique, only a structural observation: `heightmapShadow` is a binary hit-test, a sample point is either fully lit or fully shadowed (`return 0.0`/`return 1.0`), with no soft edge/penumbra at all. That's inherent to the simple raking self-shadow march this uses (real, cited technique, see `REFERENCES.md`), not a bug in how it's wired, so this is new work (a soft-shadow technique), not a fix to something broken. Needs research into real soft self-shadow approaches before proposing anything specific, per standing rule, not something to invent from first principles.

---

## 🖥️ UI & panels

*The controls and the viewport around them.*

### [B22] Panel width changed with content · `wrong but workable`
**✅ Fixed:** 2026-09-30 · **Found:** 2026-09-30

**Cause**
- Panels auto-sized to whatever was visible, so they resized whenever an accordion opened or a tab switched. A hardcoded width was rejected in turn.

**Fix**
- A drag handle, so width changes only on an explicit drag.
- Follow-up: at narrower widths, slider and select rows overflowed rather than shrinking, because browsers give those inputs an intrinsic minimum that `flex: 1` alone cannot override.

### [B21] Expand covered the whole window · `wrong but workable`
**✅ Fixed:** 2026-09-24 · It overlaid both panels instead of replacing the viewport's content.

### [B03] Gumball drew on top of the right panel · `minor`
**✅ Fixed:** 2026-09-14 · Positioned against the window rather than the viewport.

### [B02] Gumball axis drags did nothing · `wrong but workable`
**✅ Fixed:** 2026-09-09 · Two `pointer-events` gaps.

### [B01] Grid duplicated on resolution change · `minor`
**✅ Fixed:** 2026-09-09 · A StrictMode-related leak.

---

## 🏗️ Architecture

*Structural problems, and limits tracked but not scheduled.*

### [B11] App.tsx became a five-feature monolith · `wrong but workable`
**✅ Fixed:** 2026-09-22 · **Found:** 2026-09-22

**Cause**
- Lighting, planet appearance, layers, painting and persistence had all accumulated as loose state directly in `App.tsx`, each wired in as it was built.

**Fix**
- One hook per feature, with `App.tsx` reduced to composition only.
- The standing rule came out of this: give a feature its own hook the moment it adds state, rather than accumulating and splitting later. Caught by Dana rather than done proactively.

### [B28] The planet's own detail was capped by the map
**🟡 Implemented, not yet visually verified** · **Raised:** 2026-10-13 · **Built:** 2026-10-17 · **Where:** `planet/PlanetPatchRenderer.ts`, `planet/planetPatches.ts`, `planet/planetPatchMesh.ts`, `shaders/planetPatch.frag.glsl`, `map/heightmap.ts`, `scene/SceneCanvas.tsx`

**What happened**
- The planet displaced from one 1024x512 map, so zooming into it revealed nothing past what that held. [B26] was the same cause.
- The land chunk didn't have this problem, since it read its own patch. The planet now gets the same treatment.

**Fix**
- The planet renders as patches that subdivide by camera distance (CDLOD-style, see `REFERENCES.md`), walking `patch.ts`'s existing quadtree, each patch baking and sampling its own small heightmap via `heightmapPipeline.bakeRegionToTarget()` (a new method, since the existing `renderRegion`/`renderDisplayRegion` each only ever hold one texture at a time, and the planet now needs many simultaneously).
- **Seam handling**: a restricted quadtree, no two same-face neighboring patches differ by more than one depth level, plus a physical skirt around every patch's edge to visually cover whatever gap a one-level difference (or an un-balanced cross-face boundary) still leaves. Full CDLOD vertex-morphing across every neighbor combination was the more complete alternative; this is the simpler, well-known mitigation, chosen given the scope of a single pass.
- **Known gap, not silently dropped**: cross-face seam balancing (between two different cube faces, not just within one) isn't implemented, only same-face. The skirt mitigates how visible this is but doesn't eliminate it. Worth a follow-up pass once Dana has actually seen how noticeable it is.
- **Known gap**: Wireframe display mode isn't reimplemented for patches this pass, selecting it falls back to the old single-mesh planet (kept fully intact behind `USE_PLANET_PATCHES` in `SceneCanvas.tsx`, a real fallback, not scaffolding).
- A side effect worth knowing: the old pole/seam-unwrapping complexity in `planet/mesh.ts` (`SEAM_FACE`, `facePatches`, equirect UV unwrapping) existed specifically because of the lat/long tangent basis the single shared map needed. A patch's own cube-face-local tangent basis has no pole singularity and no wrap line at all, so this likely also resolves [B26], not just [B28], though that needs Dana's own visual confirmation, not asserted here.
- **Regression, 2026-10-18:** turning this on made the planet render almost entirely black with the whole app feeling frozen/unresponsive. Root cause not confirmed, strongest lead (noted in-code, `SceneCanvas.tsx`) is the per-frame patch reselect/rebake in `PlanetPatchRenderer.updatePatches`. `USE_PLANET_PATCHES` was set back to `false` as a working fallback (the old single-mesh path stays fully built either way, just hidden) rather than shipped broken. Still open: diagnose this for real, fix it, flip the flag back to `true`. This is what actually governs the planet's resolution ceiling, the 256 limit Dana's been seeing belongs to the old fallback mesh (`meshSegments`), not to this system.
- **Re-tested, 2026-10-19:** a diagnostic fork ruled out three real candidates for the blackness/freeze by checking actual Three.js source (scissor/viewport bleed, float-texture mipmap filtering, an LOD explosion at the default camera distance), and found one small, genuine, unrelated bug (`planetPatch.frag.glsl`'s bump gradient sampled `.r` instead of `.g`, the project's own elevation-channel convention, cosmetic only, not yet fixed). `USE_PLANET_PATCHES` was then actually flipped to `true` to get real output: the near-black/frozen regression did **not** reproduce. What Dana saw instead: the Scene panel's stored default lighting values read as near-black on this terrain (not a patches-specific bug), and visible dark seams between patches, not aligning, "the main issue." The original 2026-10-18 report was most likely this same bad-default-lighting reading as "black," compounded by the choppy-load issue below reading as "frozen," not a deeper rendering bug, though this isn't asserted with certainty, only consistent with everything observed since.
- **Fixed, 2026-10-19 — the chunk and planet didn't actually agree on lighting:** Dana: "the chunk looks dark, why don't they match, the chunk should be located where the planet is." Real cause: the land chunk always renders its patch flat with world +Y as "up," but the patch itself can be anywhere on the real sphere, with its own real outward direction. The chunk fed the raw shared light vector straight in regardless, correct only by coincidence for a patch directly under the light. Confirmed by Dana's own empirical detail: the mismatch showed up "mostly" in light elevation, exactly the component measured against local up, so the most sensitive to this. Fixed with `planet/patch.ts`'s new `patchLightDirection()`, the same East-North-Up-style reframing geodesy uses to re-express a direction at a point on a sphere (see `REFERENCES.md`): rotates the shared light vector by whatever rotation takes the patch's real surface direction to `(0,1,0)`. `LandChunkCanvas.tsx` now takes `patch` as a prop and uses this instead of the raw vector; `App.tsx` passes it through.
- **Reverted, 2026-10-20:** the rotation above made the chunk go dark whenever its current patch happened to face away from the light, real and physically consistent, but not what Dana wants: "it's located somewhere in space so it really doesn't matter... the chunk should always have light on it, but i should be able to tweak the lighting settings." The chunk is an inspection view, not a simulation of that exact spot's day/night side. `patchLightDirection()` removed entirely (now unused), `LandChunkCanvas.tsx` back to the raw shared vector, its own `patch` prop and `App.tsx`'s pass-through removed along with it.
- **Found the same turn, the actual remaining cause of chunk darkness:** independent of the above, the Scene panel's own default `lightDirY` was `-1` (light from *below* horizontal). The chunk's top surface always faces exactly `+Y`, so a negative `lightDirY` gives it zero real diffuse light, ambient only, dark by construction, regardless of rotation or direction logic. The planet never showed this, a sphere always has some surface facing any given direction. Fixed in `scene/sceneControls.ts`: `lightDirY` flipped from `-1` to `1`, sign only, same grazing character intended for the 2026-10-19 default otherwise.
- **Still dark after that, 2026-10-20 — the real structural fix.** The sign flip wasn't enough: a grazing elevation (small vertical component relative to the horizontal ones) is reasonable *on the planet*, where a sphere always has some point facing closer to the light, but the chunk's fixed flat `+Y` can never get that — any sufficiently grazing shared elevation dims it, sign aside. Dana: "they can share all light settings, beside the elevation." Fixed by actually splitting that one value: `scene/sceneControls.ts` gained `chunkLightDirZ`/`setChunkLightDirZ`, independent of the planet's own `lightDirZ`, defaulted to `0.7` (Dana's own found-by-testing value). `App.tsx` feeds the chunk this instead of the shared value; the Scene panel's "Light elevation" slider rebinds between the two by `activeViewContext`, the same established pattern already used for Radius/Size and Resolution. Every other light setting (ambient, intensity, X/Y position, specular, shininess) stays genuinely shared, only elevation doesn't.
- **Also added, same turn — Half Lambert for the chunk's own diffuse term** (`shaders/chunk.frag.glsl`, Mitchell, "Shading in Valve's Source Engine," SIGGRAPH 2006, see `REFERENCES.md`): softens the falloff instead of hard-clamping to 0 at a 90° angle, so the chunk doesn't go fully flat/unlit on its "back" side the way plain Lambert can. Complements the elevation split above rather than replacing it, a safety margin for whatever elevation gets picked, not the fix for the structural problem itself.
- **Default specular lowered, 2026-10-20** (Dana: "too harsh"): `scene/sceneControls.ts`'s `specularStrength` default, `0.3` → `0`. Shared by both views, still a live, adjustable slider either way.
- **Changed, 2026-10-19:** the Scene panel's stored default lighting values (`scene/sceneControls.ts`) were visibly too dark against real terrain. Updated after the fix above landed, so judged against a chunk that actually agrees with the planet: `ambientLight` 0.12→0.26, `lightDirX` 1→1.6, `lightDirY` 1→-1, `lightDirZ` 1→-4.3.
- **Fixed, 2026-10-19 — choppy loading:** `PlanetPatchRenderer.updatePatches` built and baked every newly-visible patch synchronously (a real GPU bake plus a `ShaderMaterial` compile each), so a burst of patches becoming visible at once (first load, especially) was a real spike in one frame. Fixed with a pending-build queue (`pendingBuilds`) drained at most `MAX_NEW_PATCHES_PER_FRAME` (4) patches per call, regardless of the camera-movement reselect throttle, so a burst spreads across several frames instead. Matches Unigine's own terrain-streaming docs, which cap tiles loaded per frame the same way (see `REFERENCES.md`).
- **The patch seams**, "the main issue" per Dana: dark gaps between patches, appearing mid-face (not at an actual cube-face boundary), so distinct from the already-known, already-logged cross-face seam gap below. A fork traced this to two separate, real, confirmed causes, not one:
  - **Fixed, 2026-10-19 — a half-texel edge misalignment.** Each patch bakes its own heightmap independently, and a GPU samples a texture at each texel's own center, not its edge, so a patch's edge texel actually held the height for a point slightly inside the patch, not the true boundary. Two neighbors each inset in opposite directions around what's meant to be one shared line, so even matching-resolution neighbors could disagree slightly right at the seam. Fixed the standard way GeoTIFF/DEM tiling handles this exact "pixel is area vs. pixel is point" mismatch (see `REFERENCES.md`): `shaders/heightmap.frag.glsl` now remaps its region-bake `vUv` to land exactly on the true boundary at the first/last texel, via a new `uRegionSamples` uniform (the bake target's own resolution, set in `map/heightmap.ts`'s `bakeRegionInto()`).
  - **In progress, the bigger one — different vertex counts across an LOD boundary.** Every patch always uses a fixed 65 vertices per edge regardless of its own physical size, so where one patch is subdivided one level further than its neighbor, the neighbor's single edge spans the same physical distance the two finer patches cover with twice as many points. Every other one of those extra points exists on the finer side with its own real height and simply isn't represented on the coarser side at all, a classic T-junction crack, and neither side's skirt (which only extends its own existing edge points straight down) bridges it. The established fix (de Boer's geomipmapping, see `REFERENCES.md`) is a triangle fan stitching the extra points down to the coarser edge. Broken into testable stages, built one at a time so Dana can confirm each before the next builds on it:
    - **Stage 1, landed 2026-10-20:** `planet/planetPatches.ts` gained `computeStitchFlags()` (new `EdgeStitchFlags` type), flagging, per patch, which of its four edges border two same-face neighbors one level finer. `planet/planetPatchMesh.ts`'s `buildPatchGeometry` gained a `stitchFlags` parameter, but only actually stitched the **top** edge that stage, on purpose, as the smallest first testable piece.
    - **Stages 2+3, landed 2026-10-20/21:** generalized to all four edges, plus the corner case (a patch with two adjacent edges both needing stitching at once), which de Boer's own technique doesn't cover on its own (it bridges one edge's 2:1 density change, not two meeting at a point). `buildPatchGeometry` rebuilt around a corner-aware architecture: the four corners are now single shared vertices (not owned by either adjacent edge), each edge is its own strip between its two corners (plain or doubled density per its own flag), the interior stays a plain fixed grid one ring smaller than the full patch, and each corner's own small unit cell is triangulated as a fan from the corner vertex across however many points its two adjacent edges actually have there (4, 5, or 6, depending on 0/1/2 of them being doubled) — reasoned through directly via worked examples for each case, then confirmed with an automated topology check (every edge in the combined surface+skirt mesh shared by exactly 2 triangles, except real free boundaries), run across 11 representative stitch-flag combinations including every pair of adjacent edges and all four at once: identical result in every case, 0 new topological defects relative to the unstitched baseline.
    - **Open scope question, not yet decided:** a patch's geometry is only built once, when first selected. If a neighbor's depth changes later while this patch stays selected, nothing today triggers a rebuild for this patch, so a seam could reappear without this patch itself changing. Fix now or log as a known, accepted gap (same way the cross-face gap above is) is Dana's call, not resolved here.
- **Fixed, 2026-10-20 — the planet's own Resolution slider silently stopped doing anything.** `meshSegments` only ever controlled the old single whole-globe mesh, which patches now hide in every display mode except Wireframe (patches don't have their own wireframe overlay yet, a known, separate gap, see `ROADMAP.md`). Dana: "the res slider isnt doing anything." Fixed in `ui/Panel.tsx`: the slider now disables itself for the planet outside Wireframe mode, with a description explaining why, instead of silently doing nothing.

### [B05] 📋 GPU compute for voxel meshing
**📋 Tracked, not scheduled** · **Raised:** 2026-09-23

- CPU meshing has a real ceiling: worst-case triangle counts at very high resolution risk crashing the tab from raw buffer size.
- Not adopted because Three.js cannot run both renderers at once, so it would mean migrating the entire app and porting every hand-written shader to a different shading language.

### [B04] 📋 Wireframe overlay doesn't track displacement
**📋 Tracked, not scheduled** · **Raised:** 2026-09-14

- The overlay is built once from undisplaced geometry, so it never follows the real terrain. Barely visible until terrain had real height; obvious now.
- Fix is to give it its own shader sampling the same heightmap.

### [B00] 📋 Design-system tokenization
**📋 Tracked, not urgent** · **Raised:** 2026-09-09

- Colors, lighting, camera distance and similar are scattered inline with no central place to adjust them. Each is flagged `TODO(DS)` until they move into CSS custom properties and a scene-config file.

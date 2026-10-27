# 📚 References

`Last updated: 2026-10-26`

*Every outside source this project relies on, with what it is and what was taken from it. Cited once here, linked from everywhere else.*

> [!NOTE]
> Grouped as **conceptual** (ideas and framing), **visual** (look and reference imagery) and **computational** (methods, algorithms and implementations used in the tool).
>
> A source is listed only once it has actually been read and used. Something mentioned in discussion but never verified is marked ⚠️ and says so.

---

## 🧠 Conceptual

*Ideas and framing. Gathered mostly in response to the class feedback that the project read as 3D terrain software rather than a procedural system.*

**Node-graph pipelines where output flows downstream** · World Machine, Gaea · `framing`
- Changes upstream recompute everything below them live, which is what makes a pipeline causal rather than a set of parallel panels.
- The reference for the stage structure adopted here, and already this project's source for blend-mode conventions.
- *[World Machine](https://world-machine.com/) · [Gaea docs](https://docs.quadspinner.com/Guide/)*

**Climate as a named stage before Biome** · `naming and ordering`
- Confirms "Climate" rather than Atmosphere or Weather as the established name, sequenced after erosion and before biome classification.
- Settled both the stage's name and its position rather than either being invented.
- *[World Machine's wetness documentation](https://help.world-machine.com/?p=92) · [AutoBiomes](https://cgvr.cs.uni-bremen.de/papers/cgi20/AutoBiomes.pdf) · [a multi-biome pipeline](https://cgvr.cs.uni-bremen.de/theses/finishedtheses/multibiom/)*

**Biome classification from elevation, moisture and temperature** · `method`
- How a production system turns continuous values into discrete biomes. Minecraft matches five parameters per location against each biome's ideal values.
- The model for Stage 10.
- *[Red Blob Games, polygonal map generation](https://www.redblobgames.com/maps/polygon-map-generation/) · [Minecraft's noise generator](https://minecraft.fandom.com/wiki/Noise_generator)*

**Procedural planets end to end** · Sebastian Lague · `framing`
- Noise layering through biomes to water, close to this project's own scope.
- *[Procedural Planets playlist](https://www.youtube.com/watch?v=QN39W020LqU&list=PLFt_AvWsXl0cONs3T0By4puYy6GM22ko8)*

**Simulations that play themselves** · Ian Cheng, *Emissaries* · `framing`
- Live simulations of ecosystems and communities built on a game engine, where the story comes out of agents rather than being written.
- The project's anchor reference since the 2026-10-26 change of direction: a world you set up, then watch evolve.
- *[MoMA, Ian Cheng: Emissaries](https://www.moma.org/calendar/exhibitions/3656). Read 2026-10-26*

**Evolved alien plants** · Karl Sims, *Panspermia* · `framing`
- An animation of an alien plant life cycle, made with Sims's own artificial evolution of plant forms.
- The second anchor reference, for the evolving plants planned on the land chunk.
- *[Panspermia](https://www.karlsims.com/panspermia.html). Read 2026-10-26*

**Seed-driven worlds that stay coherent** · Sean Murray · `framing`
- One system producing wildly different but coherent worlds, which is the basis for generating themes from continuous axes rather than authoring them.
- ⚠️ On GDC Vault; no stable direct link found.
- *"Building Worlds Using Math(s)" and "Continuous World Generation in No Man's Sky"*

**Master-detail navigation** · `UX pattern`
- An established named pattern for complex navigation, with accordions a recognized variant of the master pane. The basis for the left panel being the pipeline.

**Timeline conventions in editors** · Premiere, After Effects · `UX pattern`
- The time ruler sits above the content, and is the only place the playhead can be dragged, so a drag can never grab the content underneath it.
- Zoom anchors on the pointer rather than on the left edge, with keys for stepping the zoom and one for fitting the whole range.
- Taken for the ruler's behavior only. Placement is not taken: this project's timeline appears with the stage that uses it rather than sitting under the viewport permanently.
- *[Premiere's timeline panel](https://ittrainingcontent.iu.edu/training/proba/files/pc/understanding-timeline-panel.html) · [why the playhead is ruler-only](https://creativecow.net/forums/thread/click-anywhere-in-timeline-to-move-playhead-cti-an/) · [timeline zoom](https://filmora.wondershare.com/video-editing-tips/premiere-pro-how-to-zoom-in-on-timeline.html). Read 2026-10-13*

---

## 🎨 Visual

**Multi-stop gradient ramp editor** · Blender Color Ramp · `UX pattern used`
- A horizontal bar; each stop has its own position and color; drag a stop to reposition it, an Add control inserts a new one, a Delete control removes the selected one; Linear is one of several interpolation modes between stops.
- The convention `ui/panels/ColorRampEditor.tsx` follows: drag along the bar, click empty space to add (sampling the ramp's own current color there), delete the selected stop, linear interpolation. Base color stays the fixed stop at position 0 (Dana, 2026-10-13), not a separate control.
- *[Blender Manual, Color Ramp Widget](https://docs.blender.org/manual/en/4.1/interface/controls/templates/color_ramp.html). Verified 2026-10-20.*

---

## ⚙️ Computational

*Methods and implementations the tool actually uses.*

### Noise, used directly in the code

**3D Perlin noise** · Stefan Gustavson, with Ian McEwan of Ashima Arts · `code used` · MIT
- The classic gradient noise implementation, in `shaders/noise.glsl` as `perlinNoise3D`.
- Verified against the canonical source rather than reproduced from memory, which caught a wrong constant in `permute()` that would have been invisible otherwise.
- *[stegu/webgl-noise](https://github.com/stegu/webgl-noise), `src/classicnoise3D.glsl`. Verified 2026-09-14*

**3D Simplex noise** · Stefan Gustavson, with Ian McEwan of Ashima Arts · `code used` · MIT
- In `shaders/noise.glsl` as `simplexNoise3D`, sharing the permutation helper with the Perlin entry above.
- *[stegu/webgl-noise](https://github.com/stegu/webgl-noise), `src/noise3D.glsl`. Verified 2026-09-14*

**Fractal Brownian motion** · `method used`
- The standard octaves, persistence and lacunarity summation, applied over whichever base generator a layer selects.
- *[The Book of Shaders, chapter 13](https://thebookofshaders.com/13/). Verified 2026-09-14*

**Ridged multifractal noise, per-octave folding** · `method used` · MIT (libnoise)
- Genuine ridged-multifractal noise folds each octave individually, weighted by the previous octave's own value as a feedback term, rather than summing fBm first and folding the result once. Implemented as `ridgedFbm3D()` in `shaders/heightmap.frag.glsl`, reusing this project's own `ridge()` and `ridgeAmount` rather than libnoise's separate gain/offset uniforms. See `[B31]` in `ISSUES.md`.
- *[libnoise RidgedMulti module docs](https://libnoise.sourceforge.net/docs/classnoise_1_1module_1_1RidgedMulti.html). Verified 2026-10-14.*

### Terrain queries

**Maximum mipmaps, hierarchical min/max reduction** · Tevs, Ihrke, Seidel · `method used` · I3D 2008
- A hierarchical pyramid built by a min or max reduction at each level (not an averaging mipmap), applied directly to height fields for cheap, exact range queries and ray-stepping. The same lineage as Greene, Kass and Miller's 1993 hierarchical Z-buffer, applied to terrain. Built for the land chunk's elevation-range query (replacing a full-resolution CPU readback on every Resolution-slider change, see `[B32]` in `ISSUES.md`): a sequence of GPU downsample passes reduces to a single texel holding the patch's true min/max, so only that one texel is ever read back, not the full buffer, and the result is exact, not approximated from a coarser bake.
- The literal min/max this returns is exactly what Percent Clip (below) exists to avoid using directly for a color ramp: confirmed as the cause of `[B32]`'s color-banding regression, a single outlier pixel set the ramp's own range, crushing the terrain's real bulk variation into a narrow slice of it. Fixed by the GPU histogram below, which now bins against this technique's own literal range rather than replacing it, this one still answers a different, legitimate question (the literal range) correctly, and the histogram needs exactly that as its own bucketing bounds.
- *Tevs, A., Ihrke, I., Seidel, H.-P. (2008), "Maximum Mipmaps for Fast, Accurate, and Scalable Dynamic Height Field Rendering," I3D 2008. Verified 2026-10-17.*

**GPU histogram, for a percentile-robust range (not raw min/max)** · Unity/Bevy auto-exposure · `method used`
- The same problem this project already solved on the CPU for Percent Clip (`map/elevationRange.ts`: bin the data, walk the cumulative count to a percentile, instead of trusting the literal extremes) has a standard GPU equivalent, used in production for HDR auto-exposure: build a histogram of the frame's own values (luminance, there; elevation, here), then compute the average/range from the bins between a low and high cutoff percentage, discarding the rest, exactly Percent Clip's own definition. Unity's Post-Processing auto-exposure and a documented Bevy compute-shader implementation both build a histogram (64 bins) this way, then filter it by percentile cutoffs before using it.
- WebGL (no compute shaders, this project's whole constraint) builds a histogram by rasterization instead: draw one point per source pixel, compute that pixel's bin index, position the point at that bin's location in a 1D output texture, and let additive blending (`gl.ONE, gl.ONE` blend func) accumulate the count per bin, into a float render target (WebGL has no integer blending/atomics, so counts must be floats). Matches this project's own existing pattern of multi-pass fragment-shader rendering (erosion, the min/max pyramid above) rather than needing a new rendering style.
- Built for `[B32]`: a histogram pass (256 bins, matching `elevationRange.ts`'s own bin count, now exported and shared rather than duplicated) over the same region-bake texture the min/max pyramid already reads, then a tiny readback (256 floats, not the full buffer) to walk the cumulative count to the 1st/99th percentile client-side, the same walk `computeElevationRange()` already does, just fed from a GPU-built histogram instead of a full CPU array. See `map/heightmap.ts`'s `getRegionPercentileRangeAsync()`.
- *[Unity Auto Exposure / Eye Adaptation docs](https://docs.unity3d.com/Packages/com.unity.postprocessing@2.0/manual/Auto-Exposure.html) (percentile histogram filtering, "Filtering" low/high percentages). [Creating a histogram using rasterization?: Khronos community forum](https://community.khronos.org/t/creating-a-histogram-using-rasterization/76746) and [webgl2fundamentals: 16-bit histogram](https://webgl2fundamentals.org/webgl/lessons/webgl-qna-how-can-i-create-a-16bit-historgram-of-16bit-data.html) (point-sprite + additive-blending construction, the WebGL-compatible mechanism). Verified 2026-10-18.*

**Whole-dataset vs. current-view color stretch** · QGIS raster symbology · `method used`
- A real, named choice in GIS tools, not one universal rule: `WholeRaster` (stretch computed once from the entire dataset, stays fixed at every zoom/pan) versus `CurrentCanvas`/`UpdatedCanvas` (stretch recomputed from whatever's currently visible, shifts as you navigate).
  - This project's own color ramp uses the first: a shared elevation range computed once from the whole planet, so the same real elevation reads as the same color everywhere, whether zoomed into the planet or one land-chunk patch of it, matching the project's own earlier decision that the ramp "should encompass all terrain levels that exist in the planet."
  - The chunk's own per-patch range computation (tonight's GPU histogram work included) was a drift from that decision, corrected by reading the planet's already-computed range instead of recomputing one locally.
- *[QgsRasterMinMaxOrigin: QGIS C++ API docs](https://api.qgis.org/api/3.40/classQgsRasterMinMaxWidget.html) (`Limits` enum: `WholeRaster` vs `CurrentCanvas`/`UpdatedCanvas`). Verified 2026-10-18.*

### Rendering

**Multiple views, one shared renderer** · Three.js project · `method used`
- One `WebGLRenderer` draws into one canvas; each view gets its own `setScissor()`/`setViewport()` rectangle per frame, read from a DOM placeholder element's own `getBoundingClientRect()` (converted from the DOM's top-left origin to WebGL's bottom-left one), with the scissor test on so each region clears and draws independently without touching the others. Built as the fix for the planet and land chunk previously being unable to share a GPU texture at all, each owned a separate `WebGLRenderer`/context, and a render target's texture belongs to the context that created it. See `scene/sharedViewportRenderer.ts`, `[S28]` in `SPEC.md`, `[B32]` in `ISSUES.md`.
- *[mrdoob/three.js](https://github.com/mrdoob/three.js), `examples/webgl_multiple_elements.html`. Verified 2026-10-17.*

**A world-space direction, re-expressed in a point's own local frame** · geodesy / tangent-space lighting · `superseded 2026-10-20`
- Geodesy's East-North-Up (ENU) local tangent plane: a direction vector (e.g. a sun vector) at a specific point on a sphere is rotated into that point's own local frame, built from its own local "up" (the surface normal there), not world up. Tangent-space normal mapping does the identical thing for a light vector against a surface's own basis.
- Was used to fix the land chunk's light direction via a new `patchLightDirection()` (`planet/patch.ts`). Reverted the same day: Dana decided the chunk shouldn't be tied to its real position at all ("it's located somewhere in space so it really doesn't matter"), `patchLightDirection()` was removed entirely. See `ISSUES.md` `[B28]` for what replaced it (a chunk-only elevation value, plus Half Lambert below).
- *[Local tangent plane coordinates](https://en.wikipedia.org/wiki/Local_tangent_plane_coordinates) · [ECEF ↔ ENU transforms, ESA Navipedia](https://gssc.esa.int/navipedia/index.php/Transformations_between_ECEF_and_ENU_coordinates) · [Normal mapping](https://en.wikipedia.org/wiki/Normal_mapping). Verified 2026-10-19.*

**Soft shadows from a raymarch, free of extra cost** · Quilez · `method used`
- During a shadow march that already steps toward the light checking for an occluder, track the minimum ratio of how far above/below the ray each sample's height gap is relative to the distance traveled, instead of returning a hard 0/1 the moment one sample occludes. Converts a binary hit into a continuous penumbra, same march, same step count, no new samples.
- Adapted here for a heightfield march (the original is for a signed-distance-field raymarch): the "distance to the nearest surface" term becomes the ray's own height above the sampled terrain at that step, converted to world units via the patch's own `maxHeightWorld`, divided by the real world distance traveled, scaled by a tunable softness constant (`SHADOW_SOFTNESS`, `shaders/terrain.glsl`).
- *[Quilez, "Soft Shadows"](https://iquilezles.org/articles/rmshadows/). Read 2026-10-20.*

**Half Lambert, so a surface's unlit side isn't flat black** · Mitchell / Valve · `method used`
- Remaps the diffuse dot product from its usual -1..1 range to 0..1 (`dot * 0.5 + 0.5`, then squared) instead of clamping anything below 0 straight to black. Valve's own description: keeps an object's rear from looking flat.
- Used for the land chunk's own diffuse term (`shaders/chunk.frag.glsl`): it's a flat patch always facing one fixed direction, so a grazing or unfavorable light angle can leave it looking fully unlit with plain Lambert, this softens that without overriding any of Dana's own lighting controls.
- *[Half Lambert, Valve Developer Community](https://developer.valvesoftware.com/wiki/Half_Lambert) · [Mitchell, "Shading in Valve's Source Engine," SIGGRAPH 2006](https://advances.realtimerendering.com/s2006/Mitchell-ShadingInValvesSourceEngine.pdf). Verified 2026-10-20.*

### Erosion

**Hydraulic erosion, droplet-based** · Sebastian Lague · `considered` · MIT
- The most-copied reference implementation, and the basis of the September decision for Stage 08.
- ⚠️ Now in question: it is a CPU implementation, and research since points to grid-based erosion for a GPU pipeline. See `[S25]` in `SPEC.md`.
- *[SebLague/Hydraulic-Erosion](https://github.com/SebLague/Hydraulic-Erosion)*

**Hydraulic erosion, grid-based** · Mei, Decaudin and Hu · `proposed`
- A shallow-water model whose flow velocity drives erosion, deposition and sediment transport, designed to run entirely on the GPU.
- Proposed for Stage 08 in place of the droplet approach, because droplets need scattered writes that WebGL handles badly.
- *[Interactive Terrain Modeling Using Hydraulic Erosion](https://diglib.eg.org/items/60afda0c-a666-4df8-90dd-9b80afc554c2/full) · [Eulerian erosion writeup](https://sapereaude1490.itch.io/eulerian-erosion)*

**The grid model's pass order, checked against two GPU implementations** · `proposed`
- Per step: add water, update the outflow flux, apply it to get the new water depth, derive the velocity field, erode or deposit against sediment capacity, move sediment along the velocity, evaporate.
- Three state textures: terrain height with water depth and sediment together, the four outflow amounts, and velocity. Constants named sediment capacity, dissolving, deposition and evaporation.
- Checked against two independent implementations rather than taken from the paper's prose, the same way the noise above was verified.
- *[bshishov, Unity compute-shader erosion](https://github.com/bshishov/UnityTerrainErosionGPU) · [Interactive erosion simulator on GPU, with the equations](https://huw-man.github.io/Interactive-Erosion-Simulator-on-GPU/). Verified 2026-10-13*

**Erosion exposed as separately named rates** · Houdini · `naming`
- Water and sediment are separate named parameters rather than one amount slider: Rainfall Coverage, Evaporation Rate, Erosion Rate, Deposition Rate and Removal Rate, alongside Flow Force, Erodability, Bank Angle and Slope Influence. Thermal has Weathering Force, Cut Angle and Repose Angle.
- Each force has a zero that turns that half of the simulation off, so hydraulic and thermal are one node rather than two.
- Where it rains, and how soft the rock is, are mask inputs rather than sliders. That is the shape the engine's location parameter takes, and how a disaster gets confined to one place.
- *[HeightField Erode SOP](https://www.sidefx.com/docs/houdini/nodes/sop/heightfield_erode.html). Read 2026-10-13*

### Planet surface detail

**Chunked level of detail** · Thatcher Ulrich · `method used`
- splitting a surface into patches that each subdivide into four smaller ones as the camera gets closer, drawing only the undivided ones
- the technique the planet's adaptive resolution is built on, including the skirts that hide cracks between patches of different sizes
- *"Rendering massive terrains using chunked level of detail control", SIGGRAPH 2002 course notes. Originally Gamasutra, 2000*

**Cube sphere quadtrees in production engines** · `method used`
- a cube inflated into a sphere, each of its six faces subdividing independently, used instead of a lat/long grid so every patch is a roughly even piece of the surface
- confirms the choice of a cube over the sphere's own grid, which stretches without limit toward the poles
- *[Godot: procedural planet chunked LOD](https://store.godotengine.org/asset/cuberact/procedural-planet-chunked-lod/) · [A software architecture for multiLOD planetary surface meshes](https://libprocter.sourceforge.net/documentation/procter-architecture-2.pdf) · [White, planetary terrain thesis, University of Nevada](https://www.cse.unr.edu/~fredh/papers/thesis/047-white/thesis.pdf)*

**Why lat/long grids fail at the poles** · `background`
- mapping tiles onto a sphere by latitude and longitude stretches them near the equator and crushes them at the poles, where the vertical coordinate runs to infinity
- the evidence for not building the patch system on the existing sphere grid
- *[gamedev.net, mapping tiles onto a sphere](https://gamedev.net/forums/topic/719766-correctly-mapping-web-mercator-map-tiles-onto-a-3d-sphere-in-opengl/5473769/) · [jMonkeyEngine, spherical and planetary terrains](https://hub.jmonkeyengine.org/t/spherical-planetary-terrains/17487)*

**Budgeting how many tiles load per frame** · Unigine · `method used`
- Separate per-frame caps: how many tiles get passed to the virtual texture each frame, and how many actually load (default 4), rather than loading everything that became visible all at once.
- Why the planet felt choppy loading in: `PlanetPatchRenderer.updatePatches` built and baked every newly-visible patch synchronously, a real GPU bake plus a shader compile each. `MAX_NEW_PATCHES_PER_FRAME` caps this the same way, draining a queue a few patches at a time instead.
- *[Unigine, terrain streaming settings](https://developer.unigine.com/en/docs/2.17/editor2/settings/render_settings/landscape/). Read 2026-10-19.*

**Stitching a 2:1 vertex-density LOD boundary with a triangle fan** · de Boer, "geomipmapping" · `method used`
- Where a coarser block's edge meets a finer neighbor's edge at twice the vertex density, the standard fix is a fan of 3 triangles per coarse cell (instead of the usual 2), welding the finer side's one extra in-between point down to the coarser edge, rather than leaving it unrepresented (the T-junction crack).
- The planet's own patches hit exactly this case: a fixed 65 vertices per edge regardless of patch size means a patch bordering a same-face neighbor one level finer has half as many edge points as that boundary actually needs. `planet/planetPatchMesh.ts`'s `buildPatchGeometry` now builds a stitched edge this way when flagged (`planet/planetPatches.ts`'s `computeStitchFlags`), one edge direction at a time. See `ISSUES.md` [B28].
- *de Boer, "Fast Terrain Rendering using Geometrical Mipmapping," flipCode featured articles, October 2000 · [Panda3D, Geometrical MipMapping](https://docs.panda3d.org/1.9/cpp/programming/terrain/geometrical-mipmapping) (confirms the technique and its origin; the original flipCode PDF's current live URL wasn't independently verified this pass). Read 2026-10-20.*

### Height data without a rectangular map

**3D noise instead of a 2D map** · `method used`
- calculating terrain from a point's position in 3D space rather than from a flat map, so there is no edge to hit and therefore no seam or pinch at the poles
- the basis for the 2026-10-13 fix: the planet reads height straight from position instead of out of a baked rectangular map
- *[Fixing Spheres and Planets, gamedev.net](https://gamedev.net/blogs/entry/2269506-fixing-spheres-and-planets) · [Ralith, Planetary terrain](https://ralith.com/blog/planetary-terrain/)*

**Calculating terrain on the GPU in real time** · `method used`
- computing fractal noise in the shader each frame rather than storing a pre-made heightmap, which removes the storage cost and the resolution ceiling that comes with it
- supports evaluating the layer stack in the planet's vertex shader
- *[Real time procedural terrain generation on the GPU, SBGames 2018](https://www.sbgames.org/sbgames2018/files/papers/ComputacaoShort/188242.pdf)*

**Per-patch heightmaps rendered on the GPU** · Outerra · `method used`
- when a patch subdivides, a small floating point texture is rendered for just that patch, with the shader computing height from each pixel's position on the sphere, at a resolution matching how far the patch has subdivided
- the model for giving the land chunk its own heightmap for its own region instead of reading back the global map
- *[Outerra engine progress](https://www.moddb.com/engines/outerra/news/outerra-engine-progress)*

**Terrain detail that matches at every zoom level** · Cesium · `background`
- a noise function returning the same value for the same point in space lets the same hills appear at different levels of detail as the camera moves, which is why a detail view evaluates the function itself rather than enlarging a coarser map
- the reasoning for removing the land chunk's dependence on the 1024x512 global map
- *[Procedural terrain generation with noise functions](https://cesium.com/blog/2017/11/17/procedural-terrain-generation-with-noise-functions)*

**Tiles as the unit of a globe's surface** · Cesium · `method used`
- the whole globe is built from terrain tiles, with a plain sphere treated as a special case of terrain rather than something tiles sit on top of, and each tile's heightmap is a fixed small size (65x65) so detail comes from descending the tree
- the basis for making a patch the single unit of terrain here, with the land chunk being one patch drawn flat rather than its own pipeline
- *[Cesium rendering pipeline](https://community.cesium.com/t/rendering-pipeline-of-cesium/459) · [heightmap-1.0 tile format](https://github.com/CesiumGS/cesium/wiki/heightmap-1.0)*

**Geometry clipmaps, nested grids around the viewer** · Losasso & Hoppe (SIGGRAPH 2004) · `referenced, not yet matched`
- caches terrain as nested regular grids centered on the viewer, stored as vertex buffers and incrementally refilled as the camera moves, so detail is dense nearby and coarser far away without re-tiling the whole surface each frame
- the established answer for [B28], same family as Cesium's own tiling, worth citing on its own since it's the specific technique real terrain engines use to get LOD without a resolution ceiling from one shared map
- *[hhoppe.com/proj/geomclipmap](https://hhoppe.com/proj/geomclipmap/) · [GPU Gems 2, ch. 2](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry). Verified 2026-10-14.*

**CDLOD, per-vertex morphing between LOD levels** · Strugar (2009) · `referenced, not yet matched`
- each vertex morphs individually based on its own distance from the camera, so neighboring tiles at different LOD levels never show a visible seam, a quadtree picks which tiles are active
- an alternative/complementary technique to geometry clipmaps for the same [B28] problem, worth knowing both exist rather than just one
- *[CDLOD terrain reference implementation](https://github.com/tschie/terrain-cdlod). Verified 2026-10-14.*

**Async GPU→CPU readback via a Pixel Buffer Object** · WebGL2 `PIXEL_PACK_BUFFER` · `referenced, not yet matched`
- a synchronous `readPixels()` stalls the GPU pipeline until it catches up, even for a small read; reading into a PBO and polling a fence instead lets the CPU retrieve the data once it's ready without blocking
- doesn't reduce the bytes moved, but is the real fix for [B32]'s "crashes/freezes" symptom specifically, since the stall, not the byte count, is what a user actually feels at higher resolutions
- *[Khronos WebGL mailing list, PBO async readback discussion](https://www.khronos.org/webgl/public-mailing-list/public_webgl/1712/msg00010.php). Verified 2026-10-14.*

**Finding which tile a point on the planet falls in** · `method used`
- take the direction from the planet's center, find which axis dominates to get the cube face, then divide the other two components by it to get the position on that face, and walk the tree to the depth wanted
- how double-clicking the planet picks the chunk's location. It is the algebraic inverse of the cube-to-sphere projection, so picking and geometry cannot disagree
- *[Unity discussion: planetary terrain tile coordinates](https://discussions.unity.com/t/planetary-terrains-tiles-coordinates/688800)*

**Uneven patch sizes from plain normalization** · ⚠️ `known limitation`
- projecting a cube onto a sphere by normalizing makes patches near a face's center cover more ground than those at its corners, so detail is not perfectly even across a face
- accepted for now; a distortion-correcting projection is the fix if it becomes visible
- *Same Unity discussion as above*

### Timeline and playback

**Tick steps come from a fixed ladder of human units** · d3 · `method`
- The visible range is never divided into equal parts. The step is whichever rung of a prepared ladder puts the tick count closest to the one asked for: 1, 5, 15 and 30 seconds, the same four for minutes, then 1, 3, 6 and 12 hours, 1 and 2 days, 1 week, 1 and 3 months, 1 year.
- The method behind the timeline's unit following its zoom, with the ladder extended upward through decades, centuries, millennia and millions of years.
- *[d3-scale, time scales](https://d3js.org/d3-scale/time). Read 2026-10-13*

**Nice numbers for axis labels** · Heckbert · `background`
- Snapping a step to 1, 2, 5 or 10 times a power of ten, for a ruler whose unit is not a calendar one.
- The canonical answer to choosing readable labels, with Talbot's paper the later optimized version of it.
- *[Nice Numbers for Graph Labels, Graphics Gems](https://github.com/cenfun/nice-ticks) · [Talbot, Lin and Hanrahan, extended Wilkinson](https://www.tableau.com/sites/default/files/2023-01/infovis2010-talbot-tickmarks.pdf). Read 2026-10-13*

**Checkpointing a simulation under a memory ceiling** · Houdini · `method`
- A budget in megabytes, older cached frames dropped once it is exceeded, and an option to spill to disk instead of dropping. Snapshots are periodic, with both a save interval and a limit on how many are kept at once.
- A frame that already exists is loaded rather than recomputed, and only the frames after the last valid checkpoint are re-run. That is what makes scrubbing cheap.
- Each frame on the timeline is colored by what is held: in memory, on disk, or held but out of date because a parameter changed.
- The model for recording and scrubbing an erosion run.
- *[Houdini, caching simulations](https://www.sidefx.com/docs/houdini/dyno/cache.html). Read 2026-10-13*

**Cached frames evicted oldest first, in two tiers** · After Effects · `method`
- Rendered frames sit in memory for instant scrubbing and spill to a disk cache that survives reopening the project. Once the budget fills it is first in, first out.
- Where the rolling window's sizing comes from: a fixed budget with the oldest frames dropped, rather than keeping everything.
- *[How disk cache affects preview playback](https://www.pugetsystems.com/labs/articles/how-disk-cache-impacts-after-effects-preview-playback/) · [the blue and green lines explained](https://screenlight.tv/blog/the-definitive-guide-to-ram-previews-and-disk-caches-in-after-effects-ie-those-blue-and-green-lines). Read 2026-10-13*

**A cache bar drawn along the timeline** · Blender · `UX pattern`
- A faint block for the whole cached extent, with solid blocks over the frames actually held, darker when they came from disk.
- How a timeline shows which frames are recorded, so a gap is visible rather than a surprise.
- *[Blender, cache display](https://docs.blender.org/manual/nl/dev/editors/video_sequencer/sequencer/sidebar/cache.html). Read 2026-10-13*

**Seeking plays forward from the nearest keyframe** · `background`
- Video stores a complete frame periodically and only differences in between, so jumping to a point means starting at the previous complete frame and playing forward to it.
- The established name for recording periodically and replaying the few steps between, and the tradeoff that sizes the gap: a longer gap saves memory and costs seek time.
- *[Group of pictures](https://www.forasoft.com/learn/video-encoding/glossary/terms/gop). Read 2026-10-13*

**Undo as a shared history of snapshots** · Redux, Nutrient · `method`
- A history is a list of past states, the present, and a list of future states, and undo moves the present between them. Snapshots work for any change but add up, so they are capped. The alternative, storing each action's inverse, gets hard to write for every control.
- Where the shared snapshot history for undo and redo comes from.
- *[Redux, implementing undo history](https://redux.js.org/usage/implementing-undo-history) · [Approaches to undo and redo](https://www.nutrient.io/blog/approaches-to-undo-and-redo/). Read 2026-10-21*

**Soft shadows on a height field** · Snyder and Nowrouzezahrai · `method`
- Shadows on terrain come from either horizon maps or marching a ray toward the light, with a mip pyramid to cover long distances.
- The basis for the planet's cast shadows, and for the land chunk's existing march.
- *[Fast soft self-shadowing on dynamic height fields, 2008](https://diglib.eg.org/handle/10.2312/CGF.v27i4pp1275-1283). Read 2026-10-21*

**Soft shadows on curved terrain** · arXiv · `method`
- A maximum-mipmap approach for shadows across a curved surface. Only the introduction was read, so details are unconfirmed.
- The accurate alternative to treating each patch as flat.
- *[Optimally fast soft shadows on curved terrain, 2005.06671](https://arxiv.org/pdf/2005.06671). Read 2026-10-21 (intro only)*

**How much relief a planet has, and how tools scale it** · `background`
- Earth's tallest relief is about 0.14% of its radius and Mars's about 0.6%. A Moon figure of about 1.1% came from a forum only, so it is unverified. Generators have no standard ratio, amplitude is a setting. Vertical exaggeration is a separate display multiplier on true elevation.
- Where the realistic Height scale and the Exaggeration idea come from.
- *[Beyond elevation, new metrics for relief, 2208.01600](https://arxiv.org/pdf/2208.01600) · [Comparative analysis of procedural planet generators, 2510.24764](https://arxiv.org/pdf/2510.24764) · [Gaia Sky, procedural planets](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.7.1/Procedural-planets.html) · [CesiumJS VerticalExaggeration](https://cesium.com/learn/cesiumjs/ref-doc/VerticalExaggeration.html). Read 2026-10-21*

### Terrain shaping and masks

**Gaea documentation, masks and shaping** · QuadSpinner · `method used`
- a mask is a grayscale map where bright means fully affected, and nearly every node takes an optional mask. Selectors (Slope, Height) have Min, Max and Falloff. Terrace, FractalTerraces and Clamp shape plateaus and strata. Insert drops flat shapes into terrain while preserving its relative heights
- where the layer Mask controls, the Plateau section and the plateau-then-sea idea come from. The docs mark many pages as being updated for 1.3 and give almost no numeric ranges or defaults, so ours are our own. The docs have moved to docs.gaea.app, which was not read. Using Clamp for plateaus becoming continents is our inference
- *[Modify Shapes](https://docs.quadspinner.com/Guide/Using-Gaea/Modify-Shapes.html) · [Draw/Modify](https://docs.quadspinner.com/Learning/Techniques/Draw-Modify.html) · [Combine](https://docs.quadspinner.com/Reference/Adjustments/Combine.html) · [Slope](https://docs.quadspinner.com/Reference/Data/Slope.html) · [Height](https://docs.quadspinner.com/Reference/Data/Height.html) · [Terrace](https://docs.quadspinner.com/Reference/Profile/Terrace.html) · [FractalTerraces](https://docs.quadspinner.com/Reference/Profile/FractalTerraces.html) · [Clamp](https://docs.quadspinner.com/Reference/Adjustments/Clamp.html) · [Curve](https://docs.quadspinner.com/Reference/Adjustments/Curve.html) · [Sea](https://docs.quadspinner.com/Reference/Water/Sea.html) · [Controlling Water](https://docs.quadspinner.com/Learning/Techniques/Control-Water.html) · [Insert](https://docs.quadspinner.com/Reference/Adjustments/Insert.html).
  - Read 2026-10-21*

**Normalizing and layering noise** · various · `method used`
- divide an octave sum by the sum of its amplitudes to keep it in range, though that alone does not shape the distribution. Each octave raises frequency and lowers amplitude. Ridged noise gives pointed summits. The same function must return the same height at any scale, so zooming adds detail without moving the large shape
- where the bounded heights step and detail-by-zoom come from. ⚠️ The continent-as-low-frequency-base idea and normalizing a layer sum have no verified standard source, only common practice
- *[Red Blob Games, terrain from noise](https://redblobgames.com/maps/terrain-from-noise/) · [Blender, Musgrave texture](https://docs.blender.org/manual/es/4.0/modeling/geometry_nodes/texture/musgrave.html) · [Quilez, fbm](https://iquilezles.org/articles/fbm) · [Cesium, procedural terrain with noise functions](https://cesium.com/blog/2017/11/17/procedural-terrain-generation-with-noise-functions) · [Earth's topography spectrum, 2009.04918](https://arxiv.org/pdf/2009.04918). Read 2026-10-21*

### Detail by level and noise ranges

**Band-limited noise and fBm** · Quilez, Cesium, NVIDIA, Outerra, Blender, Gaea · `method used`
- fade each noise octave out as its wavelength nears the sample spacing, so deeper tiles show more octaves while coarse octaves stay identical. Noise must be a pure function of world position, so every tile and depth agrees
- where the octave fade and the wider slider ranges come from. Trust: Quilez's bandlimiting and fbm articles are medium-high (a recognized expert's blog), Cesium's article is medium (company blog), GPU Gems 3 chapter 1 is a primary book chapter. Outerra is low-medium: read only through search summaries, and it is the only source for a patch-local origin against float precision loss
- ⚠️ Not documented: threshold constants for a vertex grid (Quilez's are tuned for pixels), how a fixed 65-sample bake interacts with octave count, and band-limiting Ridged, Terrace or domain warp. The Musgrave book chapters and the CDLOD paper were not read. The Blender noise manual and the Gaea Perlin and Combine pages list no numeric slider ranges, so the new ranges come from shader limits and design judgment
- *[Quilez, bandlimiting](https://iquilezles.org/articles/bandlimiting/) · [Quilez, fbm](https://iquilezles.org/articles/fbm/) · [Cesium, procedural terrain with noise functions](https://cesium.com/blog/2017/11/17/procedural-terrain-generation-with-noise-functions) · [NVIDIA, GPU Gems 3 chapter 1](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu) · [Blender, Noise Texture](https://docs.blender.org/manual/en/4.2/render/shader_nodes/textures/noise.html) · [Gaea, Perlin](https://docs.quadspinner.com/Reference/Primitives/Perlin.html) · [Gaea, Combine](https://docs.quadspinner.com/Reference/Adjustments/Combine.html). Read 2026-10-21*

### Layer masks in editors

**Layer mask conventions** · Adobe, Procreate · `method used`
- Photoshop and Substance Painter attach a mask to a layer, with a thumbnail on the layer's row and finer controls in a properties panel. Procreate allows one mask per layer. A mask on a group reaches every layer inside it
- where the mask icon and popup on the layer row come from. ⚠️ A top-layer mask alone not reaching layers below was inferred from these docs, and Substance and Procreate group-mask behavior was not confirmed
- *[Adobe, fine-tune layer masks](https://helpx.adobe.com/bg/photoshop/how-to/fine-tune-layer-masks.html) · [Procreate, layer masks](https://help.procreate.com/procreate/handbook/layers/layers-mask) · [Adobe Substance 3D Painter, layer stack](https://helpx.adobe.com/substance-painter/using/layer-stack.html). Read 2026-10-21*

### Refining terrain tiles without popping

**Tile refinement and hysteresis** · CS354R, Pulsegeek, Cesium · `method used`
- use two thresholds per detail switch, with merging farther out than splitting, and pick detail by screen error. A tile is drawn only if it passes the error test, otherwise its children are
- where the patch cache plan comes from. ⚠️ Keeping a parent drawn until its children are ready, and evicting least recently used tiles, are common practice but no source confirmed them
- *[CS354R lecture](https://www.cs.utexas.edu/~theshark/courses/cs354r/lectures/cs354r-23.pdf) · [Pulsegeek, terrain stitching and chunking](https://pulsegeek.com/articles/terrain-stitching-and-chunking-seamless-streaming/) · [Cesium3DTileRefine](https://ci-builds.cesium.com/cesium/main/Build/Coverage/Firefox%20145.0%20(Linux%200.0.0)/engine/Source/Scene/Cesium3DTileRefine.js.html). Read 2026-10-21*

### Walking on terrain

**Ground following and travel speed** · ArcGIS Pro, Unity, Cesium · `method used`
- keep a set height above the ground by reading the ground height at your position each frame; speed can be changed with the mouse wheel and shown on screen; ArcGIS's first-person mode has no collision detection. Cesium reads terrain height from the most detailed data available, which can differ slightly from the drawn tiles
- where walk mode's height following, wheel speed and `sampleHeight` come from. ⚠️ No source found for a collider that stops the camera entering terrain in this kind of viewer, or for the default speeds
- *[ArcGIS Pro, first-person navigation](https://pro.arcgis.com/en/pro-app/3.2/help/mapping/navigation/first-person-navigation-mode.htm) · [Unity, Terrain.SampleHeight](https://docs.unity3d.com/cn/2022.1/ScriptReference/Terrain.SampleHeight.html) · [Cesium forum, sampleHeight vs sampleHeightMostDetailed](https://community.cesium.com/t/the-heights-returned-by-scene-sampleheight-and-scene-sampleheightmostdetailed-are-different/44570). Read 2026-10-26*

### Culling displaced meshes

**Bounds for shader-displaced meshes** · three.js forum · `method used`
- three.js culls a mesh by bounds computed from its CPU positions, so a mesh lifted in the vertex shader is skipped when its flat shape leaves the view. The fix is to give the geometry bounds that cover the displaced range (turning culling off also works, at the cost of drawing everything)
- where the chunk patches' `fitBounds` comes from. ⚠️ Forum level, no official three.js statement found
- *[Update geometries' boundingBox taking shader displacement into account](https://discourse.threejs.org/t/update-geometries-boundingbox-taking-shader-displacement-into-account/5729) · [Zooming in camera makes some meshes not visible](https://discourse.threejs.org/t/zooming-in-camera-make-some-meshes-not-visible/3872). Read 2026-10-26*

### Lighting a heightfield across detail levels

**Normals from heightfields** · Khronos forum, gamedev.net, NVIDIA · `method used`
- take a height on each side, difference them, and cross the tangents, with spacing in real ground distance at each detail level. Normals should come from the finest data, and mismatched normals between levels make lighting jump. Toksvig-style widening of highlights handles varied normals cheaply
- where the shared normal function and soft diffuse come from. ⚠️ The sources are forum and docs level, and none was found for per-tile world-scale normals, curvature-based ambient occlusion or hemisphere ambient on terrain
- *[Khronos, surface normals for a height field](https://community.khronos.org/t/surface-normals-for-a-height-field/104854) · [gamedev.net, GPU clipmaps normals](https://gamedev.net/forums/topic/604196-gpu-clipmaps-normal-map-transition/4826703/) · [NVIDIA, mipmapping normal maps](https://developer.download.nvidia.cn/whitepapers/2006/Mipmapping_Normal_Maps.pdf). Read 2026-10-21*

**Noise detail by sample spacing** · Lagae and Drettakis, Quilez, Cesium · `method used`
- weight each octave by a smooth step on its frequency against the Nyquist limit, one over twice the sample spacing, so a deeper patch shows more octaves while the coarse shape stays identical. The paper's Perlin constants, 0.25 and 0.95, were "determined experimentally" for pixel shading, so here they are tunable starting values, not proven for vertex grids
- trust: peer-reviewed paper for the weight, a recognized expert's blog for the idea, and a vendor blog for "the closer the camera, the greater the number of octaves". ⚠️ Not documented: fade constants for a vertex grid, and band-limiting Ridged, Terrace, domain warp or Voronoi (one low-trust forum thread says to fade before the nonlinear step)
- *[Lagae and Drettakis, Filtering Solid Gabor Noise, supplementary](https://graphics.kuleuven.be/publications/LD11FSGN/LD11FSGN_supplementary.pdf) · [Quilez, band limiting](https://iquilezles.org/articles/bandlimiting/) · [Quilez, fBm](https://iquilezles.org/articles/fbm/) · [Cesium, procedural terrain with noise](https://cesium.com/blog/2017/11/17/procedural-terrain-generation-with-noise-functions). Read 2026-10-21*

**Fixed grid per tile** · CDLOD (Strugar) · `method used`
- one fixed-size grid mesh renders every quadtree node, detail changes through tile size, and levels blend over the last 15 to 30 percent of their range. Trust: the author's own paper
- *[CDLOD paper](https://github.com/fstrugar/CDLOD). Read 2026-10-21*

**Float precision at deep zoom** · AGI, Precisions, Precisions · `method used`
- single precision holds about seven decimal digits, so render relative to a local origin, with a high and low split if needed. Trust: authors of Cesium. Outerra's forum reports the same problem (anecdotal, low trust)
- *[AGI, Precisions, Precisions](https://help.agi.com/AGIComponents/html/BlogPrecisionsPrecisions.htm). Read 2026-10-21*

**GPU hash functions** · Jarzynski and Olano, JCGT 2020 · `method used`
- the sin-based hash shows visible banding and repeats. Integer hashes such as pcg3d and xxhash32 are better. Trust: peer-reviewed. ⚠️ No sourced precision limit for the sin hash at large inputs. Built with Hoskins' "hash without sine" (listed in the paper, float-only, safe in GLSL ES 1.00, which has no integers). ⚠️ Its constants were typed from memory because the Shadertoy page returned an error, so they need checking
- *[Hash Functions for GPU Rendering, JCGT](https://www.jcgt.org/published/0009/03/02/paper.pdf). Read 2026-10-21*

**Noise controls across terrain tools** · Unity, World Creator, Gaea, Terragen, Blender, Houdini · `reference`
- the controls each tool exposes: offset, warp scale and octaves, Voronoi jitter and distance function, anisotropic stretch, rotation, output clamp, fractal type, ridged offset and gain. Trust: official docs, except Unreal (a search summary) and World Machine (a third-party guide)
- ⚠️ No tool documents octave defaults, a persistence range, a seed range or high-frequency precision. Terragen's "Smallest scale" is the closest documented match to octave fading
- *[Unity Terrain noise](https://docs.unity3d.com/Manual/terrain-Noise-Ref.html) · [World Creator noises](https://docs.world-creator.com/reference/terrain/noises) · [Gaea Perlin](https://docs.quadspinner.com/Reference/Primitives/Perlin.html) and [Voronoi](https://docs.quadspinner.com/Reference/Primitives/Voronoi.html) · [Terragen Power Fractal v3](https://docs.planetside.co.uk/wiki/Power_Fractal_Shader_v3) · [Blender Noise](https://docs.blender.org/manual/ar/4.4/modeling/geometry_nodes/texture/noise.html) and [Voronoi](https://docs.blender.org/manual/en/4.2/modeling/geometry_nodes/texture/voronoi.html) · [Houdini HeightField Noise](https://www.sidefx.com/docs/houdini/nodes/sop/heightfield_noise.html). Read 2026-10-21*

**Antialiasing noise after nonlinear steps** · Yang and Barnes, Quilez, Cook and DeRose · `method used`
- band-limiting means smoothing with a low-pass filter. Amplitude fade alone is not enough after abs, a terrace or a Voronoi edge, because a crease or a hard edge carries energy at every higher frequency. Fade the octave before the nonlinearity, and soften a step to the filter width. Trust: Yang and Barnes 2017 is peer reviewed and was read in full. Quilez's bandlimiting article is a recognized expert's blog and was read only through search summaries. The Wavelet Noise paper was read as an abstract
- where the second pass on Ridged, Terrace, domain warp and Voronoi comes from. ⚠️ Inferred, not documented: the smoothed abs for ridged noise, the extra fade for warp, the smooth minimum for Voronoi, and fading before the nonlinearity (only an unsourced forum hint). No terrain-specific guide or filtered Voronoi method was found
- *[Yang and Barnes 2017, arXiv 1706.01208](https://arxiv.org/pdf/1706.01208) · [Quilez, bandlimiting](https://iquilezles.org/articles/bandlimiting/) · [Cook and DeRose, Wavelet Noise](https://graphics.pixar.com/library/WaveletNoise). Read 2026-10-21*

### Fractal types for terrain

**Musgrave fractal types** · Blender source, Blender manual, Unity · `method used`
- fBm, multifractal, hybrid multifractal, hetero terrain and ridged multifractal each have a short recurrence in Blender's shader source. Hybrid and hetero scale each octave by the height so far, which gives smooth valleys and rough peaks. Offset and Gain are the shared extra controls
- where the planned fractal type selector comes from. Trust: Blender's open-source GLSL (v3.6.0) is a primary source. The manual quotes are from the 2.80 page. ⚠️ Not documented: formulas for Billow and Strata (Unity gives only one-line descriptions), and Musgrave's own chapter was not readable. Renormalizing the unbounded outputs is our inference
- *[Blender v3.6.0, musgrave shader source](https://raw.githubusercontent.com/blender/blender/v3.6.0/source/blender/gpu/shaders/material/gpu_shader_material_tex_musgrave.glsl) · [Blender manual, Musgrave](https://docs.blender.org/manual/es/2.80/render/shader_nodes/textures/musgrave.html) · [Unity Terrain Tools, noise](https://docs.unity3d.com/Packages/com.unity.terrain-tools@5.2/manual/sculpt-noise.html). Read 2026-10-21*

### Detail by screen-space error

**Screen-space-error LOD** · 3D Tiles specification, Cesium3DTileset and Globe docs · `method used`
- a tile carries a geometric error in meters. At runtime it becomes a screen-space error in pixels, and a tile is refined into its children only when that error passes a maximum. Cesium exposes the maximum as the quality control (default 16 for 3D tiles, 2 for the globe), so a lower value gives more detail. Caches and load budgets are separate settings
- where the Resolution slider as a detail bias comes from (`[S32]`). Trust: official docs, high. ⚠️ The exact formula (error times screen height over distance times twice the tangent of half the field of view) is the widely used form, medium trust, and was not confirmed from an official page. The CDLOD paper could not be read, and Unreal and Unity bias settings were not documented anywhere authoritative
- *[3D Tiles specification](https://github.com/CesiumGS/3d-tiles/tree/main/specification) · [Cesium3DTileset](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html) · [Cesium Globe](https://cesium.com/learn/cesiumjs/ref-doc/Globe.html). Read 2026-10-21*

### Water

**Beer-Lambert light absorption** · ocean rendering survey, underwater optics review · `method used`
- Light fades exponentially with the distance it travels through water, transmittance = e^(−absorption × distance), separately per color channel, which is why deep water turns blue-green.
- The core of `waterColor` (`shaders/water.glsl`). Depth is measured as a share of the deepest water, not in meters, and the colors and clarity are hand-set for alien worlds, not real seawater values.
- *[A Survey of Ocean Simulation and Rendering Techniques, eq. 18](https://arxiv.org/pdf/1109.6494) · [Underwater scenes review](https://arxiv.org/pdf/2505.01869). Read 2026-10-26*

**Shallow and deep color with a Beer's law control, and a power-curve Fresnel** · Godot community water shaders · `method used`
- Real-time water blends a shallow and a deep color by exp(−depth × strength), and makes water more reflective at grazing angles with a power of (1 − view angle).
- The shape of `waterColor` and `waterFresnel`. ⚠️ Community code, medium trust.
- *[Godot water shader](https://godotshaders.com/shader/water-shader/) · [Absorption-based stylized water](https://godotshaders.com/shader/absorption-based-stylized-water/). Read 2026-10-26*

**Water as the volume between the ground's heightfield and the water surface** · Baboud and Décoret, 2006 · `method used`
- Water depth at any point is the water surface minus the ground height below it, read from height data rather than a depth pass.
- Why both views compute depth as sea level minus the baked ground height.
- *[Realistic Water Volumes in Real-Time, Eurographics 2006](https://diglib.eg.org/items/5b40d5b3-ad48-42f4-be55-cdf122c33ae1/full). Read 2026-10-26*

**Scrolling normal maps for water on curved surfaces** · three.js forum · `method used`
- three.js's own `Water` and ocean examples only work on flat planes; for spheres the advice is one or two scrolling normal maps in a custom material.
- The chunk's ripples (`shaders/chunkWater.frag.glsl`), and why the planet uses its own shader instead of three's `Water`. ⚠️ The ripple texture (`waternormals.jpg` from the three.js repo) is assumed to fall under the repo's MIT license.
- *[Ocean water for curved surfaces](https://discourse.threejs.org/t/ocean-water-for-curved-surfaces/42166). Read 2026-10-26*
- The texture is now in `app/public/textures/` (downloaded 2026-10-26).

**Ocean colored by depth from the unclamped terrain height** · Sebastian Lague, Procedural Planets E07 · `method used`
- The ocean is the terrain itself, flattened at sea level and colored by how deep the ground below would be.
- The planet's ocean. ⚠️ Taken from the episode's description only; the video and code were not read.
- *[Sebastian Lague, 2018 videos](https://rosetta.to/u/sebastianlague/2018). Read 2026-10-26*

**Schlick's Fresnel approximation, F0 = 0.02 for water** · `method used`
- Reflectance at a viewing angle is F0 + (1 − F0)(1 − cos θ)⁵. Head-on, water reflects ((1.33 − 1)/(1.33 + 1))² ≈ 0.02 for its refractive index of 1.33.
- `waterFresnel` (`shaders/water.glsl`): the sky color is blended in by this amount, and the rest of the water is scaled by what is left.
- *[UCR, ray tracing transparent surfaces](https://www.cs.ucr.edu/~craigs/courses/2026-summer-cs-130/lectures/raytracing-transparent.pdf) · [Berkeley CS184 discussion 8](https://cs184.eecs.berkeley.edu/su25/assets/discussions/08-sol.pdf). Read 2026-10-26*

**Per-channel absorption tints the seabed** · Godot absorption-based water, underwater optics review · `method used`
- The ground seen through water is multiplied by exp(−absorption × depth) per color channel, so channels the water lacks fade first and even shallow water colors the ground.
- `waterFilter` (`shaders/water.glsl`), with the absorption taken as 1 minus the water ramp's color. The chunk applies it as a multiply pass over the drawn seabed.
- *[Absorption-based stylized water](https://godotshaders.com/shader/absorption-based-stylized-water/) · [Underwater scenes review](https://arxiv.org/pdf/2505.01869). Read 2026-10-26*

**Fine detail kept off the coastline** · World Creator Shore filter, Musgrave hetero terrain · `method used`
- World Creator controls terrain in a band above and below sea level; hetero terrain scales each octave by the height so far, for smooth lowlands.
- No Roughness below sea level, then a linear fade-in over twice its largest swing above it (`heightmap.frag.glsl`), so it never crosses the coastline and the "% land" readout stays exact. A two-sided version that kept seabed detail was tried and dropped (Dana: no rough patches under water) (`[B61]`). The band width is this project's own bound, assuming the noise stays within ±1.
- *[World Creator, Shore filter](https://docs.world-creator.com/reference/terrain/biome/filters/effect/shore). Read 2026-10-26*

**Hold Space and drag to pan** · Figma · `UX pattern used`
- Space plus a drag pans the canvas; the space state is released when the canvas loses focus, the cause of Figma's known "stuck spacebar" bug.
- The land chunk's pan.
- *[How to pan in Figma](https://leyaa.ai/codefly/learn/figma/qna/how-to-pan-in-figma) · [Figma forum, spacebar panning glitch](https://forum.figma.com/report-a-problem-6/spacebar-panning-glitch-in-figma-49752). Read 2026-10-26*

**Hypsometric and bathymetric tints, split at sea level** · cartography · `method used`
- Land and water get separate color ramps: greens through browns to whites above sea level, blues by depth below it.
- With water on, the land ramp starts at the depth light reaches (Clarity), not exactly at sea level, so the seabed seen through the shallows keeps the land's colors (Dana, 2026-10-27); the water ramp colors the water. Established practice, not a formal standard.
- *[Hypsometric tints, Wikipedia](https://en.wikipedia.org/wiki/Hypsometric_tints) · [Esri, hypsometric tinting](https://www.esri.com/arcgis-blog/products/product/imagery/hypsometric-tinting). Read 2026-10-26*

**Ocean light zones** · NOAA · `method used`
- Sunlight reaches the top 200 m, a twilight zone runs to 1,000 m, and below that is dark, so most of the ocean's visible change is near the surface.
- Why the water ramp is spaced by light remaining (1 − e^(−depth ÷ clarity), normalized), not by meters (`waterRampPosition`). The real depths are not used: this planet's exaggerated heights put its seas tens of kilometers deep, so only the principle is taken. Inferred, tunable.
- *[NOAA Ocean Service, how far light travels](https://oceanservice.noaa.gov/facts/light_travel.html) · [NOAA Ocean Explorer](https://oceanexplorer.noaa.gov/facts/light-distributed.html). Read 2026-10-26*

**"Seascape"** · Alexander Alekseev (TDM), 2014 · `code used` · CC BY-NC-SA 3.0
- A Shadertoy ocean: layered "choppy" wave octaves, a normal from their height, and a sea color mixing a base color, a lighter tint on wave tops, the sky by Fresnel and a sun highlight.
- The water in both views (`shaders/oceanWaves.glsl`, credited and licensed in its header): the wave and color functions copied, recolored by the water ramp, with the octave count as Wave detail and a Wave size multiplier. Its own distance smoothing (`dot(dist,dist) * 0.1 / screen width`) is kept as published. Its sky reflection and sun highlight are scaled by the Reflection and Shine settings (Shine defaults to 0.3 of the original glare). Its sine hash is replaced by the repo's sine-free hash, since it banded into stripes at kilometer coordinates (the banding Jarzynski and Olano 2020 report). ⚠️ Non-commercial and ShareAlike: that file must stay under CC BY-NC-SA 3.0, and a commercial use would need the author's permission or a replacement. Copied from Fuchsia's embedded copy (Shadertoy blocked the fetch); indentation was lost in the fetch, the tokens are as published.
- *[Seascape on Shadertoy](https://www.shadertoy.com/view/Ms2SD1) · [Fuchsia's copy](https://fuchsia.googlesource.com/fuchsia/+/038d2b9/src/ui/examples/shadertoy/client/glsl_strings.cc). Read 2026-10-26*

**Ocean lighting from geometry to BRDF** · Bruneton, Neyret & Holzschuch, 2010 · `method used`, approximated
- Waves are handled by size: big ones as geometry, middle ones as normals, and those too small to see as roughness in the lighting, so the ocean reads correctly from any distance. Used in the Proland engine's planet oceans.
- `seaFarFactor` (`shaders/oceanWaves.glsl`): once Seascape's distance-smoothed normal step passes the waves, the normal flattens and the sun highlight widens into a soft glare. ⚠️ A simplified stand-in for the paper's roughness model, not its math.
- *[Paper page](https://evasion.inrialpes.fr/Publications/2010/BNH10) · [course slides](https://cgg.mff.cuni.cz/%7Ejaroslav/teaching/2012-npgr031/prezentace/Realtime%20Realistic%20Ocean%20Lighting.pdf) · [Proland ocean](https://proland.inrialpes.fr/doc/proland-4.0/ocean/html/page-examples.html). Read 2026-10-26*

**Whitecaps from wave deformation, filtered across scales** · Dupuy & Bruneton, SIGGRAPH Asia 2012 · `replaced 2026-10-27` by the Cox and Munk glint and wind-set foam
- Whitecap coverage comes from how much the waves deform, a value that can be averaged with distance, so foam stays correct from centimeters to planet scale.
- `crestFoam` (`shaders/oceanWaves.glsl`): foam where Seascape's waves crest, blended with distance into an averaged, patchy coverage. ⚠️ Crest height stands in for the paper's deformation criterion; thresholds inferred.
- *[Paper](https://liris.cnrs.fr/Documents/Liris-5812.pdf). Read (abstract) 2026-10-26*

**Band-limiting procedural detail** · Inigo Quilez, "Bandlimiting" · `method used`
- Each octave is multiplied by smoothstep(1.0, 0.5, w), where w is the pixel footprint from fwidth() carried down the octaves with the frequency, so detail that oscillates about once per pixel or faster fades out; a domain warp or rotation must be carried into w too.
- `sea_octaves` (`shaders/oceanWaves.glsl`): w grows 3.8 times per octave (Seascape's octave_m doubles the coordinates and its frequency grows 1.9 times), the window is scaled to sea_octave's period of pi, and the loop stops once an octave is gone. Text pasted by Dana (the site blocks automated readers).
- *[iquilezles.org/articles/bandlimiting](https://iquilezles.org/articles/bandlimiting/). Read 2026-10-26*

**Foam by halftoning** · Yingst, Alford & Parberry, UNT LARC-2011-05 · `method used`
- Foam saturation f = (H − H0)/(Hmax − H0) is compared per pixel against a clustered halftone mask (Gaussian-filtered white noise, σ = 24 clumps best); foam shows where f exceeds the mask, faded by clamp(f − m, 0.15, 3.0), so it clumps and pops instead of tiling.
- `crestFoam` and `halftoneMask` (`shaders/oceanWaves.glsl`). ⚠️ Two octaves of smooth noise stand in for their precomputed mask texture. Departs from the paper: the mask moves with the currents and a slow drift, in larger clusters (Dana, 2026-10-27: a still layer looked wrong).
- *[Project page](https://ianparberry.com/research/seafoam/) · [tech report](https://ianparberry.com/techreports/LARC-2011-05.pdf). Read in full 2026-10-26*

**Flow maps with a two-phase blend** · Vlachos, "Water Flow in Portal 2", SIGGRAPH 2010 · `method used`
- A field of directions pushes the water's pattern; it is sampled twice half a cycle apart and blended so the motion loops without a visible reset.
- `sea_height` (`shaders/oceanWaves.glsl`): currents from a procedural noise field instead of a painted map. Strength, scale and rate inferred.
- *[Slides](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf) · [Grimes, GDC 2011](https://www.hlportal.de/files/GDC2011_BronwenGrimes_NonstandardTextures.pdf). Read (summaries) 2026-10-26*

**Shoreline waves from distance to shore** · Croakwood devlog, GameDev.net ocean log · `superseded 2026-10-27` by the surf waves below
- Waves and foam near the coast are driven by each point's distance to the shoreline, so bands travel toward it and break.
- `shoreWaveFoam` (`shaders/oceanWaves.glsl`): foam bands moving toward the coast. ⚠️ Water depth stands in for distance to shore, which is wrong on steep coasts; a true distance field is the upgrade.
- *[Croakwood devlog #5](https://www.texelraptor.com/blog/croakwood-devlog-5) · [GameDev.net, ocean rendering](https://gamedev.net/blogs/715/entry-2249487-ocean-rendering/page__st__5/). Read (summaries) 2026-10-26*

**three.js `Water`, the ocean example** · three.js · `tried, replaced 2026-10-26`
- A mirror reflection of the scene, animated normal-map waves, a sun glint and wave-distorted reflections, in one tested shader.
- Tried for the chunk the same evening, scaled from meters to kilometers. Dana: it looked much the same, with a sharp line at the shore. Replaced by Seascape.
- *[three.js ocean example](https://threejs.org/examples/#webgl_shaders_ocean)*

**Planar reflection and refraction for flat water** · three.js `Reflector`, `Refractor`, `Water2` · `superseded 2026-10-26`
- A mirrored camera renders the scene into a texture for the reflection, and a camera clipped at the surface renders what lies below for the refraction. Water2 projects both with a texture matrix, offsets the lookups by the ripple normal (factor 0.05) and blends them by Schlick Fresnel.
- The chunk's water (`voxel/chunkWater.ts`): the refraction replaces the old multiply pass as the seabed, and the reflection replaces the flat sky color, with the sky as the fallback where nothing was drawn. Read in the installed three.js 0.185 source.

**Shore foam from the depth gap** · Godot community water shaders, Unity forum · `superseded 2026-10-27`
- Game water adds foam where the gap between the water surface and the ground behind it is small, softened with smoothstep and broken up by a scrolling texture.
- The first `waterFoam`: a smooth band that read as a hard line at the waterline. Replaced by Roystan's noise threshold below. ⚠️ Community examples, medium trust.
- *[Godot, water with foam and depth](https://godotshaders.com/shader/water-with-foam-and-depth/). Read 2026-10-26*

**Toon water: depth foam by a rising noise threshold, and distorted noise** · Erik Roystan Ross · `method used` · Unlicense
- Foam where the depth gap is small: `foamDepthDifference01 = saturate(depthDifference / foamDistance)`, `surfaceNoiseCutoff = foamDepthDifference01 * _SurfaceNoiseCutoff` (0.777), then `smoothstep(cutoff - SMOOTHSTEP_AA, cutoff + SMOOTHSTEP_AA, noise)` with `SMOOTHSTEP_AA` 0.01. The noise UVs are pushed by a second texture: `(sample * 2 - 1) * _SurfaceDistortionAmount` (0.27).
- `waterFoam` (`shaders/water.glsl`): the shore foam, solid at the waterline and breaking into patches further out; the cutoff rises past 1 so the foam ends at the zone's edge, and the softness is wider (0.12) for a soft edge. `foamPatchiness`: the same threshold on a slow noise, so crest foam gathers in patches. `seaBend` (`shaders/oceanWaves.glsl`): the distortion step applied to the wave coordinates. Values inferred, tunable.
- *[Roystan, Toon Water Shader](https://roystan.net/articles/toon-water.html) · [code, ToonWater.shader](https://github.com/IronWarrior/ToonWaterShader). Read the shader file in full 2026-10-27*

**Domain warping** · Inigo Quilez · `method used`
- A pattern is evaluated at a distorted position, f(p + h(p)), with the offset h made of noise, which breaks up regular shapes into flowing ones.
- `seaBend` (`shaders/oceanWaves.glsl`): a slow, gentle warp of the wave coordinates so crests curve instead of running in rows, kept small so band-limiting's footprint stays about right (Quilez's bandlimiting note: a warp changes the footprint). ⚠️ The article itself returned 404 to the reader; read through search summaries and The Book of Shaders, chapter 13, only.
- *[Quilez, warp](https://iquilezles.org/articles/warp/) · [The Book of Shaders, ch. 13](https://thebookofshaders.com/13/). Read (summaries) 2026-10-27*

**Fetch limits wave size** · Physical Geology (Earle), Kalff via PSU limnology notes · `method used`
- Waves grow with fetch, how far the wind blows over open water: harbors and lakes stay small, open oceans grow large. Kalff's estimate: max height ≈ 0.332 √(fetch in km) meters.
- `seaFetchScale` (`shaders/oceanWaves.glsl`): wave height grows with the square root of a fetch stand-in. ⚠️ Water depth stands in for fetch, inferred.
- *[Physical Geology, waves](https://geo.libretexts.org/Bookshelves/Geology/Book%253A_Physical_Geology_(Earle)/17%253A_Shorelines/17.1%253A_Waves) · [PSU limnology notes](https://web.pdx.edu/~sytsmam/limno/Limno09.10.Motion.pdf). Read (summaries) 2026-10-27*

**Sun glint shows roughness, slicks and currents from space** · NASA, Oceanography magazine · `replaced 2026-10-27` by the Cox and Munk glint and wind-set foam
- From orbit, waves are seen only through the sun glint: slicks, current boundaries and wind change the surface's roughness, so they show as brighter or darker streaks in the glare.
- `seaRoughness` and `seaFarSpecularPower` (`shaders/oceanWaves.glsl`). Scales inferred.
- *[NASA, Ocean Revealed](https://earthobservatory.nasa.gov/images/81814/ocean-revealed) · [Oceanography, sun glitter from space](https://tos.org/oceanography/article/sun-glitter-photographs-of-georges-bank-and-the-gulf-of-maine-from-the-spac) · [NASA, tsunami waves off Sri Lanka](https://science.nasa.gov/earth/earth-observatory/deep-ocean-tsunami-waves-off-the-sri-lankan-coast-5198/). Read (summaries) 2026-10-27*

**Surf waves from distance to shore, foam born at the crest** · GameDev.net ocean log and ShaderLab · `method used`, approximated
- A surf wave shape is looked up by distance from shore and added to the open-sea waves; foam is masked near the coast and moved by flow.
- `surfWave` (`shaders/oceanWaves.glsl`), replacing the earlier foam-only bands. ⚠️ Developer write-ups, medium trust; depth stands in for distance to shore.
- *[GameDev.net, ocean rendering](https://gamedev.net/blogs/715/entry-2249487-ocean-rendering/page__st__5/) · [GameDev.net, foam with flow mapping](https://gamedev.net/shaderlab/53-foam-with-flow-mapping/). Read (summaries) 2026-10-27*

**Triplanar mapping** · Catlike Coding · `method used`
- Three flat projections of the world position (zy, xz, xy) blended by weights from the normal: `abs(normal) - 0.25` clamped, raised to 2, divided by their sum.
- The planet ocean's waves, roughness and crest foam (`shaders/oceanWaves.glsl`), so the cube's face edges leave no seam. The published offset and exponent are kept.
- *[Catlike Coding, Triplanar Mapping](https://catlikecoding.com/unity/tutorials/advanced-rendering/triplanar-mapping/). Read 2026-10-27*

**Beaufort wind scale** · NOAA National Weather Service · `method used`
- Wind force 0 to 12 with the sea's look: a mirror at 0, crests begin to break and "scattered white horses" at 3, "many" at 5, foam blown in streaks from 7, the sea "white" from 10.
- The Wind setting: whitecaps start at 3 and cover the sea from 10. The page gives no wave heights, so wave size scales relative to force 4. Curves inferred.
- *[NWS Miami, Beaufort scale](https://www.weather.gov/mfl/beaufort). Read 2026-10-27*

**Deep-water dispersion and choppy-wave foam** · Tessendorf, "Simulating Ocean Water" (2004 notes) · `method used`
- Deep water: ω² = g·k (eq. 31), so speed c = √(gλ/2π); the Jacobian of the horizontal displacement, J = Jxx·Jyy − Jxy² (eq. 45), drops below 0 where the surface folds, a signal for foam and breaking.
- `waterVariance` (`shaders/oceanWaves.glsl`): the variance waves' speeds and foam where they pinch; Seascape's clock follows the same relation by wind (`windTimeScale`). Applying eq. 45 to Gerstner sums is inferred.
- *[Tessendorf, course notes 2004](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf). Read 2026-10-27*

**Pierson-Moskowitz wind-wave spectrum** · Stewart, Introduction to Physical Oceanography 16.4 · `method used`
- For a fully developed sea, peak frequency 0.877 g/U19.5 and significant height 0.21 U19.5²/g, with U19.5 ≈ 1.026 U10.
- `peakWavelength`, `significantWaveHeight`, `windLengthScale` (`planet/oceanSpectrum.ts`): Wind sets Seascape's wave length and the variance waves.
- *[Stewart, ocean-wave spectra (LibreTexts, CC BY-NC-SA 4.0)](https://geo.libretexts.org/Bookshelves/Oceanography/Introduction_to_Physical_Oceanography_(Stewart)/16:_Ocean_Waves/16.4:_Ocean-Wave_Spectra). Read 2026-10-27*

**Sea surface slopes by wind** · Cox and Munk 1954, via the Ocean Optics Web Book · `method used`
- Clean surface mean square slope σ² = 0.003 + 5.12·10⁻³ U (U in m/s at 12.5 m); slopes follow a Gaussian distribution.
- `seaGlint` and `seaSlopeVariance`: far away, Seascape's highlight blends into this glint, sharp when calm and wide in wind. The 0.25 brightness scale is inferred.
- *[Ocean Optics Web Book, Cox-Munk slope statistics (CC BY 2.0)](https://oceanopticsbook.info/view/surfaces/cox-munk-sea-surface-slope-statistics). Read 2026-10-27*

**Choosing Gerstner waves** · Finch, GPU Gems 1 ch. 1 · `method used`
- Wavelengths random between half and double a median, amplitude in proportion to length, directions within a constant angle of the wind, steepness Q_i = Q/(w_i A_i N) so crests never loop.
- `buildWaveSet` (`planet/oceanSpectrum.ts`): the large variance waves layered under Seascape. The spread angle (60°) and Q by wind are inferred.
- *[GPU Gems ch. 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models). Read (text only, equations are images) 2026-10-27*

**Wave breaking depth** · McCowan 1894, via Bosboom and Stive, Goda 2010 · `method used`
- A wave breaks once the water is shallower than about its height / 0.78, a first estimate that varies with beach slope and wave steepness (Goda).
- `surfZoneShare` (`planet/oceanSpectrum.ts`): the surf shows only where the water is shallower than the wind's wave height / 0.78.
- *[Bosboom and Stive, Coastal Dynamics, wave breaking](https://geo.libretexts.org/Bookshelves/Oceanography/Coastal_Dynamics_(Bosboom_and_Stive)/05%3A_Coastal_hydrodynamics/5.02%3A_Wave_transformation/5.2.5%3A_Wave_breaking) · [Goda 2010](https://www.ancientportsantiques.com/wp-content/uploads/Documents/ENGINEERING/Maritime/BW/WaveBreaking-Goda2010.pdf). Read (summaries) 2026-10-27*

**Foam deposited where waves pinch, faded over time** · Crest Ocean System docs · `considered`
- Foam is deposited where waves are "pinched" and reduced every update by a fade rate, in its own simulation.
- Pinch foam is used; the build-up and fade is deferred (it needs a simulation texture).
- *[Crest, water appearance](https://crest.readthedocs.io/en/stable/user/water-appearance.html). Read 2026-10-27*

**Gerstner waves, in text** · Catlike Coding, "Waves" · `considered`
- The full Gerstner wave function with its tangent and binormal, three summed waves, and example values (steepness 0.5, wavelength 10).
- Verified source for waves if three.js `Water`'s own waves aren't enough.
- *[Catlike Coding, Waves](https://catlikecoding.com/unity/tutorials/flow/waves/). Read 2026-10-26*

**Gerstner waves** · Finch, GPU Gems ch. 1 · `deferred`
- Waves that move the surface in circles, with sharp crests, summed in the vertex shader, plus normals from the same sum.
- ⚠️ Not built: the chapter's equations are images, so they could not be verified from text. Also, the chunk's 18 km sheet can't carry meter-scale vertex waves.
- *[GPU Gems ch. 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)*

**Land share weighted by area** · `method used`
- On a latitude-by-longitude map each row covers cos(latitude) of the sphere's area, so the "% land" readout weights rows by it.
- ⚠️ Standard sphere geometry, no source fetched.

### Plants (planned, not built)

**Parametric L-systems** · Prusinkiewicz and Lindenmayer; `nylki/lindenmayer` · `planned`
- Rewriting rules grow a plant step by step, so more steps is a more complex plant. Chapter 4 covers spiral arrangements (cactus spines, rosettes).
- The planned engine for evolving plants, one rule set per planet type. The library is MIT and has a three.js example.
- *[The Algorithmic Beauty of Plants](http://algorithmicbotany.org/papers/abop/abop.pdf) · [Chapter 4](http://algorithmicbotany.org/papers/abop/abop-ch4.pdf) · [nylki/lindenmayer](https://github.com/nylki/lindenmayer). Read by a research agent 2026-10-26*

**Artificial evolution of plant forms** · Karl Sims, SIGGRAPH 1991 · `planned`
- Plants built from about 20 genes, each kept between 0 and 1. A mutation changes a gene with probability 0.2 by up to ±0.4, then clamps it. Section 3.3 gives four ways to mate two parents.
- The planned evolution rule.
- *[Artificial Evolution for Computer Graphics](https://www.karlsims.com/papers/SimsSiggraph91.pdf). Read by a research agent 2026-10-26*

**Space colonization** · Runions et al. 2007; `nicknikolov/space-colonization` · `planned`
- Branches grow toward a cloud of target points; the cloud's shape sets the silhouette (a sphere gives a coral bush, a ring an anemone).
- Planned for coral and anemone forms. The library is MIT and marked unstable.
- *[Runions et al.](http://algorithmicbotany.org/papers/colonization.egwnp2007.large.pdf) · [nicknikolov/space-colonization](https://github.com/nicknikolov/space-colonization). Read by a research agent 2026-10-26*

**Ecological placement rules** · three.js `ForestGenerator` · `planned`
- Trees placed by rejection sampling against an altitude band, a slope limit and a noise mask that opens clearings.
- The planned placement method, each rule as a visible slider. Its material is WebGPU-only, so only the method is reused. Read in the installed three.js 0.185 source.

### Considered, not used

**EZ-Tree** · Dan Greenheck · `considered 2026-10-26`
- MIT three.js tree generator with 15 presets (oak, pine, bushes) and seeded parameters, 10k to 40k triangles a tree.
- Not chosen for now: earth-like trees, heavy, and unconfirmed for alien or coral forms.
- *[ez-tree](https://github.com/dgreenheck/ez-tree) · [CG Channel](https://www.cgchannel.com/2025/04/ez-tree-is-a-lightweight-free-open-source-tree-generator)*

**Poly Haven scanned trees** · `considered 2026-10-26`
- CC0 glTF trees, including desert quiver trees and island trees. Too realistic and heavy for the style.
- *[Poly Haven trees](https://polyhaven.com/models/nature/trees)*

**Storing height as a cubemap** · `considered 2026-10-13`
- six square textures, one per cube face, instead of one rectangle, which removes pole distortion from the stored data itself and uses less memory for the same detail
- not chosen: it would mean rebuilding painting, the 2D canvas, saving and the chunk's height reading. The position based fix solves the same problem for noise without touching any of them
- *[Gaia Sky, cubemaps](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.6.0/Cubemaps.html) · [Ellipsoidal cube maps for accurate rendering of planetary-scale terrain data, Eurographics](https://diglib.eg.org/items/96578eb4-03cf-4aba-bb3b-fc1cbe96a626/full)*

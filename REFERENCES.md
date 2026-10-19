# 📚 References

`Last updated: 2026-10-13`

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

*Nothing yet.*

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
- *[Unity Auto Exposure / Eye Adaptation docs](https://docs.unity3d.com/Packages/com.unity.postprocessing@2.0/manual/Auto-Exposure.html) (percentile histogram filtering, "Filtering" low/high percentages). [Creating a histogram using rasterization? — Khronos community forum](https://community.khronos.org/t/creating-a-histogram-using-rasterization/76746) and [webgl2fundamentals: 16-bit histogram](https://webgl2fundamentals.org/webgl/lessons/webgl-qna-how-can-i-create-a-16bit-historgram-of-16bit-data.html) (point-sprite + additive-blending construction, the WebGL-compatible mechanism). Verified 2026-10-18.*

**Whole-dataset vs. current-view color stretch** · QGIS raster symbology · `method used`
- A real, named choice in GIS tools, not one universal rule: `WholeRaster` (stretch computed once from the entire dataset, stays fixed at every zoom/pan) versus `CurrentCanvas`/`UpdatedCanvas` (stretch recomputed from whatever's currently visible, shifts as you navigate). This project's own color ramp uses the first: a shared elevation range computed once from the whole planet, so the same real elevation reads as the same color everywhere, whether zoomed into the planet or one land-chunk patch of it, matching the project's own earlier decision that the ramp "should encompass all terrain levels that exist in the planet." The chunk's own per-patch range computation (tonight's GPU histogram work included) was a drift from that decision, corrected by reading the planet's already-computed range instead of recomputing one locally.
- *[QgsRasterMinMaxOrigin — QGIS C++ API docs](https://api.qgis.org/api/3.40/classQgsRasterMinMaxWidget.html) (`Limits` enum: `WholeRaster` vs `CurrentCanvas`/`UpdatedCanvas`). Verified 2026-10-18.*

### Rendering

**Multiple views, one shared renderer** · Three.js project · `method used`
- One `WebGLRenderer` draws into one canvas; each view gets its own `setScissor()`/`setViewport()` rectangle per frame, read from a DOM placeholder element's own `getBoundingClientRect()` (converted from the DOM's top-left origin to WebGL's bottom-left one), with the scissor test on so each region clears and draws independently without touching the others. Built as the fix for the planet and land chunk previously being unable to share a GPU texture at all, each owned a separate `WebGLRenderer`/context, and a render target's texture belongs to the context that created it. See `scene/sharedViewportRenderer.ts`, `[S28]` in `SPEC.md`, `[B32]` in `ISSUES.md`.
- *[mrdoob/three.js](https://github.com/mrdoob/three.js), `examples/webgl_multiple_elements.html`. Verified 2026-10-17.*

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

### Considered, not used

**Storing height as a cubemap** · `considered 2026-10-13`
- six square textures, one per cube face, instead of one rectangle, which removes pole distortion from the stored data itself and uses less memory for the same detail
- not chosen: it would mean rebuilding painting, the 2D canvas, saving and the chunk's height reading. The position based fix solves the same problem for noise without touching any of them
- *[Gaia Sky, cubemaps](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.6.0/Cubemaps.html) · [Ellipsoidal cube maps for accurate rendering of planetary-scale terrain data, Eurographics](https://diglib.eg.org/items/96578eb4-03cf-4aba-bb3b-fc1cbe96a626/full)*

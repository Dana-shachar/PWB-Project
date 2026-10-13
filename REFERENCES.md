# 📚 References

`Last updated: 2026-10-13`

*Every outside source this project relies on, with what it is and what was taken from it. Cited once here, linked from everywhere else.*

> [!NOTE]
> Grouped as **conceptual** (ideas and framing), **visual** (look and reference imagery) and **computational** (methods, algorithms and implementations used in the tool).
>
> A source is listed only once it has actually been read and used. Something mentioned in discussion but never verified is marked ⚠️ and says so.

> [!IMPORTANT]
> This file was added on 2026-10-13, so it currently holds the planet-mesh work only. References already cited inside `ROADMAP.md` and `README.md` (Gaea, World Machine, Sebastian Lague, Red Blob Games, Minecraft's noise generator, Stefan Gustavson's noise implementations, The Book of Shaders) get migrated here during the documentation retrofit, so they live in one place.

---

## 🧠 Conceptual

*Nothing migrated here yet. See the note above.*

---

## 🎨 Visual

*Nothing migrated here yet. See the note above.*

---

## ⚙️ Computational

*Methods and implementations the tool actually uses.*

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

**Finding which tile a point on the planet falls in** · `method used`
- take the direction from the planet's center, find which axis dominates to get the cube face, then divide the other two components by it to get the position on that face, and walk the tree to the depth wanted
- how double-clicking the planet picks the chunk's location. It is the algebraic inverse of the cube-to-sphere projection, so picking and geometry cannot disagree
- *[Unity discussion: planetary terrain tile coordinates](https://discussions.unity.com/t/planetary-terrains-tiles-coordinates/688800)*

**Uneven patch sizes from plain normalization** · ⚠️ `known limitation`
- projecting a cube onto a sphere by normalizing makes patches near a face's center cover more ground than those at its corners, so detail is not perfectly even across a face
- accepted for now; a distortion-correcting projection is the fix if it becomes visible
- *Same Unity discussion as above*

### Considered, not used

**Storing height as a cubemap** · `considered 2026-10-13`
- six square textures, one per cube face, instead of one rectangle, which removes pole distortion from the stored data itself and uses less memory for the same detail
- not chosen: it would mean rebuilding painting, the 2D canvas, saving and the chunk's height reading. The position based fix solves the same problem for noise without touching any of them
- *[Gaia Sky, cubemaps](https://gaia.ari.uni-heidelberg.de/gaiasky/docs/3.6.0/Cubemaps.html) · [Ellipsoidal cube maps for accurate rendering of planetary-scale terrain data, Eurographics](https://diglib.eg.org/items/96578eb4-03cf-4aba-bb3b-fc1cbe96a626/full)*

# 🧭 Code Index

`Last updated: 2026-10-21`

*Where every part of the app lives, so a read can jump straight to the right file and function. Paths are under `app/src/`.*

> [!IMPORTANT]
> This index maps by file and function **name**, never by line number, because line numbers go stale at once. Search for the name to find the lines. Verify a name before relying on it. **Update this file with every milestone's docs pass and before every handover**, the same as `ROADMAP.md`.

---

## 🔎 If you are changing...

*A lookup of the common tasks and the files to read first.*

| Task | Read first, in order |
|---|---|
| Add or change a noise control | `map/noiseRanges.ts`, `map/heightmap.ts` (`NoiseLayer`), `ui/NoisePanel.tsx`, `shaders/heightmap.frag.glsl` |
| Add a field to a layer | `map/heightmap.ts` (`NoiseLayer`, `createDefaultLayer`, `migrateLegacyLayers`, `syncLayerUniforms`), then the shader uniform |
| Change a layer's mask | `ui/MaskControls.tsx`, `map/heightmap.ts` (`hasMask`, `quantileOf`), the mask code in `shaders/heightmap.frag.glsl` |
| Change which patches the planet shows | `planet/planetPatches.ts`, `planet/PlanetPatchRenderer.ts`, `planet/patchLifecycle.ts` |
| Change patch bake size or depth limits | `planet/patch.ts`, then `PlanetPatchRenderer.ts` |
| Change planet lighting or color | `shaders/terrain.glsl`, `shaders/planetPatch.frag.glsl`, `shaders/chunk.frag.glsl` |
| Change the color ramp | `planet/colorRamp.ts`, `ui/panels/ColorRampEditor.tsx`, `terrainRampColor` in `shaders/terrain.glsl` |
| Add a saved planet setting | `planet/planetControls.ts` (`PlanetSettings`, `applySettings`), `projectSettings/saveProject.ts` |
| Add a design-system component | `ui/UIElements.tsx`, `design.css`, `ui/icons.tsx` |
| Add a panel control | `ui/Panel.tsx` (left) or `ui/NoisePanel.tsx` (right), then `App.tsx` for wiring |
| Change erosion | `erosion/erosionEngine.ts`, `shaders/erosion/`, `ui/panels/ErosionPanel.tsx` |
| Change the land chunk | `voxel/landChunk.ts`, `voxel/LandChunkCanvas.tsx`, `shaders/chunk.frag.glsl` |

---

## 🔗 Data flows

*The chains that cross several files, in order.*

**A noise slider reaching the screen**
1. `ui/NoisePanel.tsx` calls `onUpdateSelectedLayer`, wired through `RightPanel.tsx` and `App.tsx`.
2. `map/noiseLayers.ts` (`updateSelectedLayer`, `updateLayers`) merges the value into the layer.
3. `scene/SceneCanvas.tsx` sees `layers` change and re-bakes through `map/heightmap.ts` (`syncLayerUniforms`, then the bake).
4. `shaders/heightmap.frag.glsl` evaluates the layer. The planet patches rebake (`PlanetPatchRenderer.rebakeAll`).

**A patch appearing on the planet**
1. `scene/SceneCanvas.tsx` calls `PlanetPatchRenderer.updatePatches` each frame with the camera.
2. `planet/planetPatches.ts` (`selectPatchesIncremental`) picks the patches by screen-space error.
3. `planet/patchLifecycle.ts` tracks active, retiring and cached patches.
4. `PlanetPatchRenderer` bakes (`bakeRegionToTarget`), builds geometry (`planetPatchMesh.ts`) and the material.

**A planet setting being saved**
1. The control calls a setter in `planet/planetControls.ts`.
2. `projectSettings/saveProject.ts` (`useSaveProject`) collects `currentSettings` and autosaves through `firebase/storage.ts`.
3. On load, `applySettings` restores it, with migrations for older saves.

---

## 🧱 App and state

*The composition root and the shared pieces.*

**App.tsx**
- What it is: wires every feature hook into the layout. It holds no feature state of its own.
- Key names: `App`, `handleToggleStageEnabled`.
- Talks to: every hook below, `Panel`, `RightPanel`, both canvases.

**design.css** (in `src/`)
- What it is: design tokens and the styles for every component.
- Key names: the `--color-*`, `--gap-*` and `--font-*` tokens, `.ui-*` component classes, `.ui-tooltip`.
- Talks to: all of `ui/`.

---

## 🧊 Terrain noise (`map/`)

*The layer model and the GPU heightmap bake.*

**map/heightmap.ts**
- What it is: the layer type, its migrations, and the pipeline that bakes layers into a heightmap on the GPU.
- Key names: `NoiseLayer`, `NOISE_TYPE_OPTIONS`, `FRACTAL_TYPE_OPTIONS`, `VORONOI_DISTANCE_OPTIONS`, `BLEND_MODE_OPTIONS`, `hasMask`, `quantileOf`, `createDefaultLayer`, `migrateLegacyLayers`, `HeightmapPipeline` (`beginStroke`, `endStroke`, `replayLayerHistory`, `bakeRegionToTarget`, `getRegionElevationData`), `syncLayerUniforms`.
- Talks to: `shaders/heightmap.frag.glsl`, `SceneCanvas`, the patch renderer.

**map/noiseRanges.ts**
- What it is: one table of every noise control's range and scale.
- Key names: `NOISE_RANGES`, `randomForRange`, `sliderRange`.
- Talks to: `NoisePanel`, `noiseLayers` (Randomize), `MaskControls`.

**map/noiseLayers.ts**
- What it is: the layer list hook.
- Key names: `useNoiseLayers`, `addLayer`, `deleteLayer`, `reorderLayer`, `renameLayer`, `updateSelectedLayer`, `updateLayers`, `toggleLayerVisible`, `randomizeTerrain`.
- Talks to: `NoisePanel`, `heightmap.ts`.

**map/2Dbrush.ts**
- What it is: paint strokes and their undo.
- Key names: `useBrush`.

**map/MapView.tsx**
- What it is: the 2D noise canvas and its painting.

**map/elevationRange.ts**
- What it is: the percentile elevation range used by the color ramp.
- Key names: `computeElevationRange`, `HISTOGRAM_BINS`, `CLIP_PERCENT`.

---

## 🪐 Planet (`planet/`)

*Patches, their lifecycle, and the planet's settings.*

**planet/planetPatches.ts**
- What it is: decides which patches to show.
- Key names: `screenSpaceError`, `patchPixelWidth`, `patchInView`, `shouldSplit`, `thresholdFor`, `buildLeafIndex`, `coveringLeaves`, `selectPatchesIncremental`, `selectLeafPatches`, `computeStitchFlags`, `patchKey`.
- Talks to: `patch.ts`, `PlanetPatchRenderer.ts`.

**planet/patch.ts**
- What it is: patch math, bake sizes, the Resolution migration, the depth cap.
- Key names: `TerrainPatch`, `rootPatch`, `subdivide`, `crossFaceNeighbors`, `neighborProbe`, `bakeSamplesCap`, `bakeSamplesForPixelWidth`, `migrateResolution`, `MAX_PATCH_DEPTH`, `PATCH_GRID_TIERS`.

**planet/PlanetPatchRenderer.ts**
- What it is: builds, upgrades and drops patch meshes.
- Key names: `PlanetPatchRenderer` (`updatePatches`, `rebakeAll`, `applyShared`, `raycast`, `dispose`).
- Talks to: `planetPatches.ts`, `patchLifecycle.ts`, `planetPatchMesh.ts`, `heightmap.ts`.

**planet/patchLifecycle.ts**
- What it is: the cache and the retiring set.
- Key names: `PatchLifecycle` (`add`, `remove`, `refresh`, `shownKeys`, `bumpBakeVersion`), `PATCH_CACHE_MAX_VERTICES`, `PATCH_CACHE_MAX_BAKE_TEXELS`.

**planet/planetPatchMesh.ts**
- What it is: patch geometry (stitching, skirts) and material.
- Key names: `buildPatchGeometry`, `createPatchMaterial`, `applySharedUniforms`, `PlanetSharedUniforms`.

**planet/planetControls.ts**
- What it is: the planet's settings state and their migrations.
- Key names: `PlanetSettings`, `DEFAULT_PLANET_SETTINGS`, `usePlanetControls`, `applySettings`, `currentSettings`, `migrateColorStops`.

**planet/colorRamp.ts**
- What it is: the ramp stops as shader arrays.
- Key names: `ColorStop`, `MAX_COLOR_STOPS`, `buildRampUniformArrays`.

**planet/cubeFace.ts**
- What it is: the cube-sphere mapping.
- Key names: `cubeFacePoint`, `cubeFaceCoord`, `CUBE_FACES`.

**planet/mesh.ts**
- What it is: the old whole-globe mesh, kept for Wireframe.

---

## 🎬 Scene (`scene/`)

*The planet view, the shared renderer and the lighting state.*

**scene/SceneCanvas.tsx**
- What it is: the planet view and its imperative handle.
- Key names: `SceneCanvas`, `SceneCanvasHandle`, `updateElevationRange`, `replayAndRecomposite`, `buildWireframeOverlay`.
- Talks to: `heightmap.ts`, `PlanetPatchRenderer`, `sharedViewportRenderer`.

**scene/sharedViewportRenderer.ts**
- What it is: the one WebGL renderer both panes share.
- Key names: `useSharedViewportRenderer`, `registerView`.

**scene/sceneControls.ts**
- What it is: lighting and grid state.
- Key names: `useSceneControls`.

**scene/Gumball.tsx**, **scene/sharedGumball.ts**
- What it is: the navigation widget, and its shared control of one or two cameras.
- Key names: `Gumball`, `useSharedGumball`.

**scene/camera.ts**, **controls.ts**, **grid.ts**, **renderer.ts**, **scene.ts**
- What it is: small Three.js setup modules.

---

## 🧊 Land chunk (`voxel/`)

*The flat detail view and its meshing.*

**voxel/landChunk.ts**
- What it is: chunk state, picking and the view mode.
- Key names: `useLandChunk`, `pickLocation`, `startResize`.

**voxel/LandChunkCanvas.tsx**
- What it is: the chunk view and its material.
- Key names: `LandChunkCanvas`, `LandChunkCanvasHandle`.

**voxel/smoothMesh.ts**, **meshWorker.ts**, **density.ts**, **chunkGrid.ts**
- What it is: smooth and blocky meshing, and the chunk's grid constants.
- Key names: `buildSmoothChunkGeometry`, `buildChunkHeights`.

---

## 🌊 Erosion (`erosion/`)

*The grid-based solver and its timeline.*

**erosion/erosionEngine.ts**
- What it is: the GPU solver with checkpoints.
- Key names: `ErosionEngine` (`seed`, `step`, `captureCheckpoint`, `loadCheckpoint`), `stepsForYears`, `createDefaultErosionRates`.

**erosion/erosionControls.ts**
- What it is: the erosion state hook.
- Key names: `useErosion` (`run`, `scrubTo`, `loadSavedRun`, `updateRates`).

**erosion/ErosionTimeline.tsx**
- What it is: the bottom dock with the scrub timeline.

---

## 🖥️ Interface (`ui/`)

*Panels, controls and the design-system components.*

**ui/UIElements.tsx**
- What it is: the design-system components.
- Key names: `Slider` (log and reversed scales), `Toggle`, `Select`, `ColorPicker`, `EditableText`, `Accordion`, `IconButton`, `Popup`, `placeTooltip`.

**ui/icons.tsx**
- What it is: flat line-art icons.
- Key names: `DiceIcon`, `PaletteIcon`, `EyeIcon`, `MaskIcon`, `UndoIcon`, `RedoIcon`, `ResetIcon`, `CloseIcon`.

**ui/Panel.tsx**
- What it is: the left panel (Project, Edit, Scene, Planet Terrain, stages).
- Key names: `Panel`, `PipelineStageRow`.

**ui/RightPanel.tsx**, **ui/NoisePanel.tsx**
- What it is: the right panel for the active stage, and the Terrain stage's layer controls.
- Key names: `RightPanel`, `NoisePanel`.

**ui/MaskControls.tsx**
- What it is: the layer mask popup and its row button.
- Key names: `MaskControls`, `LayerMaskButton`.

**ui/panels/ColorRampEditor.tsx**
- What it is: the gradient ramp editor and its color list.
- Key names: `ColorRampEditor`, `rawElevationAt`, `positionFromMeters`, `formatColorCode`.

**ui/panels/ErosionPanel.tsx**, **StagePlaceholder.tsx**, **ui/pipelineStages.ts**, **ui/panelResize.ts**
- What it is: the Erosion stage panel, an empty stage, the stage list, and the drag-to-resize hooks.

---

## 🎨 Shaders (`shaders/`)

*GLSL ES 1.00, so no integers and constant loop bounds.*

**heightmap.frag.glsl**
- What it is: composites every layer, masks and fractals into elevation.
- Key names: `evalLayerNoise`, `evalBaseGenerator`, `fbm3D`, `fractalNoise3D`, `ridgedFbm3D`, `octaveFade`, `domainWarpedPosition`, `applyBlendMode`, `main`.

**noise.glsl**
- What it is: the hash and the noise functions.
- Key names: `hash1`, `perlinNoise3D`, `simplexNoise3D`, `voronoiNoise3D`, `voronoiMetric`, `ridge`, `terrace`.

**terrain.glsl**
- What it is: pieces shared by the surface shaders.
- Key names: `terrainRampColor`, `heightfieldNormal`, `softDiffuse`, `heightmapShadow`.

**planetPatch.frag.glsl**, **chunk.frag.glsl**, **fragment.glsl**
- What it is: the three surface shaders (patches, chunk, old globe).

**erosion/**, **elevationHistogram**, **minMaxReduce**, **grid**, **strokePath**, **vertex**, **chunk.vert**
- What it is: erosion passes, range reduction, the grid, strokes and the vertex stages.

---

## 💾 Persistence

*Saving and loading projects.*

**projectSettings/saveProject.ts**
- What it is: autosave, load, new and reset.
- Key names: `useSaveProject`, `createFreshProject`, `handleReset`.

**firebase/storage.ts**, **client.ts**, **currentUser.ts**
- What it is: Firestore access and the anonymous user.
- Key names: `saveProject`, `loadProject`, `listProjects`, `useCurrentUser`.

# 🧭 Code Index

`Last updated: 2026-10-27`

*Where every part of the app lives, so a read can jump straight to the right file and function. Paths are under `app/src/`.*

> [!IMPORTANT]
> This index maps by file and function **name**, never by line number, because line numbers go stale at once. Search for the name to find the lines. Verify a name before relying on it. **Update this file with every milestone's docs pass and before every handover**, the same as `ROADMAP.md`.

---

## 🔎 If you are changing...

*A lookup of the common tasks and the files to read first.*

| Task | Read first, in order |
|---|---|
| Add or change a noise control | `map/noiseRanges.ts`, `map/heightmap.ts` (`NoiseLayer`), `ui/NoisePanel.tsx`, `shaders/heightmap/heightmap.frag.glsl` |
| Add a field to a layer | `map/heightmap.ts` (`NoiseLayer`, `createDefaultLayer`, `migrateLegacyLayers`, `syncLayerUniforms`), then the shader uniform |
| Change a layer's mask | `ui/MaskControls.tsx`, `map/heightmap.ts` (`hasMask`, `quantileOf`), the mask code in `shaders/heightmap/heightmap.frag.glsl` |
| Change which patches the planet shows | `planet/planetPatches.ts`, `planet/PlanetPatchRenderer.ts`, `planet/patchLifecycle.ts` |
| Change patch bake size or depth limits | `planet/patch.ts`, then `PlanetPatchRenderer.ts` |
| Change planet lighting or color | `shaders/terrain/terrain.glsl`, `shaders/terrain/planetPatch.frag.glsl`, `shaders/terrain/chunk.frag.glsl` |
| Change the atmosphere (sky, haze, glow, clouds, wind) | `atmosphere/`, `shaders/atmosphere/`, `ui/panels/AtmospherePanel.tsx`, the Atmosphere section of `ui/Panel.tsx` |
| Change water (sea level, color, transparency, waves) | `shaders/water/water.glsl` and `shaders/terrain/planetPatch.frag.glsl` (planet ocean), `voxel/chunkWater.ts`, `shaders/water/chunkWater.frag.glsl` and `shaders/water/oceanWaves.glsl` (chunk, Seascape), `WaterSettings` in `planet/planetControls.ts`, the water rows and Color section of `ui/Panel.tsx` |
| Change the planet's height statistics (ramp range, % land) | `updateElevationRange` in `scene/SceneCanvas.tsx`, `getRegionHistogramAsync` in `map/heightmap.ts`, `percentileRangeFromBins` in `map/elevationRange.ts`, `planet/seaLevel.ts` |
| Change the color ramp | `planet/colorRamp.ts`, `ui/panels/ColorRampEditor.tsx`, `terrainRampColor` in `shaders/terrain/terrain.glsl` |
| Add a saved planet setting | `planet/planetControls.ts` (`PlanetSettings`, `applySettings`), `projectSettings/saveProject.ts` |
| Add a design-system component | `ui/UIElements.tsx`, `design.css`, `ui/icons.tsx` |
| Add a panel control | `ui/Panel.tsx` (left) or `ui/NoisePanel.tsx` (right), then `App.tsx` for wiring |
| Change erosion | `erosion/erosionEngine.ts`, `shaders/erosion/`, `ui/panels/ErosionPanel.tsx` |
| Change the land chunk | `voxel/landChunk.ts`, `voxel/LandChunkCanvas.tsx`, `voxel/ChunkPatchRenderer.ts`, `shaders/chunk.vert.glsl`, `shaders/terrain/chunk.frag.glsl` |
| Change which patches the chunk shows | `voxel/chunkPatches.ts` (`selectChunkPatches`), `voxel/ChunkPatchRenderer.ts`, `voxel/chunkPatchMesh.ts` |
| Change walk mode (person view): keys, speed, look, click-to-walk, fly-in | `scene/walkMode.ts` (`WalkMode`), its wiring in the setup effect of `voxel/LandChunkCanvas.tsx` (`enterWalk`), the person button in `scene/Gumball.tsx` (`toggleWalkMode`, `isWalking`) |
| Change the chunk camera's ground picking or collision | `voxel/chunkGround.ts` (`groundHeightAt`, `raycastGround`), `keepAboveFlatGround` in `scene/controls.ts`, `pivotAtScreenPoint` and the setup effect of `voxel/LandChunkCanvas.tsx`, `pivotToGround` in `scene/Gumball.tsx` |
| Change patch texture borders or slope reading | `PATCH_BORDER_TEXELS`, `createPatchTarget` in `planet/patch.ts`, `borderTexels` in `map/heightmap.ts`, `borderedTextureUv` and `texelStepUv` in `shaders/terrain/terrain.glsl` |
| Change how the camera moves or zooms | `scene/controls.ts` (`applyAltitudeRates`), `scene/camera.ts` (`MIN_CAMERA_ALTITUDE`), `scene/Gumball.tsx` (`levelToDistance`, `distanceToLevel`) |
| Change the planet-wide fine detail | `planetDetail` in `shaders/heightmap/heightmap.frag.glsl`, `HeightmapPipeline.setDetailAmount`, `detailAmount` in `planet/planetControls.ts` |

---

## 🔗 Data flows

*The chains that cross several files, in order.*

**A noise slider reaching the screen**
1. `ui/NoisePanel.tsx` calls `onUpdateSelectedLayer`, wired through `RightPanel.tsx` and `App.tsx`.
2. `map/noiseLayers.ts` (`updateSelectedLayer`, `updateLayers`) merges the value into the layer.
3. `scene/SceneCanvas.tsx` sees `layers` change and re-bakes through `map/heightmap.ts` (`syncLayerUniforms`, then the bake).
4. `shaders/heightmap/heightmap.frag.glsl` evaluates the layer. The planet patches rebake (`PlanetPatchRenderer.rebakeAll`).

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
- Key names: `NoiseLayer`, `NOISE_TYPE_OPTIONS`, `FRACTAL_TYPE_OPTIONS`, `VORONOI_DISTANCE_OPTIONS`, `BLEND_MODE_OPTIONS`, `hasMask`, `quantileOf`, `createDefaultLayer`, `migrateLegacyLayers`, `HeightmapPipeline` (`beginStroke`, `endStroke`, `replayLayerHistory`, `bakeRegionToTarget`, `getRegionElevationData`, `setDetailAmount`, `bakeRegionInto`, `maskSortedValues`, `resolveMaskBand`), `syncLayerUniforms`.
- Talks to: `shaders/heightmap/heightmap.frag.glsl`, `SceneCanvas`, the patch renderer.

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
- What it is: patch math, bake sizes, the Resolution conversion and migration, the depth cap, the fixed mesh grid.
- Key names: `TerrainPatch`, `rootPatch`, `subdivide`, `crossFaceNeighbors`, `neighborProbe`, `bakeSamplesCap`, `bakeSamplesForPixelWidth`, `PATCH_BORDER_TEXELS`, `createPatchTarget`, `MAX_INDEX_DEPTH`, `migrateResolution`, `resolutionToMaxErrorPixels`, `maxErrorPixelsToResolution`, `MAX_PATCH_DEPTH`, `PATCH_GRID`, `MAX_PATCH_TEXTURE_RESOLUTION`, `clampPatchTextureResolution`.

**planet/PlanetPatchRenderer.ts**
- What it is: builds, upgrades and drops patch meshes.
- Key names: `PlanetPatchRenderer` (`updatePatches`, `rebakeAll`, `applyShared`, `wantedBakeSamples`, `syncVisibility`, `raycast`, `dispose`).
- Talks to: `planetPatches.ts`, `patchLifecycle.ts`, `planetPatchMesh.ts`, `heightmap.ts`.

**planet/patchLifecycle.ts**
- What it is: the cache and the retiring set.
- Key names: `PatchLifecycle` (`add`, `remove`, `refresh`, `shownKeys`, `bumpBakeVersion`), `PATCH_CACHE_MAX_VERTICES`, `PATCH_CACHE_MAX_BAKE_TEXELS`.

**planet/planetPatchMesh.ts**
- What it is: patch geometry (stitching, skirts) and material.
- Key names: `buildPatchGeometry`, `createPatchMaterial`, `applySharedUniforms` (on a change), `applyFrameUniforms` (every frame, the eye only), `buildPatchRampArrays`, `PlanetSharedUniforms`.

**planet/planetControls.ts**
- What it is: the planet's settings state and their migrations.
- Key names: `PlanetSettings` (incl. `maxErrorPixels`, `detailAmount`, `autoDetail`, `water`, `atmosphere`), `WaterSettings` (incl. `shine`, `reflection`), `DEFAULT_WATER_SETTINGS`, `updateAtmosphere`, `WATER_SKY_COLOR`, `WATER_SHININESS`, `migrateWater`, `shoreSeaLevel` (debounced), `effectiveMaxErrorPixels`, `DEFAULT_PLANET_SETTINGS`, `usePlanetControls`, `applySettings`, `currentSettings`, `migrateColorStops`.

**planet/seaLevel.ts**
- What it is: the planet's area-weighted height distribution, the "% land" readout, and the water ramp's spacing by light remaining.
- Key names: `HeightDistribution`, `buildHeightDistribution`, `landShareAt`, `seaLevelForLandShare`, `depthToRampPosition`, `rampPositionToDepth`, `landRampFloor` (the land ramp starts at the depth light reaches).

**planet/rippleMap.ts**
- What it is: the water's ripple texture, loaded once and shared by the planet and the chunk.
- Key names: `getRippleMap`, `isRippleMapReady`.

**planet/oceanSpectrum.ts**
- What it is: waves from the wind: Beaufort force to wind speed, Pierson-Moskowitz wavelength and height, the variance waves, wave clock and surf zone.
- Key names: `beaufortWindSpeed`, `peakWavelength`, `significantWaveHeight`, `windLengthScale`, `windTimeScale`, `surfZoneShare`, `buildWaveSet`, `applyWaveSet`, `createWaveUniforms`, `MAX_WAVES`, `MAX_WAVE_WIND` (waves stop growing at force 12; Wind goes to 40 for the clouds).

**planet/colorRamp.ts**
- What it is: the ramp stops as shader arrays.
- Key names: `ColorStop`, `MAX_COLOR_STOPS`, `buildRampUniformArrays`.

**planet/cubeFace.ts**
- What it is: the cube-sphere mapping.
- Key names: `cubeFacePoint`, `cubeFaceCoord`, `CUBE_FACES`.

**planet/mesh.ts**
- What it is: the old whole-globe mesh, kept for Wireframe.

---

## ☁️ Atmosphere (`atmosphere/`)

*The sky, haze, glow, clouds, wind and moon, saved with the planet.*

**atmosphere/atmosphereSettings.ts**
- What it is: the settings and their defaults; older saves take their wind from the water.
- Key names: `AtmosphereSettings` (incl. `cloudColor2`, `moonHeight`), `DEFAULT_ATMOSPHERE_SETTINGS`, `migrateAtmosphere`.

**atmosphere/skyDome.ts**, **planetGlow.ts**, **planetHaze.ts**, **cloudLayer.ts**
- What it is: the chunk's sky, the planet's rim glow, surface haze and cloud shell.
- Key names: `createSkyDome`, `updateSkyDome`, `updateSkyDomeFrame`, `setSkyDomeLight` (the Scene light for the moon), `MOON_AZIMUTH`, `CLOUD_DRIFT`; `createPlanetGlow`, `updatePlanetGlow`, `updatePlanetGlowFrame`, `GLOW_MIN_WIDTH`, `GLOW_WIDTH_PER_UNIT`, `GLOW_SHELL_WIDTHS`; `createPlanetHaze`, `updatePlanetHaze`, `HAZE_SCALE_HEIGHT`, `HAZE_DENSITY_PER_UNIT`; `createCloudLayer`, `updateCloudLayer`, `updateCloudLayerFrame`, `CLOUD_TIME_PER_WIND`.

**ui/panels/AtmospherePanel.tsx**
- What it is: the right panel's Wind, Clouds and Moon controls, shown when Atmosphere is selected.

---

## 🎬 Scene (`scene/`)

*The planet view, the shared renderer and the lighting state.*

**scene/SceneCanvas.tsx**
- What it is: the planet view and its imperative handle.
- Key names: `SceneCanvas`, `SceneCanvasHandle` (incl. `bakePatchInto`), `updateElevationRange`, `replayAndRecomposite`, `buildWireframeOverlay`.
- Talks to: `heightmap.ts`, `PlanetPatchRenderer`, `sharedViewportRenderer`.

**scene/sharedViewportRenderer.ts**
- What it is: the one WebGL renderer both panes share.
- Key names: `useSharedViewportRenderer`, `registerView`.

**scene/sceneControls.ts**
- What it is: lighting and grid state, including whether the light follows the camera (on by default).
- Key names: `useSceneControls`, `lightFollowsCamera`.

**scene/Gumball.tsx**, **scene/sharedGumball.ts**
- What it is: the navigation widget, and its shared control of one or two cameras. A target with a `surface` zooms by log height above the ground.
- Key names: `Gumball`, `GumballTarget` (`surface`), `levelToDistance`, `distanceToLevel`, `zoomAnchors`, `useSharedGumball`.

**scene/camera.ts**, **controls.ts**
- What it is: the camera and its orbit controls. Every frame the planet view scales rotate, pan and zoom speed, and the near and far planes, by height above the surface.
- Key names: `camera`, `defaultCameraPosition`, `DEFAULT_CAMERA_DISTANCE`, `MIN_CAMERA_ALTITUDE`, `DEFAULT_NEAR`, `DEFAULT_FAR`, `controls`, `applyAltitudeRates`, `keepAboveFlatGround` (the chunk). The gumball's zoom slider and Reset View call the target's `pivotToGround` first (`scene/Gumball.tsx`).

**scene/grid.ts**, **renderer.ts**, **scene.ts**
- What it is: small Three.js setup modules.

---

## 🧊 Land chunk (`voxel/`)

*The flat detail view and its meshing.*

**voxel/landChunk.ts**
- What it is: chunk state, picking and the view mode. In smooth style its main effect bakes one whole-chunk texture for shadows, a CPU copy of the heights for the camera, and bumps `bakeVersion` so the patches re-bake. Voxel style (being dropped) still builds one mesh.
- Key names: `useLandChunk`, `pickLocation`, `startResize`, `CHUNK_SHADOW_SAMPLES`, `GROUND_SAMPLES`, `bakeVersion`, `groundHeights`.

**voxel/chunkPatches.ts**
- What it is: which patches the chunk shows, the planet's screen-space-error rule over one flat square.
- Key names: `selectChunkPatches`, `ChunkDetail`, `rootFractions`, `chunkPatchWorldSize`, `chunkPatchBox`, `chunkPatchPixelWidth`, `chunkPatchInView`, `CHUNK_MAX_EXTRA_DEPTH`.

**voxel/ChunkPatchRenderer.ts**
- What it is: bakes, builds and swaps the chunk's patches; each patch material shares the chunk material's uniforms.
- Key names: `ChunkPatchRenderer` (`configure`, `update`, `rebakeAll`, `clear`, `fitBounds`, `sampleHeight`: the drawn ground height read from the deepest shown patch's bake), `BakeChunkPatch`.
- Talks to: `bakePatchInto` on `SceneCanvasHandle`, `chunkPatchMesh.ts`.

**voxel/chunkPatchMesh.ts**
- What it is: a flat patch from the planet's stitched grid (`buildPatchGeometry`), with walls on the chunk's border, and the chunk's base.
- Key names: `buildFlatPatchGeometry`, `buildChunkBaseGeometry`, `chunkBaseDepth`.

**scene/walkMode.ts**
- What it is: the chunk's person view. Drag to look, click to walk (the click ray is marched against the drawn ground, `pickGround`), WASD or arrows to move, arrows turn, R/F look up and down, Shift runs, `[` `]` or the wheel scale speed (default 10x), Esc leaves. A 1.5 s fly-in eases the camera from the orbit view.
- Key names: `WalkMode` (`enter`, `exit`, `update`, `progress`, `travelScale`), `EYE_HEIGHT_METERS`, `WALK_SPEED_MPS`, `RUN_MULTIPLIER`, `pickGround`, `flyIn`; water rules `getSeaHeight`, `nearestShore`, `nearestCoarseAbove`, `SHORE_INLAND_METERS`, `SHORE_VERIFY_ATTEMPTS`, `noShoreHeights` (walking stops at the shore, entering over water starts on the nearest shore, the eye never goes under the sea).
- Talks to: `LandChunkCanvas.tsx` (saves and restores the orbit camera, eases fov/near/far with `progress`), `ChunkPatchRenderer.sampleHeight` for the eye height.

**voxel/chunkWater.ts**
- What it is: the chunk's water, TDM's Seascape on a flat sheet, recolored by the water ramp, see-through in the shallows, with shore and crest foam.
- Key names: `ChunkWater`, `createChunkWater`, `updateChunkWater`, `updateChunkWaterFrame`, `setChunkWaterLight`.

**voxel/chunkGround.ts**
- What it is: ground height anywhere on the chunk, for camera picking and collision.
- Key names: `ChunkGround`, `groundHeightAt` (rows run opposite to z, `[B63]`), `raycastGround`.

**voxel/LandChunkCanvas.tsx**
- What it is: the chunk view, its chunk material (shared by the voxel mesh and every patch), map-style orbit (`zoomToCursor`, pivot on the ground under the cursor) and the patch renderer.
- Key names: `LandChunkCanvas`, `LandChunkCanvasHandle`, `pivotAtScreenPoint` (screen point to ground pivot), `pivotOnGround` (mouse handler), `currentGround`.

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
- What it is: the right panel for the active stage, and the Terrain stage's layer controls (its Terrain section holds Height and Roughness).
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

*GLSL ES 1.00, so no integers and constant loop bounds. One folder per feature.*

**heightmap/** (`heightmap.frag.glsl`, `noise.glsl`, `heightmapBrush.vert.glsl`, `strokePath.frag.glsl`, `elevationHistogram`, `minMaxReduce.frag.glsl`)
- What it is: the height bakes, the noise functions, brush strokes and the height statistics.
- Key names: `evalLayerNoise`, `evalBaseGenerator`, `fbm3D`, `fractalNoise3D`, `ridgedFbm3D`, `octaveFade`, `domainWarpedPosition`, `applyBlendMode`, `planetDetail`, `DETAIL_BASE_FREQUENCY`, `shoreFade`, `NYQUIST_FADE_MIN`/`MAX`; unproven `[B66]` changes: `isDeepCellOctave`, `deepCellOctave`, `octaveSeed`, `nextOctavePoint`, `OCTAVE_ROTATION`; in `noise.glsl`: `hash1`, `perlinNoise3D`, `simplexNoise3D`, `voronoiNoise3D`, `voronoiMetric`, `ridge`, `terrace`.

**terrain/** (`terrain.glsl`, `planetPatch.frag.glsl`, `chunk.frag.glsl`, `chunk.vert.glsl`, `vertex.glsl`, `fragment.glsl`)
- What it is: the land surfaces (planet patches, chunk, old globe) and the pieces they share. Lighting is in world space; `heightfieldNormal` always faces outward (`faceforward`).
- Key names: `terrainRampColor`, `borderedTextureUv`, `texelStepUv`, `heightfieldNormal`, `softDiffuse`, `heightmapShadow`; the chunk's haze `uHazeColor`, `uHazeDensity`, `uHazeStart`; the planet ocean block in `planetPatch.frag.glsl` (triplanar waves, `wavesVisible`, `dayLight`).

**water/oceanWaves.glsl** (CC BY-NC-SA 3.0, TDM's Seascape, with additions)
- What it is: the sea for both views: Seascape's waves and color, plus the project's additions.
- Key names: Seascape's `sea_octave`, `sea_octaves` (band-limited, `gSeaFootprint`, `SEA_WARP`), `sea_height` (currents, `seaBend`), `getNormal`, `seaColor` (Shine, Reflection, Cox and Munk glint far away); additions `seaFetchScale`, `gSeaAmplitude`, `seaWindScale`, `seaWhitecaps`, `seaStormStrength`, `foamStreaks`, `seaWhiteSea`, `seaFarFoam`, `halftoneMask`, `foamPatchiness`, `crestFoam`, `seaGlint`, `seaSlopeVariance`, `surfWave` (`uSurfZone`), `worldGradient`, `waterVariance` (Gerstner waves, pinch foam), the triplanar helpers `triplanarWeights`, `seaHeightTriplanar`, `seaNormalTriplanar`, `crestFoamTriplanar`.

**water/water.glsl**, **water/chunkWater.vert.glsl**, **water/chunkWater.frag.glsl**
- What it is: the water look both views share, and the chunk's water sheet (Seascape plus variance, surf, foam, depth transparency and haze).
- Key names: `WATER_F0`, `waterFresnel`, `waterTransmittance`, `waterRampPosition`, `waterFilter`, `waterFoam` (`SHORE_FOAM_SOFTNESS`, `SHORE_FOAM_EDGE_CUTOFF`), `FOAM_COLOR`, `FOAM_OPACITY`.

**atmosphere/** (`skyDome`, `planetGlow`, `planetHaze`, `clouds`, `haze.glsl`)
- What it is: the chunk's sky dome, the planet's rim glow and surface haze, the planet's cloud shell, and the chunk haze shared by ground and water.
- Key names: sky dome `topColor`, `bottomColor`, `uGlow`, sun halo, `skyFbm`, `drawMoon`, `moonCells`, `moonRelief`; glow `uWidth`, `uStrength`, edge-distance fade; haze `sphereHits`, `uScaleHeight`, `HAZE_STEPS`; clouds `cloudShape` (Swirl, Feather erosion), `cloudFbm`, `cloudTone`, `toneBands`, `bandSpeed`, `GLOBAL_DRIFT`, `BAND_SWING`, Beer and powder lighting; `haze.glsl` `applyHaze` (Quilez height fog, sun and sky hues), `interleavedGradientNoise`, `HAZE_FALLOFF`, `HAZE_GRAIN`.

**erosion/**, **scene/** (the grid)
- What it is: the erosion passes and the ground grid.

---

## 💾 Persistence

*Saving and loading projects.*

**projectSettings/saveProject.ts**
- What it is: autosave, load, new and reset.
- Key names: `useSaveProject`, `createFreshProject`, `handleReset`.

**firebase/storage.ts**, **client.ts**, **currentUser.ts**
- What it is: Firestore access and the anonymous user. `client.ts` reads its config from the `VITE_FIREBASE_*` env vars (`app/.env.local`), with a placeholder key when they're missing so the app still loads.
- Key names: `saveProject`, `loadProject`, `listProjects`, `useCurrentUser`.

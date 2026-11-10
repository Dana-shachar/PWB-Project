# 🧭 Code Index

`Last updated: 2026-11-10`

*Where every part of the app lives, so a read can jump straight to the right file and function. Paths are under `app/src/`.*

> [!IMPORTANT]
> This index maps by file and function **name**, never by line number, because line numbers go stale at once. Search for the name to find the lines. Verify a name before relying on it. **Update this file with every milestone's docs pass and before every handover**, the same as `ROADMAP.md`.

---

## 🔎 If you are changing...

*A lookup of the common tasks and the files to read first.*

| Task | Read first, in order |
|---|---|
| Add or change a noise control | `map/noiseRanges.ts`, `map/heightmap.ts` (`NoiseLayer`), `ui/NoisePanel.tsx`, `shaders/heightmap/heightmap.frag.glsl` |
| Change lakes or the river network | `rivers/drainage.worker.ts` (`buildWaterMap`, `extractRiverNodes`), `rivers/depressions.ts` (`fillSpillMerge`), `rivers/riverGrid.ts` |
| Change the chunk's lakes or tides | `rivers/chunkLakes.worker.ts`, `voxel/chunkLakes.ts`, `shaders/water/chunkWater.vert.glsl`, `applyTide` in `voxel/chunkWater.ts`, `atmosphere/tides.ts` |
| Change how rivers carve and draw (off) | `riverEdgeDistance`, `DRAW_RIVERS` and the carve after Roughness in `shaders/heightmap/heightmap.frag.glsl` |
| Change how the planet erodes | `rivers/planetDrainage.ts`, `shaders/erosion/streamPowerPlanet.frag.glsl`, `erodedSurface` and `waterMapAt` in `shaders/heightmap/heightmap.frag.glsl`, `shaders/heightmap/erosionFilter3d.glsl` |
| Add a liquid or a climate control | `rivers/riverClimate.ts` (`LIQUIDS`, `waterBudget`), `atmosphere/atmosphereSettings.ts` (`randomClimate`), the Climate section in `ui/Panel.tsx` |
| Add a field to a layer | `map/heightmap.ts` (`NoiseLayer`, `createDefaultLayer`, `migrateLegacyLayers`, `syncLayerUniforms`), then the shader uniform |
| Change a layer's mask | `ui/MaskControls.tsx`, `map/heightmap.ts` (`hasMask`, `quantileOf`), the mask code in `shaders/heightmap/heightmap.frag.glsl` |
| Change which patches the planet shows | `planet/planetPatches.ts`, `planet/PlanetPatchRenderer.ts`, `planet/patchLifecycle.ts` |
| Change patch bake size or depth limits | `planet/patch.ts`, then `PlanetPatchRenderer.ts` |
| Change planet lighting or color | `shaders/terrain/landLayers.glsl` (the land's shared layers), `shaders/terrain/terrain.glsl`, `shaders/terrain/planetPatch.frag.glsl`, `shaders/terrain/chunk.frag.glsl` |
| Change the shadows' color (the sky fill) | `fillLight` in `shaders/terrain/landLayers.glsl`, `fillColorFor` in `scene/fillLight.ts`, `shadowHue` in `atmosphere/atmosphereSettings.ts` (its `HueSlider` in the Atmosphere section of `ui/Panel.tsx`), `uFillColor` in `planet/planetPatchMesh.ts` and `voxel/LandChunkCanvas.tsx` |
| Change the atmosphere (sky, haze, glow, clouds, wind) | `atmosphere/`, `shaders/atmosphere/`, `ui/panels/AtmospherePanel.tsx`, the Atmosphere section of `ui/Panel.tsx` |
| Change water (sea level, color, transparency, waves) | `shaders/water/water.glsl` and `shaders/terrain/planetPatch.frag.glsl` (planet ocean), `voxel/chunkWater.ts`, `shaders/water/chunkWater.frag.glsl`, `shaders/water/oceanWaves.glsl` (chunk, Seascape) and `shaders/water/seaLookOverride.glsl` (the lakes' own look), `WaterSettings` in `planet/planetControls.ts`, the water rows and Color section of `ui/Panel.tsx` |
| Change the planet's height statistics (ramp range, % land) | `updateElevationRange` in `scene/SceneCanvas.tsx`, `getRegionHistogramAsync` in `map/heightmap.ts`, `percentileRangeFromBins` in `map/elevationRange.ts`, `planet/seaLevel.ts` |
| Change the color ramp | `planet/colorRamp.ts`, `ui/panels/ColorRampEditor.tsx`, `terrainRampColor` in `shaders/terrain/terrain.glsl` |
| Change Randomize colors (one roll for land, water, rock and sky) | `randomizeColors`, `randomTerrainPalette`, `randomWaterPalette`, `randomRockPalette` in `planet/planetControls.ts`, `randomAtmosphereColors` in `atmosphere/atmosphereSettings.ts` |
| Change rock on steep ground | `RockSettings` in `planet/planetControls.ts`, `createRockUniforms` and `applyRockUniforms` in `planet/planetPatchMesh.ts`, `landSurfaceColor` in `shaders/terrain/landLayers.glsl`, `uRockSlope` in `planetPatch.frag.glsl` and `chunk.frag.glsl` |
| Change the color grade | `scene/colorGrade.ts` (`ColorGrade`, `prepareLiftGammaGain`, `SAMPLES`), `shaders/post/colorGrade.frag.glsl`, `scene/sharedViewportRenderer.ts`, `randomColorGrade` in `planet/planetControls.ts` |
| Change the chunk's toon shading | `toonShadeMask` and `shadeColor` in `shaders/terrain/landLayers.glsl`, `shadeColorFor` and `shadeHueTrackGradient` (the Shadow hue preview) in `scene/fillLight.ts`, the shade block in `chunk.frag.glsl`, `shade*` in `atmosphere/atmosphereSettings.ts`, `uShade*` in `voxel/LandChunkCanvas.tsx` |
| Change templates or the project list | `handleCreateTemplate`, `handleEditTemplate`, `handleNewFromTemplate`, `handleRenameById`, `editingTemplate` in `projectSettings/saveProject.ts`; `template` in `firebase/storage.ts`; Project Settings in `ui/Panel.tsx` |
| Change settings undo (Cmd+Z) | `useSettingsHistory` in `projectSettings/settingsHistory.ts` |
| Add a saved planet setting | `planet/planetControls.ts` (`PlanetSettings`, `applySettings`), `projectSettings/saveProject.ts` |
| Add a design-system component | `ui/UIElements.tsx` (incl. `LinkMenu`), `design.css`, `ui/icons.tsx` |
| Add a panel control | `ui/Panel.tsx` (left) or `ui/NoisePanel.tsx` (right), then `App.tsx` for wiring |
| Change erosion | `erosion/erosionEngine.ts`, `shaders/erosion/`, `ui/panels/ErosionPanel.tsx` |
| Change the land chunk | `voxel/landChunk.ts`, `voxel/LandChunkCanvas.tsx`, `voxel/ChunkPatchRenderer.ts`, `shaders/chunk.vert.glsl`, `shaders/terrain/chunk.frag.glsl` |
| Change which patches the chunk shows | `voxel/chunkPatches.ts` (`selectChunkPatches`), `voxel/ChunkPatchRenderer.ts`, `voxel/chunkPatchMesh.ts` |
| Change walk mode (person view): keys, speed, look, long-press to walk, fly-in | `scene/walkMode.ts` (`WalkMode`), its wiring in the setup effect of `voxel/LandChunkCanvas.tsx` (`enterWalk`), the person button and Speed slider in `scene/Gumball.tsx` (`toggleWalkMode`, `isWalking`, `setWalkSpeed`) |
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
- Key names: `NoiseLayer`, `NOISE_TYPE_OPTIONS`, `FRACTAL_TYPE_OPTIONS`, `VORONOI_DISTANCE_OPTIONS`, `BLEND_MODE_OPTIONS`, `hasMask`, `quantileOf`, `createDefaultLayer`, `migrateLegacyLayers`, `HeightmapPipeline` (`beginStroke`, `endStroke`, `replayLayerHistory`, `bakeRegionToTarget`, `getRegionElevationData`, `setDetailAmount`, `setPlanetRadiusMeters`, `getChunkBaseTexture` (the 4096 map for the chunk's water and shadows), the globe size option in the constructor, `bakeRegionInto`, `ensureChunkBase`: the land chunk's own 4096 height map, `chunkPatchMaterial`: the bake compiled as `CHUNK_PATCH_PASS` to resample it, `maskSortedValues`, `resolveMaskBand`), `RegionParams` (`localOrigin`, `fromChunkBase`), `CHUNK_BASE_SAMPLES`, `syncLayerUniforms`.
- Talks to: `shaders/heightmap/heightmap.frag.glsl`, `SceneCanvas`, the patch renderer. `setPlanetWaterMap` takes the water map (R carving, G drainage, B ground, A lake level; rows south first) with the river grid's rows after it (`uWaterMapSize`, `uWaterTextureRows`, `uRiverGridSize`); `setErosionFilter` takes Strength and the filter's shape (`ErosionFilterShape`); `setTerrainTop` feeds the filter's fade.

**map/noiseRanges.ts**
- What it is: one table of every noise control's range and scale, plus Randomize's narrower range (`random`).
- Key names: `NOISE_RANGES`, `randomForRange` (an optional position along the range, for the drivers), `sliderRange`.
- Talks to: `NoisePanel`, `noiseLayers` (Randomize), `MaskControls`.

**map/noiseLayers.ts**
- What it is: the layer list hook, and terrain Randomize: a world type first, then layers by role, masked by the continents' noise.
- Key names: `useNoiseLayers`, `addLayer`, `deleteLayer`, `reorderLayer`, `renameLayer`, `updateSelectedLayer`, `updateLayers`, `toggleLayerVisible`, `randomizeTerrain`, `WORLD_TYPES`, `TERRAIN_ROLES`, `ROLE_NAMES`, `HEIGHT_SUM_CAP`, `TERRACE_STEPS`, `PLATEAU_SHARE`, `MOUNTAIN_SHARE`, `landMask`, `HEIGHT_REFERENCE_FREQUENCY`.
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
- Key names: `buildPatchGeometry`, `createPatchMaterial`, `applySharedUniforms` (on a change), `applyFrameUniforms` (every frame, the eye only), `buildPatchRampArrays`, `PlanetSharedUniforms` (incl. `terrainBottom`, `terrainTop`: the true height range, beside the ramp's clipped `elevationMin`/`elevationMax`), `createRockUniforms`, `applyRockUniforms` (the rock ramp and slope, shared with the chunk).

**planet/planetControls.ts**
- What it is: the planet's settings state and their migrations.
- Key names: `PlanetSettings` (incl. `maxErrorPixels`, `detailAmount`, `autoDetail`, `water`, `atmosphere`), `WaterSettings` (incl. `shine`, `reflection`), `DEFAULT_WATER_SETTINGS`, `updateAtmosphere`, `WATER_SKY_COLOR`, `WATER_SHININESS`, `migrateWater`, `shoreSeaLevel` (debounced), `effectiveMaxErrorPixels`, `DEFAULT_PLANET_SETTINGS`, `usePlanetControls`, `applySettings`, `currentSettings`, `migrateColorStops`; `RockSettings` (`enabled`, `stops`, `slope`, `softness`), `DEFAULT_ROCK_SETTINGS`; `colorGrade`, `updateColorGrade`, `randomColorGrade`, `randomRockPalette` (from the land ramp, `ROCK_SATURATION_SHARE`, `ROCK_LIGHTNESS_SHARE`); `randomizeColors` (one roll sets land, sea, lakes, rock, sky and the grade from the land's hue: `randomTerrainPalette`, `randomWaterPalette`, `randomRockPalette`).

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

## 🏞️ Water and erosion (`rivers/`, `erosion/`)

*The planet's water from erosion: pit fill, stream power on the GPU, lakes by climate, the erosion filter, and the map that carries them into the bake. River drawing is off (`DRAW_RIVERS`).*

**rivers/drainageControls.ts**
- What it is: `useDrainage`, which reruns everything on a terrain or sea level change, only the erosion passes on Duration or Strength, and only the lakes on a climate change; returns the progress bar's state and a revision for the land chunk.
- Key names: `useDrainage`, `WaterProgress`, `terrainKey`, `handleResult`, `changeErosion`, `carving`.

**rivers/planetDrainage.ts**
- What it is: Schott's stream power pass in batches per frame: drainage first with erosion off, saved, then erosion on top, continued or restarted from the save.
- Key names: `PlanetDrainage` (`run`, `setErosionPasses`, `runPasses`, `readResult`), `DrainageResult`, `HILLSLOPE_SHARE`, `SCHOTT_K`. `run` takes the settled drainage from the worker and seeds it (`streamPowerSeed.frag.glsl`).

**rivers/drainage.worker.ts**
- What it is: the CPU half off the main thread: the pit fill, lakes by Fill-Spill-Merge on the eroded ground, the river network and its grid, the checks, the valley spacing, and the bake's water map (rows south first, river grid rows after). [TEMP] logs lakes, rivers, carving and valley spacing.
- Key names: `buildWaterMap`, `extractRiverNodes`, `gridNeighbors`, `valleySpacingMeters`, `accumulateDrainage` (the settled drainage in one sweep, sent with `'filled'`), `RIVER_MIN_CELLS`, `RIVER_HALF_WIDTH_AT_THRESHOLD`.

**rivers/pitFill.ts**
- What it is: Priority-Flood + ε on the globe grid, and the heap it and the lakes share.
- Key names: `fillPits`, `NodeHeap`, `FILL_EPSILON`.

**rivers/depressions.ts**
- What it is: the depression hierarchy and Fill-Spill-Merge (Barnes 2020, 2021) on any node graph.
- Key names: `buildDepressionHierarchy`, `fillSpillMerge`, `DepressionHierarchy`, `LakeResult`, `MIN_DEPRESSION_CELLS`.

**rivers/chunkLakes.worker.ts**
- What it is: the land chunk's lakes, solved off the main thread on the chunk's own ground, with the square's cut sides as outlets; returns each cell's level and the lake's share of the tide.
- Key names: `ChunkLakesRequest`, `squareNeighbors`, `spillHeights` (Priority-Flood from the sea: how high water stands before it drains), `floodPlanetLakes` (the planet's lakes at their level over the chunk's ground, capped at the spill height), `lakeAreas`, `NO_CHUNK_LAKE`, `LAKE_TIDE_BOOST`, `selectiveBreach` (Lindsay's selective breaching: shallow pits on slopes drain, deep ones stay as lakes; `BREACH_MAX_DEPTH_METERS`, `BREACH_MAX_LENGTH_CELLS`).

**rivers/riverGrid.ts**
- What it is: river spans as Catmull-Rom curves filed into lat-long buckets for the bake. Built but not drawn.
- Key names: `buildRiverGrid`, `RiverNodes`, `RIVER_GRID_WIDTH`, `RIVER_GRID_HEIGHT`, `RIVER_BLEND_WIDTH`, `RIVER_CURVE_STEPS`.

**rivers/riverClimate.ts**
- What it is: the water budget from Rainfall, Temperature and Liquid, and each liquid's ranges.
- Key names: `LIQUIDS`, `liquidNamed`, `waterBudget` (`lakeShare`, `flowScale`), `referenceTemperature`, `rainfallMax`, `flowingMinC`.

**erosion/erosionControls.ts**
- What it is: the shared Erosion settings (switch, Duration, Strength, the filter's Shape) for the planet and the land chunk, and the chunk's automatic run.
- Key names: `useErosion` (`enabled`, `strength`, `filterShape`, `updateFilterShape`, `filterRevision`), `useErosionAutoRun`, `engineRainfall`, `planetErosionPasses`.

**shaders/erosion/streamPowerPlanet.frag.glsl**, **streamPowerSeed.frag.glsl**
- What it is: one stream power pass (Schott's, wrapped east to west, the ocean as outlet, hillslope as a share per pass) and its seed from the filled heights.
- Key names: `hillslope`, `flowCoeff`, `flowSteepest`, `uDiffusion`, `uK`.

**shaders/heightmap/erosionFilter3d.glsl**
- What it is: Rune Skovbo Johansen's erosion filter in 3D with Estqes's Phacelle noise (MPL).
- Key names: `erosionFilter3d`, `erosionPhacelle`, `erosionHash33`.

## ☁️ Atmosphere (`atmosphere/`)

*The sky, haze, glow, clouds, wind, moons and tides, saved with the planet.*

**atmosphere/atmosphereSettings.ts**
- What it is: the settings and their defaults, the locks, and the Atmosphere's Randomize; older saves take their wind from the water and their shared Crescent, Texture, Halo, Inner glow and "Lock colors" into each moon.
- Key names: `AtmosphereSettings` (incl. `shadowHue`, `clouds`, `cloudColor2`, `moonCount`, `moons`, `lockedColors`, `rainfall`, `temperature`, `liquid`), `randomClimate`, `AtmosphereColorKey`, `colorLockProps`, `randomAtmosphere` (the drivers `storm`, `air`, `climate`; `follow`, `MILD_DRIVER`, `EXTREME_DRIVER`, `EXTREME_CHANCE`, `JITTER`), `DEFAULT_ATMOSPHERE_SETTINGS`, `migrateAtmosphere`, `migrateMoons` (old single-moon saves become moon 1), `randomAtmosphereColors` (Randomize colors: sky, horizon, clouds and shadow from the land's hue by a color rule).

**atmosphere/moonTexture.ts**
- What it is: the moons: their settings, simple noise layers, Randomize (sizes, places in view, colors from the sky, textures), the colors built from the sky and a harmony rule, and the five defaults.
- Key names: `MoonSettings` (incl. `hueTurn`, `secondOffset`, `saturation`, `blend`, `crescent`, `crescentAngle`, `texture`, `halo`, `glow`, `colorLocked`), `MAX_MOONS`, `randomMoons`, `randomMoonLayers`, `moonColorsForSky`, `skySaturation`, `skyHsl`, `hueTurnFor` (old saves), `moonHueTrackGradient`, `HARMONY_RULES`, `harmonyFor`, `MOON_LIGHTNESS`, `MOON_MIN_SATURATION`, `SECOND_COLOR_DARKER`, `randomHueTurns`, `COLOR_RULES`, `randomSizes`, `describeMoonLayers`, `DEFAULT_MOONS`.

**atmosphere/airGround.ts**, **planetAir.ts**
- What it is: the air's ground, the planet's visible surface averaged by direction into a small cube map, re-baked 150 ms after terrain or sea changes, with the planet's jaggedness; and the haze settings shared by the sky shell and every surface patch.
- Key names: `AirGround` (`jaggedness`), `createAirGround`, `bakeAirGround`, `cubeMapDirection`, `cubeMapTexel`, `AIR_GROUND_SMOOTHING`; `planetAirUniforms`; in `scene/SceneCanvas.tsx`, `airGroundRef` and `jaggedGap`; `GAP_PER_JAGGEDNESS` in `cloudLayer.ts`.

**atmosphere/tides.ts**
- What it is: how far the chunk's water rises and falls: the moons' size cubed, summed, times the radius over the default planet's, divided by viscosity, capped.
- Key names: `tideHeight`, `TIDE_PERIOD_SECONDS`, `TIDE_MAX_SHARE`.

**atmosphere/skyDome.ts**, **planetGlow.ts**, **planetHaze.ts**, **cloudLayer.ts**
- What it is: the chunk's sky, the planet's rim glow, surface haze and cloud shell.
- Key names: `createSkyDome`, `updateSkyDome`, `updateSkyDomeFrame`, `setSkyDomeLight` (the Scene light for the moons), `setSkyDomeMoonTexture`, `getSkyView` (where the camera last looked, for Randomize), `CLOUD_DRIFT`; `createPlanetGlow`, `updatePlanetGlow`, `updatePlanetGlowFrame`, `glowOuterRadius` (for the camera's far limit), `GLOW_MIN_WIDTH`, `GLOW_WIDTH_PER_UNIT`, `GLOW_SHELL_WIDTHS`; `GLOW_GAP`; `createPlanetHaze` (the sky-only shell, its far side), `updatePlanetHaze` (writes `planetAirUniforms`; rays stop at the lowest visible surface, `hazeGround` in `scene/SceneCanvas.tsx`), `HAZE_SCALE_HEIGHT`, `HAZE_DENSITY_PER_UNIT`; `createCloudLayer`, `updateCloudLayer`, `updateCloudLayerFrame`, `CLOUD_TIME_PER_WIND`.

**ui/panels/AtmospherePanel.tsx**
- What it is: the right panel's Clouds (with Wind) and Moons, shown when Atmosphere is selected, each with a header switch. One moon's controls show inline; two or more get a nested section each, added and removed like layers.
- Key names: `AtmospherePanel`, `moonControls`, `moonTextureButton`, `addMoon`, `removeMoon`, `randomizeMoons`, `updateMoon`.

---

## 🎬 Scene (`scene/`)

*The planet view, the shared renderer and the lighting state.*

**scene/SceneCanvas.tsx**
- What it is: the planet view and its imperative handle.
- Key names: `SceneCanvas`, `SceneCanvasHandle` (incl. `bakePatchInto`, which first calls `ensureChunkBase`), `chunkCenter`, `updateElevationRange`, `replayAndRecomposite`, `buildWireframeOverlay`.
- Talks to: `heightmap.ts`, `PlanetPatchRenderer`, `sharedViewportRenderer`.

**scene/sharedViewportRenderer.ts**
- What it is: the one WebGL renderer both panes share.
- Key names: `useSharedViewportRenderer`, `registerView`.

**scene/sceneControls.ts**
- What it is: lighting and grid state, including whether the light follows the camera (on by default). Not saved with projects.
- Key names: `useSceneControls`, `lightFollowsCamera`.

**scene/fillLight.ts**
- What it is: the sky fill's color: the sky's top color turned by Shadow hue, scaled to white's luminance; white with no atmosphere. Also the Shadow hue slider's track and swatch colors.
- Key names: `fillColorFor`, `displayColorFor`, `hueTrackGradient`.

**scene/Gumball.tsx**, **scene/sharedGumball.ts**
- What it is: the navigation widget, and its shared control of one or two cameras. A target with a `surface` zooms by log height above the ground.
- Key names: `Gumball`, `GumballTarget` (`surface`, `setWalkSpeed`, `setEyeHeight`), the Zoom row turning into Eye height while walking (`eyeHeightAt`, `EYE_HEIGHT_MAX_METERS`), the walk Speed row (`walkSpeedRow`, `handleWalkSpeedInput`, shown only while walking), `levelToDistance`, `distanceToLevel`, `zoomAnchors`, `useSharedGumball`.

**scene/camera.ts**, **controls.ts**
- What it is: the camera and its orbit controls. Every frame the planet view scales rotate, pan and zoom speed, and the near and far planes, by height above the surface; the far plane always contains the glow (`[B75]`). Space + drag pans, as does Shift + drag.
- Key names: `camera`, `defaultCameraPosition`, `DEFAULT_CAMERA_DISTANCE`, `MIN_CAMERA_ALTITUDE`, `DEFAULT_NEAR`, `DEFAULT_FAR`, `controls`, `holdSpaceToPan`, `applyAltitudeRates` (`outerRadius`), `keepAboveFlatGround` (the chunk). The gumball's zoom slider and Reset View call the target's `pivotToGround` first (`scene/Gumball.tsx`).

**scene/planetSpin.ts**
- What it is: the planet turning on its own: the planet's group leans onto the axis and turns about it, a press pauses it, and it eases back in.
- Key names: `SpinSettings`, `DEFAULT_SPIN`, `randomSpin`, `spinAxis`, `createPlanetSpin`, `SPIN_EASE_SECONDS`; in `scene/SceneCanvas.tsx`, `planetGroup`, `planetGroupRef`, `patchCameraLocal`; `uPlanetFrame` in `planetAirUniforms`, `airGroundLiftWorld`.

**app/scripts/checkShaders.mjs**
- What it is: compiles every material with glslangValidator, using three.js's own header. Run after any shader edit; new shader pieces go in its `MATERIALS` list.

**scene/grid.ts**, **renderer.ts**, **scene.ts**
- What it is: small Three.js setup modules.

---

## 🧊 Land chunk (`voxel/`)

*The flat detail view and its meshing.*

**voxel/landChunk.ts**
- What it is: chunk state, picking and the view mode. In smooth style its main effect bakes one whole-chunk texture for shadows, a CPU copy of the heights for the camera, and bumps `bakeVersion` so the patches re-bake. Voxel style (being dropped) still builds one mesh.
- Key names: `useLandChunk`, `startResize`, `CHUNK_SHADOW_SAMPLES`, `GROUND_SAMPLES`, `bakeVersion`, `groundHeights`.

**voxel/areaSelect.ts**
- What it is: selection mode: dragging a square on the planet, Esc, and the Size (km) slider's area.
- Key names: `useAreaSelect`, `squareFromDrag`, `squareAroundCenter`, `squareSizeKm`, `frameVersion`.
- Talks to: `SceneCanvasHandle.pickPointAt` and `setAreaOutline`, `scene/areaOutline.ts`, `voxel/landChunk.ts`.

**scene/areaOutline.ts**
- What it is: the chosen area's outline on the planet, a 3 px three.js `Line2`.
- Key names: `AreaOutline`.

**voxel/chunkPatches.ts**
- What it is: which patches the chunk shows, the planet's screen-space-error rule over one flat square.
- Key names: `selectChunkPatches`, `morphRange` (a patch's blend into its coarser level, CDLOD's last 30%), `chunkSelectionThreshold`, `chunkFrame`, `patchGroundRange`, `ChunkDetail`, `rootFractions`, `chunkPatchWorldSize`, `chunkPatchBox`, `chunkPatchPixelWidth`, `chunkPatchInView`, `CHUNK_MAX_EXTRA_DEPTH`.

**voxel/chunkLodRanges.ts** (unused)
- What it is: the chunk's detail ranges from one view distance set by the haze, as CDLOD does (Strugar 2009). Nothing calls it yet; kept for `[B166]` or to delete.
- Key names: `hazeViewDistance`, `lodRanges`, `morphRanges`, `minRangeDistance`, `levelHeightSpans`, `rangesTooSmall`, `HAZE_CLOSED_SHARE`, `LOD_DISTANCE_RATIO`, `MORPH_START_RATIO`.

**voxel/ChunkPatchRenderer.ts**
- What it is: bakes, builds and swaps the chunk's patches; each patch material shares the chunk material's uniforms.
- Key names: `ChunkPatchRenderer` (`configure`, `update`, `rebakeAll`, `clear`, `fitBounds`, `sampleHeight`: the drawn ground height from the deepest shown patch, blended as `chunk.vert.glsl` draws it, from a CPU copy read once without stalling (`requestHeights`), `settled`: every wanted patch built and shown; per-patch `uMorphStart`/`uMorphEnd`, `uEdgeFiner` from `edgeFinerVector`; `finerEdgeFade` mirrors the shader's), `EDGE_FADE_CELLS`, `BakeChunkPatch` (patch, target, root).
- Talks to: `bakePatchInto` on `SceneCanvasHandle`, `chunkPatchMesh.ts`.

**voxel/chunkPatchMesh.ts**
- What it is: a flat patch from the planet's stitched grid (`buildPatchGeometry`), with walls on the chunk's border, and the chunk's base.
- Key names: `buildFlatPatchGeometry`, `buildChunkBaseGeometry`, `chunkBaseDepth`.

**scene/walkMode.ts**
- What it is: the chunk's person view. Drag to look, long-press to walk forward (`HOLD_TO_WALK_MS`; dragging then steers), WASD or arrows to move, arrows turn, R/F look up and down, Shift runs, `[` `]` or the wheel scale speed (default 10x), Esc leaves. A 1.5 s fly-in eases the camera from the orbit view.
- Key names: `WalkMode` (`enter`, `exit`, `update`, `progress`, `travelScale`, `speedMultiplier`, `holding`), `EYE_HEIGHT_METERS`, `WALK_SPEED_MPS`, `RUN_MULTIPLIER`, `HOLD_TO_WALK_MS`, `eyeHeightMeters` (set by the Eye height slider), `GROUND_PROBE_METERS`, `placeEye` (eases both ways, never closer than `MIN_CLEARANCE_METERS` to the floor), `settleEye` (run after the patch swap), `teleport` (the walk map's glide, `JUMP_ARC_SHARE`), `flyIn`; water rules `getWaterHeight` (the sea or a lake at a point), `nearestShore`, `nearestCoarseAbove`, `SHORE_INLAND_METERS`, `SHORE_VERIFY_ATTEMPTS` (walking stops at the shore, entering over water starts on the nearest shore, the eye never goes under the sea).
- Talks to: `LandChunkCanvas.tsx` (saves and restores the orbit camera, eases fov/near/far with `progress`), `ChunkPatchRenderer.sampleHeight` for the eye height.

**voxel/chunkWater.ts**
- What it is: the chunk's water, TDM's Seascape on a sheet that stands flat at the sea and at each lake's level, recolored by the water ramp, see-through in the shallows, with shore and crest foam, and side walls down to the chunk's base.
- Key names: `ChunkWater` (`walls`, `baseDepth`), `WATER_SHEET_SEGMENTS`, `WALL_TOP_SHARE`, the walls' cross-section (`WALL_GROUND_OVERLAP` in `chunkWaterWall.frag.glsl`, drawn behind the land wall by polygon offset), lake ripples (`RIPPLE_TILE_SHARE`, `uRippleTile`, `RIPPLE_STRENGTH`, `uLakeRippleStrength` and `lakeRipple` in `chunkWater.frag.glsl`), `applyTide` (`uLakeEbb`), `createChunkWater`, `updateChunkWater`, `updateChunkWaterFrame` (also moves the tide), `setChunkWaterLight`, `setChunkWaterTide`, `setChunkWaterSky` (the haze and its layers on the water), `chunkWaterLevel`; the lakes' own controls (`uLakeRampColors`, `uLakeShine`, `uLakeWaveScale`, `uLakeRippleStrength` and the rest of `uLake*`).

**voxel/chunkLakes.ts**
- What it is: keeps the chunk's lake levels fresh: reads the preview map without stalling a frame, keeps only the latest request, and holds the result as a texture (R the level, G the tide share), read by the sheet and both walls.
- Key names: `ChunkLakes` (`update`, `texture` RGBA: level, tide share, spill height, unused; `levelAt`, `drawnLevelAt` the sheet's own reach, `seaReaches`, `ground` the preview map's heights for detail selection and the cameras), `uChunkLakeLevels`; `getChunkPreview` in `map/heightmap.ts`.

**voxel/chunkMap.ts**
- What it is: the walk map, the chunk drawn from above with the scene's own materials into a 256-pixel image every 2 s while walking; the gumball shows it with the walker's dot and turns a click into a `teleport`.
- Key names: `createChunkMap` (clears its target first: the shared renderer has `autoClear` off), `WALK_MAP_REDRAW_MS` in `LandChunkCanvas.tsx`, `walkMap`/`teleport` on `GumballTarget`, `drawWalkMap` and `handleMapClick` in `scene/Gumball.tsx`.

**voxel/chunkGround.ts**
- What it is: ground height anywhere on the chunk, for camera picking and collision.
- Key names: `ChunkGround`, `groundHeightAt` (rows run opposite to z, `[B63]`), `raycastGround`.

**voxel/LandChunkCanvas.tsx**
- What it is: the chunk view, its chunk material (shared by the voxel mesh and every patch), map-style orbit (`zoomToCursor`, pivot on the ground under the cursor) and the patch renderer.
- Key names: `LandChunkCanvas`, `LandChunkCanvasHandle`, `pivotAtScreenPoint` (screen point to ground pivot), `waterHeightAt` (the sea or a lake at a point, the floor for both cameras), `pivotOnGround` (mouse handler), `currentGround`; one `HeightmapPipeline` per moon (`moonPipelinesRef`, `MOON_TEXTURE_WIDTH`).

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
- Key names: `Slider` (log and reversed scales, `trackBackground`, `swatchColor`: a color bar on its own row), `HueSlider`, `DualHueSlider` (two hues on one bar, the second saved as a distance), `Dial` (round angle control), `Toggle`, `Switch`, `SectionTitle` (a title line with an optional switch), `Select`, `ColorPicker` (optional lock), `LockButton`, `EditableText`, `Accordion` (`actions`, `headerSwitch`), `IconButton`, `Popup`, `placeTooltip`, `BusyIndicator` (background work running).

**ui/icons.tsx**
- What it is: flat line-art icons.
- Key names: `DiceIcon`, `PaletteIcon`, `EyeIcon`, `MaskIcon`, `UndoIcon`, `RedoIcon`, `ResetIcon`, `CloseIcon`, `LockIcon`.

**ui/Panel.tsx**
- What it is: the left panel (Project, Edit, Scene, Planet Terrain, stages).
- Key names: `Panel`, `PipelineStageRow`.

**ui/RightPanel.tsx**, **ui/NoisePanel.tsx**
- What it is: the right panel for the active stage, and the Terrain stage's layer controls (its Terrain section holds Height and Roughness; each modifier is a nested section with its switch in the header).
- Key names: `RightPanel`, `NoisePanel`, `MODIFIERS`, `ModifierSection`.

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
- Key names: `evalLayerNoise`, `evalBaseGenerator`, `fbm3D`, `fractalNoise3D`, `ridgedFbm3D`, `octaveFade`, `domainWarpedPosition`, `applyBlendMode`, `planetDetail`, `DETAIL_BASE_FREQUENCY`, `shoreFade`, `NYQUIST_FADE_MIN`/`MAX`; chunk-local fine octaves: `useLocalDetail`, `LOCAL_DETAIL_SCALE`, `gLocalDelta`; the chunk patch pass (`CHUNK_PATCH_PASS`): `chunkBaseElevation`, `bsplineWeights`; in `noise.glsl`: `hash1`, `perlinNoise3D`, `simplexNoise3D`, `voronoiNoise3D`, `voronoiMetric`, `ridge`, `terrace`.

**terrain/** (`terrain.glsl`, `landLayers.glsl`, `planetPatch.frag.glsl`, `chunk.frag.glsl`, `chunk.vert.glsl`, `vertex.glsl`, `fragment.glsl`)
- What it is: the land surfaces (planet patches, chunk, old globe) and the pieces they share. Lighting is in world space; `heightfieldNormal` always faces outward (`faceforward`).
- Key names: in `chunk.vert.glsl`: `drawnElevation`, `coarserSurface`, `finerEdgeFade`, `EDGE_FADE_CELLS`, stitch points averaged onto their edge line (`[B171]`); `fillLight` (`landLayers.glsl`, the sky fill both land shaders use in place of a flat ambient), `terrainRampColor`, `borderedTextureUv`, `texelStepUv`, `heightfieldNormal`, `softDiffuse`, `heightmapShadow`, `landSurfaceColor` (`landLayers.glsl`, rock on steep ground: `uRockColors`, `uRockSlope`, `uRockSoftness`; off sets the slope past 2), `toonShadeMask` and `shadeColor` (`landLayers.glsl`, Unity Toon Shader's mask; the shade is the ground's hue turned by `uShadeHueTurn`, with Unity's `rgbToHsv`/`hsvToRgb`; `uShadeStep` 0 is off); the chunk's haze `uHazeColor`, `uHazeDensity`, `uHazeStart`; the planet ocean block in `planetPatch.frag.glsl` (triplanar waves, `wavesVisible`, `dayLight`).

**water/oceanWaves.glsl** (CC BY-NC-SA 3.0, TDM's Seascape, with additions)
- What it is: the sea for both views: Seascape's waves and color, plus the project's additions.
- Key names: Seascape's `sea_octave`, `sea_octaves` (band-limited, `gSeaFootprint`, `SEA_WARP`), `sea_height` (currents, `seaBend`), `getNormal`, `seaColor` (Shine, Reflection, Cox and Munk glint far away); additions `seaFetchScale`, `gSeaAmplitude`, `seaWindScale`, `seaWhitecaps`, `seaStormStrength`, `foamStreaks`, `seaWhiteSea`, `seaFarFoam`, `halftoneMask`, `foamPatchiness`, `crestFoam`, `seaGlint`, `SEA_SPARKLE_EXPONENT`, `seaSlopeVariance`, `surfWave` (`uSurfZone`), `worldGradient`, `waterVariance` (Gerstner waves, pinch foam), the triplanar helpers `triplanarWeights`, `seaHeightTriplanar`, `seaNormalTriplanar`, `crestFoamTriplanar`.

**water/water.glsl**, **water/chunkWater.vert.glsl**, **water/chunkWater.frag.glsl**, **water/chunkWaterWall.vert.glsl**, **water/chunkWaterWall.frag.glsl**
- What it is: the water look both views share, and the chunk's water sheet (Seascape plus variance, surf, foam, depth transparency and haze).
- Key names: `seaLookOverride.glsl` (`SEA_LOOK_OVERRIDE` swaps Seascape's fixed look for per-pixel values, so the sea and lakes each use their own), `WATER_F0`, `waterFresnel`, `waterTransmittance`, `waterRampPosition`, `waterFilter`, `waterFoam` (`SHORE_FOAM_SOFTNESS`, `SHORE_FOAM_EDGE_CUTOFF`), `FOAM_COLOR`, `FOAM_OPACITY`.

**atmosphere/** (`skyDome`, `planetGlow`, `planetHaze`, `clouds`, `haze.glsl`, `airGround.glsl`, `planetAir.glsl`)
- What it is: the chunk's sky dome, the planet's rim glow and surface haze, the planet's cloud shell, and the chunk haze shared by ground and water.
- Key names: sky dome `topColor`, `bottomColor`, `uGlow`, sun halo, `skyFbm`, `drawMoon` (screen blend, split toning, crescent, one rounded glow across the edge), `airmass`, `MOON_EXTINCTION`, `MOON_HORIZON_FADE`, `MOON_EDGE_SOFTNESS`, `uMoonBlends`; `airGroundLift`; `planetHaze` (the haze along a ray, used by surfaces and the shell), `hazeSphereHits`; clouds `uCloudLayer`, `CLOUD_SHELL_CORE`, `CLOUD_SHELL_OPACITY`; `moonSurface`, `blendScreen`, `MOON_HALO_*`, `MOON_GLOW_*`; glow `uWidth`, `uStrength`, edge-distance fade; haze `hazeSphereHits`, `uHazeScaleHeight`, `HAZE_STEPS`; clouds `cloudShape` (Swirl, Feather erosion), `cloudFbm`, `cloudTone`, `toneBands`, `bandSpeed`, `GLOBAL_DRIFT`, `BAND_SWING`, Beer and powder lighting; `haze.glsl` `applyHaze` (`uHazeLayers`: 0 a smooth fade, 2 or more soft bands; Quilez height fog from `uHazeFloor`, the sea's height, thinning over `uHazeScaleHeight`, set from `HAZE_SCALE_SHARE` in `voxel/LandChunkCanvas.tsx`; sun and sky hues), `interleavedGradientNoise`, `HAZE_GRAIN`.

**post/colorGrade.frag.glsl**
- What it is: the color grade, in Unity's order: decode screen color, split toning (`softLight`), lift, gamma, gain, saturation, encode.

**erosion/**, **scene/** (the grid)
- What it is: the erosion passes and the ground grid.

---

## 💾 Persistence

*Saving and loading projects.*

**projectSettings/saveProject.ts**
- What it is: autosave, load, new and reset.
- Key names: `useSaveProject` (the autosave's trigger list includes the atmosphere, rock, spin and grade, `[B70]`; skipped while `editingTemplate`), `openSaved`, templates (`handleCreateTemplate`, `handleEditTemplate`, `handleNewFromTemplate`), `handleRenameById`, `createFreshProject`, `handleReset`.

**scene/colorGrade.ts**
- What it is: the per-planet color grade, a post pass over the shared canvas: a 2-sample multisampled half-float image with a float depth texture (reversed depth), an `EffectComposer` and one `ShaderPass` (no `OutputPass`: the scene's shaders already write screen color).
- Key names: `ColorGrade` (`begin`, `drawView`, `finish`, `update`, `setSize`), `ColorGradeSettings` (`enabled`, `lift`, `gamma`, `gain`, `saturation`, `split`), `DEFAULT_COLOR_GRADE` (neutral), `migrateColorGrade`, `prepareLiftGammaGain` (Unity's), `splitTint`, `splitSwatch`, `splitHueTrackGradient`, `SAMPLES`.
- Talks to: `scene/sharedViewportRenderer.ts` (`setColorGrade`), `shaders/post/colorGrade.frag.glsl`.

**projectSettings/settingsHistory.ts**
- What it is: one undo timeline for settings and paint strokes in the order made, as editors keep one; a settings change is recorded once it settles. A load or a new planet starts a fresh history.
- Key names: `useSettingsHistory`, `SETTLE_MS`, `Snapshot`, `Step`.

**firebase/storage.ts**, **client.ts**, **currentUser.ts**
- What it is: Firestore access and the anonymous user. `client.ts` reads its config from the `VITE_FIREBASE_*` env vars (`app/.env.local`), with a placeholder key when they're missing so the app still loads.
- Key names: `saveProject`, `loadProject`, `listProjects`, `useCurrentUser`.

import { useState } from 'react';
import { SceneCanvas } from './scene/SceneCanvas';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import type { NoiseType } from './map/heightmap';

// TODO(DS): arbitrary placeholder conversion — the UI shows/accepts a
// narrative-scale planet radius in km (the tool's premise, per Dana), mapped
// down to the small render-space units the scene actually uses. 1 scene
// unit = 300 km is a made-up round number chosen to land near the previous
// hardcoded default (~20 scene units) at an Earth-ish 6000km — not derived
// from anything. Revisit once there's a real scene-scale convention.
const KM_PER_SCENE_UNIT = 300;

function App() {
  const [radiusKm, setRadiusKm] = useState(6000);
  const [baseColor, setBaseColor] = useState('#3a7bd5'); // TODO(DS): still the original arbitrary placeholder color
  const [ambientLight, setAmbientLight] = useState(0.15);
  const [lightDirX, setLightDirX] = useState(1);
  const [lightDirY, setLightDirY] = useState(1);
  const [displayMode, setDisplayMode] = useState('shaded'); // 'shaded' | 'wireframe'
  const [gridSpacing, setGridSpacing] = useState(10);
  const [gridVisible, setGridVisible] = useState(true);
  const [noiseEnabled, setNoiseEnabled] = useState(true);
  const [noiseSeed, setNoiseSeed] = useState(0);
  const [noiseFrequency, setNoiseFrequency] = useState(4);
  const [noiseType, setNoiseType] = useState<NoiseType>('perlin'); // matches the shader's default uNoiseType
  // Standard fBm defaults — matches the shader's own defaults, see heightmap.ts.
  const [noiseOctaves, setNoiseOctaves] = useState(4);
  const [noisePersistence, setNoisePersistence] = useState(0.5);
  const [noiseLacunarity, setNoiseLacunarity] = useState(2.0);
  const [noiseTerraceSteps, setNoiseTerraceSteps] = useState(8); // TODO(DS): arbitrary placeholder step count

  // The planet only ever sees 'none' when the master toggle is off — the
  // user's actual selection in noiseType is preserved so switching back on
  // restores it. The right-side NoisePanel's own dropdown/2D preview still
  // use the real noiseType regardless, so you can keep tuning it while
  // disabled (matches a node-bypass convention, not a per-layer one).
  const appliedNoiseType: NoiseType = noiseEnabled ? noiseType : 'none';

  return (
    <div className="app-layout">
      <Panel
        ambientLight={ambientLight}
        onAmbientLightChange={setAmbientLight}
        lightDirX={lightDirX}
        onLightDirXChange={setLightDirX}
        lightDirY={lightDirY}
        onLightDirYChange={setLightDirY}
        gridSpacing={gridSpacing}
        onGridSpacingChange={setGridSpacing}
        gridVisible={gridVisible}
        onGridVisibleChange={setGridVisible}
        radiusKm={radiusKm}
        onRadiusKmChange={setRadiusKm}
        baseColor={baseColor}
        onBaseColorChange={setBaseColor}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        noiseEnabled={noiseEnabled}
        onNoiseEnabledChange={setNoiseEnabled}
      />
      {/* The 3D viewport fills the remaining space between the two panels —
          SceneCanvas's ResizeObserver picks up this box's actual size, so
          the camera centers on what's actually visible. */}
      <div className="app-viewport">
        <SceneCanvas
          radius={radiusKm / KM_PER_SCENE_UNIT}
          baseColor={baseColor}
          ambientLight={ambientLight}
          lightDirX={lightDirX}
          lightDirY={lightDirY}
          displayMode={displayMode}
          gridSpacing={gridSpacing}
          gridVisible={gridVisible}
          noiseSeed={noiseSeed}
          noiseFrequency={noiseFrequency}
          noiseType={appliedNoiseType}
          noiseOctaves={noiseOctaves}
          noisePersistence={noisePersistence}
          noiseLacunarity={noiseLacunarity}
          noiseTerraceSteps={noiseTerraceSteps}
        />
      </div>
      <RightPanel
        noiseType={noiseType}
        onNoiseTypeChange={setNoiseType}
        noiseSeed={noiseSeed}
        onNoiseSeedChange={setNoiseSeed}
        noiseFrequency={noiseFrequency}
        onNoiseFrequencyChange={setNoiseFrequency}
        noiseOctaves={noiseOctaves}
        onNoiseOctavesChange={setNoiseOctaves}
        noisePersistence={noisePersistence}
        onNoisePersistenceChange={setNoisePersistence}
        noiseLacunarity={noiseLacunarity}
        onNoiseLacunarityChange={setNoiseLacunarity}
        noiseTerraceSteps={noiseTerraceSteps}
        onNoiseTerraceStepsChange={setNoiseTerraceSteps}
      />
    </div>
  );
}

export default App;

import { useState } from 'react';
import { SceneCanvas } from './scene/SceneCanvas';
import { Panel } from './ui/Panel';

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
  const [gridDivisions, setGridDivisions] = useState(50);

  return (
    <div className="app-layout">
      <Panel
        ambientLight={ambientLight}
        onAmbientLightChange={setAmbientLight}
        lightDirX={lightDirX}
        onLightDirXChange={setLightDirX}
        lightDirY={lightDirY}
        onLightDirYChange={setLightDirY}
        gridDivisions={gridDivisions}
        onGridDivisionsChange={setGridDivisions}
        radiusKm={radiusKm}
        onRadiusKmChange={setRadiusKm}
        baseColor={baseColor}
        onBaseColorChange={setBaseColor}
      />
      {/* The 3D viewport fills the remaining space next to the panel (not the
          full window) — SceneCanvas's ResizeObserver picks up this box's
          actual size, so the camera centers on what's actually visible. */}
      <div className="app-viewport">
        <SceneCanvas
          radius={radiusKm / KM_PER_SCENE_UNIT}
          baseColor={baseColor}
          ambientLight={ambientLight}
          lightDirX={lightDirX}
          lightDirY={lightDirY}
          gridDivisions={gridDivisions}
        />
      </div>
    </div>
  );
}

export default App;

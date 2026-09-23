import { useState } from 'react';

// TODO(DS): arbitrary placeholder conversion — the UI shows/accepts a
// narrative-scale planet radius in km (the tool's premise, per Dana), mapped
// down to the small render-space units the scene actually uses. 1 scene
// unit = 300 km is a made-up round number chosen to land near the previous
// hardcoded default (~20 scene units) at an Earth-ish 6000km — not derived
// from anything. Revisit once there's a real scene-scale convention.
const KM_PER_SCENE_UNIT = 300;

// Owns the planet-specific appearance controls — radius, base color, and
// display mode — distinct from scene/sceneControls.ts's lighting/grid, which
// aren't the planet itself. See ISSUES.md, 2026-09-22.
export function usePlanetControls() {
  const [radiusKm, setRadiusKm] = useState(6000);
  const [baseColor, setBaseColor] = useState('#c9dbea'); // TODO(DS): lighter placeholder, per Dana's 2026-09-16 request
  const [displayMode, setDisplayMode] = useState('shaded'); // 'shaded' | 'wireframe'

  return {
    radiusKm,
    setRadiusKm,
    radiusScene: radiusKm / KM_PER_SCENE_UNIT, // what SceneCanvas actually renders with
    baseColor,
    setBaseColor,
    displayMode,
    setDisplayMode,
  };
}

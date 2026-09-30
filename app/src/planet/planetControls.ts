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
  const [displayMode, setDisplayMode] = useState('shaded'); // 'shaded' | 'wireframe' | 'voxel'
  // Overall terrain height — shared directly by the planet's own
  // displacement and the land chunk's voxel/smooth height (Dana, 2026-09-23:
  // "it's overall height... the chunk is eventually a part of the planet
  // we're viewing as a flat piece" — the same number, not two separately
  // scaled ones). A percentage of whichever context it's applied to
  // (radius for the planet, footprint size for the chunk — see
  // SceneCanvas.tsx/voxel/landChunk.ts), not an absolute scene-unit value —
  // that's what keeps the same number proportionally correct on both,
  // despite the planet and a chunk being wildly different absolute sizes
  // (Dana, 2026-09-24: "can the height be in %?"). 15 matches the old
  // radius*0.15 auto-derivation at any radius now, not just the default
  // one. See ISSUES.md, 2026-09-24.
  const [heightScale, setHeightScale] = useState(15);

  return {
    radiusKm,
    setRadiusKm,
    radiusScene: radiusKm / KM_PER_SCENE_UNIT, // what SceneCanvas actually renders with
    baseColor,
    setBaseColor,
    displayMode,
    setDisplayMode,
    heightScale,
    setHeightScale,
  };
}

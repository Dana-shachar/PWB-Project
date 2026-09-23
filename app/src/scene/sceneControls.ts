import { useState } from 'react';

// Owns the scene-wide controls — lighting and the ground grid — distinct
// from planet/planetControls.ts, which is the planet itself, not the scene
// around it. See ISSUES.md, 2026-09-22.
export function useSceneControls() {
  const [ambientLight, setAmbientLight] = useState(0.12); // lower = more shadow contrast on the bumps
  const [lightDirX, setLightDirX] = useState(1);
  const [lightDirY, setLightDirY] = useState(1);
  const [gridSpacing, setGridSpacing] = useState(10);
  const [gridVisible, setGridVisible] = useState(true);

  return {
    ambientLight,
    setAmbientLight,
    lightDirX,
    setLightDirX,
    lightDirY,
    setLightDirY,
    gridSpacing,
    setGridSpacing,
    gridVisible,
    setGridVisible,
  };
}

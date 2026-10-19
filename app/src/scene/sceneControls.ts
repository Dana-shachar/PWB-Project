import { useState } from 'react';

// Owns the scene-wide controls — lighting and the ground grid — distinct
// from planet/planetControls.ts, which is the planet itself, not the scene
// around it. See ISSUES.md, 2026-09-22.
export function useSceneControls() {
  const [ambientLight, setAmbientLight] = useState(0.12); // the fill — lower means deeper shadow
  const [lightDirX, setLightDirX] = useState(1);
  const [lightDirY, setLightDirY] = useState(1);
  // The light's elevation. Was hardcoded to 1 (uLightDirection.set(x, y, 1)
  // in SceneCanvas/LandChunkCanvas) with no control reaching it at all — a
  // grazing, near-0 light is what gives terrain long shading and real form
  // (every landscape photograph near sunrise), and that angle was simply
  // unreachable. Reverted the invented "Contrast" curve in favor of this
  // plus uLightIntensity below: known Blinn-Phong terms, not a reshaped
  // falloff. See ISSUES.md, 2026-10-13.
  const [lightDirZ, setLightDirZ] = useState(1);
  // The key light's own strength — the conventional way to separate lit
  // from shadow is a brighter key against the ambient fill, not a contrast
  // curve on the result.
  const [lightIntensity, setLightIntensity] = useState(1);
  // Blinn-Phong specular (Blinn, 1977): a highlight is what reads as a lit
  // surface rather than flat-shaded. Strength is how bright it is;
  // shininess how tight.
  const [specularStrength, setSpecularStrength] = useState(0.3);
  const [shininess, setShininess] = useState(24);
  const [gridSpacing, setGridSpacing] = useState(10);
  const [gridVisible, setGridVisible] = useState(true);

  return {
    ambientLight,
    setAmbientLight,
    lightDirX,
    setLightDirX,
    lightDirY,
    setLightDirY,
    lightDirZ,
    setLightDirZ,
    lightIntensity,
    setLightIntensity,
    specularStrength,
    setSpecularStrength,
    shininess,
    setShininess,
    gridSpacing,
    setGridSpacing,
    gridVisible,
    setGridVisible,
  };
}

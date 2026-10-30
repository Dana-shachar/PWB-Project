import { useState } from 'react';

// Owns the scene-wide controls — lighting and the ground grid — distinct
// from planet/planetControls.ts, which is the planet itself, not the scene
// around it. See ISSUES.md, 2026-09-22.
export function useSceneControls() {
  const [ambientLight, setAmbientLight] = useState(0.26); // the fill — lower means deeper shadow
  const [lightDirX, setLightDirX] = useState(1.6);
  const [lightDirY, setLightDirY] = useState(1);
  // The light's elevation. Was hardcoded to 1 (uLightDirection.set(x, y, 1)
  // in SceneCanvas/LandChunkCanvas) with no control reaching it at all — a
  // grazing, near-0 light is what gives terrain long shading and real form
  // (every landscape photograph near sunrise), and that angle was simply
  // unreachable. Reverted the invented "Contrast" curve in favor of this
  // plus uLightIntensity below: known Blinn-Phong terms, not a reshaped
  // falloff. See ISSUES.md, 2026-10-13.
  // +4.3 since the planet's normals point outward ([B61], 2026-10-27); -4.3 had compensated for inward normals.
  const [lightDirZ, setLightDirZ] = useState(4.3);
  // The land chunk's own elevation, independent of the planet's (Dana,
  // 2026-10-20: "that's basically the only difference between the two,
  // they can share all light settings, beside the elevation"). The chunk
  // is a flat patch always facing one fixed direction, so a grazing
  // elevation tuned for the planet (where some point on the sphere always
  // faces the light regardless) can leave the whole chunk dim — a problem
  // specific to elevation, not the other light terms. 0.7 is Dana's own
  // found-by-testing value.
  const [chunkLightDirZ, setChunkLightDirZ] = useState(0.7);
  // The key light's own strength — the conventional way to separate lit
  // from shadow is a brighter key against the ambient fill, not a contrast
  // curve on the result.
  const [lightIntensity, setLightIntensity] = useState(1);
  // Blinn-Phong specular (Blinn, 1977): a highlight is what reads as a lit
  // surface rather than flat-shaded. Strength is how bright it is;
  // shininess how tight.
  const [specularStrength, setSpecularStrength] = useState(0);
  const [shininess, setShininess] = useState(24);
  // How far the diffuse light wraps past the terminator: 0 is plain Lambert,
  // 1 the soft half-Lambert the chunk used alone. Shared by planet and chunk.
  const [diffuseWrap, setDiffuseWrap] = useState(0.5);
  const [gridSpacing, setGridSpacing] = useState(10);
  const [gridVisible, setGridVisible] = useState(true);
  // Vertical field of view of the chunk's walk mode, degrees (Unity's default is 60).
  const [walkFieldOfView, setWalkFieldOfView] = useState(60);
  // On: the light turns with the camera, so the side in view is always lit, as in modeling tools. Off: a fixed light,
  // like a distant sun, with a day and night side (Dana, 2026-10-27).
  const [lightFollowsCamera, setLightFollowsCamera] = useState(true); // on by default (Dana, 2026-10-27)

  return {
    lightFollowsCamera,
    setLightFollowsCamera,
    ambientLight,
    setAmbientLight,
    lightDirX,
    setLightDirX,
    lightDirY,
    setLightDirY,
    lightDirZ,
    setLightDirZ,
    chunkLightDirZ,
    setChunkLightDirZ,
    lightIntensity,
    setLightIntensity,
    specularStrength,
    setSpecularStrength,
    shininess,
    setShininess,
    diffuseWrap,
    setDiffuseWrap,
    gridSpacing,
    setGridSpacing,
    gridVisible,
    setGridVisible,
    walkFieldOfView,
    setWalkFieldOfView,
  };
}

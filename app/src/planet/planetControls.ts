import { useState } from 'react';
import * as THREE from 'three';

// Generates a Low/Mid/High palette that reads as one lit terrain ramp
// rather than three unrelated colors. What makes them "make sense together"
// (Dana, 2026-10-14) is the hue relationship, not a fixed lightness order:
// color-harmony theory says a related hue is a hue-wheel rotation, with
// "analogous" reading as one family rather than clashing the way an
// arbitrary jump would — Mid is picked at a rotation from Low, never an
// independent random hue. HSL, not RGB, since hue rotation only makes sense
// in a cylindrical color space. See REFERENCES.md.
//
// Low is NOT forced darker than Mid (Dana, 2026-10-14: "low doesnt always
// need to be darker... i need the colors to make sense together") — real
// terrain palettes go both ways depending on what Low represents: dark soil
// in the Swiss "Atlas II" scheme, but pale water in any scheme that colors
// a coastline, and both are equally real. Its lightness is left free to
// land anywhere Mid's own range can, so which one reads darker varies
// rather than being fixed.
//
// The rotation itself was too narrow in the first version (20-45°) and
// read as one same-ish shade three times over (Dana, 2026-10-14: "all the
// same shade which is very boring") — the actual Atlas II reference this
// cites moves green through yellow-green to white, a noticeably wider swing
// than that. Widened to 45-110° to actually match the source, not just
// cite it; still one-directional around the wheel, so it stays a family
// rather than a clash, just a far more visible one.
function randomTerrainPalette(): { low: string; mid: string; high: string } {
  const baseHue = Math.random() * 360;
  const midHue = (baseHue + 45 + Math.random() * 65) % 360;
  // High previously reused midHue directly, so Low and High were only ever
  // the same 45-110° apart as Low-to-Mid — at High's heavy desaturation
  // that gap doesn't read as different at all (Dana, 2026-10-14: "the top
  // and bottom colors still match"). A third rotation, further along the
  // same direction, same convention as the low->mid step, not a new rule —
  // the full sweep is now Low -> Mid -> High, each visibly distinct, the
  // way Atlas II actually goes green -> yellow-green -> white as three
  // real steps rather than two.
  const highHue = (midHue + 20 + Math.random() * 40) % 360;
  const low = new THREE.Color().setHSL(baseHue / 360, 0.35 + Math.random() * 0.35, 0.25 + Math.random() * 0.35);
  const mid = new THREE.Color().setHSL(midHue / 360, 0.35 + Math.random() * 0.35, 0.3 + Math.random() * 0.35);
  // Pale and desaturated no matter which hues were picked, or how Low and
  // Mid landed — every real hypsometric ramp's peaks trend toward white,
  // not a saturated color. The one lightness rule left fixed, since this
  // one wasn't contested.
  const high = new THREE.Color().setHSL(highHue / 360, 0.05 + Math.random() * 0.1, 0.9 + Math.random() * 0.07);
  return { low: `#${low.getHexString()}`, mid: `#${mid.getHexString()}`, high: `#${high.getHexString()}` };
}

// TODO(DS): arbitrary placeholder conversion — the UI shows/accepts a
// narrative-scale planet radius in km (the tool's premise, per Dana), mapped
// down to the small render-space units the scene actually uses. 1 scene
// unit = 300 km is a made-up round number chosen to land near the previous
// hardcoded default (~20 scene units) at an Earth-ish 6000km — not derived
// from anything. Revisit once there's a real scene-scale convention.
const KM_PER_SCENE_UNIT = 300;

// Every field this hook owns that's meant to be per-project, not global app
// state — these were never wired into save/load at all until now, so
// switching projects silently leaked one planet's Display/Radius/colors
// into the next (Dana, 2026-10-14: "it didn't save my colors to the
// project... the new project colors remained"). One shape, shared by the
// hook's own defaults, resetToDefaults(), and firebase/storage.ts's saved
// document, so there's one place this list lives, not three.
export interface PlanetSettings {
  radiusKm: number;
  baseColor: string;
  displayMode: string;
  heightScale: number;
  meshSegments: number;
  colorByElevation: boolean;
  colorMid: string;
  colorHigh: string;
  shadowsEnabled: boolean;
}

export const DEFAULT_PLANET_SETTINGS: PlanetSettings = {
  radiusKm: 6000,
  baseColor: '#c9dbea', // TODO(DS): lighter placeholder, per Dana's 2026-09-16 request
  displayMode: 'shaded', // 'shaded' | 'wireframe' | 'voxel'
  heightScale: 15,
  meshSegments: 32,
  colorByElevation: false,
  colorMid: '#6b8f4e',
  colorHigh: '#ffffff',
  shadowsEnabled: false,
};

// Owns the planet-specific appearance controls — radius, base color, and
// display mode — distinct from scene/sceneControls.ts's lighting/grid, which
// aren't the planet itself. See ISSUES.md, 2026-09-22.
export function usePlanetControls() {
  const [radiusKm, setRadiusKm] = useState(DEFAULT_PLANET_SETTINGS.radiusKm);
  const [baseColor, setBaseColor] = useState(DEFAULT_PLANET_SETTINGS.baseColor);
  const [displayMode, setDisplayMode] = useState(DEFAULT_PLANET_SETTINGS.displayMode);
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
  const [heightScale, setHeightScale] = useState(DEFAULT_PLANET_SETTINGS.heightScale);
  // How finely the base cube-sphere is subdivided, per face. Was hardcoded
  // at 32 in planet/mesh.ts with no control reaching it at all, which is
  // what gave the planet its faceted, low-poly silhouette once displacement
  // pushed those few vertices out a long way — visible directly in the
  // sphere's outline, not just its shading (Dana, 2026-10-13: "this isn't
  // related to voxel", the chunk's own Resolution slider is a separate
  // thing). 32 stays the default; this only exposes the ceiling.
  const [meshSegments, setMeshSegments] = useState(DEFAULT_PLANET_SETTINGS.meshSegments);
  // Elevation color ramp (shaders/terrain.glsl) — off by default so nothing
  // changes until turned on. A labelled placeholder for Stage 11's real
  // height+climate+biome shader, not that shader itself (Dana, 2026-10-13:
  // "color slope... control of colors for min, max, mid"). See ROADMAP.md.
  // Low is baseColor above, not its own state — a dedicated low-elevation
  // picker duplicated what Base color already means (Dana, 2026-10-13:
  // "the base color should just serve as the low elevation color").
  const [colorByElevation, setColorByElevation] = useState(DEFAULT_PLANET_SETTINGS.colorByElevation);
  const [colorMid, setColorMid] = useState(DEFAULT_PLANET_SETTINGS.colorMid);
  const [colorHigh, setColorHigh] = useState(DEFAULT_PLANET_SETTINGS.colorHigh);
  // Heightmap self-shadowing — land chunk only for now, see shaders/
  // terrain.glsl for why the planet's curved surface is a separate step.
  const [shadowsEnabled, setShadowsEnabled] = useState(DEFAULT_PLANET_SETTINGS.shadowsEnabled);

  function randomizeColors() {
    const palette = randomTerrainPalette();
    setBaseColor(palette.low);
    setColorMid(palette.mid);
    setColorHigh(palette.high);
  }

  // Every field above, as the one PlanetSettings shape — what
  // projectSettings/saveProject.ts actually persists.
  function currentSettings(): PlanetSettings {
    return { radiusKm, baseColor, displayMode, heightScale, meshSegments, colorByElevation, colorMid, colorHigh, shadowsEnabled };
  }

  // Restores a saved project's settings — every setter in one call, so a
  // loaded project replaces all of these at once rather than one at a time.
  function applySettings(settings: PlanetSettings) {
    setRadiusKm(settings.radiusKm);
    setBaseColor(settings.baseColor);
    setDisplayMode(settings.displayMode);
    setHeightScale(settings.heightScale);
    setMeshSegments(settings.meshSegments);
    setColorByElevation(settings.colorByElevation);
    setColorMid(settings.colorMid);
    setColorHigh(settings.colorHigh);
    setShadowsEnabled(settings.shadowsEnabled);
  }

  // A project with nothing saved yet (new, or an old save from before this
  // existed) gets the real defaults, not whatever the previously-open
  // planet happened to leave behind.
  function resetToDefaults() {
    applySettings(DEFAULT_PLANET_SETTINGS);
  }

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
    meshSegments,
    setMeshSegments,
    colorByElevation,
    setColorByElevation,
    colorMid,
    setColorMid,
    colorHigh,
    setColorHigh,
    shadowsEnabled,
    setShadowsEnabled,
    randomizeColors,
    currentSettings,
    applySettings,
    resetToDefaults,
  };
}

import * as THREE from 'three';
import type { NoiseLayer } from '../map/heightmap';
import { between, COLOR_RULES, DEFAULT_MOONS, HUE_JITTER, hueTurnFor, MAX_MOONS, skySaturation, pickOne, randomMoons, type MoonSettings } from './moonTexture';

// The planet's atmosphere: sky colors, haze, the planet's glow, clouds, the wind (which also drives the water's
// waves) and optional moons in the chunk's sky. Saved with the planet (planet/planetControls.ts).
export interface AtmosphereSettings {
  enabled: boolean;
  // The sky's gradient from the horizon up (three.js's sky dome, shaders/atmosphere/skyDome.frag.glsl).
  horizonColor: string;
  zenithColor: string;
  // Turns the shadows' sky fill round the hue wheel (degrees), so shadows can take an unexpected color (scene/fillLight.ts).
  shadowHue: number;
  // How thick the haze is, 0 (clear) to 1 (distant ground fades into the horizon color quickly).
  haze: number;
  // How strong and wide the planet's rim glow is, seen from space.
  glow: number;
  // Clouds: how much of the sky they cover (0 to 1), their color, and how soft their edges are (0 to 1).
  cloudCoverage: number;
  clouds: boolean; // the Clouds header's switch; off hides them and keeps their settings
  cloudColor: string;
  // A second cloud color, mixed in by warped bands; the same as cloudColor gives one tone.
  cloudColor2: string;
  cloudSoftness: number;
  // Cloud shape: feature size (1 is the default size), noise layers (1 to 8), wispy worn edges (0 to 1), and how much
  // they stretch along latitude lines into bands (0 patchy, 1 Jupiter-like).
  cloudScale: number;
  cloudDetail: number;
  cloudFeather: number;
  cloudSwirl: number; // marbled swirls, 0 to 1
  cloudBanding: number;
  // How much cloud gathers at the equator, the mid-latitudes and the poles (0 to 1 each).
  cloudEquator: number;
  cloudMidLatitudes: number;
  cloudPoles: number;
  // How much latitude decides where clouds form: 0 scattered everywhere, 1 only in the favored bands.
  cloudDistributionStrength: number;
  // How windy, as a Beaufort force: 0 is calm, 12 a storm. Moves the clouds and sets the water's waves.
  wind: number;
  moon: boolean;
  // How many moons show (1 to 5), and all five, so changing the count never loses one (atmosphere/moonTexture.ts).
  moonCount: number;
  moons: MoonSettings[];
  // The colors Randomize keeps (LockButton); the moons keep their own locks.
  lockedColors: AtmosphereColorKey[];
}

export type AtmosphereColorKey = 'horizonColor' | 'zenithColor' | 'shadowHue' | 'cloudColor' | 'cloudColor2';

// A color control's lock (LockButton), read from and written to lockedColors.
export function colorLockProps(settings: AtmosphereSettings, key: AtmosphereColorKey, onChange: (changes: Partial<AtmosphereSettings>) => void) {
  return {
    locked: settings.lockedColors.includes(key),
    onLockChange: (locked: boolean) =>
      onChange({ lockedColors: locked ? [...settings.lockedColors, key] : settings.lockedColors.filter((each) => each !== key) }),
  };
}

// Inferred, TUNABLE: a soft, pale default between the references (Sable, Gris, No Man's Sky).
export const DEFAULT_ATMOSPHERE_SETTINGS: AtmosphereSettings = {
  enabled: true,
  horizonColor: '#f3d9c6',
  zenithColor: '#8fb4d9',
  shadowHue: 0,
  haze: 0.3,
  glow: 0.5,
  cloudCoverage: 0.4,
  clouds: true,
  cloudColor: '#f7eef2',
  cloudColor2: '#f7eef2',
  cloudSoftness: 0.6,
  cloudScale: 1,
  cloudDetail: 4,
  cloudFeather: 0.4,
  cloudSwirl: 0,
  cloudBanding: 0.2,
  // NASA MODIS: a narrow cloudy band at the equator and two wider ones in the mid-latitudes; amounts inferred.
  cloudEquator: 0.8,
  cloudMidLatitudes: 1,
  cloudPoles: 0.5,
  cloudDistributionStrength: 0.6,
  wind: 4,
  moon: false,
  moonCount: 1,
  moons: DEFAULT_MOONS,
  lockedColors: [],
};

// Older saves have no atmosphere; their wind lived in the water settings.
export function migrateAtmosphere(saved: (Partial<AtmosphereSettings> & LegacyMoonFields) | undefined, legacyWind: number | undefined): AtmosphereSettings {
  const wind = saved?.wind ?? legacyWind ?? DEFAULT_ATMOSPHERE_SETTINGS.wind;
  const cloudColor2 = saved?.cloudColor2 ?? saved?.cloudColor ?? DEFAULT_ATMOSPHERE_SETTINGS.cloudColor2;
  const { moonCrescent: _crescent, moonColorsLocked: _locked, moonTexture: _texture, moonHalo: _halo, moonGlow: _glow, ...rest } = saved ?? {};
  return { ...DEFAULT_ATMOSPHERE_SETTINGS, ...rest, wind, cloudColor2, moons: migrateMoons(saved) };
}

// Saves from before there were several moons kept one moon's fields flat; they become moon 1.
interface LegacyMoonFields {
  moonColor?: string;
  moonColor2?: string;
  moonSize?: number;
  moonHeight?: number;
  moonAzimuth?: number;
  moonLayers?: NoiseLayer[];
  // Shared by every moon before each had its own (2026-10-30).
  moonCrescent?: number;
  moonColorsLocked?: boolean;
  moonTexture?: number;
  moonHalo?: number;
  moonGlow?: number;
}
// Moons saved before the hue slider (2026-10-30) kept two free colors; the first becomes a turn from the sky's hue.
type LegacyMoon = Partial<MoonSettings> & { color?: string; color2?: string; color2Locked?: boolean };
function migrateMoons(saved: (Partial<AtmosphereSettings> & LegacyMoonFields) | undefined): MoonSettings[] {
  const moons: LegacyMoon[] = saved?.moons ?? DEFAULT_MOONS;
  const first = moons[0] ?? DEFAULT_MOONS[0];
  const legacyFirst: LegacyMoon = {
    ...first,
    size: saved?.moonSize ?? first.size,
    height: saved?.moonHeight ?? first.height,
    azimuth: saved?.moonAzimuth ?? first.azimuth,
    color: saved?.moonColor ?? first.color,
    layers: saved?.moonLayers ?? first.layers,
  };
  const all = [saved?.moons ? first : legacyFirst, ...moons.slice(1)];
  const locked = saved?.moonColorsLocked ?? false;
  const horizonColor = saved?.horizonColor ?? DEFAULT_ATMOSPHERE_SETTINGS.horizonColor;
  const zenithColor = saved?.zenithColor ?? DEFAULT_ATMOSPHERE_SETTINGS.zenithColor;
  return Array.from({ length: MAX_MOONS }, (_, i) => {
    const { color, color2, color2Locked: _color2Locked, ...moon } = all[i] ?? DEFAULT_MOONS[i];
    return {
      ...DEFAULT_MOONS[i],
      ...moon,
      hueTurn: moon.hueTurn ?? (color ? hueTurnFor(color, horizonColor, zenithColor) : DEFAULT_MOONS[i].hueTurn),
      secondOffset: moon.secondOffset ?? (color && color2 ? hueTurnFor(color2, horizonColor, zenithColor) - hueTurnFor(color, horizonColor, zenithColor) : DEFAULT_MOONS[i].secondOffset),
      crescentAngle: moon.crescentAngle ?? 0,
      crescent: moon.crescent ?? saved?.moonCrescent ?? DEFAULT_MOONS[i].crescent,
      texture: moon.texture ?? saved?.moonTexture ?? DEFAULT_MOONS[i].texture,
      halo: moon.halo ?? saved?.moonHalo ?? DEFAULT_MOONS[i].halo,
      glow: moon.glow ?? saved?.moonGlow ?? DEFAULT_MOONS[i].glow,
      blend: moon.blend ?? 0,
      saturation: moon.saturation ?? skySaturation(horizonColor, zenithColor),
      colorLocked: moon.colorLocked ?? locked,
    };
  });
}

// Randomize (Dana, 2026-10-30): every value changes, but locked colors stay and anchor the palette. Unlocked colors are
// hue turns from one base hue (the moons' color rules), taken from a locked color, Sky first, else random.
// The sliders follow three hidden drivers, so related settings move together (a stormy world is windy, cloudy and
// ragged at once); each is mild, and sometimes one goes extreme. A few high-level controls driving many parameters is
// the documented way to keep a generator's output coherent (US 10552730; Compton, "So you want to build a generator").
// The couplings and ranges are inferred, TUNABLE.
type Range = [number, number];
const MILD_DRIVER: Range = [0.1, 0.55];
const EXTREME_DRIVER: Range = [0.85, 1];
const EXTREME_CHANCE = 0.5; // how often one driver goes extreme
const JITTER = 0.12; // each slider's own wobble around its driver, as a share of its span
const SKY_LIGHTNESS: Range = [0.45, 0.75];
const HORIZON_LIGHTNESS: Range = [0.7, 0.88]; // lighter than the sky, as air is near the horizon
const CLOUD_SATURATION: Range = [0.05, 0.3]; // tinted whites
const CLOUD_LIGHTNESS: Range = [0.82, 0.96];
const NEIGHBOR_TURN = 30 / 360; // how far the sky and horizon may turn from the base hue

const hslHex = (hue: number, saturation: Range, lightness: Range) =>
  `#${new THREE.Color().setHSL(((hue % 1) + 1) % 1, between(saturation), between(lightness)).getHexString()}`;
const ruleTurn = () => pickOne(COLOR_RULES) + (Math.random() * 2 - 1) * HUE_JITTER;
// A slider's value from its driver (0 to 1) along [from, to], with a little wobble, rounded to two decimals.
const follow = (driver: number, [from, to]: Range) => {
  const value = from + (to - from) * Math.min(1, Math.max(0, driver + (Math.random() * 2 - 1) * JITTER));
  return Math.round(value * 100) / 100;
};

export function randomAtmosphere(settings: AtmosphereSettings): AtmosphereSettings {
  // The drivers: storminess (wind, cloud cover, ragged edges, bands), air thickness (haze, glow, pale sky, soft moons)
  // and cloud climate (how large the cloud systems are and how strongly latitude places them).
  const extreme = Math.random() < EXTREME_CHANCE ? pickOne(['storm', 'air', 'climate'] as const) : undefined;
  const roll = (name: 'storm' | 'air' | 'climate') => between(name === extreme ? EXTREME_DRIVER : MILD_DRIVER);
  const storm = roll('storm');
  const air = roll('air');
  const climate = roll('climate');

  const isLocked = (key: AtmosphereColorKey) => settings.lockedColors.includes(key);
  const anchor = (['zenithColor', 'horizonColor', 'cloudColor', 'cloudColor2'] as const).find(isLocked);
  const hsl = { h: 0, s: 0, l: 0 };
  const baseHue = anchor ? new THREE.Color(settings[anchor]).getHSL(hsl).h : Math.random();
  const neighbor = () => baseHue + (Math.random() * 2 - 1) * NEIGHBOR_TURN;
  const skySaturation: Range = [0.7 - air * 0.45, 0.75 - air * 0.4]; // thick air washes the sky out

  const next: AtmosphereSettings = { ...settings };
  if (!isLocked('zenithColor')) next.zenithColor = hslHex(anchor ? neighbor() : baseHue, skySaturation, SKY_LIGHTNESS);
  if (!isLocked('horizonColor')) next.horizonColor = hslHex(neighbor(), skySaturation, HORIZON_LIGHTNESS);
  if (!isLocked('cloudColor')) next.cloudColor = hslHex(baseHue + ruleTurn(), CLOUD_SATURATION, CLOUD_LIGHTNESS);
  if (!isLocked('cloudColor2')) next.cloudColor2 = hslHex(baseHue + ruleTurn(), CLOUD_SATURATION, CLOUD_LIGHTNESS);
  if (!isLocked('shadowHue')) next.shadowHue = Math.round((((ruleTurn() * 360 + 540) % 360) - 180));

  next.wind = follow(storm, [0.5, 36]);
  next.cloudCoverage = follow(storm, [0.15, 0.9]);
  next.cloudFeather = follow(storm, [0.15, 0.85]);
  next.cloudBanding = follow(storm, [0, 0.8]);
  next.cloudSoftness = follow(storm, [0.85, 0.3]);
  next.cloudDetail = Math.round(follow(storm, [3, 7]));
  next.haze = follow(air, [0.1, 5.5]);
  next.glow = follow(air, [0.2, 5]);
  next.cloudScale = follow(climate, [0.7, 3]);
  next.cloudDistributionStrength = follow(climate, [0.15, 0.95]);
  next.cloudEquator = follow(Math.random(), [0.2, 1]);
  next.cloudMidLatitudes = follow(Math.random(), [0.2, 1]);
  next.cloudPoles = follow(Math.random(), [0, 1]);

  next.moonCount = 1 + Math.floor(Math.random() * MAX_MOONS);
  next.moons = randomMoons(next.moonCount, settings.moons, next.horizonColor, next.zenithColor).map((moon) => ({
    ...moon,
    texture: follow(air, [1.4, 0.4]), // thick air blurs the surface into glow
    halo: follow(air, [0.05, 2]),
    glow: follow(air, [0.1, 1.5]),
  }));
  return next;
}

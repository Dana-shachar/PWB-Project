// The planet's atmosphere: sky colors, haze, the planet's glow, clouds, the wind (which also drives the water's
// waves) and an optional moon in the chunk's sky. Saved with the planet (planet/planetControls.ts).
export interface AtmosphereSettings {
  enabled: boolean;
  // The sky's gradient from the horizon up (three.js's sky dome, shaders/atmosphere/skyDome.frag.glsl).
  horizonColor: string;
  zenithColor: string;
  // How thick the haze is, 0 (clear) to 1 (distant ground fades into the horizon color quickly).
  haze: number;
  // How strong and wide the planet's rim glow is, seen from space.
  glow: number;
  // Clouds: how much of the sky they cover (0 to 1), their color, and how soft their edges are (0 to 1).
  cloudCoverage: number;
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
  moonColor: string;
  moonSize: number; // degrees across
}

// Inferred, TUNABLE: a soft, pale default between the references (Sable, Gris, No Man's Sky).
export const DEFAULT_ATMOSPHERE_SETTINGS: AtmosphereSettings = {
  enabled: true,
  horizonColor: '#f3d9c6',
  zenithColor: '#8fb4d9',
  haze: 0.3,
  glow: 0.5,
  cloudCoverage: 0.4,
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
  moonColor: '#e9d2c4',
  moonSize: 8,
};

// Older saves have no atmosphere; their wind lived in the water settings.
export function migrateAtmosphere(saved: Partial<AtmosphereSettings> | undefined, legacyWind: number | undefined): AtmosphereSettings {
  const wind = saved?.wind ?? legacyWind ?? DEFAULT_ATMOSPHERE_SETTINGS.wind;
  const cloudColor2 = saved?.cloudColor2 ?? saved?.cloudColor ?? DEFAULT_ATMOSPHERE_SETTINGS.cloudColor2;
  return { ...DEFAULT_ATMOSPHERE_SETTINGS, ...saved, wind, cloudColor2 };
}

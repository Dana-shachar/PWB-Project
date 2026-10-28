import { useState } from 'react';
import { Accordion, ColorPicker, Dial, IconButton, Select, Slider, Toggle } from '../UIElements';
import type { AtmosphereSettings } from '../../atmosphere/atmosphereSettings';
import { describeMoonLayers, MAX_MOONS, randomMoonLayers, randomMoons, type MoonSettings } from '../../atmosphere/moonTexture';
import { DiceIcon } from '../icons';

// The atmosphere's detail controls on the right panel: wind, cloud shape and distribution, and the moon. The general
// ones (sky colors, haze, glow) stay in the left panel's Atmosphere section (Dana, 2026-10-27).
interface AtmospherePanelProps {
  atmosphere: AtmosphereSettings;
  onAtmosphereChange: (changes: Partial<AtmosphereSettings>) => void;
}

export function AtmospherePanel({ atmosphere, onAtmosphereChange }: AtmospherePanelProps) {
  const off = !atmosphere.enabled;
  const moonOff = off || !atmosphere.moon;
  // Which moon the per-moon controls below edit; Randomize sets them all.
  const [selectedMoon, setSelectedMoon] = useState(0);
  const moonIndex = Math.min(selectedMoon, atmosphere.moonCount - 1);
  const moon = atmosphere.moons[moonIndex];
  const updateMoon = (changes: Partial<MoonSettings>) =>
    onAtmosphereChange({ moons: atmosphere.moons.map((each, i) => (i === moonIndex ? { ...each, ...changes } : each)) });
  // New moons: sizes, places in view, surfaces, and colors that go with the sky unless they're locked.
  const randomizeMoons = () =>
    onAtmosphereChange({ moons: randomMoons(atmosphere.moonCount, atmosphere.moons, atmosphere.moonColorsLocked, atmosphere.horizonColor, atmosphere.zenithColor) });
  const moonOptions = Array.from({ length: atmosphere.moonCount }, (_, i) => ({ value: String(i), label: `Moon ${i + 1}` }));
  return (
    <>
      <div className="panel-section">
        <Accordion title="Wind" defaultOpen>
          <Slider
            label="Wind"
            value={atmosphere.wind}
            onChange={(wind) => onAtmosphereChange({ wind })}
            min={0}
            max={40}
            step={0.5}
            precision={1}
            disabled={off}
            description="How calm or stormy, on the Beaufort scale: 0 is calm, 3 brings the first whitecaps, 12 is a storm, 40 is Jupiter's jet streams. It moves the clouds and sets the water's waves, which stop growing at 12."
          />
        </Accordion>
      </div>
      <div className="panel-section-divider" />
      <div className="panel-section">
        <Accordion title="Clouds" defaultOpen>
          <Slider label="Coverage" value={atmosphere.cloudCoverage} onChange={(cloudCoverage) => onAtmosphereChange({ cloudCoverage })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much of the sky the clouds cover. 0 turns them off." />
          <Slider label="Softness" value={atmosphere.cloudSoftness} onChange={(cloudSoftness) => onAtmosphereChange({ cloudSoftness })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How soft the clouds' edges are: 0 is crisp, 1 is a soft blur." />
          <ColorPicker label="Color" value={atmosphere.cloudColor} onChange={(cloudColor) => onAtmosphereChange({ cloudColor })} />
          <ColorPicker label="Second color" value={atmosphere.cloudColor2} onChange={(cloudColor2) => onAtmosphereChange({ cloudColor2 })} />
          <span className="panel-section-title">Shape</span>
          <Slider label="Scale" value={atmosphere.cloudScale} onChange={(cloudScale) => onAtmosphereChange({ cloudScale })} min={0.2} max={4} step={0.05} precision={2} disabled={off} description="How large the clouds are: lower is bigger." />
          <Slider label="Detail" value={atmosphere.cloudDetail} onChange={(cloudDetail) => onAtmosphereChange({ cloudDetail })} min={1} max={8} step={1} precision={0} disabled={off} description="How many layers of noise shape each cloud: 1 is simple blobs, 8 is finely broken up." />
          <Slider label="Feather" value={atmosphere.cloudFeather} onChange={(cloudFeather) => onAtmosphereChange({ cloudFeather })} min={0} max={1} step={0.01} precision={2} disabled={off} description="Wispy, worn edges: finer, turbulent noise wears away only the cloud edges (as Horizon Zero Dawn builds its clouds). 0 is smooth." />
          <Slider label="Banding" value={atmosphere.cloudBanding} onChange={(cloudBanding) => onAtmosphereChange({ cloudBanding })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much the clouds stretch along the latitude lines: 0 is patchy, 1 is banded like a gas giant." />
          <span className="panel-section-title">Distribution</span>
          <Slider label="Latitude strength" value={atmosphere.cloudDistributionStrength} onChange={(cloudDistributionStrength) => onAtmosphereChange({ cloudDistributionStrength })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much latitude decides where clouds form: 0 is scattered everywhere, 1 is only in the bands set below." />
          <Slider label="Equator" value={atmosphere.cloudEquator} onChange={(cloudEquator) => onAtmosphereChange({ cloudEquator })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much cloud gathers around the equator. Latitude strength sets how much these three matter." />
          <Slider label="Mid-latitudes" value={atmosphere.cloudMidLatitudes} onChange={(cloudMidLatitudes) => onAtmosphereChange({ cloudMidLatitudes })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much cloud gathers between about 30 and 60 degrees north and south. Latitude strength sets how much these three matter." />
          <Slider label="Poles" value={atmosphere.cloudPoles} onChange={(cloudPoles) => onAtmosphereChange({ cloudPoles })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much cloud gathers around the poles. Latitude strength sets how much these three matter." />
        </Accordion>
      </div>
      <div className="panel-section-divider" />
      <div className="panel-section">
        <Accordion title="Moon">
          <Toggle label="Moon" value={atmosphere.moon} onChange={(moon) => onAtmosphereChange({ moon })} description="Moons or other planets in the land chunk's sky." />
          <div className="panel-btn-row">
            <button type="button" className="noise-add-layer-btn" onClick={randomizeMoons} disabled={moonOff}>
              <DiceIcon /> Randomize
            </button>
            <IconButton icon={<DiceIcon />} label="Randomize this moon's texture only" onClick={() => updateMoon({ layers: randomMoonLayers() })} disabled={moonOff} />
          </div>
          <Slider label="Moons" value={atmosphere.moonCount} onChange={(moonCount) => onAtmosphereChange({ moonCount })} min={1} max={MAX_MOONS} step={1} precision={0} disabled={moonOff} description="How many moons are in the sky, 1 to 5. Randomize gives them clearly different sizes and surfaces." />
          {atmosphere.moonCount > 1 && (
            <Select label="Moon" value={String(moonIndex)} onChange={(value) => setSelectedMoon(Number(value))} options={moonOptions} description="Which moon the controls below adjust." />
          )}
          <Slider label="Crescent" unit="%" value={atmosphere.moonCrescent} onChange={(moonCrescent) => onAtmosphereChange({ moonCrescent })} min={0} max={100} step={1} precision={0} disabled={moonOff} description="How much of each moon is in shadow: 0 is a full moon, 100 the thinnest crescent." />
          <Dial label="Crescent angle" value={moon.crescentAngle} onChange={(crescentAngle) => updateMoon({ crescentAngle })} disabled={moonOff} description="Turns this moon's crescent round from the sun's side: 0 is lit from the sun." />
          <Slider label="Texture" value={atmosphere.moonTexture} onChange={(moonTexture) => onAtmosphereChange({ moonTexture })} min={0} max={2} step={0.01} precision={2} disabled={moonOff} description="How clearly the surface shows: 0 is pure glow melting into the sky, 1 a solid moon, and above 1 the pattern grows stronger too." />
          <Slider label="Halo" value={atmosphere.moonHalo} onChange={(moonHalo) => onAtmosphereChange({ moonHalo })} min={0} max={3} step={0.01} precision={2} disabled={moonOff} description="A soft light around each moon. Meant to stay subtle; the sky's haze softens it further." />
          <Slider label="Inner glow" value={atmosphere.moonGlow} onChange={(moonGlow) => onAtmosphereChange({ moonGlow })} min={0} max={3} step={0.01} precision={2} disabled={moonOff} description="A soft brightening just inside each moon's lit edge." />
          <Toggle label="Lock colors" value={atmosphere.moonColorsLocked} onChange={(moonColorsLocked) => onAtmosphereChange({ moonColorsLocked })} description="Keeps every moon's colors when Randomize picks new moons." />
          <p className="ui-note">{describeMoonLayers(moon.layers)}</p>
          <Slider label="Size" unit="°" value={moon.size} onChange={(size) => updateMoon({ size })} min={1} max={90} step={0.5} precision={1} disabled={moonOff} description="How large this moon looks, in degrees across." />
          <Slider label="Height" unit="°" value={moon.height} onChange={(height) => updateMoon({ height })} min={0} max={90} step={1} precision={0} disabled={moonOff} description="How high this moon sits above the horizon, in degrees." />
          <Slider label="Direction" unit="°" value={moon.azimuth} onChange={(azimuth) => updateMoon({ azimuth })} min={0} max={360} step={1} precision={0} disabled={moonOff} description="Which way this moon sits around the horizon, in compass degrees." />
          <ColorPicker label="Color" value={moon.color} onChange={(color) => updateMoon({ color })} />
          <ColorPicker label="Second color" value={moon.color2} onChange={(color2) => updateMoon({ color2 })} />
        </Accordion>
      </div>
    </>
  );
}

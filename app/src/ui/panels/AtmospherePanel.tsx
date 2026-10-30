import { Accordion, ColorPicker, Dial, IconButton, Slider } from '../UIElements';
import { colorLockProps, type AtmosphereSettings } from '../../atmosphere/atmosphereSettings';
import { describeMoonLayers, MAX_MOONS, randomMoonLayers, randomMoons, type MoonSettings } from '../../atmosphere/moonTexture';
import { DiceIcon } from '../icons';

// The atmosphere's detail controls on the right panel: the clouds (with the wind that moves them) and the moons. The general
// ones (sky colors, haze, glow) stay in the left panel's Atmosphere section (Dana, 2026-10-27).
interface AtmospherePanelProps {
  atmosphere: AtmosphereSettings;
  onAtmosphereChange: (changes: Partial<AtmosphereSettings>) => void;
}

export function AtmospherePanel({ atmosphere, onAtmosphereChange }: AtmospherePanelProps) {
  const off = !atmosphere.enabled;
  const moonOff = off || !atmosphere.moon;
  const updateMoon = (moonIndex: number, changes: Partial<MoonSettings>) =>
    onAtmosphereChange({ moons: atmosphere.moons.map((each, i) => (i === moonIndex ? { ...each, ...changes } : each)) });
  // New moons: sizes, places in view, surfaces, and colors that go with the sky unless they're locked.
  const randomizeMoons = () =>
    onAtmosphereChange({ moons: randomMoons(atmosphere.moonCount, atmosphere.moons, atmosphere.horizonColor, atmosphere.zenithColor) });
  // All five moons are kept: adding shows the next stored one, and removing moves a moon to the end, out of view.
  const addMoon = () => onAtmosphereChange({ moonCount: Math.min(MAX_MOONS, atmosphere.moonCount + 1) });
  const removeMoon = (moonIndex: number) =>
    onAtmosphereChange({
      moonCount: atmosphere.moonCount - 1,
      moons: [...atmosphere.moons.filter((_, i) => i !== moonIndex), atmosphere.moons[moonIndex]],
    });
  return (
    <>
      <div className="panel-section">
        <Accordion title="Clouds">
          <Slider label="Coverage" value={atmosphere.cloudCoverage} onChange={(cloudCoverage) => onAtmosphereChange({ cloudCoverage })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much of the sky the clouds cover. 0 turns them off." />
          <Slider label="Softness" value={atmosphere.cloudSoftness} onChange={(cloudSoftness) => onAtmosphereChange({ cloudSoftness })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How soft the clouds' edges are: 0 is crisp, 1 is a soft blur." />
          <Slider label="Wind" value={atmosphere.wind} onChange={(wind) => onAtmosphereChange({ wind })} min={0} max={40} step={0.5} precision={1} disabled={off} description="How calm or stormy, on the Beaufort scale: 0 is calm, 3 brings the first whitecaps, 12 is a storm, 40 is Jupiter's jet streams. It moves the clouds and sets the water's waves, which stop growing at 12." />
          <div className="panel-section-divider" />
          <span className="panel-section-title">Shape</span>
          <Slider label="Scale" value={atmosphere.cloudScale} onChange={(cloudScale) => onAtmosphereChange({ cloudScale })} min={0.2} max={4} step={0.05} precision={2} disabled={off} description="How large the clouds are: lower is bigger." />
          <Slider label="Detail" value={atmosphere.cloudDetail} onChange={(cloudDetail) => onAtmosphereChange({ cloudDetail })} min={1} max={8} step={1} precision={0} disabled={off} description="How many layers of noise shape each cloud: 1 is simple blobs, 8 is finely broken up." />
          <Slider label="Feather" value={atmosphere.cloudFeather} onChange={(cloudFeather) => onAtmosphereChange({ cloudFeather })} min={0} max={1} step={0.01} precision={2} disabled={off} description="Wispy, worn edges: finer, turbulent noise wears away only the cloud edges (as Horizon Zero Dawn builds its clouds). 0 is smooth." />
          <Slider label="Banding" value={atmosphere.cloudBanding} onChange={(cloudBanding) => onAtmosphereChange({ cloudBanding })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much the clouds stretch along the latitude lines: 0 is patchy, 1 is banded like a gas giant." />
          <div className="panel-section-divider" />
          <span className="panel-section-title">Distribution</span>
          <Slider label="Latitude strength" value={atmosphere.cloudDistributionStrength} onChange={(cloudDistributionStrength) => onAtmosphereChange({ cloudDistributionStrength })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much latitude decides where clouds form: 0 is scattered everywhere, 1 is only in the bands set below." />
          <Slider label="Equator" value={atmosphere.cloudEquator} onChange={(cloudEquator) => onAtmosphereChange({ cloudEquator })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much cloud gathers around the equator. Latitude strength sets how much these three matter." />
          <Slider label="Mid-latitudes" value={atmosphere.cloudMidLatitudes} onChange={(cloudMidLatitudes) => onAtmosphereChange({ cloudMidLatitudes })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much cloud gathers between about 30 and 60 degrees north and south. Latitude strength sets how much these three matter." />
          <Slider label="Poles" value={atmosphere.cloudPoles} onChange={(cloudPoles) => onAtmosphereChange({ cloudPoles })} min={0} max={1} step={0.01} precision={2} disabled={off} description="How much cloud gathers around the poles. Latitude strength sets how much these three matter." />
          <div className="panel-section-divider" />
          <span className="panel-section-title">Color</span>
          <ColorPicker label="Color" value={atmosphere.cloudColor} onChange={(cloudColor) => onAtmosphereChange({ cloudColor })} {...colorLockProps(atmosphere, 'cloudColor', onAtmosphereChange)} />
          <ColorPicker label="Second color" value={atmosphere.cloudColor2} onChange={(cloudColor2) => onAtmosphereChange({ cloudColor2 })} {...colorLockProps(atmosphere, 'cloudColor2', onAtmosphereChange)} />
        </Accordion>
      </div>
      <div className="panel-section-divider" />
      <div className="panel-section">
        <Accordion
          title="Moons"
          description="Moons or other planets in the land chunk's sky."
          headerSwitch={{ value: atmosphere.moon, onChange: (moon) => onAtmosphereChange({ moon }), label: 'Moons on or off' }}
        >
          <div className="panel-btn-row">
            <button type="button" className="noise-add-layer-btn" onClick={randomizeMoons} disabled={moonOff}>
              <DiceIcon /> Randomize
            </button>
          </div>
          <Slider label="Texture" value={atmosphere.moonTexture} onChange={(moonTexture) => onAtmosphereChange({ moonTexture })} min={0} max={2} step={0.01} precision={2} disabled={moonOff} description="How clearly the surface shows: 0 is pure glow melting into the sky, 1 a solid moon, and above 1 the pattern grows stronger too." />
          <Slider label="Halo" value={atmosphere.moonHalo} onChange={(moonHalo) => onAtmosphereChange({ moonHalo })} min={0} max={3} step={0.01} precision={2} disabled={moonOff} description="A soft light around each moon. Meant to stay subtle; the sky's haze softens it further." />
          <Slider label="Inner glow" value={atmosphere.moonGlow} onChange={(moonGlow) => onAtmosphereChange({ moonGlow })} min={0} max={3} step={0.01} precision={2} disabled={moonOff} description="A soft brightening just inside each moon's lit edge." />
          {atmosphere.moons.slice(0, atmosphere.moonCount).map((moon, i) => (
            <Accordion
              key={i}
              title={`Moon ${i + 1}`}
              nested
              actions={
                <button type="button" className="panel-text-btn panel-text-btn--delete" onClick={() => removeMoon(i)} disabled={atmosphere.moonCount === 1} aria-label={`Remove moon ${i + 1}`}>
                  ×
                </button>
              }
            >
              <div className="panel-btn-row">
                <IconButton icon={<DiceIcon />} label="Randomize this moon's texture only" onClick={() => updateMoon(i, { layers: randomMoonLayers() })} disabled={moonOff} />
              </div>
              <Slider label="Crescent" unit="%" value={moon.crescent} onChange={(crescent) => updateMoon(i, { crescent })} min={0} max={100} step={1} precision={0} disabled={moonOff} description="How much of this moon is in shadow: 0 is a full moon, 100 the thinnest crescent." />
              <Dial label="Crescent angle" value={moon.crescentAngle} onChange={(crescentAngle) => updateMoon(i, { crescentAngle })} disabled={moonOff} description="Turns this moon's crescent round from the sun's side: 0 is lit from the sun." />
              <Slider label="Size" unit="°" value={moon.size} onChange={(size) => updateMoon(i, { size })} min={1} max={90} step={0.5} precision={1} disabled={moonOff} description="How large this moon looks, in degrees across." />
              <Slider label="Height" unit="°" value={moon.height} onChange={(height) => updateMoon(i, { height })} min={0} max={90} step={1} precision={0} disabled={moonOff} description="How high this moon sits above the horizon, in degrees." />
              <Slider label="Direction" unit="°" value={moon.azimuth} onChange={(azimuth) => updateMoon(i, { azimuth })} min={0} max={360} step={1} precision={0} disabled={moonOff} description="Which way this moon sits around the horizon, in compass degrees." />
              <p className="ui-note">{describeMoonLayers(moon.layers)}</p>
              <div className="panel-section-divider" />
              <span className="panel-section-title">Color</span>
              <ColorPicker label="Color" value={moon.color} onChange={(color) => updateMoon(i, { color })} locked={moon.colorLocked} onLockChange={(colorLocked) => updateMoon(i, { colorLocked })} />
              <ColorPicker label="Second color" value={moon.color2} onChange={(color2) => updateMoon(i, { color2 })} locked={moon.color2Locked} onLockChange={(color2Locked) => updateMoon(i, { color2Locked })} />
            </Accordion>
          ))}
          <div className="panel-btn-row">
            <button type="button" className="noise-add-layer-btn" onClick={addMoon} disabled={moonOff || atmosphere.moonCount === MAX_MOONS}>
              + Add moon
            </button>
          </div>
        </Accordion>
      </div>
    </>
  );
}

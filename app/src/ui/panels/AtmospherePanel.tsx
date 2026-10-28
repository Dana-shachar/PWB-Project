import { Accordion, ColorPicker, Slider, Toggle } from '../UIElements';
import type { AtmosphereSettings } from '../../atmosphere/atmosphereSettings';

// The atmosphere's detail controls on the right panel: wind, cloud shape and distribution, and the moon. The general
// ones (sky colors, haze, glow) stay in the left panel's Atmosphere section (Dana, 2026-10-27).
interface AtmospherePanelProps {
  atmosphere: AtmosphereSettings;
  onAtmosphereChange: (changes: Partial<AtmosphereSettings>) => void;
}

export function AtmospherePanel({ atmosphere, onAtmosphereChange }: AtmospherePanelProps) {
  const off = !atmosphere.enabled;
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
          <Toggle label="Moon" value={atmosphere.moon} onChange={(moon) => onAtmosphereChange({ moon })} description="A moon or second planet in the land chunk's sky." />
          <Slider label="Size" unit="°" value={atmosphere.moonSize} onChange={(moonSize) => onAtmosphereChange({ moonSize })} min={1} max={40} step={0.5} precision={1} disabled={off || !atmosphere.moon} description="How large the moon looks, in degrees across." />
          <Slider label="Height" unit="°" value={atmosphere.moonHeight} onChange={(moonHeight) => onAtmosphereChange({ moonHeight })} min={0} max={90} step={1} precision={0} disabled={off || !atmosphere.moon} description="How high the moon sits above the horizon, in degrees." />
          <ColorPicker label="Color" value={atmosphere.moonColor} onChange={(moonColor) => onAtmosphereChange({ moonColor })} />
        </Accordion>
      </div>
    </>
  );
}

import { Accordion, DualHueSlider, Slider } from '../UIElements';
import { LIFE_SATURATION, landMiddleColor, lifeColors, type BiomeSettings, type LifeType, type LifeTypeKey } from '../../biome/plantTypes';
import type { ColorStop } from '../../planet/colorRamp';
import { DiceIcon } from '../icons';

// The Biome stage's right panel: the granular controls per life type (biome/plantTypes.ts). The main ones live in the
// left panel's Biome section.
interface BiomePanelProps {
  biome: BiomeSettings;
  onBiomeChange: (changes: Partial<BiomeSettings>) => void;
  colorStops: ColorStop[]; // the land ramp, which life's colors turn from
}

const LIFE_LABELS: Record<LifeTypeKey, string> = { algae: 'Algae', moss: 'Moss' };


// A life type's swatch, sRGB HSL as lifeColors gives it.
const lifeSwatch = (hue: number, saturation: number, lightness: number) => `hsl(${((hue % 360) + 360) % 360}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`;

export function BiomePanel({ biome, onBiomeChange, colorStops }: BiomePanelProps) {
  const land = landMiddleColor(colorStops);
  // Previews on this planet's land color, as the shader derives it.
  const preview = (look: LifeType['look'], turn: number, key: LifeTypeKey = 'moss') => {
    const colors = lifeColors({ ...look, hueTurn: turn, saturationShare: LIFE_SATURATION[key] }, land);
    return lifeSwatch(colors.hue, (colors.saturation[0] + colors.saturation[1]) / 2, (colors.lightness[0] + colors.lightness[1]) / 2);
  };
  const hueTrack = (look: LifeType['look'], key: LifeTypeKey) => {
    const stops: string[] = [];
    for (let turn = -180; turn <= 180; turn += 30) stops.push(preview(look, turn, key));
    return `linear-gradient(to right, ${stops.join(', ')})`;
  };
  const update = (key: LifeTypeKey, changes: Partial<LifeType>) => onBiomeChange({ [key]: { ...biome[key], ...changes } });
  return (
    <div className="panel-section">
      {(Object.keys(LIFE_LABELS) as LifeTypeKey[]).map((key) => {
        const type = biome[key];
        const look = type.look;
        const brightness = (look.lightnessShare[0] + look.lightnessShare[1]) / 2;
        return (
          <Accordion key={key} title={LIFE_LABELS[key]} defaultOpen>
            <DualHueSlider
              label="Hue"
              value={look.hueTurn}
              secondOffset={look.hueSpread}
              onChange={(hueTurn) => update(key, { look: { ...look, hueTurn } })}
              onSecondOffsetChange={(offset) => update(key, { look: { ...look, hueSpread: Math.min(Math.abs(offset), 180) } })}
              trackBackground={hueTrack(look, key)}
              swatchColor={preview(look, look.hueTurn, key)}
              secondSwatchColor={preview(look, look.hueTurn + look.hueSpread, key)}
              description="Its color as a turn from the land's own hue (0 is the land's hue), in the land's own saturation and lightness."
            />
            <Slider
              label="Brightness"
              value={brightness}
              onChange={(value) => update(key, { look: { ...look, lightnessShare: [look.lightnessShare[0] * (value / brightness), look.lightnessShare[1] * (value / brightness)] } })}
              min={0.2}
              max={2}
              step={0.01}
              precision={2}
              description="How light it is against the land: 1 is the land's own lightness."
            />
            <Slider
              label="Moisture need"
              value={type.moisture.idealMin}
              onChange={(need) => update(key, { moisture: { ...type.moisture, idealMin: need, min: Math.max(need - 0.2, 0) } })}
              min={0}
              max={2}
              step={0.01}
              precision={2}
              description="How wet the ground must be: low tolerates dry ground, 1 needs soaked ground, above 1 only at and under water. Evolution can lower a variant's need by up to 0.4, so the top of the range offsets that."
            />
            <Slider
              label="Shade need"
              value={1 - type.sun.idealMax}
              onChange={(need) => update(key, { sun: { ...type.sun, idealMax: 1 - need, max: Math.min(1.01, 1.3 - need) } })}
              min={0}
              max={1}
              step={0.01}
              precision={2}
              description="How much shade it needs: 0 thrives in full sun, 1 only in deep shade."
            />
            {key === 'algae' && (
              <Slider
                label="Shore reach"
                value={biome.shoreReach}
                onChange={(shoreReach) => onBiomeChange({ shoreReach })}
                min={10}
                max={5000}
                scale="log"
                step={1}
                precision={0}
                description="How far from the water algae can grow, in meters. It also needs low ground: Moisture need sets how high above the water."
              />
            )}
          </Accordion>
        );
      })}
      <Accordion
        title="Evolution"
        defaultOpen
        headerSwitch={{ value: biome.evolve, onChange: (evolve) => onBiomeChange({ evolve }), label: 'Evolution on or off' }}
      >
        <Slider
          label="Variation"
          value={biome.variation}
          onChange={(variation) => onBiomeChange({ variation })}
          min={0}
          max={2}
          step={0.01}
          precision={2}
          description="How different the variants look from their type: 0 keeps one color, 1 is the default, 2 is wide. Changes the look only, instantly."
        />
        <Slider
          label="Mutation rate"
          value={biome.mutationRate}
          onChange={(mutationRate) => onBiomeChange({ mutationRate })}
          min={0}
          max={1}
          step={0.01}
          precision={2}
          description="How often a variant's genes change each era: low drifts slowly, high changes fast."
        />
        <button
          type="button"
          className="noise-add-layer-btn ui-tooltip-anchor"
          disabled={!biome.evolve}
          onClick={() => onBiomeChange({ seed: Math.floor(Math.random() * 1e9) })}
        >
          <DiceIcon /> Shuffle
          <span className="ui-tooltip">Replays evolution with a new seed, so different variants win</span>
        </button>
      </Accordion>
    </div>
  );
}

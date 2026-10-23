import { useRef, useState } from 'react';
import { Popup, Select, Slider, Toggle } from './UIElements';
import { hasMask, NOISE_TYPE_OPTIONS, type NoiseLayer, type NoiseType } from '../map/heightmap';
import { DiceIcon, MaskIcon } from './icons';
import { randomForRange, sliderRange } from '../map/noiseRanges';

interface MaskControlsProps {
  layer: NoiseLayer;
  // How many layers this edit applies to, shown when it is more than one.
  editedCount: number;
  onUpdate: (patch: Partial<NoiseLayer>) => void;
}

// One layer's mask controls, shown in the layer row's popup. The mask is the
// layer's own pattern, so it has its own type, seed and frequency.
export function MaskControls({ layer, editedCount, onUpdate }: MaskControlsProps) {
  return (
    <>
      <span className="panel-section-title">{editedCount > 1 ? `Mask: editing ${editedCount} layers` : `Mask: ${layer.name}`}</span>
      <Select
        label="Mask pattern"
        value={layer.maskNoiseType}
        onChange={(value) => onUpdate({ maskNoiseType: value as NoiseType })}
        options={NOISE_TYPE_OPTIONS}
        description="Limits where this layer shows. Bright areas of the mask pattern let it through, dark areas hide it. None turns the mask off."
      />
      {hasMask(layer) && (
        <>
          <Slider
            label="Seed"
            value={layer.maskSeed}
            onChange={(value) => onUpdate({ maskSeed: value })}
            {...sliderRange('seed')}
            precision={0}
            description="Which random variation of the mask pattern to use, so the covered areas move."
          />
          <Slider
            label="Frequency"
            value={layer.maskFrequency}
            onChange={(value) => onUpdate({ maskFrequency: value })}
            {...sliderRange('frequency')}
            description="How many mask features fit across the planet. Low values make broad regions, high values make small patches."
          />
          <Toggle
            label="Invert"
            value={layer.maskInvert}
            onChange={(value) => onUpdate({ maskInvert: value })}
            description="Flips the mask, so this layer shows where the pattern is dark instead of bright. Coverage then counts the area shown."
          />
          <Slider
            label="Coverage"
            unit="%"
            value={layer.maskCoverage}
            onChange={(value) => onUpdate({ maskCoverage: value })}
            min={0}
            max={100}
            step={1}
            precision={0}
            description="How much of the planet the mask lets this layer through. 0 hides it everywhere, 100 shows it everywhere, 50 shows it over about half the planet."
          />
          <Slider
            label="Softness"
            unit="%"
            value={layer.maskSoftness}
            onChange={(value) => onUpdate({ maskSoftness: value })}
            min={0}
            max={100}
            step={1}
            precision={0}
            description="How wide the fade is where the mask edge meets. Low gives sharp edges and steeper slopes, high gives gradual blends and gentler slopes."
          />
          <button
            type="button"
            className="noise-add-layer-btn ui-tooltip-anchor"
            onClick={() => onUpdate({ maskSeed: randomForRange('seed') })}
          >
            <DiceIcon /> Shuffle
            <span className="ui-tooltip">Rerolls the mask pattern with a new seed, so the covered areas move</span>
          </button>
        </>
      )}
    </>
  );
}

interface LayerMaskButtonProps {
  layer: NoiseLayer;
  selectedLayerIds: string[];
  onUpdateLayers: (ids: string[], patch: Partial<NoiseLayer>) => void;
}

// The mask icon beside a layer row's eye: lit when the layer's mask is on,
// opens its mask controls in a popup. From a row that is part of a multi-layer
// selection the popup edits every selected layer, so their masks line up.
export function LayerMaskButton({ layer, selectedLayerIds, onUpdateLayers }: LayerMaskButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const editedIds = selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id) ? selectedLayerIds : [layer.id];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={'panel-text-btn noise-layer-row-visibility ui-tooltip-anchor' + (hasMask(layer) ? ' noise-layer-row-mask--active' : '')}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(!open)}
        aria-label="Layer mask"
      >
        <MaskIcon />
        <span className="ui-tooltip">Mask: limit where this layer shows</span>
      </button>
      <Popup open={open} anchorRef={buttonRef} onClose={() => setOpen(false)}>
        <MaskControls layer={layer} editedCount={editedIds.length} onUpdate={(patch) => onUpdateLayers(editedIds, patch)} />
      </Popup>
    </>
  );
}

import { useRef, useState, type RefObject } from 'react';
import { Slider, Select } from './UIElements';
import { MapView } from '../map/MapView';
import { NOISE_TYPE_OPTIONS, BLEND_MODE_OPTIONS, type NoiseLayer, type NoiseType, type BlendMode } from '../map/heightmap';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';

interface NoisePanelProps {
  layers: NoiseLayer[];
  selectedLayerId: string;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  onReorderLayer: (draggedId: string, targetId: string) => void;
  onUpdateSelectedLayer: (patch: Partial<NoiseLayer>) => void;
  brushRadiusPx: number;
  onBrushRadiusPxChange: (value: number) => void;
  brushValue: number; // -1 (erase/black) .. 1 (paint/white)
  onBrushValueChange: (value: number) => void;
  feather: number; // 0=hard edge, 1=fully soft — a fraction of brushRadiusPx (Photoshop-style Hardness); never changes brush size
  onFeatherChange: (value: number) => void;
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
}

const EXPANDED_CANVAS_SIZE_PX = 800; // TODO(DS): arbitrary placeholder — richer brush controls for this mode land later, see ROADMAP.md

// Content for the right panel's "Noise" tab (see RightPanel.tsx for the tab
// bar itself). Photoshop-style layer stack (Dana, 2026-09-15): bottom of
// `layers` is the base, applied first; each layer above composites onto the
// running result with its own blend mode + opacity. The visual list below
// renders top-of-stack first (reversed array order) to match Photoshop's
// own panel convention, even though the underlying array stays bottom-first.
export function NoisePanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onReorderLayer,
  onUpdateSelectedLayer,
  brushRadiusPx,
  onBrushRadiusPxChange,
  brushValue,
  onBrushValueChange,
  feather,
  onFeatherChange,
  sceneHandleRef,
}: NoisePanelProps) {
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isExpanded, setIsExpanded] = useState(false);

  // Hand-rolled pointer drag (matches Slider's click-drag-to-scrub pattern,
  // ported from active-geometry's makeScrubber) — a plain click (no
  // movement past the threshold) selects the layer instead of reordering.
  function handleRowMouseDown(event: React.MouseEvent, layerId: string) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let hasDragged = false;

    function onMove(moveEvent: MouseEvent) {
      if (!hasDragged) {
        if (Math.abs(moveEvent.clientX - startX) < 4 && Math.abs(moveEvent.clientY - startY) < 4) return;
        hasDragged = true;
      }
      let targetId: string | null = null;
      rowRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) targetId = id;
      });
      if (targetId && targetId !== layerId) onReorderLayer(layerId, targetId);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!hasDragged) onSelectLayer(layerId);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title-row">
          <div className="panel-section-title">Noise canvas</div>
          <button type="button" className="panel-text-btn" onClick={() => setIsExpanded(true)}>
            Expand
          </button>
        </div>
        {/* TODO(DS): radius only for now — strength/size/shape come later, per Dana's 2026-09-15 simplification. */}
        <Slider
          label="Brush radius"
          unit="px"
          value={brushRadiusPx}
          onChange={onBrushRadiusPxChange}
          min={1}
          max={300}
          step={1}
          precision={0}
        />
        <Slider
          label="Brush"
          trackClassName="ui-slider-track--bw"
          value={brushValue}
          onChange={onBrushValueChange}
          min={-1}
          max={1}
          step={0.01}
        />
        <Slider label="Feather" value={feather} onChange={onFeatherChange} min={0} max={1} step={0.01} />
        <MapView
          layers={layers}
          selectedLayerId={selectedLayerId}
          brushRadiusPx={brushRadiusPx}
          brushValue={brushValue}
          feather={feather}
          sceneHandleRef={sceneHandleRef}
        />
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <div className="panel-section-title">Layers</div>
        {layers
          .slice()
          .reverse()
          .map((layer) => (
            <div
              key={layer.id}
              ref={(el) => {
                if (el) rowRefs.current.set(layer.id, el);
                else rowRefs.current.delete(layer.id);
              }}
              className={'noise-layer-row' + (layer.id === selectedLayerId ? ' noise-layer-row--selected' : '')}
              onMouseDown={(event) => handleRowMouseDown(event, layer.id)}
            >
              <span className="noise-layer-row-label">
                {NOISE_TYPE_OPTIONS.find((option) => option.value === layer.noiseType)?.label ?? layer.noiseType}
              </span>
              <button
                type="button"
                className="panel-text-btn"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onDeleteLayer(layer.id)}
                disabled={layers.length === 1}
              >
                ×
              </button>
            </div>
          ))}
        <button type="button" className="noise-add-layer-btn" onClick={onAddLayer}>
          + Add layer
        </button>
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <div className="panel-section-title">Noise</div>
        <Select
          label="Noise type"
          value={selectedLayer.noiseType}
          onChange={(value) => onUpdateSelectedLayer({ noiseType: value as NoiseType })}
          options={NOISE_TYPE_OPTIONS}
        />
        <Slider
          label="Seed"
          value={selectedLayer.seed}
          onChange={(value) => onUpdateSelectedLayer({ seed: value })}
          min={0}
          max={1000}
          step={1}
          precision={0}
        />
        <Slider
          label="Frequency"
          value={selectedLayer.frequency}
          onChange={(value) => onUpdateSelectedLayer({ frequency: value })}
          min={0.5}
          max={20}
          step={0.1}
        />
        <Slider
          label="Opacity"
          value={selectedLayer.opacity}
          onChange={(value) => onUpdateSelectedLayer({ opacity: value })}
          min={0}
          max={1}
          step={0.01}
        />
        <Select
          label="Blend mode"
          value={selectedLayer.blendMode}
          onChange={(value) => onUpdateSelectedLayer({ blendMode: value as BlendMode })}
          options={BLEND_MODE_OPTIONS}
        />
      </div>

      {(selectedLayer.noiseType === 'octaves' ||
        selectedLayer.noiseType === 'terrace' ||
        selectedLayer.noiseType === 'domainWarp') && (
        <>
          <div className="panel-section-divider" />
          <div className="panel-section">
            <div className="panel-section-title">Modifiers</div>
            {selectedLayer.noiseType === 'octaves' && (
              <>
                <Slider
                  label="Octaves"
                  value={selectedLayer.octaves}
                  onChange={(value) => onUpdateSelectedLayer({ octaves: value })}
                  min={1}
                  max={8}
                  step={1}
                  precision={0}
                />
                <Slider
                  label="Persistence"
                  value={selectedLayer.persistence}
                  onChange={(value) => onUpdateSelectedLayer({ persistence: value })}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Lacunarity"
                  value={selectedLayer.lacunarity}
                  onChange={(value) => onUpdateSelectedLayer({ lacunarity: value })}
                  min={1}
                  max={4}
                  step={0.1}
                />
              </>
            )}
            {selectedLayer.noiseType === 'terrace' && (
              <Slider
                label="Terrace steps"
                value={selectedLayer.terraceSteps}
                onChange={(value) => onUpdateSelectedLayer({ terraceSteps: value })}
                min={2}
                max={20}
                step={1}
                precision={0}
              />
            )}
            {selectedLayer.noiseType === 'domainWarp' && (
              <Slider
                label="Warp strength"
                value={selectedLayer.warpStrength}
                onChange={(value) => onUpdateSelectedLayer({ warpStrength: value })}
                min={0}
                max={4}
                step={0.1}
              />
            )}
          </div>
        </>
      )}

      {isExpanded && (
        <div className="noise-canvas-overlay">
          <div className="noise-canvas-overlay-header">
            <span>Noise canvas</span>
            <button type="button" className="panel-text-btn" onClick={() => setIsExpanded(false)}>
              Collapse
            </button>
          </div>
          <MapView
            layers={layers}
            selectedLayerId={selectedLayerId}
            brushRadiusPx={brushRadiusPx}
            brushValue={brushValue}
            feather={feather}
            sceneHandleRef={sceneHandleRef}
            sizePx={EXPANDED_CANVAS_SIZE_PX}
          />
        </div>
      )}
    </>
  );
}

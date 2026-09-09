import { Slider, ColorPicker } from './UIElements';

interface PanelProps {
  // Scene controls
  ambientLight: number;
  onAmbientLightChange: (value: number) => void;
  lightDirX: number;
  onLightDirXChange: (value: number) => void;
  lightDirY: number;
  onLightDirYChange: (value: number) => void;
  gridDivisions: number;
  onGridDivisionsChange: (value: number) => void;
  // Planet controls
  radiusKm: number;
  onRadiusKmChange: (value: number) => void;
  baseColor: string;
  onBaseColorChange: (value: string) => void;
}

// Left-side control panel, divided into titled sections — ported from
// active-geometry-project's right-panel pattern (section() + ag-panel-section:
// a bold titled group, sections separated by a divider), mirrored to the left
// per this project's layout. Lighting slider ranges are also ported directly
// (ambient 0-0.5/step 0.01, light X/Y -10-10/step 0.1) — the two things NOT
// borrowed (no convention exists for them in active-geometry) are the color
// picker and the grid-resolution range, both flagged where they're defined.
export function Panel({
  ambientLight,
  onAmbientLightChange,
  lightDirX,
  onLightDirXChange,
  lightDirY,
  onLightDirYChange,
  gridDivisions,
  onGridDivisionsChange,
  radiusKm,
  onRadiusKmChange,
  baseColor,
  onBaseColorChange,
}: PanelProps) {
  return (
    <div className="panel-outer">
      <div className="panel-content">
        <div className="panel-section">
          <div className="panel-section-title">Scene controls</div>
          <Slider
            label="Ambient light"
            value={ambientLight}
            onChange={onAmbientLightChange}
            min={0}
            max={0.5}
            step={0.01}
          />
          <Slider
            label="X pos light"
            value={lightDirX}
            onChange={onLightDirXChange}
            min={-10}
            max={10}
            step={0.1}
          />
          <Slider
            label="Y pos light"
            value={lightDirY}
            onChange={onLightDirYChange}
            min={-10}
            max={10}
            step={0.1}
          />
          {/* TODO(DS): grid resolution range not borrowed from active-geometry — it has no grid at all */}
          <Slider
            label="Grid resolution"
            value={gridDivisions}
            onChange={onGridDivisionsChange}
            min={10}
            max={200}
            step={5}
            precision={0}
          />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Planet controls</div>
          <Slider
            label="Radius"
            unit="km"
            value={radiusKm}
            onChange={onRadiusKmChange}
            min={1000}
            max={15000}
            step={100}
            precision={0}
          />
          <ColorPicker label="Base color" value={baseColor} onChange={onBaseColorChange} />
        </div>
      </div>
    </div>
  );
}

import { Slider, ColorPicker, Toggle, Select, Accordion } from './UIElements';
import type { ProjectSummary } from '../firebase/storage';

const DISPLAY_MODE_OPTIONS = [
  { value: 'shaded', label: 'Shaded' },
  { value: 'wireframe', label: 'Wireframe' },
];

// Sentinel value for the Project dropdown's "+ New Project" option — never
// a real Firestore doc id, so it can't collide with one.
const NEW_PROJECT_OPTION = '__new__';

interface PanelProps {
  // Scene controls
  ambientLight: number;
  onAmbientLightChange: (value: number) => void;
  lightDirX: number;
  onLightDirXChange: (value: number) => void;
  lightDirY: number;
  onLightDirYChange: (value: number) => void;
  gridSpacing: number;
  onGridSpacingChange: (value: number) => void;
  gridVisible: boolean;
  onGridVisibleChange: (value: boolean) => void;
  // Planet controls
  radiusKm: number;
  onRadiusKmChange: (value: number) => void;
  baseColor: string;
  onBaseColorChange: (value: string) => void;
  displayMode: string; // 'shaded' | 'wireframe'
  onDisplayModeChange: (value: string) => void;
  // Edit controls
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
  // Project settings
  projects: ProjectSummary[];
  currentPlanetId: string | null; // null = a fresh, not-yet-saved planet
  currentPlanetName: string | null;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  onRenameProject: () => void;
}

// Left-side control panel, divided into titled sections — ported from
// active-geometry-project's right-panel pattern (section() + ag-panel-section:
// a bold titled group, sections separated by a divider), mirrored to the left
// per this project's layout. Lighting slider ranges are also ported directly
// (ambient 0-0.5/step 0.01, light X/Y -10-10/step 0.1) — the two things NOT
// borrowed (no convention exists for them in active-geometry) are the color
// picker and the grid-spacing range, both flagged where they're defined.
//
// "Project Settings" and "Edit" are collapsible (Dana, 2026-09-22 — they
// don't need to stay visible all the time), unlike Scene/Planet controls.
export function Panel({
  ambientLight,
  onAmbientLightChange,
  lightDirX,
  onLightDirXChange,
  lightDirY,
  onLightDirYChange,
  gridSpacing,
  onGridSpacingChange,
  gridVisible,
  onGridVisibleChange,
  radiusKm,
  onRadiusKmChange,
  baseColor,
  onBaseColorChange,
  displayMode,
  onDisplayModeChange,
  canUndo,
  onUndo,
  onReset,
  projects,
  currentPlanetId,
  onSelectProject,
  onNewProject,
  onSaveProject,
  onRenameProject,
}: PanelProps) {
  const projectOptions = [
    ...projects.map((project) => ({ value: project.id, label: project.name })),
    { value: NEW_PROJECT_OPTION, label: '+ New Project' },
  ];

  function handleProjectSelect(value: string) {
    if (value === NEW_PROJECT_OPTION) {
      onNewProject();
    } else {
      onSelectProject(value);
    }
  }

  return (
    <div className="panel-outer">
      <div className="panel-content">
        <div className="panel-section">
          <Accordion title="Project Settings">
            <Select
              label="Planet"
              value={currentPlanetId ?? NEW_PROJECT_OPTION}
              onChange={handleProjectSelect}
              options={projectOptions}
            />
            <button type="button" className="panel-text-btn" onClick={onRenameProject} disabled={currentPlanetId === null}>
              Rename
            </button>
            <button type="button" className="noise-add-layer-btn" onClick={onSaveProject}>
              Save
            </button>
          </Accordion>
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <Accordion title="Edit">
            {/* Mirrors the Cmd+Z/Ctrl+Z shortcut (see App.tsx) — undoes the single
                most recent paint stroke, regardless of which layer it's on. */}
            <button type="button" className="noise-add-layer-btn" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
            {/* Clears the current planet back to blank without switching which
                saved planet is open — different from "+ New Project" above. */}
            <button type="button" className="noise-add-layer-btn" onClick={onReset}>
              Reset
            </button>
          </Accordion>
        </div>

        <div className="panel-section-divider" />

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
          {/* TODO(DS): grid spacing range not borrowed from active-geometry — it has no shader-plane grid */}
          <Slider
            label="Grid spacing"
            value={gridSpacing}
            onChange={onGridSpacingChange}
            min={1}
            max={50}
            step={1}
            precision={0}
          />
          <Toggle label="Grid lines" value={gridVisible} onChange={onGridVisibleChange} />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Planet controls</div>
          <Select
            label="Display"
            value={displayMode}
            onChange={onDisplayModeChange}
            options={DISPLAY_MODE_OPTIONS}
          />
          <Slider
            label="Radius"
            unit="km"
            value={radiusKm}
            onChange={onRadiusKmChange}
            min={1000}
            max={100000}
            step={100}
            precision={0}
          />
          <ColorPicker label="Base color" value={baseColor} onChange={onBaseColorChange} />
        </div>
      </div>
    </div>
  );
}

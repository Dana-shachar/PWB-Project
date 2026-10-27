// The left-panel pipeline-stage menu's stage list — the structural response
// to class feedback that the project "reads as 3D software, not a
// procedural system" (Dana, 2026-09-30/2026-10-07; full reasoning in
// ROADMAP.md's "Procedural System Feedback" section). Shared between
// ui/Panel.tsx (renders the rows) and App.tsx/ui/RightPanel.tsx (own/read
// which one is active) so the list isn't duplicated across files.
//
// Color Texturing is deliberately not one of these — Dana, 2026-10-07:
// "it's a general menu like the lighting and planet controls" — it lives
// with the general settings instead (ROADMAP.md, Stage 11).
export type PipelineStage = 'terrain' | 'erosion' | 'atmosphere' | 'biome' | 'population' | 'events';

// hasTimeline: whether this stage's content plays out over time and gets the
// global bottom timeline dock (App.tsx) rather than a static settings panel.
// Only Erosion has real timeline content today; a future time-based stage
// (Atmosphere, Events) just flips this on rather than rebuilding the dock.
export const PIPELINE_STAGES: { key: PipelineStage; label: string; hasTimeline?: boolean }[] = [
  { key: 'terrain', label: 'Terrain' },
  { key: 'erosion', label: 'Erosion', hasTimeline: true },
  // Climate became Atmosphere (Dana, 2026-10-27); selected from its own left-panel section.
  { key: 'atmosphere', label: 'Atmosphere' },
  { key: 'biome', label: 'Biome' },
  { key: 'population', label: 'Population' },
  { key: 'events', label: 'Events' },
];

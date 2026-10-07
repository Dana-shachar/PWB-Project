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
export type PipelineStage = 'terrain' | 'erosion' | 'climate' | 'biome' | 'population' | 'events';

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: 'terrain', label: 'Terrain' },
  { key: 'erosion', label: 'Erosion' },
  { key: 'climate', label: 'Climate' },
  { key: 'biome', label: 'Biome' },
  { key: 'population', label: 'Population' },
  { key: 'events', label: 'Events' },
];

import { useRef, useState } from 'react';
import { createDefaultLayer, VORONOI_DISTANCE_OPTIONS, FRACTAL_TYPE_OPTIONS, type NoiseLayer, type NoiseType } from './heightmap';
import { randomForRange } from './noiseRanges';

function randomFrom<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

// Randomize's drivers (randomizeTerrain): how often one goes extreme, each control's wobble around its driver, and the
// frequency at which a layer keeps its full rolled Height. Inferred, TUNABLE.
const EXTREME_CHANCE = 0.5;
const DRIVER_JITTER = 0.15;
const HEIGHT_REFERENCE_FREQUENCY = 4;
// What each layer is for, when Randomize builds the stack (randomizeTerrain). Frequencies are on the slider's scale;
// Heights are before the frequency rule shrinks them. Inferred, TUNABLE.
type TerrainRole = 'continents' | 'mountains' | 'detail' | 'feature';
const TERRAIN_ROLES: Record<TerrainRole, { noiseTypes: NoiseType[]; frequency: [number, number]; height: [number, number] }> = {
  continents: { noiseTypes: ['perlin', 'simplex'], frequency: [0.8, 2.5], height: [0.6, 1.8] },
  mountains: { noiseTypes: ['perlin', 'simplex'], frequency: [2, 6], height: [0.4, 1.6] },
  detail: { noiseTypes: ['perlin', 'simplex', 'voronoi'], frequency: [6, 14], height: [0.2, 0.8] },
  feature: { noiseTypes: ['voronoi', 'perlin'], frequency: [1.5, 5], height: [0.3, 1] },
};
// Masks on every layer but the base: how often, and a broad pattern (lower frequency than terrain), covering 25 to 75%.
const MASK_CHANCE = 0.7;
const MASK_FREQUENCY: [number, number] = [0.5, 4];
const MASK_COVERAGE: [number, number] = [25, 75];
const MASK_SOFTNESS: [number, number] = [10, 50];

function formatLayerName(number: number): string {
  return `Layer ${String(number).padStart(2, '0')}`;
}

// Owns the layer stack itself and its CRUD operations — no knowledge of
// painting or persistence, see map/2Dbrush.ts and project/saveProject.ts
// for those. See ISSUES.md, 2026-09-22, for why this was split out of
// App.tsx.
//
// Multi-select (Dana, 2026-09-23): click a row selects it exclusively,
// shift+click adds/removes it — same convention as scene/sharedGumball.ts's
// pane selection. `selectedLayerIds`' *last* entry is the "primary" one —
// whichever slider values are shown, and what painting targets (see
// ui/NoisePanel.tsx, map/MapView.tsx) — while editing any control applies
// the change to every selected layer at once (updateSelectedLayer, below).
export function useNoiseLayers(initialLayerId: string) {
  // Ever-incrementing — never reused after a delete, so deleting "Layer 02"
  // and adding a new one gives "Layer 03", not another "Layer 02" (Dana,
  // 2026-09-22's original spec).
  const nextLayerNumberRef = useRef(1);
  const [layers, setLayers] = useState<NoiseLayer[]>([
    createDefaultLayer(initialLayerId, formatLayerName(nextLayerNumberRef.current++)),
  ]);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([initialLayerId]);

  function handleLayerClick(id: string, event: { shiftKey: boolean }) {
    setSelectedLayerIds((previous) => {
      if (!event.shiftKey) return [id];
      if (previous.includes(id)) {
        const next = previous.filter((selected) => selected !== id);
        return next.length > 0 ? next : previous; // never empty
      }
      return [...previous, id]; // newly added becomes the primary (last) one
    });
  }

  function addLayer() {
    const id = crypto.randomUUID();
    const name = formatLayerName(nextLayerNumberRef.current++);
    setLayers([...layers, createDefaultLayer(id, name)]); // appended at the end — top of the stack
    setSelectedLayerIds([id]); // a fresh layer is selected exclusively, not added to an existing multi-selection
  }

  // Double-click a layer's name to rename it (ui/NoisePanel.tsx) — always
  // targets the one row clicked, independent of the current selection, same
  // reasoning as toggleLayerVisible below.
  function renameLayer(id: string, name: string) {
    setLayers(layers.map((layer) => (layer.id === id ? { ...layer, name } : layer)));
  }

  function deleteLayer(id: string) {
    if (layers.length === 1) return; // always keep at least one layer
    const remaining = layers.filter((layer) => layer.id !== id);
    setLayers(remaining);
    setSelectedLayerIds((previous) => {
      const next = previous.filter((selected) => selected !== id);
      return next.length > 0 ? next : [remaining[remaining.length - 1].id];
    });
  }

  // Moves draggedId to targetId's position in the stack — drag-to-reorder,
  // called continuously as the pointer moves over other rows in NoisePanel.
  function reorderLayer(draggedId: string, targetId: string) {
    const draggedIndex = layers.findIndex((layer) => layer.id === draggedId);
    const targetIndex = layers.findIndex((layer) => layer.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
    const reordered = [...layers];
    const [dragged] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, dragged);
    setLayers(reordered);
  }

  // Batch edit — applies to every currently-selected layer, not just one,
  // overwriting whatever each had individually for the fields in `patch`.
  function updateSelectedLayer(patch: Partial<NoiseLayer>) {
    setLayers(layers.map((layer) => (selectedLayerIds.includes(layer.id) ? { ...layer, ...patch } : layer)));
  }

  // Edits the given layers by id, independent of the selection, for controls
  // that act on the row they sit on (the mask popup).
  function updateLayers(ids: string[], patch: Partial<NoiseLayer>) {
    setLayers(layers.map((layer) => (ids.includes(layer.id) ? { ...layer, ...patch } : layer)));
  }

  // Photoshop-style hide/unhide (Dana, 2026-09-23) — the row's own eye
  // toggle, independent of selection: flips exactly the layer clicked,
  // regardless of which layer(s) are currently selected for editing.
  function toggleLayerVisible(id: string) {
    setLayers(layers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)));
  }

  // Randomizes every generation parameter on every layer at once, independent
  // of selection — not just the seed (Dana, 2026-10-13: "i need it to
  // randomize everything, not just current layer seed noise"). Every value
  // comes from map/noiseRanges.ts, the same table the sliders read, so a
  // randomized value is never one a person couldn't have dragged to
  // themselves. Pressing it is meant to produce a different world in one
  // gesture, the most direct demonstration that this is a procedural system
  // rather than hand-authored terrain. A bigger theme-generation feature
  // (wetness, tectonics and the rest mapped from continuous axes by one
  // formula) is tracked separately in ROADMAP.md's Procedural System
  // Feedback section — this is plain uniform randomization, not that.
  //
  // Left alone on purpose: `visible` (a layer silently vanishing would read
  // as broken, not as a new world) and identity fields (`id`, `name`).
  function randomizeTerrain() {
    // Two hidden drivers, rolled once, so a world is coherently rugged or smooth, tall or flat (the atmosphere's
    // method, SPEC [S35]); each mild, and sometimes one extreme. Inferred, TUNABLE.
    const extreme = Math.random() < EXTREME_CHANCE ? randomFrom(['rugged', 'relief'] as const) : undefined;
    const roll = (name: 'rugged' | 'relief') => (name === extreme ? 0.85 + Math.random() * 0.15 : 0.1 + Math.random() * 0.45);
    const rugged = roll('rugged');
    const relief = roll('relief');
    const near = (driver: number) => Math.min(1, Math.max(0, driver + (Math.random() * 2 - 1) * DRIVER_JITTER));
    const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);
    const logBetween = ([min, max]: [number, number]) => min * Math.pow(max / min, Math.random());

    // Layers by role, as in Lague's procedural planets: broad continents, then masked ridged mountains, then fine
    // detail, sometimes a stepped feature. Existing layers take the roles bottom up (their paint is kept); missing
    // ones are added, and extra ones become more detail. Never deleted.
    const roles: TerrainRole[] = ['continents'];
    if (Math.random() < 0.85) roles.push('mountains');
    if (Math.random() < 0.75) roles.push('detail');
    if (Math.random() < 0.3) roles.push('feature');
    const stack = [...layers];
    while (stack.length < roles.length) stack.push(createDefaultLayer(crypto.randomUUID(), formatLayerName(nextLayerNumberRef.current++)));

    const rolled = stack.map((layer, i): NoiseLayer => {
      const role = roles[i] ?? 'detail';
      const recipe = TERRAIN_ROLES[role];
      const frequency = Math.round(logBetween(recipe.frequency) * 10) / 10;
      // Height from frequency (agreed 2026-10-21): finer noise gets less height, so no layer turns to spikes.
      const height = (recipe.height[0] + near(relief) * (recipe.height[1] - recipe.height[0])) * Math.min(1, HEIGHT_REFERENCE_FREQUENCY / frequency);
      const masked = role !== 'continents' && Math.random() < MASK_CHANCE;
      return {
        ...layer,
        noiseType: randomFrom(recipe.noiseTypes),
        seed: randomForRange('seed'),
        frequency,
        heightScale: Math.round(height * 100) / 100,
        opacity: 1,
        blendMode: role === 'continents' ? 'normal' : 'add',
        domainWarpEnabled: Math.random() < 0.2 + 0.5 * rugged,
        warpStrength: randomForRange('warpStrength', near(rugged)),
        warpScale: randomForRange('warpScale'),
        warpOctaves: randomForRange('warpOctaves'),
        octavesEnabled: role !== 'feature',
        octaves: randomForRange('octaves', near(rugged)),
        persistence: randomForRange('persistence', near(rugged)),
        lacunarity: randomForRange('lacunarity'),
        fractalType: randomFrom(FRACTAL_TYPE_OPTIONS.map((option) => option.value)),
        fractalOffset: randomForRange('fractalOffset'),
        fractalGain: randomForRange('fractalGain'),
        ridgedEnabled: role === 'mountains',
        ridgeAmount: randomForRange('ridgeAmount', near(rugged)),
        ridgeOffset: randomForRange('ridgeOffset'),
        ridgeGain: randomForRange('ridgeGain'),
        terraceEnabled: role === 'feature',
        terraceSteps: randomForRange('terraceSteps'),
        voronoiJitter: randomForRange('voronoiJitter'),
        voronoiDistance: randomFrom(VORONOI_DISTANCE_OPTIONS.map((option) => option.value)),
        // A broad mask, so the layer shows in regions rather than everywhere (Dana, 2026-10-30).
        maskNoiseType: masked ? randomFrom(['perlin', 'simplex'] as NoiseType[]) : ('none' as NoiseType),
        maskSeed: randomForRange('seed'),
        maskFrequency: Math.round(logBetween(MASK_FREQUENCY) * 10) / 10,
        maskInvert: Math.random() < 0.5,
        maskCoverage: Math.round(between(MASK_COVERAGE)),
        maskSoftness: Math.round(between(MASK_SOFTNESS)),
      };
    });
    setLayers(rolled);
  }

  return {
    layers,
    setLayers,
    selectedLayerIds,
    setSelectedLayerIds,
    handleLayerClick,
    addLayer,
    deleteLayer,
    reorderLayer,
    updateSelectedLayer,
    updateLayers,
    toggleLayerVisible,
    renameLayer,
    randomizeTerrain,
  };
}

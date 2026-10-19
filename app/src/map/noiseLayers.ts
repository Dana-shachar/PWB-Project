import { useRef, useState } from 'react';
import { createDefaultLayer, NOISE_TYPE_OPTIONS, BLEND_MODE_OPTIONS, type NoiseLayer } from './heightmap';

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.round(randomInRange(min, max));
}

function randomFrom<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

// Never picked for a random layer — "randomize" producing a layer that
// contributes nothing would be the one disappointing result out of the set.
const RANDOMIZABLE_NOISE_TYPES = NOISE_TYPE_OPTIONS.map((option) => option.value).filter((value) => value !== 'none');

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

  // Photoshop-style hide/unhide (Dana, 2026-09-23) — the row's own eye
  // toggle, independent of selection: flips exactly the layer clicked,
  // regardless of which layer(s) are currently selected for editing.
  function toggleLayerVisible(id: string) {
    setLayers(layers.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)));
  }

  // Randomizes every generation parameter on every layer at once, independent
  // of selection — not just the seed (Dana, 2026-10-13: "i need it to
  // randomize everything, not just current layer seed noise"). Every range
  // matches the slider it belongs to in ui/NoisePanel.tsx exactly, so a
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
    setLayers(
      layers.map((layer) => ({
        ...layer,
        noiseType: randomFrom(RANDOMIZABLE_NOISE_TYPES),
        seed: randomInt(0, 1000),
        frequency: randomInRange(0.5, 20),
        domainWarpEnabled: Math.random() < 0.5,
        warpStrength: randomInRange(0, 4),
        octavesEnabled: Math.random() < 0.5,
        octaves: randomInt(1, 8),
        persistence: randomInRange(0, 1),
        lacunarity: randomInRange(1, 4),
        ridgedEnabled: Math.random() < 0.5,
        ridgeAmount: randomInRange(0, 1),
        terraceEnabled: Math.random() < 0.5,
        terraceSteps: randomInt(2, 20),
        opacity: randomInRange(0, 1),
        heightScale: randomInRange(0, 10),
        blendMode: randomFrom(BLEND_MODE_OPTIONS.map((option) => option.value)),
      })),
    );
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
    toggleLayerVisible,
    renameLayer,
    randomizeTerrain,
  };
}

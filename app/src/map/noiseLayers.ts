import { useRef, useState } from 'react';
import { createDefaultLayer, type NoiseLayer } from './heightmap';

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
  };
}

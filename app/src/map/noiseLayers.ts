import { useState } from 'react';
import { createDefaultLayer, type NoiseLayer } from './heightmap';

// Owns the layer stack itself and its CRUD operations — no knowledge of
// painting or persistence, see map/2Dbrush.ts and project/saveProject.ts
// for those. See ISSUES.md, 2026-09-22, for why this was split out of
// App.tsx.
export function useNoiseLayers(initialLayerId: string) {
  const [layers, setLayers] = useState<NoiseLayer[]>([createDefaultLayer(initialLayerId)]);
  const [selectedLayerId, setSelectedLayerId] = useState(initialLayerId);

  function addLayer() {
    const id = crypto.randomUUID();
    setLayers([...layers, createDefaultLayer(id)]); // appended at the end — top of the stack
    setSelectedLayerId(id);
  }

  function deleteLayer(id: string) {
    if (layers.length === 1) return; // always keep at least one layer
    const remaining = layers.filter((layer) => layer.id !== id);
    setLayers(remaining);
    if (selectedLayerId === id) {
      setSelectedLayerId(remaining[remaining.length - 1].id);
    }
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

  function updateSelectedLayer(patch: Partial<NoiseLayer>) {
    setLayers(layers.map((layer) => (layer.id === selectedLayerId ? { ...layer, ...patch } : layer)));
  }

  return {
    layers,
    setLayers,
    selectedLayerId,
    setSelectedLayerId,
    addLayer,
    deleteLayer,
    reorderLayer,
    updateSelectedLayer,
  };
}

import { useRef, useState } from 'react';
import { BLEND_MODE_OPTIONS, createDefaultLayer, VORONOI_DISTANCE_OPTIONS, FRACTAL_TYPE_OPTIONS, type FractalType, type NoiseLayer, type NoiseType } from './heightmap';
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
type TerrainRole = 'continents' | 'mountains' | 'plateaus' | 'detail';
const TERRAIN_ROLES: Record<TerrainRole, { noiseTypes: NoiseType[]; frequency: [number, number]; height: [number, number] }> = {
  continents: { noiseTypes: ['perlin', 'simplex'], frequency: [0.6, 1.6], height: [0.6, 1.8] },
  mountains: { noiseTypes: ['perlin', 'simplex'], frequency: [2, 6], height: [0.4, 1.6] },
  detail: { noiseTypes: ['perlin', 'simplex', 'voronoi'], frequency: [6, 14], height: [0.2, 0.8] },
  plateaus: { noiseTypes: ['perlin', 'simplex'], frequency: [1.2, 2], height: [0.3, 1] }, // broad (Dana liked 1.6)
};
const ROLE_NAMES: Record<TerrainRole, string> = { continents: 'Continents', mountains: 'Mountains', plateaus: 'Plateaus', detail: 'Detail' };
// Regions follow the land, as in Lague's Procedural Planets (mountains masked by the continents' height) and Minecraft
// (landforms on bands of continentalness): the mountains' and plateaus' masks are the continents' own broad noise
// (same type, seed and frequency, i.e. its first octave), so mountains take the high interior and plateaus a wider band
// of land, and neither rises from the ocean. Mask Softness blends the borders. Shares inferred, TUNABLE.
const MOUNTAIN_SHARE: [number, number] = [12, 30]; // percent of the surface: the continents' highest part, more when rugged
const PLATEAU_SHARE: [number, number] = [8, 15]; // terraces only in specific areas, never vast ones (Dana, 2026-11-01)
const TERRACE_STEPS: [number, number] = [3, 6]; // more steps read as uniform contour lines
// World types (Dana, 2026-11-01: worlds repeated 3 to 5 styles): Randomize first picks a type, then rolls within it, as
// No Man's Sky sorts planets into types and Kate Compton advises shaping a generator's possibility space. Each type uses
// a different part of the engine; "wild" is the old free mix. Weights inferred, TUNABLE.
type WorldType = 'ranges' | 'archipelago' | 'supercontinent' | 'highlands' | 'rolling' | 'cellular' | 'shattered' | 'rifted' | 'wild';
const WORLD_TYPES: [WorldType, number][] = [['ranges', 3], ['archipelago', 2], ['supercontinent', 2], ['highlands', 1], ['rolling', 2], ['cellular', 2], ['shattered', 2], ['rifted', 2], ['wild', 3]];
const SUPERCONTINENT_FREQUENCY: [number, number] = [0.3, 0.5]; // one or two huge landmasses
const SHATTERED_FREQUENCY_SCALE = 2.5; // many small Voronoi plates
const MOUNTAIN_STRETCH_CHANCE = 0.4; // Dana liked stretched ranges on any world (2026-11-01)
const ARCHIPELAGO_FREQUENCY_SCALE = 1.8; // smaller, more numerous landmasses
const ROLLING_HEIGHT_SCALE = 0.5;
const RIFT_STRETCH: [number, number] = [1.6, 3]; // long ranges along one axis
const WILD_TERRACE_CHANCE = 0.2;
// Carving: elevation is the sum of the layers' Heights, with no blend mode (by design, 2026-09-24), so a layer carves by a
// negative Height. Rifted worlds carve their detail into rift valleys, cellular ones into basins; wild layers sometimes.
const WILD_CARVE_CHANCE = 0.25;
// Real planets keep relief under 1% of their radius, so even dry ones read as round; the layers' Heights together stay
// under this, scaled down if they exceed it (Dana, 2026-11-01). Inferred, TUNABLE.
const HEIGHT_SUM_CAP = 1.5;
const REGION_SOFTNESS: [number, number] = [20, 45];
// Lague's saved planet (E07) as the center of each range, not a fixed recipe, so worlds differ: continents plain fBm,
// 4 octaves, persistence 0.5, lacunarity 2.2; mountains a ridged multifractal (each octave weighted by the last, weight
// 0.78) at about 1.5 times the continents' frequency, 4 octaves, lacunarity 3.3. The rugged driver moves the ranges.
const CONTINENT_OCTAVES: [number, number] = [3, 5];
const CONTINENT_PERSISTENCE: [number, number] = [0.4, 0.6];
const CONTINENT_LACUNARITY = 2.2;
const MOUNTAIN_FREQUENCY_RATIO: [number, number] = [1.2, 2.5];
const MOUNTAIN_OCTAVES: [number, number] = [3, 6];
const MOUNTAIN_LACUNARITY: [number, number] = [2, 3.3];
const MOUNTAIN_GAIN: [number, number] = [0.6, 1];
const DETAIL_HEIGHT_SHARE = 0.5; // the detail layer adds texture, not landforms
// Smooth coasts, rougher highlands (Dana, 2026-10-31): fine noise grows with height. The continents use Musgrave's hetero
// terrain, whose offset "determines the level where least fine noise will appear" (Blender), and the one detail layer
// sits on the high ground by the same land mask as the mountains, since plain fBm is "statistically homogeneous" while
// nature is not (Musgrave). Offset range inferred around Blender's default of 1, TUNABLE.
const CONTINENT_OFFSET: [number, number] = [0.8, 1];
const DETAIL_SHARE: [number, number] = [20, 40]; // percent of the surface: the continents' higher ground

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
  // as broken, not as a new world) and `id`. The name follows the layer's
  // role, so the list explains the world (Dana, 2026-10-31).
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

    // Layers by role, as in Lague's procedural planets: broad continents, then the region types, then fine detail.
    // Each world gets two or three of mountains, plateaus and plains (plains need no layer). Existing layers take the
    // roles bottom up (their paint is kept); missing ones are added, and extra ones become more detail. Never deleted.
    const totalWeight = WORLD_TYPES.reduce((sum, [, weight]) => sum + weight, 0);
    let pick = Math.random() * totalWeight;
    const world = (WORLD_TYPES.find(([, weight]) => (pick -= weight) < 0) ?? WORLD_TYPES[0])[0];
    const wild = world === 'wild';
    const roles: TerrainRole[] = ['continents'];
    if (world === 'highlands') roles.push('plateaus');
    else if (world !== 'rolling' && Math.random() < (wild ? 0.6 : 0.9)) roles.push('mountains');
    if (wild && Math.random() < WILD_TERRACE_CHANCE) roles.push('plateaus');
    if (Math.random() < 0.75) roles.push('detail');
    const scaled = (range: [number, number], driver: number) => range[0] + near(driver) * (range[1] - range[0]);
    const continent = {
      noiseType: world === 'cellular' || world === 'shattered' ? ('voronoi' as NoiseType) : wild ? randomFrom(['perlin', 'simplex', 'voronoi'] as NoiseType[]) : randomFrom(TERRAIN_ROLES.continents.noiseTypes),
      seed: randomForRange('seed'),
      frequency: Math.round(
        (world === 'supercontinent' ? between(SUPERCONTINENT_FREQUENCY) : logBetween(TERRAIN_ROLES.continents.frequency))
        * (world === 'archipelago' ? ARCHIPELAGO_FREQUENCY_SCALE : world === 'shattered' ? SHATTERED_FREQUENCY_SCALE : 1) * 10) / 10,
    };
    // Each world type's continents: hetero keeps coasts smooth; the others trade that for a different character.
    const continentFractal: FractalType = ({ ranges: 'hetero', archipelago: 'hetero', supercontinent: 'hetero', shattered: 'ridgedMulti', highlands: 'hetero', rolling: 'hybrid', cellular: 'fbm', rifted: 'ridgedMulti', wild: randomFrom(FRACTAL_TYPE_OPTIONS.map((option) => option.value)) } as Record<WorldType, FractalType>)[world];
    const rift = { axis: randomFrom(['stretchX', 'stretchY', 'stretchZ'] as const), amount: Math.round(between(RIFT_STRETCH) * 10) / 10 };
    const softness = Math.round(between(REGION_SOFTNESS));
    // Mountains and plateaus are masked by the continents' own broad noise, so both stay on land.
    const landMask = (share: number) => ({
      maskNoiseType: continent.noiseType, maskSeed: continent.seed, maskFrequency: continent.frequency,
      maskInvert: false, maskCoverage: Math.round(share), maskSoftness: softness,
    });
    const stack = [...layers];
    while (stack.length < roles.length) stack.push(createDefaultLayer(crypto.randomUUID(), formatLayerName(nextLayerNumberRef.current++)));

    const rolled = stack.map((layer, i): NoiseLayer => {
      // Layers past the roles are kept (with their paint) but switched off, so detail isn't doubled.
      if (i >= roles.length) return { ...layer, name: 'Unused', opacity: 0 };
      const role = roles[i];
      const recipe = TERRAIN_ROLES[role];
      const frequency =
        role === 'continents' ? continent.frequency
        : role === 'mountains' ? Math.round(continent.frequency * scaled(MOUNTAIN_FREQUENCY_RATIO, rugged) * 10) / 10
        : Math.round(logBetween(recipe.frequency) * 10) / 10;
      // Height from frequency (agreed 2026-10-21): finer noise gets less height, so no layer turns to spikes.
      const height = (recipe.height[0] + near(relief) * (recipe.height[1] - recipe.height[0])) * Math.min(1, HEIGHT_REFERENCE_FREQUENCY / frequency);
      // Wild worlds pick blend, ridges and stretch freely; other types keep the role's recipe.
      const wildBlend = role === 'continents' ? 'normal' : randomFrom(BLEND_MODE_OPTIONS.map((option) => option.value)); // shows on the 2D map only
      const carves = role !== 'continents' && ((role === 'detail' && (world === 'rifted' || world === 'cellular')) || (wild && Math.random() < WILD_CARVE_CHANCE));
      const stretched = (role === 'mountains' && (world === 'rifted' || Math.random() < MOUNTAIN_STRETCH_CHANCE)) || (wild && role !== 'continents' && Math.random() < 0.4);
      return {
        ...layer,
        name: ROLE_NAMES[role],
        // Stretch is set on every layer, so none keeps a stretch from the roll before.
        stretchX: 1, stretchY: 1, stretchZ: 1,
        ...(stretched ? { [rift.axis]: rift.amount } : {}),
        // The continents unshifted and unstretched, so the land masks reproduce their broad shape exactly.
        ...(role === 'continents' ? { offsetX: 0, offsetY: 0, offsetZ: 0, stretchX: 1, stretchY: 1, stretchZ: 1 } : {}),
        noiseType: role === 'continents' ? continent.noiseType : randomFrom(recipe.noiseTypes),
        seed: role === 'continents' ? continent.seed : randomForRange('seed'),
        frequency,
        heightScale: (carves ? -1 : 1) * Math.round(height * (role === 'detail' ? DETAIL_HEIGHT_SHARE : 1) * (world === 'rolling' ? ROLLING_HEIGHT_SCALE : 1) * 100) / 100,
        opacity: 1,
        blendMode: wild ? wildBlend : role === 'continents' ? 'normal' : 'add',
        domainWarpEnabled: (role !== 'continents' || world === 'rifted' || wild) && Math.random() < 0.2 + 0.5 * rugged,
        warpStrength: randomForRange('warpStrength', near(rugged)),
        warpScale: randomForRange('warpScale'),
        warpOctaves: randomForRange('warpOctaves'),
        octavesEnabled: role !== 'plateaus',
        octaves: Math.round(role === 'continents' ? (world === 'rolling' ? between([2, 3]) : scaled(CONTINENT_OCTAVES, rugged)) : role === 'mountains' ? scaled(MOUNTAIN_OCTAVES, rugged) : randomForRange('octaves', near(rugged))),
        persistence: Math.round((role === 'continents' ? scaled(CONTINENT_PERSISTENCE, rugged) : role === 'mountains' ? 0.5 : randomForRange('persistence', near(rugged))) * 100) / 100,
        lacunarity: role === 'continents' ? CONTINENT_LACUNARITY : role === 'mountains' ? Math.round(scaled(MOUNTAIN_LACUNARITY, rugged) * 10) / 10 : randomForRange('lacunarity'),
        fractalType: role === 'continents' ? continentFractal : role === 'mountains' ? 'ridgedMulti' : randomFrom(FRACTAL_TYPE_OPTIONS.map((option) => option.value)),
        fractalOffset: role === 'mountains' || (role === 'continents' && continentFractal === 'ridgedMulti') ? 1 : role === 'continents' ? Math.round(between(CONTINENT_OFFSET) * 100) / 100 : randomForRange('fractalOffset'),
        fractalGain: role === 'mountains' ? Math.round(scaled(MOUNTAIN_GAIN, rugged) * 100) / 100 : role === 'continents' ? 1 : randomForRange('fractalGain'),
        ridgedEnabled: wild && role !== 'continents' && Math.random() < 0.3, // otherwise ridges come from the ridged multifractal itself (Lague)
        ridgeAmount: randomForRange('ridgeAmount', near(rugged)),
        ridgeOffset: randomForRange('ridgeOffset'),
        ridgeGain: randomForRange('ridgeGain'),
        terraceEnabled: role === 'plateaus',
        terraceSteps: Math.round(between(TERRACE_STEPS)),
        // Voronoi continents use the mask's own settings (jitter 1, Euclidean), so the land masks still match them.
        voronoiJitter: role === 'continents' ? 1 : randomForRange('voronoiJitter'),
        voronoiDistance: role === 'continents' ? 'euclidean' : randomFrom(VORONOI_DISTANCE_OPTIONS.map((option) => option.value)),
        // Mountains, plateaus and detail sit on the land by the continents' own mask; the continents have none.
        ...(role === 'continents'
          ? { maskNoiseType: 'none' as NoiseType }
          : landMask(role === 'mountains' ? scaled(MOUNTAIN_SHARE, rugged) : role === 'plateaus' ? between(PLATEAU_SHARE) : between(DETAIL_SHARE))),
      };
    });
    // Round planets: the shown layers' Heights together stay under the cap.
    const heightSum = rolled.reduce((sum, layer) => sum + (layer.opacity > 0 ? Math.abs(layer.heightScale) : 0), 0);
    if (heightSum > HEIGHT_SUM_CAP) rolled.forEach((layer) => (layer.heightScale = Math.round((layer.heightScale * HEIGHT_SUM_CAP) / heightSum * 100) / 100));
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

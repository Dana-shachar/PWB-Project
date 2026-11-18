import { Fragment } from 'react';
import { Accordion, DualHueSlider, EditableText, HueSlider, IconButton, LockButton, Select, Slider } from '../UIElements';
import { FIREFLIES_MAX, HUE_RANGE_MAX, randomTreeGenes, varyTreeGenes, NO_LOCKS, SHAPE_GENE_RANGES, DEFAULT_TREE_GENES, isShrub, SHRUB_FAMILY_OPTIONS, TREE_FAMILIES, TREE_FAMILY_OPTIONS, treeColors, type GeneGroup, type NumericShapeGene, type TreeFamily, type TreeGenes, type TreeSpecies } from '../../trees/treeGenes';
import { LEAF_PART_OPTIONS, type LeafPart } from '../../trees/leafParts';
import { HARMONY_RULES, harmonyFor } from '../../atmosphere/moonTexture';
import { LIFE_SATURATION, landMiddleColor, lifeColors, type BiomeSettings, type LifeType, type LifeTypeKey } from '../../biome/plantTypes';
import type { ColorStop } from '../../planet/colorRamp';
import { DiceIcon, EyeIcon, SproutIcon, VaryIcon } from '../icons';

// The Biome stage's right panel: the granular controls per life type (biome/plantTypes.ts). The main ones live in the
// left panel's Biome section.
interface BiomePanelProps {
  biome: BiomeSettings;
  onBiomeChange: (changes: Partial<BiomeSettings>) => void;
  colorStops: ColorStop[]; // the land ramp, which life's colors turn from
}

const LIFE_LABELS: Record<LifeTypeKey, string> = { algae: 'Algae', moss: 'Moss' };


// A life type's swatch, sRGB HSL as lifeColors gives it.
const lifeSwatch = (hue: number, saturation: number, lightness: number) => `hsl(${((hue % 360) + 360) % 360}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`;

export function BiomePanel({ biome, onBiomeChange, colorStops }: BiomePanelProps) {
  const land = landMiddleColor(colorStops);
  // Previews on this planet's land color, as the shader derives it.
  const preview = (look: LifeType['look'], turn: number, key: LifeTypeKey = 'moss') => {
    const colors = lifeColors({ ...look, hueTurn: turn, saturationShare: LIFE_SATURATION[key] }, land);
    return lifeSwatch(colors.hue, (colors.saturation[0] + colors.saturation[1]) / 2, (colors.lightness[0] + colors.lightness[1]) / 2);
  };
  const hueTrack = (look: LifeType['look'], key: LifeTypeKey) => {
    const stops: string[] = [];
    for (let turn = -180; turn <= 180; turn += 30) stops.push(preview(look, turn, key));
    return `linear-gradient(to right, ${stops.join(', ')})`;
  };
  const update = (key: LifeTypeKey, changes: Partial<LifeType>) => onBiomeChange({ [key]: { ...biome[key], ...changes } });
  return (
    <>
      <div className="panel-section">
      <Accordion
        title="Evolution"
        defaultOpen
        headerSwitch={{ value: biome.evolve, onChange: (evolve) => onBiomeChange({ evolve }), label: 'Evolution on or off' }}
      >
        <Slider
          label="Variation"
          value={biome.variation}
          onChange={(variation) => onBiomeChange({ variation })}
          min={0}
          max={2}
          step={0.01}
          precision={2}
          description="How different the variants look from their type: 0 keeps one color, 1 is the default, 2 is wide. Changes the look only, instantly."
        />
        <Slider
          label="Mutation rate"
          value={biome.mutationRate}
          onChange={(mutationRate) => onBiomeChange({ mutationRate })}
          min={0}
          max={1}
          step={0.01}
          precision={2}
          description="How often a variant's genes change each era: low drifts slowly, high changes fast."
        />
        <button
          type="button"
          className="noise-add-layer-btn ui-tooltip-anchor"
          disabled={!biome.evolve}
          onClick={() => onBiomeChange({ seed: Math.floor(Math.random() * 1e9) })}
        >
          <DiceIcon /> Shuffle
          <span className="ui-tooltip">Replays evolution with a new seed, so different variants win</span>
        </button>
      </Accordion>
      </div>
      <div className="panel-section-divider panel-section-divider--spaced" />
      {(Object.keys(LIFE_LABELS) as LifeTypeKey[]).map((key) => {
        const type = biome[key];
        const look = type.look;
        const brightness = (look.lightnessShare[0] + look.lightnessShare[1]) / 2;
        return (
          <Fragment key={key}>
          <div className="panel-section">
          <Accordion title={LIFE_LABELS[key]} defaultOpen>
            <DualHueSlider
              label="Hue"
              value={look.hueTurn}
              secondOffset={look.hueSpread}
              onChange={(hueTurn) => update(key, { look: { ...look, hueTurn } })}
              onSecondOffsetChange={(offset) => update(key, { look: { ...look, hueSpread: Math.min(Math.abs(offset), 180) } })}
              trackBackground={hueTrack(look, key)}
              swatchColor={preview(look, look.hueTurn, key)}
              secondSwatchColor={preview(look, look.hueTurn + look.hueSpread, key)}
              description="Its color as a turn from the land's own hue (0 is the land's hue), in the land's own saturation and lightness."
            />
            <Slider
              label="Brightness"
              value={brightness}
              onChange={(value) => update(key, { look: { ...look, lightnessShare: [look.lightnessShare[0] * (value / brightness), look.lightnessShare[1] * (value / brightness)] } })}
              min={0.2}
              max={2}
              step={0.01}
              precision={2}
              description="How light it is against the land: 1 is the land's own lightness."
            />
            <Slider
              label="Moisture need"
              value={type.moisture.idealMin}
              onChange={(need) => update(key, { moisture: { ...type.moisture, idealMin: need, min: Math.max(need - 0.2, 0) } })}
              min={0}
              max={2}
              step={0.01}
              precision={2}
              description="How wet the ground must be: low tolerates dry ground, 1 needs soaked ground, above 1 only at and under water. Evolution can lower a variant's need by up to 0.4, so the top of the range offsets that."
            />
            <Slider
              label="Shade need"
              value={1 - type.sun.idealMax}
              onChange={(need) => update(key, { sun: { ...type.sun, idealMax: 1 - need, max: Math.min(1.01, 1.3 - need) } })}
              min={0}
              max={1}
              step={0.01}
              precision={2}
              description="How much shade it needs: 0 thrives in full sun, 1 only in deep shade."
            />
            {key === 'moss' && (
              <>
                <Slider
                  label="Breakup size"
                  value={look.patternMeters}
                  onChange={(patternMeters) => update(key, { look: { ...look, patternMeters } })}
                  min={2}
                  max={200}
                  scale="log"
                  step={0.1}
                  precision={1}
                  description="How big the patches are that break up its areas, in meters."
                />
                <Slider
                  label="Breakup amount"
                  value={look.breakupShare}
                  onChange={(breakupShare) => update(key, { look: { ...look, breakupShare } })}
                  min={0}
                  max={1}
                  step={0.01}
                  precision={2}
                  description="How much the breakup cuts into its areas: 0 follows only sun, shade and moisture, 1 only the breakup."
                />
              </>
            )}
            {key === 'algae' && (
              <Slider
                label="Shore reach"
                value={biome.shoreReach}
                onChange={(shoreReach) => onBiomeChange({ shoreReach })}
                min={10}
                max={5000}
                scale="log"
                step={1}
                precision={0}
                description="How far from the water algae can grow, in meters. It also needs low ground: Moisture need sets how high above the water."
              />
            )}
          </Accordion>
          </div>
          <div className="panel-section-divider panel-section-divider--spaced" />
          </Fragment>
        );
      })}
      <div className="panel-section">
        <SpeciesSection kind="tree" biome={biome} onBiomeChange={onBiomeChange} land={land} />
      </div>
      <div className="panel-section-divider panel-section-divider--spaced" />
      <div className="panel-section">
        <SpeciesSection kind="shrub" biome={biome} onBiomeChange={onBiomeChange} land={land} />
      </div>
    </>
  );
}

// The planet's tree species as a list like the layers (an eye shows a species in the Tree view, a click selects it), then
// the selected species' shape genes and colors (trees/treeGenes.ts). Family sets the shape genes to its starting values.
// Trees and Shrubs: one species list (biome.treeSpecies) shown in two sections by family, the same controls in each.
const SPECIES_KIND = {
  tree: { title: 'Trees', name: 'Species', add: '+ Add species', description: "The planet's tree species, seen side by side in the Tree view (the view strip over the viewport).", families: TREE_FAMILY_OPTIONS, familyHelp: 'The silhouette: round clumps, a stacked cone, discs on long limbs, leaves fanned at the top, or a crown on a bare trunk. Sets every shape gene below to its start.' },
  shrub: { title: 'Shrubs', name: 'Shrub', add: '+ Add shrub', description: "The planet's shrubs: no trunk to speak of, limbs from the ground. Shown in the Tree view with the trees.", families: SHRUB_FAMILY_OPTIONS, familyHelp: 'The growth form: a round mound, a vase fanning up, spreading wide, upright and narrow, weeping with hanging limbs, or creeping along the ground. Sets every shape gene below to its start.' },
} as const;

function SpeciesSection({ kind, biome, onBiomeChange, land }: { kind: keyof typeof SPECIES_KIND; biome: BiomeSettings; onBiomeChange: (changes: Partial<BiomeSettings>) => void; land: string }) {
  const text = SPECIES_KIND[kind];
  const all = biome.treeSpecies;
  const species = all.filter((each) => isShrub(each.genes.family) === (kind === 'shrub'));
  const pickKey = kind === 'shrub' ? 'selectedShrub' : 'selectedSpecies'; // each list remembers its own pick
  const picked = biome[pickKey];
  const selected = species.find((each) => each.id === picked) ?? species[0];
  const setSpecies = (next: TreeSpecies[], pick = picked) => onBiomeChange({ treeSpecies: next, [pickKey]: pick });
  const updateSpecies = (id: string, changes: Partial<TreeSpecies>) => setSpecies(all.map((each) => (each.id === id ? { ...each, ...changes } : each)));
  // A copy of the selected one with a new seed; the first shrub starts as a Mound.
  const addSpecies = () => {
    const id = `species-${Date.now()}`;
    const from = selected?.genes ?? { ...DEFAULT_TREE_GENES, family: 'mound' as const, ...TREE_FAMILIES.mound };
    setSpecies([...all, { id, name: `${text.name} ${species.length + 1}`, visible: true, genes: { ...from, seed: Math.floor(Math.random() * 1e9) }, locks: { ...NO_LOCKS } }], id);
  };
  const removeSpecies = (id: string) => {
    const next = all.filter((each) => each.id !== id);
    const sameKind = next.find((each) => isShrub(each.genes.family) === (kind === 'shrub'));
    setSpecies(next, id === picked ? (sameKind ?? next[0]).id : picked);
  };
  const addButton = (
    <div className="panel-btn-row">
      <button type="button" className="noise-add-layer-btn ui-tooltip-anchor" onClick={addSpecies}>
        {text.add}
        <span className="ui-tooltip">{selected ? `A copy of the selected ${text.name.toLowerCase()} with a new seed, to change from there` : 'A Mound shrub, to change from there'}</span>
      </button>
    </div>
  );
  if (!selected) {
    return (
      <Accordion title={text.title} description={text.description}>
        {addButton}
      </Accordion>
    );
  }
  const genes = selected.genes;
  const onChange = (changes: Partial<TreeGenes>) => updateSpecies(selected.id, { genes: { ...genes, ...changes } });
  const gene = (key: NumericShapeGene, label: string, step: number, description: string) => (
    <Slider label={label} value={genes[key] ?? TREE_FAMILIES[genes.family][key]} onChange={(value) => onChange({ [key]: value })} min={SHAPE_GENE_RANGES[key][0]} max={SHAPE_GENE_RANGES[key][1]} step={step} precision={step < 1 ? 2 : 0} description={description} />
  );
  // A color at an absolute hue turn from the land, as the canopy (inner) or the trunk (base) would take it.
  const swatch = (turn: number, part: 'canopy' | 'trunk') => {
    const colors = treeColors({ ...genes, hueTurn: part === 'canopy' ? turn : genes.hueTurn, trunkOffset: part === 'trunk' ? turn - genes.hueTurn : genes.trunkOffset }, land);
    return (part === 'canopy' ? colors.canopyInner : colors.trunkBase).getStyle();
  };
  // `from` shifts the track for a turn measured from another hue (Tip turns from the leaves' own).
  const track = (part: 'canopy' | 'trunk', from = 0) => {
    const stops: string[] = [];
    for (let turn = -180; turn <= 180; turn += 30) stops.push(swatch(turn + from, part));
    return `linear-gradient(to right, ${stops.join(', ')})`;
  };
  const colors = treeColors(genes, land);
  // A group's padlock, in its nested section's header: Vary and New species keep a locked group.
  const groupLock = (group: GeneGroup) => (
    <LockButton locked={selected.locks[group] ?? false} onChange={(locked) => updateSpecies(selected.id, { locks: { ...selected.locks, [group]: locked } })} />
  );
  const partTitle = (title: string) => (
    <>
      <div className="panel-section-divider panel-section-divider--part" />
      <span className="panel-section-title">{title}</span>
    </>
  );
  const trunkTurn = genes.hueTurn + genes.trunkOffset;
  return (
    <Accordion title={text.title} defaultOpen={kind === 'tree'} description={text.description}>
      <div className="panel-section-title-row panel-section-title-row--actions">
        <span className="panel-section-title">Species</span>
        <span className="panel-title-actions">
          <IconButton icon={<SproutIcon />} label="New individual: the same species, a new seed" onClick={() => onChange({ seed: Math.floor(Math.random() * 1e9) })} />
          <IconButton icon={<VaryIcon />} label="Vary: a cousin of this species, some genes changed by chance at the Mutation rate (locked groups kept)" onClick={() => onChange(varyTreeGenes(genes, selected.locks, biome.mutationRate))} />
          <IconButton icon={<DiceIcon />} label="New species: rolls every gene (locked groups kept)" onClick={() => onChange(randomTreeGenes(genes, selected.locks, HARMONY_RULES.map((rule) => rule.offset)))} />
        </span>
      </div>
      {species.map((each) => (
        <div
          key={each.id}
          className={'noise-layer-row' + (each.id === selected.id ? ' noise-layer-row--selected' : '') + (each.visible ? '' : ' noise-layer-row--hidden')}
          onMouseDown={() => onBiomeChange({ [pickKey]: each.id })}
        >
          <div className="noise-layer-row-main">
            <button type="button" className="panel-text-btn" onMouseDown={(event) => event.stopPropagation()} onClick={() => removeSpecies(each.id)} disabled={species.length === 1}>
              ×
            </button>
            <span onMouseDown={(event) => event.stopPropagation()}>
              <EditableText className="noise-layer-row-label" activateOn="doubleClick" value={each.name} onCommit={(name) => updateSpecies(each.id, { name })} />
            </span>
          </div>
          <span className="noise-layer-row-actions">
            <button type="button" className="panel-text-btn noise-layer-row-visibility ui-tooltip-anchor" onMouseDown={(event) => event.stopPropagation()} onClick={() => updateSpecies(each.id, { visible: !each.visible })}>
              <EyeIcon />
              <span className="ui-tooltip">Show/hide this species in the Tree view</span>
            </button>
          </span>
        </div>
      ))}
      {addButton}
      <Accordion title="Shape" nested trailing={groupLock('shape')} description="The trunk and limbs: the tree's silhouette.">
      <Select label="Family" value={genes.family} onChange={(family) => onChange({ family: family as TreeFamily, ...TREE_FAMILIES[family as TreeFamily] })} options={[...text.families]} description={text.familyHelp} />
      {partTitle('Trunk')}
      {gene('height', 'Height', 0.5, 'How tall the trunk grows.')}
      {gene('trunkRadius', 'Trunk width', 0.05, 'How thick the trunk is at its base.')}
      {gene('baseSwell', 'Base swell', 0.01, 'How much the trunk swells at its base. 0 keeps it straight.')}
      {gene('gnarliness', 'Gnarl', 0.01, 'How much the trunk and limbs curl and twist.')}
      {/* A crown has no limbs (applyTreeGenes), so its limb sliders would do nothing. */}
      {genes.family !== 'crown' && (
        <>
          {partTitle('Limbs')}
          {gene('limbs', 'Limbs', 1, 'Main limbs off the trunk.')}
          {gene('limbAngle', 'Limb angle', 1, 'How far the limbs lean out from the trunk, in degrees.')}
          {gene('limbLength', 'Limb length', 0.5, 'How long the main limbs are.')}
          {gene('limbStart', 'Limb start', 0.01, 'Where along the trunk the limbs begin: 0 at the ground, 1 at the top.')}
          {gene('bend', 'Bend', 0.01, 'How the limbs bend as they grow: below 0 they arch over and hang, above 0 they reach up.')}
          {gene('twigs', 'Twigs', 1, 'Branches on each limb. 0 keeps bare limbs.')}
        </>
      )}
      </Accordion>
      <Accordion title="Leaves" nested trailing={groupLock('leaves')} description="Which 3D parts the leaves are, and their size and pose.">
      <Select label="Leaf part" value={genes.leafPart} onChange={(leafPart) => onChange({ leafPart: leafPart as LeafPart })} options={LEAF_PART_OPTIONS} description="What each leaf is: a twisting tendril, a fiddlehead curl, a creased blade, a fan of fingers, a cupped pad, a trumpet cup, or a club on a stalk. Each one varies in size, bend and twist." />
      <Select label="Leaf part 2" value={genes.leafPart2} onChange={(leafPart2) => onChange({ leafPart2: leafPart2 as LeafPart | 'none' })} options={[{ value: 'none', label: 'None' }, ...LEAF_PART_OPTIONS]} description="A second part mixed into the same tree. Mix sets how many leaves take it." />
      <Select label="Leaf part 3" value={genes.leafPart3} onChange={(leafPart3) => onChange({ leafPart3: leafPart3 as LeafPart | 'none' })} options={[{ value: 'none', label: 'None' }, ...LEAF_PART_OPTIONS]} description="A third part mixed in, sharing Mix with the second." />
      <Slider label="Mix" value={genes.partMix} onChange={(partMix) => onChange({ partMix })} min={0} max={1} step={0.01} precision={2} disabled={genes.leafPart2 === 'none' && genes.leafPart3 === 'none'} description="The share of leaves that take the extra parts; the rest take Leaf part." />
      {partTitle('Size and pose')}
      {gene('leafCount', 'Leaves', 1, 'Leaves on each branch tip.')}
      {gene('leafSize', 'Leaf size', 0.1, 'How big each leaf card is.')}
      {gene('leafAngle', 'Leaf angle', 1, 'How far leaves lean from their branch, in degrees.')}
      {gene('leafSizeRange', 'Size range', 0.01, 'How much leaf sizes differ within one tree: 0 all alike, 1 from half of Leaf size to double, 3 from a quarter to four times.')}
      {gene('droop', 'Droop', 0.01, 'How fronds, blades and fans bend: below 0 they curl up, above 0 they droop down.')}
      </Accordion>
      <Accordion title="Color" nested trailing={groupLock('color')} description="The canopy's and trunk's hues, turned from the land's own.">
      <DualHueSlider
        label="Leaves"
        value={genes.hueTurn}
        secondOffset={genes.leafOffset}
        onChange={(hueTurn) => onChange({ hueTurn })}
        onSecondOffsetChange={(leafOffset) => onChange({ leafOffset })}
        trackBackground={track('canopy')}
        swatchColor={colors.canopyInner.getStyle()}
        secondSwatchColor={colors.canopyOuter.getStyle()}
        description="The canopy's gradient: the large handle colors its inner and lower leaves, the small one its outer and top ones. 0 is the land's own hue."
      />
      <HueSlider
        label="Tip"
        value={genes.tipTurn ?? 0}
        onChange={(tipTurn) => onChange({ tipTurn })}
        trackBackground={track('canopy', genes.hueTurn)}
        swatchColor={colors.tipInner.getStyle()}
        description="Each leaf part blends from its base to its tip toward this hue, measured from the leaves' color. Shows only up close; 0 keeps parts one color."
      />
      <DualHueSlider
        label="Trunk"
        value={trunkTurn}
        secondOffset={genes.trunkTopOffset}
        onChange={(turn) => onChange({ trunkOffset: turn - genes.hueTurn })}
        onSecondOffsetChange={(trunkTopOffset) => onChange({ trunkTopOffset })}
        trackBackground={track('trunk')}
        swatchColor={colors.trunkBase.getStyle()}
        secondSwatchColor={colors.trunkTop.getStyle()}
        description="The trunk's own gradient: the large handle colors its base, the small one its top. Harmony below sets the base from the leaves' color."
      />
      <Select
        label="Harmony"
        value={harmonyFor(genes.trunkOffset)}
        onChange={(name) => { const rule = HARMONY_RULES.find((each) => each.name === name); if (rule) onChange({ trunkOffset: rule.offset }); }}
        options={[...HARMONY_RULES.map((rule) => rule.name), 'Custom'].map((name) => ({ value: name, label: name }))}
        description="A color rule for the trunk's base, measured from the leaves' inner hue: Complementary is opposite, Analogous a neighbor, Monochrome the same hue, darker."
      />
      <Slider
        label="Color range"
        unit="°"
        value={genes.hueRange ?? 0}
        onChange={(hueRange) => onChange({ hueRange })}
        min={0}
        max={HUE_RANGE_MAX}
        step={1}
        precision={0}
        description="How far individuals of this species turn from its colors, each by its own amount. New individual shows another; 0 makes them all alike."
      />
      </Accordion>
      <Accordion title="Effects" nested trailing={groupLock('effects')} description="Light and life on the tree, growing with it.">
      <Slider label="Glow" value={genes.glow ?? 0} onChange={(glow) => onChange({ glow })} min={0} max={1} step={0.01} precision={2} description="A soft light toward the leaf tips, in the Tip hue. It grows with the tree: a young tree glows faintly. 0 is none." />
      <Slider label="Fireflies" value={genes.fireflies ?? 0} onChange={(fireflies) => onChange({ fireflies })} min={0} max={FIREFLIES_MAX} step={1} precision={0} description="Small lights drifting around the canopy, in the Tip hue, seen only up close. A young tree has fewer. 0 is none." />
      </Accordion>
    </Accordion>
  );
}

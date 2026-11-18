# Biome Plan

`Last updated: 2026-11-11`

*The living chunk: life simulated on a grid like erosion, evolving over time, drawn as ground color from afar and as real plants up close.*

> [!NOTE]
> The roadmap's Next in order item 6 points here. Sources and the reference images are in `REFERENCES.md` (Computational: Cordonnier 2017, Sims 1991, EZ-Tree, Horizon Zero Dawn; Visual: the No Man's Sky and Moss references).

---

## 🧭 Direction

*What the biome is for and how it should look.*

- **Simulated, never placed by hand:** you set the conditions and life follows them, as erosion does. The simulation is a grid of numbers per cell, never individual plants (Cordonnier 2017: individual plants cost too much past about 1 km²).
- **Evolution and succession layered:** eras unlock life forms (generation 0 pioneers, then grass, shrubs, trees and flowers); the grid places them by light, water and temperature.
- **Alien, in the planet's palette:** forms diverge from Earth's (No Man's Sky's bulbs, bells, spirals and tentacle crowns), and every color derives from the land's hue by the color rules, muted to the planet's palette. Never absolute or Earth colors.
- **Seen at every distance:** a soft tint from afar, a textured ground layer at walking height, real plant geometry up close.

---

## 🌱 Behavior

*Where each life type grows; the rules the grid runs.*

**The grid** · Cordonnier et al. 2017 · ✅ built (test 1)
- Per cell and type: viability −1 to 1 from temperature, moisture and sunlight through each type's hat function, the worst one wins (Liebig's law); growth by vigor into free space, die-back by stress; dead matter to humus.
- Inputs relative to the planet's own relief, since Earth's per-km rules break on its exaggerated heights: Peak cooling and Pole cooling (Climate), wetness within a share of the relief above water, rain against the liquid's typical rainfall.

**Moss and algae** · bryophyte ecology · 🟡 rules partly built
- Moss follows moisture and shade: richest near water, on forest floors, on the shaded side of rocks and trunks; sun dries it. Algae: wet ground, waterlines and under water, in light.
- 📌 Shade from trees (Cordonnier: taller layers shade lower ones) and moss on rocks and trunks, once rocks and trees exist.

**Humus by moisture** · LPJ (Sitch et al. 2003) · ⚪ needs the paper
- Decay faster in wetter, warmer ground instead of a flat 30% a year. 📚 [Sitch et al. 2003](https://doi.org/10.1046/j.1365-2486.2003.00569.x)

**Greenhouse warming** · ⚪ to research
- A thicker atmosphere warms the planet (Dana). Needs a citable simple relation before building.

---

## 🎨 Drawing

*How life shows on the ground. The first version used plain noise blobs and is being redone.*

> [!WARNING]
> The first drawn layer was improvised with plain noise: random blobs unrelated to the landform, blocky from float precision at large coordinates, and a flat dark stain instead of a blended layer. Everything below is sourced or marked as not yet sourced.

**What the references show** · No Man's Sky, Moss · `reference`
- A colored, lightly textured layer under and between plants that blends softly into the soil, so soil shows through at its edges; simple.
- Coverage follows the land: carpets on flats and sheltered ground, bare on ridges and rock faces.
- Moss has relief (rounded cushions), a velvety surface lighter at the tips, and is lighter and more saturated than the soil.

**Methods, sourced**
- **Mask from the terrain:** upward-facing ground, concavity and occlusion (Substance's moss tool masks by occlusion; terrain shaders use curvature and slope; Frostbite feeds height, slope and the normal into its splatting).
- **Noise only roughens the mask's edge** through a threshold, never the pattern itself.
- **Height blend between layers** (Unreal's landscape height blend), so cover settles into the ground's low points with a broken, soft edge.
- **Detail fading with distance:** texture up close, color from afar (band-limited, as the terrain's detail).
- **Chunk-local coordinates** for fine detail, as the terrain's height bake does, so precision holds on large squares.
- **Fuzz up close (later):** stacked shell layers (Ryse, Shadow of the Colossus) or painterly fins (Disney Research).

**From a production moss shader and tested code** (Berg, Neon Giant; Shane, Canyon Pass)
- **Two masks:** the amount (here the grid's density) times a blend pattern, raised to a high power, gives crisp edges along the pattern (a height blend); and a top-down mask, upward-facing plus the pattern, raised to a power.
- **The pattern is the moss's own relief:** rounded cushions from a cellular bump, so cover sits on cushion tops and flats.
- **Velvet:** a Fresnel-like term, darker where the surface faces the eye and brighter at grazing angles (Unreal's FuzzyShading; Shane's rim). The exact FuzzyShading formula is not published, so ours follows the description: inferred, TUNABLE.
- **Color:** a tint of the ground in the palette's hue, so the ground shows through.

**As built (2026-11-10), after the close-up detail was cut** (nothing finer than the viewing distance shows)
- Placement from the terrain only: per-pixel suitability by the grid's rule (the type's ranges, worst input wins) on the smoothed landform, as Berg's height-blend height; the grid read with a cubic B-spline (Sigg and Hadwiger, GPU Gems 2) so edges curve.
- Algae reads the waterline's wetness alone (aquatic), moss reads rain, hollows and waterline; a high algae Moisture need keeps it to a thin shore band.
- Color: a tint of the ground (Shane's multiplicative tint): the life's hue, saturation within the land's own (1 to 1.15 times, so it blends), the ground's own lightness, at most 75% cover; its edge follows the ground's own texture (35% of the height blend). No texture or volume of its own.
- 💡 Volume later: low tufts as geometry near the camera from the moss amount (Horizon Zero Dawn placement), as No Man's Sky and Moss do; and a visible-scale grain inside the tint.
- Controls per type: Hue, Brightness, Moisture need (0 to 2, so a type can be pushed past evolution's drift toward drier ground), Shade need; algae also Shore reach. Everything else fixed.

**Not sourced yet, to research or defer**
- ❓ Terrain-scale inputs (concavity, occlusion from the height map) and how they join the two masks; the Frostbite notes may cover it.
- 💡 A better velvet: the sheen model ([Estevez and Kulla 2017](https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf)) or Naughty Dog's moss lighting (Brinck and Maksimov, SIGGRAPH 2016).
- 📚 To download: [Andersson 2007, Frostbite terrain](https://www.advances.realtimerendering.com/s2007/Andersson-TerrainRendering(Siggraph07)-CourseNotes.pdf).

### 🌳 Trees

*How trees look, from Dana's references in `docs/references/`: `nms-trees-clumps-and-spiky-cones` (clumps, spiky cones), `nms-purple-palm-grove` (the complexity level to aim for: big leaves, simple trunks), `nms-umbrella-disc-trees`, `nms-tentacle-tree-pink-sky` and `nms-alien-trees` (tendrils), `nms-curled-fern-plants` and `lowpoly-alien-flora-sheet` (curls, cups, clubs, pads: simple shapes with volume and a gradient), `lowpoly-tree-kit-wireframe` (how low the geometry can be), `nms-glowing-alien-flora`, `nms-tree-moss-cliffs`, `gris-forest`, `outer-wilds-forest`. Approved by Dana, 2026-11-16.*

**Shape**
- A few big, readable parts; a tree reads from dozens of leaves, not thousands.
- Thick, smooth trunks, often swollen at the base, with 2 to 6 main limbs curving or twisting gently.
- One silhouette family per species: Clumps, Cone, Umbrella, Fan, or Crown (a single trunk with a star of leaves at its top, as palms grow).
- Shrubs have their own section and six families by growth form: Mound, Vase, Spreading, Upright, Weeping and Creeping. A Bend gene pulls limbs down to hang or up to reach, for trees too. Nothing grows below the ground: a limb reaching it runs along it.
- Leaves are 3D parts with volume, not flat stamps, after Dana's flora references: Tendril, Curl, Frond, Spikes, Antler, Blade, Fan, Pad, Cup, Bulb. Strands taper to a point and grow out of their branch along its direction; a Droop gene bends fronds, blades and fans down or up. Up to three parts mix in one tree.
- Every leaf varies: each rolls its own size, bend, twist and brightness from a seed, so no two match and the species rebuilds the same.
- Parts grow out of their branch: a tube's base starts at the branch's own radius and widens, capped. Pads are umbrellas (`nms-umbrella-disc-trees`): a stalk flaring into the center of a level disc with a drooping rim.

**Color**
- Two gradients per species, read from walking distance: the canopy from inner and lower to outer and top, and the trunk from base to top, each a two-handle hue slider; Harmony sets the trunk from the leaves.
- Each species has a Color range: individuals turn its hues by their own amount, from their seed (SpeedTree's hue variation), and a Size range for how much its leaves differ.
- Up close only, each leaf part also blends from base to tip toward a Tip hue (as in `lowpoly-alien-flora-sheet`), fading out as the tree gets small on screen, as LOD groups switch by screen size (Dana, 2026-11-17, replacing her 11-16 "no per-leaf gradient"). Bands and bark texture stay out.
- Hues come from the planet palette as turns off the land color.
- Toon shading with the planet's own shade settings (`[S83]`), leaf normals bent outward from the canopy's center, leaves lit from both sides. Far trees flatten into silhouettes in the haze.

**Wind and effects**
- Trees sway with the Atmosphere's Wind, the way Crysis bends vegetation: the whole tree leans (more with height), and leaves flutter on their own. A small or young tree sways less than a tall one; a thick trunk barely sways, but its leaves always move (Dana, 2026-11-17).
- ✅ Glow (a soft light toward the tips, in the Tip hue) and Fireflies (lights drifting around the canopy, near the camera only) are genes that mutate per era and can start at 0; both follow the plant's size (a tree's height, a shrub's limb length), later its age on the Trees track. ✅ Selective bloom gives the glow a halo, in the Tree view for now; it joins the chunk with the trees.
- Effects cost only what is seen (Dana, 2026-11-17): wind and glow run in the tree shader, so only drawn trees pay; trees outside the view are culled; on the chunk the leaf flutter and floating lights run near the camera only, and bloom touches only the bloom layer.

**Randomizing**
- Three levels: New individual (a new seed), Vary (a cousin: Sims's mutation, each gene changing with the Evolution panel's Mutation rate by up to ±0.4 of its range, the rule evolution will use per era), New species (rolled from a family's start, many big leaves never together). A padlock on Shape, Leaves and Color keeps that group.

**Grouping**
- Woods are dense stands of one species at a shared height; scattered trees are a few of another species in the open. A Spread gene sets which (seed dispersal distance: short gives clumps, long gives lone trees), so evolution can make both on one planet.

**How they're made and tested**
- Procedural: EZ-Tree builds the trunk and limbs at runtime from a seed and its settings (the genes); its leaf step is taken over so our parts grow at its leaf spots.
- ✅ Tuned in a Tree view: the planet's species side by side on a turntable, each shown or hidden by its eye, as the layer list does (as SpeedTree's modeler and EZ-Tree's app tune one tree in isolation).
- ⚪ Next: placed on the chunk; then trees start at their own track's start on the World Clock and need humus (succession, Cordonnier 2017), and mutate per era.

---

## 🪜 Stages

*In order, each look-changing step its own test.*

1. ✅ **Life grid** (test 1): the simulation, algae and moss, the Biome section and right panel. Years is a slider until the World Clock is revised.
2. ✅ **Ground layer** (2026-11-10): terrain-driven placement and a palette tint, as built above. Open: moss strength (minimum saturation 0.5, awaiting Dana's go).
3. ✅ **Evolution of algae and moss** (built 2026-11-11, `[S87]`): selection by access to resources, death and renewal, not a fitness rule.
   - **Variants compete per cell:** 4 variants per type live side by side in every cell, each by its own genes against the cell's moisture, shade and temperature, sharing the cell's free space (JeDi-DGVM, Pavlick et al. 2013: many strategies per cell, trade-offs decide who survives; Cordonnier's growth into free space).
   - **Death and renewal:** die-back by stress, regrowth into freed space by vigor (Cordonnier).
   - **Mutation each era:** the least abundant variant is replaced by a mutant of the most abundant one; each gene changes with chance 0.2 by up to ±0.4 of its range (Sims 1991; mutations every reproductive cycle, arXiv 1905.10272). Seeded, so a rerun replays the same history.
   - **Genes, only visible ones:** hue turn, brightness, moisture need, shade need. Shown as the cell's color, the abundance-weighted mix of its variants.
   - ❓ Inferred, TUNABLE: 4 variants, an era of 50 years (at most 40 eras), gene spans (hue ±60°, the rest ±0.4), Variation from 0 to 2.
   - **As built:** Variation scales only hue and brightness (a look change, instant); a mutant starts from nothing; runs work out of sight and swap in when done. Controls: an Evolution section with its switch, Variation, Mutation rate and Shuffle.
   - **Algae by the shore:** wetness needs low ground and closeness to water, the latter within Shore reach (jump flooding, Rong and Tan 2006). The distance falloff shape is inferred, TUNABLE.
   - ⏸️ Evolution fully on the GPU, to remove the era read-back waits (`[B178]`).
4. ⚪ **Grass, then shrubs and trees:** new grid types that need humus (❓ threshold unsourced, to research); a tint first, then simple tufts and trees as geometry near the camera (Horizon Zero Dawn placement, EZ-Tree for trees).
5. ⚪ **The planet's far tint:** a coarse global grid.


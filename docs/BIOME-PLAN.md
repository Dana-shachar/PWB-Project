# Biome Plan

`Last updated: 2026-11-10`

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
- Color: a tint of the ground (Shane's multiplicative tint): the life's hue and saturation (1.1 to 1.5 times the land's, at least 0.35), the ground's own lightness, so its texture shows through. No texture of its own.
- Controls per type: Hue, Brightness, Moisture need, Shade need. Everything else fixed.

**Not sourced yet, to research or defer**
- ❓ Terrain-scale inputs (concavity, occlusion from the height map) and how they join the two masks; the Frostbite notes may cover it.
- 💡 A better velvet: the sheen model ([Estevez and Kulla 2017](https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf)) or Naughty Dog's moss lighting (Brinck and Maksimov, SIGGRAPH 2016).
- 📚 To download: [Andersson 2007, Frostbite terrain](https://www.advances.realtimerendering.com/s2007/Andersson-TerrainRendering(Siggraph07)-CourseNotes.pdf).

---

## 🪜 Stages

*In order, each look-changing step its own test.*

1. ✅ **Life grid** (test 1): the simulation, algae and moss, the Biome section and right panel. Years is a slider until the World Clock is revised.
2. ✅ **Ground layer** (2026-11-10): terrain-driven placement and a palette tint, as built above. Open: moss strength (minimum saturation 0.5, awaiting Dana's go).
3. ⚪ **Planet far tint:** a global grid at the drainage grid's resolution.
4. ⚪ **Bare ground:** the land ramp becomes soil and rock; color comes from life.
5. ⚪ **Genes and eras, only what shows:** each type's genome is its visible traits (hue turn, brightness, moisture need, shade need; temperature range kept but uncontrolled); Sims's mutation per era (m = 0.2, ±d = 0.4); the grid's cover decides which mutations last (❓ inferred, needs a source or hand selection as Sims did); eras unlock the next stage once enough humus builds (❓ threshold unsourced). Shape genes wait for plants big enough to see.
6. ⚪ **Grass, shrubs, trees and flowers:** new types on the grid, a tint first; geometry only for plants large enough to read from walking height, simple alien shapes, near the camera from density on the GPU (Horizon Zero Dawn).
7. ⚪ **Agents:** pollinators and animals reading and writing the grid.

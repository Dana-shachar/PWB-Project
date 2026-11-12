# 📅 Weekly Pushes

`Last updated: 2026-11-11`

*The syllabus's graded weekly report: what was attempted, how AI tools were used, what worked and what comes next. Newest first. Original screenshots live in the course folder `Cornell/Fall 26/PWB/Screenshots/`, outside the repo.*

> [!NOTE]
> **How the entries are numbered.** By the syllabus's own sessions (`Syllabus-FA26-DESIGN6197-SEM130-DRAFT.pdf`, in the course folder): the class meets on Wednesdays, and each weekly report is committed by the start of that Wednesday's class (10:10 am). Work stays in the earlier session's entry until it is committed: the first commit after a class starts the next session's entry. Two entries in one session are marked "part 1 of 2". Sessions 1 and 2 (Aug 26, Sep 2) are left empty, before the project started. The next sessions are pre-built at the end of this file: fill one in, then move it to the top.

---

## Session 13 · Wed 2026-11-18

`Covers 2026-11-11 to 2026-11-18 · Class topic: Optimization and performance · Due: start of class, 10:10 am`

*Made life evolve: algae and moss now compete in variants that mutate over eras, with algae held to the shore, and measured where the biome's time goes. Then added rocks to the chunk, placed by rules and casting real shadows.*

![The land chunk with evolved moss and algae, and the new Debug view under the view pill.](screenshots/2026-11-11-chunk-biome-evolution.png)

![Rocks on the chunk in walk mode: faceted boulders with grain, casting shadows on the ground.](screenshots/2026-11-11-chunk-rocks.png)

### 🛠️ Done
- **Evolution (`[S87]`):** 4 variants per life type compete for each cell's space (JeDi-DGVM), and each era the rarest is replaced by a mutant of the commonest (Sims 1991). A new mutant starts from nothing and grows in (`[B180]`). Controls: an Evolution switch, Variation, Mutation rate and Shuffle.
- **Performance, measured (`[B178]`):** a full regrowth took 10.6 s, of which 10.5 s was waiting on GPU read-backs and 0.06 s was the simulation. One read per era instead of two brought it to 6.2 s; the rest is deferred to evolution fully on the GPU.
- **No flicker (`[B181]`):** regrowth runs out of sight and swaps in when done, with a progress bar; Variation recolors instantly without a regrowth.
- **Algae by the shore (`[B179]`):** algae needs low ground and closeness to water, the distance from a jump-flooding map (Rong and Tan 2006), with a Shore reach slider.
- **Saving and switches (`[S88]`, `[S89]`, `[B182]`):** lighting saves and undoes with the planet; Climate and Terrain sections have on/off switches.
- **Debug view (`[S90]`):** a Patches mode colors each ground patch, to find seams.
- **Rocks (`[S91]`, `[S94]`):** a Props section. Rocks are placed per ground patch from a density map (Horizon Zero Dawn's method): rock fields with bare ground between, more below cliffs out to the rockfall shadow angle, along shores, none under water, few boulders toward the tops, small rocks clustered around boulders. Shapes are cut convex hulls with a flat base; colors are a hue range and saturation from the ground's color; sizes scale with the landscape so they read from the walk eye.
- **Real shadows (`[S93]`):** rocks cast into a three.js sun shadow map that follows the view and redraws only on change, darkening the ground by how much it faces the sun.
- **Walk camera collision (`[B190]`):** walking fast uphill, the view cut into the slope; the eye now has a collision sphere over the camera's near plane (as Unreal's spring arm). Measured 27 bad frames of 117 before, 0 after.
- **Standing on the drawn ground (`[S92]`, `[B184]`):** the walk eye sank up to 1.5 m into the terrain at low eye height, because heights were read from a finer texture than the mesh draws. Everything on the chunk now reads the actual drawn triangle.

### 🤖 How AI was used
- Claude built the evolution from the papers already in the references, and measured the regrowth's time before choosing a fix: the measurement showed that a planned shader rewrite would have gained almost nothing.
- For the rocks, Claude researched placement, shadows and grain before building, and measured each bug's cause in the running app (precision, the sinking eye, floating rocks, stutter) before fixing it.
- What Claude got wrong: it built several changes without Dana's go, and one "continue instead of regrowing" change made colors drift with every slider move until it was reverted. A Terrain switch version that hid every layer caused a tear and was reverted. Claude also ran repeated tests for causes that were already known, and Dana stopped it.

### ❌ What didn't work
- Continuing evolution from the current grid on a slider change: the drift added up, and results no longer matched a reload.
- Checking GPU read-backs every 4 ms instead of every frame: no gain, removed.
- Terrain off still leaves the chunk a sheet with no slab (`[B177]`), and the tear (`[B176]`) is not yet explained.
- Rocks first appeared only in walk mode, too small for the landscape and too scarce; a fake blob shadow never showed and was removed for real shadow maps; a screen-space grain stayed on the screen instead of the rock. Each was replaced after measuring why.

### ➡️ Next
- Rock scattering (`[B189]`), softer rock shapes, moss on rock tops. Then the tear and the flat slab when picked.

---

## Session 12 · Wed 2026-11-11

`Covers 2026-11-04 to 2026-11-11 · Due: start of class, 10:10 am`

*Made the land chunk trustworthy and walkable: fixed its patches, lag, water and walk mode, gave it a stylized look, and set the direction for the final: three alien planets built on the chunk.*

![The land chunk this week: lakes and sea standing where they can, slope rock, snow on the peaks and the layered haze sky.](screenshots/2026-11-09-chunk-stylized.jpg)

![The architecture diagram: the chunk's own lakes, walk mode and walk map, settings undo, the color grade pass, and the shared renderer's reversed depth.](diagrams/architecture-2026-11-10.svg)

### 🛠️ Done
- **Leftover patches (`[B113]`):** a lookup that assumed a fixed grid left 114 old patches on screen, covering 27.5% of the chunk twice. Now 0.
- **Lag (`[B114]`, `[B115]`, `[B117]`):** removed an unused run that blocked the page for up to 1.8 s, halved re-bakes per slider change, and cut patches by 31%.
- **Water flicker (`[B116]`):** depth precision went from 3 to 11 km to under 1 m at the tested distances.
- **Selection (`[B118]`):** turns off on release, Esc, thick outline, opens framed, works at face edges and on 4 km squares.
- **Erosion and saving (`[B119]`, `[B120]`):** erosion shows only its final state, no lakes while it's off, and settings including the gully sliders survive a reload.
- **Lakes on the chunk (`[S75]`):** the chunk solves its own lakes from the ground it draws, so water can't stand above its rim: 1,981 shore points with lower ground beyond them went to 0, with smooth shores. Water drains through the square's cut sides.
- **Tides as ratios (`[S76]`):** planet size, moon size, liquid and lake width all scale the tide, tied to no Earth value.
- **Walls and selection (`[B123]`, `[B125]`, `[S77]`):** the white lines on the chunk's sides are gone, and a drawn square starts under the cursor.
- **Lakes, walking and haze (`[B126]` to `[B128]`):** the chunk shows the planet's large lakes (1.8% to 79% of one square), lakes ripple at every zoom, walking stops at lake shores, and haze reaches the horizon.
- **Walk mode and walls (`[B129]` to `[B132]`, `[S80]`):** no more stripes or getting stuck on bumps, an Eye height setting on the Zoom slider, cameras stay above water, and the side walls show the true cross-section with the seabed under the water.
- **Saving and defaults (`[S74]`, `[S78]`):** the Erosion switch saves; a new planet starts bare with closed panels.
- **Water that stands only where it can (`[B133]`, `[B134]`):** planet lakes stop at their spill height instead of standing as cliffs beside lower ground (480 cliff edges to 0), lakes no longer follow the tide, and the sea shows only where it can reach.
- **Walk mode, fixed and measured (`[B135]` to `[B141]`):** 40 to 60 fps, no black holes in the sky, no walls streaking through far hills, no walking under lake edges, the camera never inside the ground, and a walk map: click a spot and glide there.
- **Seamless ground detail (`[B139]`, `[B142]`, `[B143]`):** the ground near the walker now loads at full detail, and patches of different detail blend into each other (geometry clipmaps' transition regions, timed as CDLOD), closing cracks of up to 3.5 m to 0.01 m.
- **Water look:** ripples sized per pixel so lakes ripple in walk mode, and a soft shore line on lakes.
- **Direction:** a concept and research question in the README, and a vertical slice of 3 to 5 distinct planets for the final, with rivers, plants and animals as chunk detail by real size (`[S79]`).
- **Walk mode diagnosis (`[B164]` to `[B168]`):** measured every walk-mode problem Dana reported before fixing it. The eye inside the ground came from walk mode reading heights the drawn triangles skip (24 m off on coarse ground), and coarse ground underfoot came from patch boxes that ignored the slab's lift (244 m a sample to 31 m after the fix). The tan plane is the tide rising over the land.
- **Water and look on the chunk (`[B158]` to `[B161]`, `[B163]`):** no floating water, lakes with their own look, sea level no longer reshapes the land, moving water and shore foam; slope rock, rule-based palettes for land, water, rock and sky, layered haze, and settings undo (Cmd+Z).
- **Vertical slice (Dana, 2026-11-08):** general development stops; the final shows three planets (living, lava, ice) built on the land chunk, each with one process that evolves on the World Clock.
- **Drips on hillsides (`[B171]`):** measured two causes. Far skirts showed through the ground because the depth buffer ran out of precision (1,660 pixels at one view, 0 after a reversed depth buffer), and coarse patches left their shared edges with finer ones (up to 1.66 km far away, now matched). The same depth fix ended the distant flicker (`[B157]`).
- **Walk speed and eye height:** walking speeds up with eye height, as Cesium's camera does (speed proportional to height), and the eye starts at 8 m, since walk mode's height read and the drawn ground still differ by up to 7 m (`[B165]`).
- **Color and shading (2026-11-10):** a per-planet color grade after the frame is drawn, in Unity's own math (split toning, lift, gamma, gain, saturation), and toon shading on the chunk from Unity Toon Shader's model, where shade is a color of its own. Measured the grade's cost: 4× edge smoothing dropped frames in walk mode, 2× matched no grade. Templates keep each slice planet's settings safe from day-to-day tuning (Flora made from Dana 01).
- **Biome, first round (2026-11-10):** life simulated on a grid (Cordonnier 2017's rules): algae at the shores, moss on damp, shaded ground, growing over years; drawn as a palette tint of the ground. Several detailed versions (cushions, relief, velvet) were cut for not reading from walking height.

### 🤖 How AI was used
- Claude drove the app through Chrome and measured each cause before a fix, comparing old and new behavior in the same session. Dana reproduced problems, set priorities and corrected wrong theories.
- What Claude got wrong: one plan rested on an overstated measurement, and one fix was real but not the cause of the reported slowness. Both came out in before and after tests. Later in the week Claude built changes without Dana's go, blamed the square's size for problems it hadn't measured, and one crack fix flattened the eroded land until a second fix; Dana caught each of these.
- For the drips, Claude first treated an inference ("skirts show through gaps") as proven and built a gap fix that barely changed the count; tracing which edges the visible skirts hung from found the real cause, depth precision. Research came from the sources' own code: the CDLOD paper, Geometry Clipmaps, Cesium's terrain loader and camera tutorial.

### ❌ What didn't work
- Gully walls of 85 to 88 degrees remain (`[B121]`), capped for now by limiting Gully Size. A grain line and soft close-ups remain (`[B122]`).
- A fade over map jumps hid the loading but read as a black screen, and was removed for a glide. Fine shading per patch showed borders between patches and was reverted; close ground is coarser than before (`[B143]`).
- A logarithmic depth buffer for distant flicker (`[B157]`) was built on an unmeasured theory and made walking about twice as slow; it was removed.
- A gap-only fix for the drips moved the visible skirts from 1,666 to 1,660 pixels: the gaps were real but not what showed. A walk height read from the drawn triangles was tried and reverted; the 8 m eye works around it for now.

### ➡️ Next
- The vertical slice, starting with the Flora planet: Planet 1's colors and walkable terrain (plains with some mountains). Walk bugs not seen since the drips fix (`[B164]`, `[B166]`, `[B168]`, `[B170]`, `[B156]`) are pending and reopen only if they return.

---

## Session 11 · Wed 2026-11-04

`Covers 2026-10-28 to 2026-11-04 · Due: start of class, 10:10 am`

*Gave the planet a water system, then rebuilt it so the land and lakes come from erosion itself: GPU stream power, an erosion filter and lakes sized by the climate. Fixed the regular pattern on the ground up close by giving the land chunk its own high-resolution height map, rebuilt the moons (up to five, randomized, with tides), then made every panel follow one hierarchy and softened the planet's haze into a rim.*

![Walk mode on the land chunk after the fix: smooth slopes down to the water, no stripes.](screenshots/2026-10-28-ground-smooth-after.png)

![The architecture diagram: the planet's water from erosion, in a GPU pass and a worker; erosion settings shared by planet and chunk.](diagrams/architecture-2026-11-04.svg)

### 🛠️ Done
- **Ground pattern fixed (`[B66]`, 2026-10-28):** up close the chunk showed stripes and stair-stepped ridges, because its heights were computed as points on the whole 6000 km planet, where floats round to about 0.6 m. The chunk now bakes its own 4096 height map from the planet's noise and resamples it smoothly; finer texture comes from Roughness. Before and after screenshots are in the issue. The water and shadows now read the same map, so the seabed is smooth too.
- **Moons (2026-10-28):** one to five moons in the chunk's sky, each with its own surface baked by the noise engine, two colors, size, place and crescent angle. Randomize sets them all (clearly different sizes, spread across the visible sky, colors that go with the sky, different textures), with a texture-only button and a dropdown for adjusting one moon. Screened over the sky so the shadow dissolves, split-toned (one color for the darks, one for the brights), a soft glow across the edge. A new design-system control, the Dial, sets each crescent's angle.
- **Tides (2026-10-28):** the chunk's water rises and falls every two minutes by the moons' sizes cubed (the tidal-force rule, exaggerated and capped); walk mode pushes the walker to dry ground as it rises.
- **Saving fixed (`[B70]`):** atmosphere changes, Roughness and Auto detail were never autosaved.
- **Concept:** *Everything* (David OReilly) added as an inspiration.
- **Colored shadows (2026-10-28):** the first land shader layer. The flat gray ambient became a sky fill, tinted by the sky's color and a Shadow hue, following Quilez's outdoor lighting rig: No Man's Sky's strong color, softened toward Gris and Sable, with unexpected shading colors set by rule.
- **Walk mode and panel (2026-10-28):** long-press to walk with a Speed slider; the eye no longer sinks into the ground; the planet's flicker while dragging light sliders fixed (`[B72]`); the Scene section grouped into Light, Shadows, Shine, Grid and View.
- **One panel hierarchy (2026-10-30, `[S47]`):** every section an accordion, closed by default; on/off switches in the headers; the noise modifiers as nested sections instead of tabs; swatches lined up on the right. New design-system pieces: a hue slider (Shadow hue, now saved per planet), a lock icon, a bare switch.
- **Randomize the atmosphere (2026-10-30, `[S45]`):** one button changes the whole atmosphere; locked colors stay and the rest are built around them. Moons are added and removed like layers, each with its own Crescent, Texture, Halo, Inner glow and color locks; Clouds got an on/off switch. Randomize now rolls three hidden drivers (storminess, air thickness, cloud climate) and derives the related sliders from them, so worlds come out coherent. Terrain Randomize was rebuilt the same way after it made spike balls (`[B77]`): layers get roles (continents, masked mountains, detail), and the atmosphere now clears the true highest peak (`[B76]`).
- **Haze as a soft rim (`[B74]`):** a stripe floated off the planet's edge because the haze's ground sat at the tallest peak; it now starts at the sea, and the air is deeper on purpose, so the rim reads as a glow. The glow's cut-out up close was the camera's far limit (`[B75]`).

![The planet with the deeper haze: a soft rim instead of a stripe.](screenshots/2026-10-30-haze-soft-rim.png)

- **Navigation:** Space + drag pans, beside Shift + drag; walk speed reaches ×10.
- **Moons that set (2026-10-30, `[B78]`):** a low moon showed through the see-through sea and never faded. Moons now set behind the sea and melt into the horizon color, after three.js's sky shader (airmass extinction), with a Blend slider per moon.
- **Moon colors from the sky (`[S48]`):** each moon has one hue relative to the sky, a shadow tone set by a color-harmony rule (complementary, triadic, analogous and so on) and a Saturation slider. A new design-system control, the two-handle hue bar, sets both tones.
- **An atmosphere shaped like its planet (2026-10-31, `[S49]`, `[B80]`):** on jagged planets a wide empty ring sat between the planet and its glow. The air now stands on the planet's averaged surface, the glow keeps the same gap on every planet, each surface hazes only the air in front of it (Lague's atmosphere, done per surface as iTwin.js does), and the clouds are three stacked layers.
- **Water up close:** Fresnel in both views, so low views read as water (`[B67]`); foam reaches a set distance from the shore in a soft lace of Voronoi edges (`[B83]`).
- **World types (2026-11-01, `[S52]`):** Terrain Randomize picks one of nine types first (ranges, archipelago, supercontinent, highlands, rolling, cellular, shattered, rifted, wild), after reading Lague's actual planet code and Minecraft's region noises. Mountains stay on land, coasts stay smooth, terraces are rare, planets stay round.
- **The planet spins (`[S51]`):** at any tilt, like Uranus or Venus, with clouds running along its equator against the spin.
- **A shader check (`[B85]`):** every shader now compiles with Khronos's reference compiler before a reload.
- **Water as a block (`[S50]`):** the chunk's water got see-through side walls; the grid no longer shows through the water in walk mode (`[B79]`).

![A low view of the coast: the seabed fading through the shallows into deep water.](screenshots/2026-11-01-shallows-low-view.png)

![A water world from orbit, with clouds along the equator of its tilted spin.](screenshots/2026-11-01-cloud-world-from-orbit.png)

- **Clarity in meters (`[B84]`):** Clarity no longer recolors the land. It's now 1 to 200 m, the same in both views.
- **Shore foam (2026-11-01):** clumpy foam by Parberry's saturation method, lingering behind each wave. Not perfect, parked (`[B92]`).
- **Rivers (2026-11-01, `[S53]`):** a drainage tree grown from the coast on a 4096 by 2048 map, 5.3 million nodes, built in about 1.5 s off the main thread. Rivers cross ridges only at their lowest pass, and splines and meanders curve their paths.
- **Lakes from a water budget (`[S54]`):** a lake grows until evaporation meets what flows in, so a dry world keeps small closed lakes and a wet one fills its basins and spills. Water at every point has its own height, and lakes draw real shorelines from the terrain.
- **Climate joined the atmosphere (`[S56]`):** a Climate section with Liquid, Rainfall, Temperature and Erosion, on the Atmosphere switch, and rolled by both Randomize buttons.
- **Other liquids (`[S57]`):** nitrogen, methane, ethane, ammonia, sulfuric acid, sulfur, lava and iron, each with its own ranges and behavior, as on Titan, Io and the hottest exoplanets.
- **Land shaped by water (`[S55]`, `[B89]`):** the turning point of the week. Narrow river cuts looked like scratches, because the noise never knew about water. The land is now computed from the river tree by the stream power law, the standard model of river erosion, in about 0.1 s. Ridges and branching valleys appear across every landmass, and an Erosion slider blends back to the plain noise.

![The eroded land: tributaries feeding lakes and running to the sea.](screenshots/2026-11-01-river-network.png)

![A lava world: wider channels from a thicker liquid.](screenshots/2026-11-01-lava-channels.png)

- **A real shader compiler (`[S58]`):** Khronos's glslangValidator now checks all 15 materials after every shader edit, because a passing build can't see inside shader text. It caught two errors this round before they reached the screen.
- **Limits:** noise layers capped at 15 to free a texture slot for the river map (`[S59]`). Rivers only reach the planet view so far; the chunk still shows sea water.
- **Water from erosion (2026-11-03, `[S65]` to `[S70]`):** the old river tree was removed. The planet now erodes on the graphics card (Schott et al.'s stream power, after a pit fill in a background worker), in 1 to 3 s with a progress bar, and Rune Skovbo Johansen's erosion filter, in its 3D port by Estqes, carves branching gullies into the smooth eroded ground. Lakes fill each basin by the climate's water budget (Fill-Spill-Merge), so a dry world keeps few lakes and a wet one fills its basins, and lakes drain as erosion cuts their rims. Rivers are built but not drawn yet: per-cell paths on the 18 km grid zigzagged (`[B109]`).
- **Erosion moved into the Climate System (`[S68]`):** one switch and one set of settings for the planet and the land chunk (Duration, Strength, and Shape sliders for the gullies), no Run button, and every change reruns only what it affects. Ocean became the sea only (`[S69]`); the timeline moved to its own World Clock (`[S70]`); a new design-system Progress bar shows how long is left.

![The eroded planet: branching gullies and ridges across the continent, lakes in its basins.](screenshots/2026-11-03-erosion-filter.png)

- **Rivers rebuilt around one cause (2026-11-02, `[B94]`):** a debug view measured that rivers were drawn onto a terrain they didn't shape. Kept from the day: a triangulated network instead of grid rows (`[B95]`), river levels from the shown terrain (`[B96]`), Génevaux's replace operator and basin priorities, and pits filled so rivers connect. The rest is written up as one water system design for the next session, with its open bugs (`[B97]` to `[B104]`).

### 🤖 AI process
- **A day lost to theories:** three fixes were built on unproven causes (octave tweaks, local coordinates for fine detail, smoothing) before Dana's own idea, a dedicated height map resampled at higher resolution, solved it. New working rules: check Dana's proposed mechanism against established tools first, build only on a measured cause, and edit docs only at commit.
- **Measured, finally:** a readout of identical neighboring heights proved the rounding, after a day of guessing.
- **The moon, round after round:** Claude tuned by reacting to each screenshot, so colors went neon, then pale, then neon again, and added changes Dana hadn't approved (a faint dark side, an edge overlap, renamed labels). It also built fixes straight after bug reports without a go. What worked: writing a target spec from the references once, approved by Dana, then building only that. Rule reinforced: change only what was approved, no cleanup or extras.

- **Guessing again on the haze and glow:** Claude offered causes and fixes before measuring (a draw-order change that altered the colors and fixed nothing, then a wrong reading of Dana's description). What worked: logs that printed the measured numbers (the haze's ground 0.31 units above the sea; the far limit at 40 against a glow reaching 65), and a test switch Dana could compare on her own planet. A frozen test copy on another port loaded a different planet, so that test meant nothing.
- **Unapproved style again:** the first moon sections carried a nested style Dana hadn't seen; now written into the design system so it can't drift.
- **An invented fix, caught:** Claude softened the haze's edge with a method of its own and called it done; it drew rings across the planet. Dana: only known, documented methods. It was undone and replaced with Lague's, read in the source code.
- **Unchecked assumptions:** a shader used an old texture function that three.js only translates in one shader stage, so the clouds vanished; a moon color helper dropped the second tone's offset. Both were found from the console and the code, then fixed.
- **Tokens:** research agents (55k, 13k, 59k, 29k, 9k tokens); Dana asked for narrower reads through the code index.
- **A workaround that kept breaking:** Claude built the spin by moving the camera, called the standard approach (rotating the planet) risky, and each fix uncovered another side effect. Dana stopped it and asked for one holistic fix. Reading every affected system first made it one clean pass.
- **Rivers, method first:** the course folder's papers answered most questions once they were actually read: Riverscapes for pit filling and splines, Davis for blending, Derzapf for water height per point. Dana's Cordonnier and Braun and Willett PDFs settled the erosion method, and corrected Claude's claim of "one pass" for their full method: they need 100 to 300 steps, and the one-pass form is an inference from a fixed tree.
- **Over-engineering, and asking too much:** Claude measured things Dana hadn't asked for, ran web searches while the papers sat in her folder, launched an agent on top of searches already running, and edited code on a reaction instead of a go. Dana stopped each one. New saved rules: read the course folder first, a reaction isn't a go, and a slider updates only its delta.
- **The same performance bug again:** the first climate slider regrew the whole river tree on each step, despite the repo's rule to reuse its fixes. Dana caught it.
- **Misreadings cost rounds:** "a different liquid" became Temperature picking the liquid, when Dana expected a dropdown; "contextual ranges" got a guess instead of a question. Her diagnosis of the terrain itself was right from the start: the landscape has to account for water.
- **A wrong figure:** Claude said the worker would hold about 100 MB; the arrays add up to about 500 MB.
- **A lost day on rivers (2026-11-02):** Claude fixed one symptom per screenshot, built on guesses and its own inventions, put several unproven changes into one test, and repeated failing approaches, so nearly every round looked worse. New rules came out of it: read the sources before the first fix, no inventions, one change per test, stop when a fix makes it worse. A web-reading agent used about 58k tokens. Claude also reported type checks as passing for a whole day when the command checked no files (`[B105]`), and an edit Dana rejected was written anyway, then undone.
- **2026-11-03, measure first, again:** the water map was applied upside down for half a day (`[B106]`): Claude defended "erosion off is unchanged" from its own probe while Dana kept seeing shifted land, until a log of land pulled to sea level (99%) proved the flip. The erosion filter was first fed the bumpy terrain against its author's own warning (`[B107]`). What worked: reading two existing ports of the filter on GitHub (Estqes, Bevy) before redoing it, and a probe that baked the planet with and without each layer.
- **2026-11-03, process:** Claude piled plan on plan, asked permission for crashes it had caused, coded a one-line fix before approval, and reread the same papers three times. New rules: diagnose and research before proposing; no code without a yes, except a crash from its own new code; keep paper summaries in `REFERENCES.md`.
- **Fixed recipes flatten variety:** copying one saved planet's numbers made every world alike; they became the center of ranges by world type. Dana's logs of liked and disliked rolls drove each round.

### 📊 Worked / didn't / next
- ✅ The chunk's own height map, resampled: the established terrain approach.
- ❌ Fixes built on theories: removed.
- ✅ A target spec written from the references, then built in one pass.
- ❌ Tuning by screenshot, and unapproved extras.
- ✅ Measured before fixing: an A/B test and a log proved the flicker's cause in one round.
- ✅ Measured numbers proved two causes in one round each, once logged.
- ❌ A fix tried before measuring: reverted.
- ✅ Reading the actual source code (Lague, iTwin.js, three.js `Sky.js`, Lohmüller) before building.
- ❌ An invented method presented as a fix: undone.
- ✅ A real compiler for shaders: the exact error on the first run.
- ❌ A camera workaround instead of the standard rotation: replaced.
- ✅ Reading the course papers before building: pit filling, splines, water height and stream power all came from them.
- ✅ An offline render before Dana's reload showed the erosion working, and a scaling bug, in one image.
- ❌ Narrow valleys tuned round after round: the real fix was the method, not the numbers.
- ❌ Actions without a go, and research around sources already at hand.
- ✅ A debug view of ground minus river level found the root cause in one look.
- ❌ A symptom per screenshot, several unproven changes per test, and invented methods: a day of churn.
- ✅ Water from erosion: the planet's land and lakes now come from one simulation, with a real before and after.
- ✅ Existing implementations (Estqes, Bevy) showed the right input for the filter in one read.
- ❌ A fix and its probe both wrong in the same direction (the flipped map): an hour of "it's working" against what Dana saw.
- ❌ Per-cell rivers on an 18 km grid: off until researched.
- ⏭️ Rivers, research first, combining the earlier river tree with the erosion (`ROADMAP.md` handover); then cleanup of the TEMP logs, the chunk's water, and slope rock; walk mode's `[B71]` is deferred.

---

## Session 10 · Wed 2026-10-28

`Covers 2026-10-21 to 2026-10-28 · Class topic: Agents and behavior: state machines and schedules · Due: start of class, 10:10 am`

*Made the repo safe to publish and took it public, added an architecture diagram generated from a script, then, after the rubric marked the concept "Fair", turned the project toward story: finished the water, added an atmosphere, and set a 2.5D art direction.*

![The architecture diagram: the app's modules and which one owns what.](diagrams/architecture-2026-10-26.svg)

### 🛠️ Done
- **Publishing:** the Firebase config now comes from environment variables (settings kept in a git-ignored local file, with a template in the repo). Without them the app still loads, with sign-in and saving off.
- **History cleanup:** the whole git history was rewritten twice, so no commit holds the personal email, the Firebase key or the licensed fonts. Every commit now carries the GitHub no-reply address.
- **Public repo:** chosen over adding the professor as a collaborator. Anyone cloning gets the system sans-serif in place of the licensed Helvetica.
- **Docs reorganized:** every doc but the README moved into `docs/`, with screenshots and diagrams in their own folders. The working rules stay local and untracked.
- **Architecture diagram:** generated by a local script, so it is rebuilt from the code's structure instead of hand-drawn, and it stays in step with every structural change.
- **Voronoi Jitter default** lowered from 1 to 0.7, so the slider has room in both directions.
- **Planet detail and zoom (2026-10-26):** the Resolution slider reads 128 to 8192 again and sits in the Scene panel behind an Auto detail toggle; every patch uses one fixed 64-cell mesh, which let close-ups keep splitting; the camera's speed and zoom scale with height above the ground; a planet-wide Roughness adds fractal detail that appears as you zoom.
- **Change of direction (2026-10-26):** the class rubric rated conceptual goals, development and design position "Fair". The story now drives the order: water, atmosphere, planet types (desert, forest, water, volcano, ice), terrain shading, clouds and storms, then evolving alien plants (L-systems, Karl Sims's gene mutation). Infrastructure work pauses. Ian Cheng's *Emissaries* is the anchor reference.
- **Water (2026-10-26):** a sea level shared by planet and chunk with a live "% land" readout; a depth color ramp with the land's ramp editor, split from the land ramp at sea level (the cartographic convention); Seascape's waves on both views, band-limited with distance, with crest foam, currents and waves breaking on the shore. Still being tuned.
- **Interface (2026-10-26):** menus start closed except Project and Edit; Color holds Land and Water parts; Space and drag pans the land chunk (Figma's convention); a click in walk mode walks at most 100 m and can be stopped.
- **Performance (2026-10-26):** the planet's height statistics moved onto the GPU histogram and an asynchronous read the chunk already used, removing a 250 ms freeze on every slider tick; per-frame work now copies only the camera position.

![The land chunk's water: Seascape's waves recolored by the water ramp, with shore foam.](screenshots/2026-10-26-chunk-water.png)

- **Water finished (2026-10-27):** a Water menu section; Shine and Reflection; wind sets wave length, height and speed (Pierson-Moskowitz and the deep-water dispersion relation), whitecaps and storm streaks by the Beaufort scale, and the glint's width (Cox and Munk); large Gerstner waves add moving light and dark variance; surf only where waves break (McCowan's criterion); seams at the planet's cube edges removed by triplanar mapping; planet frame rate up from about 20 to about 80 by skipping wave work that can't be seen.
- **Atmosphere (2026-10-27, replacing the Climate stage):** a sky dome over the land chunk (three.js's own example), haze, a rim glow and surface haze on the planet, and clouds with Horizon Zero Dawn's cloud lighting and edge erosion, NASA's cloud bands and NOAA's wind bands. General controls on the left, Wind, Clouds and Moon on the right panel.
- **Lighting fixed at the root (2026-10-27):** the land was lit in camera space and its planet normals pointed inward, hidden by a light setting that compensated. Both fixed in the shared shader code; a "Light follows camera" toggle (on by default) lights whatever is in view.
- **Art direction (2026-10-27):** 2.5D, real 3D but flatter, between No Man's Sky and Sable; reference images from No Man's Sky, Sable, Outer Wilds and Gris added to the repo. Shaders reorganized into folders by feature.
- **Land chunk detail (2026-10-26):** the chunk now splits into patches as you zoom, the planet's chunked level-of-detail rule over a flat square, so close-ups keep gaining shape. Patch textures carry a border of neighbor ground so lighting matches across edges. The chunk camera orbits and zooms around the ground under the cursor and stays above the terrain, Cesium's convention. Voxel style is being dropped.

### 🤖 AI process
- Rewrote history with care for what GitHub keeps: old commits may stay reachable by ID for a while, so the leaked key still needs restricting or regenerating at the source.
- The permission check blocked Claude from force-pushing, so Dana ran the force-pushes herself. That kept the irreversible step in her hands.
- The diagram's visual language was inferred from Dana's own reference diagrams, not from the app's design system, which governs the UI only.
- **Measured before fixing:** a first fix for close-up detail was a theory and made it worse. A temporary on-screen probe then showed the real limit (the mesh tiers exhausting the triangle budget), and the fix followed from that.
- **Two more slips (2026-10-26):** an unsourced slope method was bundled into an approved plan, then removed when no source turned up; and a claim about what a slider fed was stated without reading the code. Both are now standing rules: no unsourced add-ons, read before claiming.
- **Measured, then fixed (2026-10-26):** timing logs showed the slider lag was a full synchronous GPU readback; the chunk had already solved the same problem two weeks earlier, and the fix was to reuse it. A rule now requires checking past performance fixes first.
- **Debug views before guessing:** a temporary view that drew one ingredient of the water color at a time found two real bugs (an unlit water normal, a seabed that never faded), after two confident guesses had been wrong.
- **Copy tested work first:** a hand-built water shader went through several weak rounds before switching to a known shader (TDM's Seascape). The lesson is now a standing rule. Sources are verified by reading them, and when only a summary was read the docs say so; one article was pasted by Dana because the site blocks automated readers.
- **Research agents:** two research agents and several page-reading helpers were used, each reported with its token cost (about 7k to 63k each).
- **An unasked rewrite (2026-10-27):** asked to add wind and glint changes to the water, Claude replaced the whole tested water shader with a hand-written one. It broke the planet, looked worse and was reverted, at a large token cost. New standing rule: never replace a working system unless asked; layer onto it.
- **Root fixes over workarounds (2026-10-27):** a light setting of −4.3 had silently compensated for inward-facing normals. Fixing the space mismatch exposed it; the fix went into the shared normal function (`faceforward`), not another compensating value.
- **Sources read, not recalled:** the cloud formulas were read from the Horizon Zero Dawn slides themselves after a summary came back empty; claims recalled from memory were flagged as such.
- **A slip:** the README screenshot's alt text was written from the filename without looking at the image. It was checked against the image and corrected afterward.

### 📊 Worked / didn't / next
- ✅ Keeping secrets out of the code with environment variables and a template file, the standard approach for client config.
- ❌ The key had already been committed, so cleaning history alone does not undo the exposure.
- ✅ Reusing the chunk's GPU statistics for the planet: slider lag gone.
- ❌ Hand-built water, three rounds; the shader that works was copied, not invented.
- ✅ Layering the research onto the tested water shader instead of replacing it.
- ❌ Replacing Seascape with hand-written waves: reverted the same day.
- ⏭️ Test and tune the atmosphere, Swirl as Musgrave's Coriolis twist, rain or snow, then terrain shading in the 2.5D direction, then planet profiles.

---

## Session 9 · Wed 2026-10-21

*Unified the planet and chunk under one renderer, chased the chunk's color and shadow bugs to their real causes, then rebuilt how the planet picks its detail and how terrain noise is made. The week ran Monday 2026-10-19 to 2026-10-21 so far.*

![The planet with the pixel Resolution slider, the meters ramp, per-layer mask icons and the new Voronoi controls.](screenshots/2026-10-21-ramp-masks-and-resolution.png)

> [!NOTE]
> Screenshots are kept in the course folder, `Cornell/Fall 26/PWB/Screenshots/`, outside this repo. The copies in `docs/screenshots/` here are the ones the docs link to.

### 🛠️ Done
- One shared `WebGLRenderer`/canvas for both viewports (planet and chunk), replacing two independent ones, the base that lets a baked patch texture hand off straight to the GPU with no CPU readback.
- Both the planet and the chunk now render as terrain patches (a quadtree, each with its own baked heightmap) instead of one mesh sampling a shared map. Planet side was gated behind a flag at first, pending a render/freeze regression that did not reproduce when tested (2026-10-20).
- Land chunk: the material is built once and reused instead of rebuilt on every Resolution change (fixed a flash-to-flat flicker while dragging), resolution changes are debounced, and the texture ceiling was raised to the real WebGL2 floor (2048).
- Land chunk shading: the top surface and the cut walls/bottom cap now get two separate, non-bleeding elevation sources for color, lighting, and shadow, via a new per-triangle flag, fixing a hard seam that only showed up at certain light angles.
- Widened the normal-reconstruction gradient step, removing harsh, faceted-looking lighting on dense terrain.
- The elevation color ramp now reads the planet's own global range rather than computing one per patch, a whole-dataset color stretch, the standard GIS convention for this.
- Hydraulic erosion simulation (grid-based, GPU), with checkpointing and a scrub timeline.
- Real SVG icons replacing emoji button glyphs.
- **2026-10-20/21, the planet's patches:** seams between patches fixed at their cause (a half-texel edge offset, then different vertex counts across a detail boundary), then cross-face stitching, a patch cache so hidden patches are not rebuilt, and detail chosen by on-screen error in pixels (the 3D Tiles and Cesium convention) with the Resolution slider as a pixel threshold.
- **Color ramp:** a multi-stop gradient editor where every stop, including the base color, is equal and movable; elevations shown and editable in meters; planet and chunk share one lighting model with a shared normal function.
- **Terrain noise:** per-layer masks with their own pattern (Coverage, Softness, Invert, Shuffle), a better hash, octaves that fade out when finer than the grid, new controls (offset, stretch, warp scale, Voronoi jitter and distance, ridge offset and gain), fractal types (multifractal, hybrid, hetero, ridged) and extra octaves at deeper patches, all with ranges from one table so Randomize never hardcodes a range.
- **Interface:** Planet and Terrain merged into one panel, icon buttons, black wrapped tooltips, a reusable popup, and a `CODE-INDEX.md` so reads can be narrow.

### 🤖 AI process
- **2026-10-21:** blamed a stale browser tab for a missing base-color row that was a real bug; parked a requested zoom-detail feature as optional; built a uniform minimum Resolution that contradicted how the user expected zoom to work. Each was corrected, the last by confirming screen-space error against the Cesium and 3D Tiles docs.
- Held methods to sourced documentation: Gaea, Blender's Musgrave source, Quilez, Cesium, a peer-reviewed hash paper. Anything unsourced was flagged and left tunable.
- **A cost failure:** about 30 forked agents, 250,000 to 600,000 tokens each and many for small doc edits, used up the session limit. New binding rules: no forks, agents only with approval and a cost estimate, docs edited directly, narrow reads through the code index.
- Traced a wall-coloring "bleed" to its exact mechanism twice over: first an interpolating vertex attribute used as a material switch, then the same mistake found again in a second code block (normals, shadows) missed the first time.
- Corrected twice: once for treating a real, undecided design tradeoff as already settled, once for floating a dev-tooling explanation (stale hot-reload) ahead of the actual code-level bug.
- Checked a claim about dev-tooling behavior (Vite's hot reload, React's Fast Refresh) against real documentation before relying on it, then dropped it once a concrete, provable code cause was found instead.

### 📊 Worked / didn't / next
- ✅ Tracing a visual bug to the exact line and explaining the mechanism, instead of proposing a fix from a plausible-sounding theory.
- ❌ Two earlier wall-color fixes each solved the stated complaint but reintroduced a seam somewhere else. The durable fix needed a true non-interpolated flag, not a branch on an attribute already doing another job.
- ✅ Checking a method against its source before building it, which caught a wrong channel read in the planet's lighting and a hash that bands.
- ❌ Forking agents that inherit the whole conversation. It was the most expensive mistake of the week.
- ⏭️ Dana tests the batch, then the second fade pass for ridged, terrace, warp and Voronoi, bounded heights, plateaus, height in meters, undo/redo, and planet shadows.

---

## Session 8 · Wed 2026-10-14

*Rebuilt the planet on a cube sphere, and made the chunk a real piece of it.*

![The planet on the cube sphere, with the pipeline-stage menu down the left panel.](screenshots/2026-10-13-cube-sphere-terrain.png)

### 🛠️ Done
- Replaced the planet's longitude/latitude sphere with a cube sphere. A lat/long grid converges at two fixed points and cannot be subdivided locally, so it cannot support detail that follows the camera.
- Fixed the two seam bugs that switch exposed: a black slit, from lighting rebuilding its surface direction out of map coordinates, and terrain tearing at both poles, where the map's wrap line crosses the pole faces.
- Introduced the patch: one piece of the planet's surface with its own heightmap. Everything showing terrain now consumes patches.
- Rebuilt the land chunk as a patch drawn flat. Its Resolution reaches real detail instead of enlarging a window of a shared map, and double-clicking the planet picks which piece it shows.
- Moved the chunk onto the planet's lighting model, so the Scene controls mean the same thing in both views.
- Restructured the docs: split `SPEC.md` out of `ISSUES.md`, added `REFERENCES.md`, and cut both main docs by roughly two thirds.

### 🤖 AI process
- A wrong diagnosis cost most of the session. The claim was that reading height from the rectangular map is lossy at the poles; it is the reverse. A pipeline rebuild was built on it and reverted.
- What eventually found the real cause was rendering the data to screen rather than reasoning about it. Colouring the six faces ruled out a broken mesh; drawing height as greyscale showed exactly where it jumped.
- Two failures worth recording: a GPU texture-limit warning sat unread in the dev log throughout, and "the shader compiled" was treated as proof an approach worked when the failure was at bind time.

### 📊 Worked / didn't / next
- ✅ Building a diagnostic view instead of arguing further. Each one ruled out a whole class of cause in one screenshot.
- ✅ Checking conventions before committing to an architecture. Cesium's tile model and Outerra's per-patch heightmaps shaped the patch directly.
- ❌ Reasoning from first principles. It produced a confident wrong diagnosis and several fixes aimed at the wrong layer.
- ❌ Proposing small fixes already known to need replacing. Corrected toward building the durable unit once.
- ⏭️ Erosion as a reusable engine, plus the Timeline. Research points to grid-based rather than the droplet approach logged in September, since droplets need scattered writes that WebGL handles badly.

---

## Session 7 · Wed 2026-10-07

*Answered the procedural-system feedback with a pipeline, not a UI tweak.*

### 🛠️ Done
- Responded to class feedback that the project reads as 3D terrain software rather than a procedural system, by researching real tools rather than reacting with a UI tweak.
- Decided the pipeline and its stages: Terrain, Erosion, Climate, Biome, Color, Population, Events. Colour became its own shader-driven stage; Population and Events are new.
- Decided Erosion is built as one reusable engine, so disasters become parameter values rather than separate effects.
- Decided the chunk moves onto the planet's shader, so shadows get implemented once for both rather than per view.
- Planned the left panel as the pipeline menu, with the right panel showing the selected stage.

### 🤖 AI process
- Cited real sources for every naming and ordering decision rather than asserting a preference.
- Corrected twice on pushback: proposed the easier shadow path, and misplaced general settings inside a stage.
- Flagged one citation as unverified rather than presenting it as sourced.

### 📊 Worked / didn't / next
- ✅ Searching conventions before deciding. It overturned one instinct and confirmed another.
- ⚠️ Defaulted to the lower-effort path twice, corrected directly rather than caught by testing.
- ⏭️ Build the pipeline menu; unify the chunk's shading; begin erosion.

---

## Session 6 · Wed 2026-09-30 · part 2 of 2

*Separated height from opacity, and made the modifiers composable.*

![Modifiers as composable toggles, and the resizable panels.](screenshots/2026-09-30-modifiers-and-panels.png)

### 🛠️ Done
- Split terrain Height from the opacity composite into its own additive elevation channel, after the first pass turned out mathematically indistinguishable from Opacity.
- Fixed Ridged noise not being zero-mean, which inflated the whole planet once Height went unclamped.
- Made Height a percentage of its context, so one value reads proportionally on both the planet and the chunk.
- Made both panels user-resizable, and fixed the 2D canvas being a fixed-size square.
- Restructured noise modifiers from mutually exclusive types into composable toggles on any base generator, matching Gaea's structure.
- Received the class feedback on procedurality, and began a structured response rather than a cosmetic pass.

### 🤖 AI process
- Implemented before an explicit go-ahead again, caught and logged.
- Worked out the Height/Opacity collapse mathematically before proposing a fix rather than patching the symptom.
- Misdiagnosed a UI complaint once, then asked a precise question instead of guessing again.

### 📊 Worked / didn't / next
- ✅ Doing the elevation maths explicitly. The first instinct looked reasonable until tested.
- ⚠️ Three things needed a second full pass: the Height split, the panel width, and the Modifiers UI.
- ⏭️ Work through the procedural-system feedback properly.

---

## Session 6 · Wed 2026-09-30 · part 1 of 2

*Found the real resolution ceiling and rearchitected around it.*

### 🛠️ Done
- Rearchitected voxel meshing from a 3D grid to a column-based one, which was the real ceiling blocking the Resolution slider, and raised its maximum from 64 to 2048 as a result.
- Replaced four hand-derived wall cases with one boundary rule.
- Added layer multi-select with batch edit, visible drag-to-reorder, and a per-layer visibility toggle that genuinely skips a hidden layer's computation.

### 🤖 AI process
- Verified the new meshing's winding by hand via cross product rather than guessing.
- Added explicit checks for the new visibility field so older saved layers default to visible.

### 📊 Worked / didn't / next
- ✅ Tracing the Resolution ceiling to its real cause rather than raising the slider's maximum again, which had been tried first.
- ⏭️ Per-layer Height, contextual Resolution, shadows for the chunk.

---

## Session 5 · Wed 2026-09-23 · part 2 of 2

*Built the land chunk and the side-by-side view.*

### 🛠️ Done
- Added Redo, and reworked project naming so a project is never in an unnamed state.
- Built Stage 07: a side-by-side planet and chunk view with a resizable split and a mode control.
- Two render styles for the chunk from the same data: blocky voxel meshing in a Worker, and a smooth displaced surface extruded into a grounded slab.
- One shared gumball driving one or two cameras, each with its own reference distance.
- Fixed panes being destroyed on every view-mode switch, which reset the camera and the planet's colour.

### 🤖 AI process
- Corrected twice for implementing before a go-ahead, logged both times.
- Hand-verified the mesh winding rather than copying it, since it is derivable rather than a citable algorithm.

### 📊 Worked / didn't / next
- ✅ Designing the gumball around a list of targets from the start, once two instances was clearly wrong.
- ⚠️ Its zoom maths assumed the planet's scale and needed a second pass for the much smaller chunk.
- ⏭️ The voxel resolution ceiling; layer multi-select.

---

## Session 5 · Wed 2026-09-23 · part 1 of 2

*Real persistence, and two compositing bugs that needed the maths.*

![The layer stack with per-layer visibility, and project persistence.](screenshots/2026-09-22-layers-and-persistence.png)

### 🛠️ Done
- Set up real persistence: Firebase Auth and Firestore, anonymous sign-in, deployed security rules, and the layer stack saving per user.
- Fixed a compositing bug where adding a layer appeared to erase painted terrain beneath it. Took two attempts.
- Fixed brush strokes cutting off at the seam instead of wrapping.
- Rewrote stroke rendering as a distance to the whole stroke path, replacing a per-dab approach that left a visible crease.
- Restructured `ROADMAP.md` and `ISSUES.md` to Dana's design direction.

### 🤖 AI process
- Slipped once more on confirm-before-acting, caught and logged.
- Walked Dana through the Firebase console and CLI steps only she could do.
- Diagnosed two rendering bugs from screenshots via the actual maths rather than guessing.

### 📊 Worked / didn't / next
- ✅ Screenshots and live testing surfaced two subtle maths bugs that reading the shader would not have.
- ⚠️ The layer-erasing fix took two real attempts; the first applied the same mask twice.
- ⏭️ Erosion; revisit the still-jagged painted terrain.

---

## Session 4 · Wed 2026-09-16

*The layer stack, the brush, and lighting that finally showed relief.*

![Noise generation on the sphere, earlier the same week.](screenshots/2026-09-14-noise-and-sphere.png)

![Painting onto the heightmap, driving real displacement.](screenshots/2026-09-16-painting-and-displacement.png)

### 🛠️ Done
- Built the multi-layer noise system: a Photoshop-style stack up to 16 layers, each with its own type, parameters, opacity and blend mode.
- Built the paint brush on the 2D heightmap, with strength and feather, live on both the preview and the planet.
- Fixed the planet having no real per-pixel normal, so terrain bumps did not show in lighting at all.
- Fixed paint erase doing nothing, diluted partial-opacity strokes, a pole tear, a faceting regression, and a brush-radius unit bug.
- Iterated the feather model through four designs based on live testing.

### 🤖 AI process
- Slipped twice on confirm-before-acting, logged each time.
- Verified rather than assumed: GPU float-blending support, Gaea's blend-mode formulas, and the normal's winding by hand.

### 📊 Worked / didn't / next
- ✅ Testing live and iterating from what was on screen. Several bugs only made sense once rendered.
- ⚠️ The feather design took four attempts, because the intent needed pinning down before implementing rather than after.
- ⏭️ The stroke-opacity fix; rebuild Expand; restructure modifiers; erosion.

---

## Session 3 · Wed 2026-09-09

*Scaffolded the project and the base scene.*

### 🛠️ Done
- Scaffolded the project with Vite, React, TypeScript and Three.js.
- Built the base scene, the planet with its own GLSL shader, the UI component set, the left control panel, and ported the gumball widget.
- Set up the documentation structure, each file with a distinct scope.

### 🤖 AI process
- Strict confirm-before-acting from the start.
- Ported real code and values from `active-geometry-project` rather than inventing conventions, and debugged a StrictMode leak, an off-centre view, and a `pointer-events` cascade.

### 📊 Worked / didn't / next
- ✅ Going back to the actual source rather than memory. Once real font files and exact values were used, the UI matched.
- ⚠️ Several first passes drifted from the source without being flagged, caught by side-by-side comparison rather than by memory.
- ⏭️ Colour-picker decision, terrain generation, design-system tokenization.

---

## Session 2 · Wed 2026-09-02

`Covers 2026-08-26 to 2026-09-02 · Class topic: AI tools tutorial, context engineering, React and Three.js · Due: start of class, 10:10 am`

*No project work recorded this session.*

### 🛠️ Done

### 🤖 AI process

### 📊 Worked / didn't / next

---

## Session 1 · Wed 2026-08-26

`Covers up to 2026-08-26 · Class topic: Intro to the syllabus and lecture · Due: start of class, 10:10 am`

*No project work recorded this session.*

### 🛠️ Done

### 🤖 AI process

### 📊 Worked / didn't / next

---

## 🗓️ Pre-built sessions

*Skeletons for the rest of the semester. Fill one in, rename nothing, then move it above Session 9. The final deliverable is due Dec 18 and is a separate package, not a weekly entry.*

### Session 11 · Wed 2026-11-04

`Covers 2026-10-28 to 2026-11-04 · Class topic: Procedural cultures · Due: start of class, 10:10 am`

*⚪ One-line summary of the week.*

🖼️ `![caption](screenshots/2026-11-04-name.png)`

#### 🛠️ Done
- ⚪

#### 🤖 AI process
- ⚪

#### 📊 Worked / didn't / next
- ✅
- ❌
- ⏭️

### Session 12 · Wed 2026-11-11

`Covers 2026-11-04 to 2026-11-11 · Class topic: Optimization and performance · Due: start of class, 10:10 am`

*⚪ One-line summary of the week.*

🖼️ `![caption](screenshots/2026-11-11-name.png)`

#### 🛠️ Done
- ⚪

#### 🤖 AI process
- ⚪

#### 📊 Worked / didn't / next
- ✅
- ❌
- ⏭️

### Session 14 · Wed 2026-12-02

`Covers 2026-11-18 to 2026-12-02 · Class topic: Final review (no class on Nov 25, Thanksgiving break) · Due: start of class, 10:10 am`

*⚪ One-line summary of the week.*

🖼️ `![caption](screenshots/2026-12-02-name.png)`

#### 🛠️ Done
- ⚪

#### 🤖 AI process
- ⚪

#### 📊 Worked / didn't / next
- ✅
- ❌
- ⏭️

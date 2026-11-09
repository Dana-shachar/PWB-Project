# 🏞️ River plan

`Last updated: 2026-11-07`

*How the land chunk's rivers get built into its terrain, stage by stage, with the source behind every step and what still needs research first.*

> [!IMPORTANT]
> Rules for this plan, from Dana (2026-11-07):
> - Diagnose properly: measure the cause before any fix. No guesses.
> - Never suggest an unproven fix. A step with no proven source is researched first, flagged as tunable, or left out.
> - Build on professional structures: how production engines, terrain generators and the papers do it, never an in-repo system reused because it exists.
> - Fix causes, not symptoms.

---

## 🧭 Why rivers look wrong today

*The root cause, measured, and the decision it leads to.*

- **The build order is backwards.** The chunk's land is the planet's shape (noise, then erosion on about 18 km cells) plus fine noise detail. Rivers are then traced at 172 m on ground that has no valleys at that scale, and a trench is stamped in.
- Measured: the ground 0.2 to 0.5 km beside a river sits 11 to 21 m *below* the river, so rivers run along hillsides. The stamped trench leaves one-sided walls and notched banks. Details and every failed attempt are in `ISSUES.md` (`[B145]` to `[B153]`).
- Both established methods make the valleys and the rivers in the same step: rivers first with the terrain built around them (Génevaux et al. 2013), or erosion at river scale with rivers read from it (Gaea, World Machine, Houdini).

> [!NOTE]
> 🧭 **Decision (2026-11-07):** rivers first, terrain built around them (Génevaux et al. 2013), for the chunk only; the planet keeps its shape. Erosion at river scale was measured and ruled out (`[B145]`).

---

## 🗺️ The new build order

*The chunk's terrain, in the order it will be generated.*

1. Coarse ground: the planet's shape, without the chunk's fine detail.
2. Lakes: depressions filled to their spill points.
3. The river network, running through lakes.
4. Rivers as smooth splines.
5. A distance field to the rivers.
6. Valleys built from the rivers.
7. Fine detail, added after the valleys.
8. A channel inside each valley floor.
9. Water: river meshes, lakes, sea.

---

## 🔨 Stages

*Each stage names its files, what it adds or removes, its sources, and the measurement that proves it before the next one starts.*

Source tags: ✅ read and checked · 📚 known source, still to be read · ⚠️ no source yet, must be researched before building.

**Stage 1 · Coarse ground first** ⚪
- What: the 1024 preview that the lake and river solver reads is baked without the chunk's fine detail octaves. New option `withoutLocalDetail` in `RegionParams`, used in `ensureChunkBase` (`map/heightmap.ts`).
- Sources: ✅ this repo's own bake (the chunk's fine octaves are already a separate switch, `useLocalDetail`).
- Proof: the preview's relief at 172 m scale before and after; the planet's shape kept.

**Stage 2 · Lakes and the river network** ✅ built
- What: the existing solver (`rivers/chunkLakes.worker.ts`, `rivers/chunkRivers.ts`): Priority-Flood, fill-spill-merge lakes, multiple flow, flat drainage, rivers continuing from lake pour points, water levels meeting lakes and the sea at their surface.
- Sources: ✅ Barnes, Callaghan and Wickert 2020 and 2021 (depression hierarchies, fill-spill-merge); ✅ GRASS r.stream.extract (stream threshold, Holmgren 1994's multiple flow); ✅ Barnes, Lehman and Mulla 2014 on flats (read, ar5iv 1511.04433); 📚 Barnes, Lehman and Mulla 2014, Priority-Flood (used and tested, paper not read); base level (a river ends at the level of the water it flows into, standard geomorphology, no paper cited yet).
- Proof: every river ends in water or at a chunk edge (measured 29 of 29 mouths, 0 ending on dry land), and every lake carrying flow has an outflowing river.

**Stage 3 · Rivers as smooth splines** ⚪
- What: new function `fitRiverSplines` in `rivers/chunkRivers.ts`. Each stretch between junctions becomes a spline. The level along it only falls and ends at the receiving water's level. Heads taper instead of ending round. The output is a list of spline segments (points, level, flow), replacing the per-cell course texture.
- Sources: ✅ Peytavie et al. 2019 sec. 4 (river trajectories smoothed between nodes with piecewise cubic splines); ✅ Bruneton and Neyret 2008, Proland sec. 5.2 (rivers as vector curves; the level profile filtered, then never rising downstream).
- ⚠️ Missing: how far apart the control points sit. The bank-notch measurement shows the course's bends must be wider than the valley's half width, or the nearest point flips (offset curves fold where the offset passes the bend radius: Farouki and Neff 1990, 📚 to read). "Space the points at the river's width" is my inference and needs a source, or is flagged as tunable.
- ⚠️ Missing: how river heads end (taper shape and length).
- Proof: no bend tighter than the valley half width; the bank level jumps measured in `[B146]` drop from 13 per 192 samples to 0.

**Stage 4 · A distance field to the rivers** ⚪
- What: new file `voxel/riverField.ts` (class `RiverField`) and shader `shaders/water/riverField.frag.glsl`. The splines are drawn into a texture, then each texel's nearest river point (distance, level, width, flow direction) is spread across the chunk on the GPU. Removes `markNearestRiver` and the 3×3 nearest-cell lookup in `riverAt`.
- This stage makes the lookup fast and gives one smooth field. It does **not** fix the notches by itself; Stage 3 does.
- Sources: 📚 Rong and Tan 2006, jump flooding (not yet read); ⚠️ whether Unreal's water brush builds its distance field this way is unverified.
- Proof: the field matches a brute-force nearest search to within one texel.

**Stage 5 · Valleys built from the rivers** ⚪
- What: in the chunk base bake (`shaders/heightmap/heightmap.frag.glsl`), valley height = river level + a valley cross-section by distance. It's blended into the coarse ground by the replace operator, never raising land. Lakes are excluded; an outlet cuts down only to its lake's level.
- Sources: ✅ Génevaux et al. 2013 (river primitive h(p) = u_z(p) + δ(d(p)), cross-sections per river type, replace operator h = (1 − w) hA + w hB).
- ⚠️ Missing: valley width. Génevaux gives no numbers. Rosgen's valley types are the candidate (📚 not read; only his channel types are in the notes).
- ⚠️ Missing: fine detail on valley floors. Fading the detail out toward the floor has no source yet. Read how Génevaux combines primitives with noise first; leave it out if nothing covers it.
- Proof: the ground beside a river is higher than the river at every distance band (today 11 to 21 m lower within 0.5 km). Lakes keep their levels. 🖼️ Dana looks at this stage.

**Stage 6 · The channel** ⚪
- What: `riverCarve` in `shaders/water/riverNetwork.glsl` becomes the channel cross-section by river type, inside the valley floor. The flood-prone bank blend is removed; the valley replaces it.
- Sources: ✅ Peytavie et al. 2019 sec. 5 (cross-section area a = φ / ‖u‖, φ = 0.42 A^0.69; Rosgen templates); ✅ Rosgen 1994 (channel types by slope and entrenchment); ✅ Miller, Pavelsky and Allen 2014 (width 13.4 Q^0.46, depth 0.18 Q^0.47).
- Proof: no channel wall stands higher than the valley side next to it.

**Stage 7 · Water** 🟡 river mesh built
- What: `voxel/riverMesh.ts` builds from the splines (Stage 3) instead of cells. `shaders/water/chunkWater.frag.glsl` reads the distance field for shore and flow. The remaining gaps and creases (`[B151]`) are measured and their causes fixed. Every river-to-lake and river-to-sea join is checked.
- Sources: ✅ Unreal Engine water bodies (a river is an open spline with width and depth per point; the water mesh runs wider than the channel); ✅ Vlachos 2010 (flow-direction ripples, already in the code).
- Proof: no gaps, no double-drawn water, every join at the water's level. 🖼️ Dana looks at this stage.

**Stage 8 · The sea level speckle** 🔴
- What: reproduce `[B152]` at a mid sea level in my own tab, put the value back, measure which surface draws it, fix that cause. Recheck after Stage 7.
- Sources: none needed until the cause is measured.

**Stage 9 · River shape by slope** ⚪
- What: meanders only on gentle slopes; steps and pools on steep ones.
- Sources: ✅ Peytavie et al. 2019 (meanders only at low slope and moderate flow; steep rivers get basins and cascades); 📚 Langbein and Leopold 1966 (sine-generated meander curve, wavelength about 11 widths; not yet read).
- ⚠️ At this planet's 15% river slopes, every source says straight rivers in steep V valleys. See the open decision below.

**Stage 10 · Planet rivers from the same network** ⚪
- What: big rivers shown on the planet, matching the chunk's where they cross into it.
- Sources: 📚 Derzapf et al. 2011 (course folder, not yet read).

**Stage 11 · Cleanup and docs** ⚪
- What: remove every `TEMP rivers` hook; update `ISSUES.md`, `CODE-INDEX.md`, `REFERENCES.md`, `SPEC.md`, `ROADMAP.md` and the weekly entry with its architecture diagram.

---

## 📚 Research before building

*What has to be read and checked before the stage that needs it. Anything left unsourced is flagged as tunable or left out, and said so.*

1. Génevaux et al. 2013, valley sections: what it says about valley width and how primitives combine with noise (Stage 5). Course folder.
2. Rosgen's valley types and widths (Stage 5).
3. Farouki and Neff 1990 on offset curves, plus any source on spline control spacing for rivers (Stage 3).
4. Rong and Tan 2006, jump flooding; and whether Unreal's water brush uses it (Stage 4).
5. Langbein and Leopold 1966, meander geometry (Stage 9).
6. Derzapf et al. 2011 (Stage 10). Course folder.

---

## ❓ Open decision

> [!IMPORTANT]
> ❓ **The chunk's height.** The chunk draws much taller than the planet, so rivers drop about 15% (26 m per 172 m). By Peytavie and Rosgen, rivers that steep run straight in steep V valleys with no meanders. Calm, snaking rivers need the chunk drawn less tall. Dana's to decide; Stage 9 depends on it.

---

## 🗑️ Removed by this plan

*Kept here so nothing is rebuilt by mistake.*

- The stamped trench and its flood-prone bank blend (`riverCarve`'s bank part).
- The per-cell course texture with `markNearestRiver` and the 3×3 nearest-cell lookup.
- The chunk stream-power experiment (measured and ruled out, `[B145]`; it was never committed).

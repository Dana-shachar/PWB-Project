# 🐛 Issues

`Last updated: 2026-10-13`

*What is broken, what was broken and why, and problems that are tracked but not scheduled.*

> [!NOTE]
> Bugs only. Architecture and the decisions that define the system are in `SPEC.md`. Status by stage is in `ROADMAP.md`. Outside sources are in `REFERENCES.md`.
>
> A fixed bug keeps its cause, not just its fix, where the cause is something worth not repeating.

---

## 🔴 Open

### Expand shows a black preview
**Reported 2026-10-13 · `wrong but workable`**

- The noise canvas's Expand view renders black instead of the heightmap.
- Not diagnosed. Not established whether it predates the cube-sphere work or arrived with it. The 2D canvas reads the heightmap pipeline rather than the planet mesh, so a connection is not obvious either way.

### Soft blur and rough ridging at both poles
**Reported 2026-10-13 · `minor`**

- Improved but not solved. The hairline and the tearing are gone; a soft blur and some rough ridging remain.
- The mesh seam is fixed, so what is left is the rectangular map's own distortion: every longitude converges to one point at each pole, so the stored data bunches up there. Visible directly in the 2D preview, whose top and bottom edges smear the same way.
- Not fixable while the map is where detail lives. Goes when the planet reads patches, below.

### Terrain still jagged, feather still subtle
**Reported 2026-09-22 · `minor` · 🟡 tabled by Dana until after erosion**

- Painted features still displace with jagged edges and the feather is hard to see.
- Likely the sphere's mesh resolution being too coarse for a narrow painted feature, since displacement only happens at vertices.

---

## 📋 Tracked, not scheduled

### The planet's own detail is capped by the map
**Raised 2026-10-13**

- The planet still displaces from one 1024x512 map, so zooming into it reveals nothing past what that holds. The pole blur above is the same cause.
- The land chunk no longer has this problem, since it reads its own patch. The planet gets the same treatment by rendering as patches.
- **The documented answer:** evaluate terrain from a function of 3D position rather than storing it, and render per-patch heightmaps as patches subdivide. Sources in `REFERENCES.md`.

### GPU compute for voxel meshing
**Raised 2026-09-23**

- CPU meshing has a real ceiling: worst-case triangle counts at very high resolution risk crashing the tab from raw buffer size.
- Not adopted because Three.js cannot run both renderers at once, so it would mean migrating the entire app and porting every hand-written shader to a different shading language.

### Design-system tokenization
**Raised 2026-09-09**

- Colors, lighting, camera distance and similar are scattered inline with no central place to adjust them. Each is flagged `TODO(DS)` until they move into CSS custom properties and a scene-config file.

### Wireframe overlay doesn't track displacement
**Raised 2026-09-14**

- The overlay is built once from undisplaced geometry, so it never follows the real terrain. Barely visible until terrain had real height; obvious now.
- Fix is to give it its own shader sampling the same heightmap.

---

## ✅ Fixed

*Newest first. Kept where the cause is worth not repeating.*

### Terrain tore into streaks at both poles
**Fixed 2026-10-13**

- The map wraps at longitude 180°, and that line crosses both pole faces, so triangles sitting on it read from both ends of the map at once and smeared the whole map width across themselves.
- Each pole face is now generated as two halves split along that line, so no triangle spans it. The same approach `SphereGeometry` uses at its own seam, which is why the old sphere never showed this.
- A separate symptom, a black slit across the surface, had a different cause: lighting rebuilt its surface direction from map coordinates, which jump at the wrap line. It now works from each point's 3D position.

### ⚠️ A wrong diagnosis, and what it cost
**Reverted 2026-10-13 · kept deliberately**

- **The claim:** that reading height out of the rectangular map is lossy at the poles. It is the reverse. An equirectangular map over-samples near the poles, so no detail was being lost.
- **What was built on it:** the layer stack split into a shared module so the planet could evaluate terrain from 3D position. That meant the vertex shader sampling sixteen paint textures, which exhausted the GPU's texture slots, so no height reached the planet and it rendered perfectly smooth. All reverted.
- **How it went unnoticed:** the texture limit was a warning in the dev server log the whole time and was not read; "the shader compiled" was treated as proof the approach worked, when the failure was at bind time; and several rounds went into reasoning about what should happen rather than looking at the rendered data. What found it was drawing the height value on screen as colour.

### The chunk's surface speckled with flickering dark patches
**Fixed 2026-10-13**

- Terrain height clamps at zero and the slab's base cap also sat at zero, so every flat-bottomed area put the top surface and the base at identical depth. The GPU cannot order two coincident surfaces.
- The base now sits below zero, giving the slab real thickness.

### Ridged noise inflated the whole planet rather than its peaks
**Fixed 2026-09-24**

- `ridge(x) = 1 - abs(x)` peaks where its input is most common, so its output sat near maximum almost everywhere. Every other noise type here is symmetric around zero; Ridged alone carried a strong positive bias.
- Invisible while the old pipeline clamped everything, but once Height applied the raw value as unclamped additive elevation, the bias scaled with it.
- Fixed by re-centering `ridge` itself rather than special-casing one noise type downstream.

### Replayed strokes and undo didn't update until clicked
**Fixed 2026-09-22 · two different causes**

- **On reload:** a real ordering bug. React runs a child's effects before its parent's, so the views read the texture before the parent had replayed into it. Fixed by reordering so replay happens before state is set, and the earlier workaround was deleted rather than left alongside.
- **On undo:** not ordering but a missing connection. The 2D canvas only watched layers, and undo only changes history, so no ordering fix could help. A small counter threaded down as a prop is the legitimate use of a signal here.
- Worth distinguishing: fix the order when it is an ordering bug, add a signal only when there is genuinely no connection.

### A new layer visually erased painted terrain beneath it
**Fixed 2026-09-22 · after 2 wrong attempts**

- An empty layer's flat gray placeholder read as real opaque content at full opacity, replacing everything under it. No data was lost; purely a compositing bug.
- The fix applies the paint mask exactly once as coverage, with the composite starting at neutral gray rather than black. Starting at black had made painted black indistinguishable from nothing painted.

### App.tsx became a five-feature monolith
**Fixed 2026-09-22**

- Lighting, planet appearance, layers, painting and persistence had all accumulated as loose state directly in `App.tsx`, each wired in as it was built.
- Split into one hook per feature, with `App.tsx` reduced to composition only.
- The standing rule came out of this: give a feature its own hook the moment it adds state, rather than accumulating and splitting later. Caught by Dana rather than done proactively.

### Brush strokes cut off at the seam
**Fixed 2026-09-22**

- Falloff used a plain distance in map coordinates, which does not know the left and right edges are the same place. Wrapping the horizontal component fixed it. Does not retroactively repair strokes painted before the fix.

### Stroke drag hardened soft edges
**Fixed 2026-09-22 · after one wrong fix**

- Compositing each dab over the last saturated a soft edge into a hard one within a single drag.
- A max-accumulation buffer fixed the hardening but left a crease in the falloff wherever two dabs were equidistant, invisible in flat colour but visible once it drove displacement.
- The fix computes distance to the whole stroke path at once, one smooth shape with no crease, which also removed a separate buffer and pass.

### Smooth-mesh walls were missing on some sides
**Fixed 2026-09-23**

- Four walls each had their winding derived independently, so there were four chances to get the sign wrong, and a wrong winding makes a face invisible.
- Replaced with one boundary walk using a single formula, verified once rather than four times.

### Switching view mode reset the planet's colour and camera
**Fixed 2026-09-23**

- The view-mode control conditionally rendered each pane, so leaving a mode destroyed that pane's whole scene, camera and renderer. Returning built a new one from scratch, showing the shader's construction-time placeholder colour.
- Both panes now stay mounted and only their visibility toggles.

### Painting toward black did nothing
**Fixed 2026-09-16**

- WebGL clamps shader output before blending, which silently zeroed a negative erase value, and blending into a float target needs an extension that is not reliably supported.
- Replaced GPU blending with ping-pong targets, where each stroke computes the complete new frame in the shader.

### Terrain bumps didn't show in lighting
**Fixed 2026-09-16**

- A screen-space-derivative normal was tried first and faceted the whole sphere, since derivatives are near-constant per triangle. Dana liked the look enough to keep it as a possible future style option.
- The fix computes the sphere's tangent basis analytically, so the normal is smooth and independent of mesh resolution.
- Two follow-ups: tangents were unit-sphere-relative while displacement was world-scaled, and `normalMatrix` is auto-set by Three.js but not auto-declared in the fragment stage.

### Panel width changed with content
**Fixed 2026-09-30**

- Panels auto-sized to whatever was visible, so they resized whenever an accordion opened or a tab switched. A hardcoded width was rejected in turn.
- Fixed by porting a drag-handle pattern, so width changes only on an explicit drag.
- Follow-up: at narrower widths, slider and select rows overflowed rather than shrinking, because browsers give those inputs an intrinsic minimum that `flex: 1` alone cannot override.

### Older fixes, kept briefly

- **Gumball drew on top of the right panel**, since it was positioned against the window rather than the viewport (2026-09-14).
- **Gumball axis drags did nothing**, two `pointer-events` gaps (2026-09-09).
- **Expand covered the whole window** including both panels, instead of replacing the viewport's content (2026-09-24).
- **Grid duplicated on resolution change**, a StrictMode-related leak (2026-09-09).
- **Chunk sat half-buried under the grid**, because the mesh centred all three axes including the vertical one (2026-09-23).
- **Partial-opacity strokes looked dark**, because value and mask were blended at the same rate rather than by Porter-Duff "over" (2026-09-16).
- **Brush radius used the canvas's display size** rather than the texture's fixed resolution (2026-09-16).
- **Old saved layers defaulted to hidden**, because a missing field read as falsy rather than as visible (2026-09-23).

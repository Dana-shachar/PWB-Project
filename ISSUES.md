# 🐛 Issues

`Last updated: 2026-10-13`

*What is broken, what was broken and why, and problems tracked but not scheduled.*

> [!NOTE]
> 🔴 open · 🟡 partial or tabled · ✅ fixed · 📋 tracked, not scheduled
> Severity is a text tag: `blocks work` · `wrong but workable` · `minor`
>
> Bugs only. Architecture and the decisions behind it are in `SPEC.md`. Status by stage is in `ROADMAP.md`.

```
🔴 Open        2
🟡 Partial     1
📋 Tracked     4
✅ Fixed      22
```

<details>
<summary>📋 <b>Format</b></summary>

```markdown
### [id] Short title · `severity`
**🔴 Open** · **Found:** YYYY-MM-DD · **Where:**

**What happens**
-

**Cause**
-
```

IDs are assigned in date order and never reused, so a reference stays valid once an entry moves between sections. Entries are grouped by topic, newest first within each group. When fixed, the status line gains the date and what it was.

</details>

---

## 🪐 Planet mesh

*The sphere itself, its seams, and the poles.*

### [B26] Soft blur and rough ridging at both poles · `minor`
**🔴 Open** · **Found:** 2026-10-13 · **Where:** the heightmap's own format

**What happens**
- Improved but not solved. The hairline and the tearing are gone; a soft blur and some rough ridging remain at both poles.

**Cause**
- Every longitude converges to one point at each pole, so data stored in a rectangular map bunches up there. Visible directly in the 2D preview, whose top and bottom edges smear the same way.
- Not fixable while the map is where detail lives. Goes with [B28].

### [B24] Terrain tore into streaks at both poles · `blocks work`
**✅ Fixed:** 2026-10-13 · **Found:** 2026-10-13 · **Where:** `planet/mesh.ts`

**What happened**
- Terrain tore into thin stretched streaks at both poles once height was turned up. A separate symptom, a black slit across the surface, appeared at the same time.

**Cause**
- The map wraps at longitude 180°, and that line crosses both pole faces, so triangles sitting on it read from both ends of the map at once and smeared the whole map width across themselves.
- The black slit had a different cause: lighting rebuilt its surface direction from map coordinates, which jump at the wrap line.

**Fix**
- Each pole face is generated as two halves split along that line, so no triangle spans it. The same approach `SphereGeometry` uses at its own seam, which is why the old sphere never showed this.
- Lighting now works from each point's 3D position rather than from map coordinates.

### [B25] ⚠️ A wrong diagnosis, and what it cost · `blocks work`
**✅ Reverted:** 2026-10-13 · **Found:** 2026-10-13 · **Kept deliberately**

**The claim**
- That reading height out of the rectangular map is lossy at the poles. It is the reverse: an equirectangular map over-samples near the poles, so no detail was being lost.

**What was built on it**
- The layer stack was split into a shared module so the planet could evaluate terrain from 3D position. That meant the vertex shader sampling sixteen paint textures, which exhausted the GPU's texture slots, so no height reached the planet and it rendered perfectly smooth. All reverted.

**How it went unnoticed**
- The texture limit was a warning in the dev server log the whole time and was not read.
- "The shader compiled" was treated as proof the approach worked, when the failure was at bind time.
- Several rounds went into reasoning about what should happen rather than looking at the rendered data. What found it was drawing the height value on screen as colour.

---

## 🎨 Painting & brush

*Authoring by hand, and what the strokes produce.*

### [B27] Expand shows a black preview · `wrong but workable`
**🔴 Open** · **Found:** 2026-10-13 · **Where:** the noise canvas's Expand view

**What happens**
- Expand renders black instead of the heightmap.

**Cause**
- Not diagnosed. Not established whether it predates the cube-sphere work or arrived with it. The 2D canvas reads the heightmap pipeline rather than the planet mesh, so a connection is not obvious either way.

### [B14] Terrain still jagged, feather still subtle · `minor`
**🟡 Tabled** by Dana until after erosion · **Found:** 2026-09-22

**What happens**
- Painted features displace with jagged edges, and the feather is hard to see.

**Cause**
- Likely the sphere's mesh resolution being too coarse for a narrow painted feature, since displacement only happens at vertices.

### [B13] Stroke drag hardened soft edges · `wrong but workable`
**✅ Fixed:** 2026-09-22, after one wrong fix · **Found:** 2026-09-16

**Cause**
- Compositing each dab over the last saturated a soft edge into a hard one within a single drag.
- A max-accumulation buffer fixed the hardening but left a crease in the falloff wherever two dabs were equidistant, invisible in flat colour but visible once it drove displacement.

**Fix**
- Distance is computed to the whole stroke path at once, one smooth shape with no crease, which also removed a separate buffer and pass.

### [B12] Brush strokes cut off at the seam · `wrong but workable`
**✅ Fixed:** 2026-09-22 · **Found:** 2026-09-22

**Cause**
- Falloff used a plain distance in map coordinates, which does not know the left and right edges are the same place.

**Fix**
- Wrapping the horizontal component. Does not retroactively repair strokes painted before the fix.

### [B15] Replayed strokes and undo didn't update until clicked · `wrong but workable`
**✅ Fixed:** 2026-09-22 · **Found:** 2026-09-22 · **Two different causes**

**Cause**
- **On reload:** a real ordering bug. React runs a child's effects before its parent's, so the views read the texture before the parent had replayed into it.
- **On undo:** not ordering but a missing connection. The 2D canvas only watched layers, and undo only changes history, so no ordering fix could help.

**Fix**
- Reload: reordered so replay happens before state is set, and the earlier workaround was deleted rather than left alongside.
- Undo: a small counter threaded down as a prop, the legitimate use of a signal here.
- Worth distinguishing: fix the order when it is an ordering bug, add a signal only when there is genuinely no connection.

### [B07] Painting toward black did nothing · `blocks work`
**✅ Fixed:** 2026-09-16 · **Found:** 2026-09-16

**Cause**
- WebGL clamps shader output before blending, which silently zeroed a negative erase value, and blending into a float target needs an extension that is not reliably supported.

**Fix**
- Ping-pong targets instead of GPU blending, so each stroke computes the complete new frame in the shader.

### [B08] Partial-opacity strokes looked dark · `minor`
**✅ Fixed:** 2026-09-16 · Value and mask were blended at the same rate rather than by Porter-Duff "over".

### [B09] Brush radius used the canvas's display size · `minor`
**✅ Fixed:** 2026-09-16 · Converted against the texture's fixed resolution instead.

---

## 🧱 Layers & noise

*Generating terrain and composing it.*

### [B18] Ridged noise inflated the whole planet rather than its peaks · `wrong but workable`
**✅ Fixed:** 2026-09-24 · **Found:** 2026-09-24

**Cause**
- `ridge(x) = 1 - abs(x)` peaks where its input is most common, so its output sat near maximum almost everywhere. Every other noise type here is symmetric around zero; Ridged alone carried a strong positive bias.
- Invisible while the old pipeline clamped everything, but once Height applied the raw value as unclamped additive elevation, the bias scaled with it.

**Fix**
- Re-centred `ridge` itself rather than special-casing one noise type downstream.

### [B10] A new layer visually erased painted terrain beneath it · `blocks work`
**✅ Fixed:** 2026-09-22, after 2 wrong attempts · **Found:** 2026-09-22

**Cause**
- An empty layer's flat gray placeholder read as real opaque content at full opacity, replacing everything under it. No data was lost; purely a compositing bug.

**Fix**
- The paint mask is applied exactly once as coverage, with the composite starting at neutral gray rather than black. Starting at black had made painted black indistinguishable from nothing painted.

### [B17] Old saved layers defaulted to hidden · `wrong but workable`
**✅ Fixed:** 2026-09-23 · A missing field read as falsy rather than as visible.

---

## 🧊 Land chunk

*The flattened detail view and its two render styles.*

### [B23] The chunk's surface speckled with flickering dark patches · `wrong but workable`
**✅ Fixed:** 2026-10-13 · **Found:** 2026-10-13 · **Where:** `voxel/smoothMesh.ts`

**Cause**
- Terrain height clamps at zero and the slab's base cap also sat at zero, so every flat-bottomed area put the top surface and the base at identical depth. The GPU cannot order two coincident surfaces.

**Fix**
- The base sits below zero, giving the slab real thickness.

### [B16] Smooth-mesh walls were missing on some sides · `wrong but workable`
**✅ Fixed:** 2026-09-23 · **Found:** 2026-09-23

**Cause**
- Four walls each had their winding derived independently, so there were four chances to get the sign wrong, and a wrong winding makes a face invisible.

**Fix**
- One boundary walk using a single formula, verified once rather than four times.

### [B19] Switching view mode reset the planet's colour and camera · `wrong but workable`
**✅ Fixed:** 2026-09-23 · **Found:** 2026-09-23

**Cause**
- The view-mode control conditionally rendered each pane, so leaving a mode destroyed that pane's whole scene, camera and renderer. Returning built a new one, showing the shader's construction-time placeholder colour.

**Fix**
- Both panes stay mounted and only their visibility toggles.

### [B20] Chunk sat half-buried under the grid · `minor`
**✅ Fixed:** 2026-09-23 · The mesh centred all three axes including the vertical one.

---

## 💡 Lighting

*How surfaces are shaded.*

### [B06] Terrain bumps didn't show in lighting · `wrong but workable`
**✅ Fixed:** 2026-09-16 · **Found:** 2026-09-16

**Cause**
- A screen-space-derivative normal was tried first and faceted the whole sphere, since derivatives are near-constant per triangle. Dana liked the look enough to keep it as a possible future style option.

**Fix**
- The sphere's tangent basis is computed analytically, so the normal is smooth and independent of mesh resolution.
- Two follow-ups: tangents were unit-sphere-relative while displacement was world-scaled, and `normalMatrix` is auto-set by Three.js but not auto-declared in the fragment stage.

---

## 🖥️ UI & panels

*The controls and the viewport around them.*

### [B22] Panel width changed with content · `wrong but workable`
**✅ Fixed:** 2026-09-30 · **Found:** 2026-09-30

**Cause**
- Panels auto-sized to whatever was visible, so they resized whenever an accordion opened or a tab switched. A hardcoded width was rejected in turn.

**Fix**
- A drag handle, so width changes only on an explicit drag.
- Follow-up: at narrower widths, slider and select rows overflowed rather than shrinking, because browsers give those inputs an intrinsic minimum that `flex: 1` alone cannot override.

### [B21] Expand covered the whole window · `wrong but workable`
**✅ Fixed:** 2026-09-24 · It overlaid both panels instead of replacing the viewport's content.

### [B03] Gumball drew on top of the right panel · `minor`
**✅ Fixed:** 2026-09-14 · Positioned against the window rather than the viewport.

### [B02] Gumball axis drags did nothing · `wrong but workable`
**✅ Fixed:** 2026-09-09 · Two `pointer-events` gaps.

### [B01] Grid duplicated on resolution change · `minor`
**✅ Fixed:** 2026-09-09 · A StrictMode-related leak.

---

## 🏗️ Architecture

*Structural problems, and limits tracked but not scheduled.*

### [B11] App.tsx became a five-feature monolith · `wrong but workable`
**✅ Fixed:** 2026-09-22 · **Found:** 2026-09-22

**Cause**
- Lighting, planet appearance, layers, painting and persistence had all accumulated as loose state directly in `App.tsx`, each wired in as it was built.

**Fix**
- One hook per feature, with `App.tsx` reduced to composition only.
- The standing rule came out of this: give a feature its own hook the moment it adds state, rather than accumulating and splitting later. Caught by Dana rather than done proactively.

### [B28] 📋 The planet's own detail is capped by the map
**📋 Tracked, not scheduled** · **Raised:** 2026-10-13

- The planet still displaces from one 1024x512 map, so zooming into it reveals nothing past what that holds. [B26] is the same cause.
- The land chunk no longer has this problem, since it reads its own patch. The planet gets the same treatment by rendering as patches.
- **The documented answer:** evaluate terrain from a function of 3D position rather than storing it, and render per-patch heightmaps as patches subdivide. Sources in `REFERENCES.md`.

### [B05] 📋 GPU compute for voxel meshing
**📋 Tracked, not scheduled** · **Raised:** 2026-09-23

- CPU meshing has a real ceiling: worst-case triangle counts at very high resolution risk crashing the tab from raw buffer size.
- Not adopted because Three.js cannot run both renderers at once, so it would mean migrating the entire app and porting every hand-written shader to a different shading language.

### [B04] 📋 Wireframe overlay doesn't track displacement
**📋 Tracked, not scheduled** · **Raised:** 2026-09-14

- The overlay is built once from undisplaced geometry, so it never follows the real terrain. Barely visible until terrain had real height; obvious now.
- Fix is to give it its own shader sampling the same heightmap.

### [B00] 📋 Design-system tokenization
**📋 Tracked, not urgent** · **Raised:** 2026-09-09

- Colors, lighting, camera distance and similar are scattered inline with no central place to adjust them. Each is flagged `TODO(DS)` until they move into CSS custom properties and a scene-config file.

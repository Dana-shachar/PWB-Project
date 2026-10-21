uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
// Key light strength — the standard way to separate a lit surface from its
// shadow is to raise the light, not to reshape the falloff curve (reverted
// 2026-10-13, see ISSUES.md). Blinn-Phong's own split of a scene into
// ambient + diffuse + specular terms, each with its own real strength.
uniform float uLightIntensity;
// Specular highlight strength and tightness (Blinn-Phong, Blinn 1977) — the
// other standard term this shading lacked entirely. A highlight is what
// reads as a lit surface rather than a flat-shaded one.
uniform float uSpecularStrength;
uniform float uShininess;
uniform vec3 uCameraPosition;
// Elevation color ramp — see shaders/terrain.glsl. Cast shadows are chunk-
// only for now (flat-plane march; the planet's curved surface needs the
// same idea projected onto its local tangent plane, a scoped follow-up).
uniform float uColorByElevation;
// The ramp's stops — see shaders/terrain.glsl's terrainRampColor and
// planet/colorRamp.ts for how these are assembled (colors[0]/positions[0]
// is always uBaseColor at 0, not stored separately here).
uniform vec3 uRampColors[MAX_COLOR_STOPS];
uniform float uRampPositions[MAX_COLOR_STOPS];
uniform float uRampCount;
// This terrain's own real low and high, read back from the baked heightmap
// rather than guessed — per-layer Height stacks additively with no fixed
// bound, so a hardcoded range either never reached Base or never reached
// High. The ramp spans whatever this terrain actually does, full low to
// high (Dana, 2026-10-13: "it should encompass all terrain levels that
// exist in the planet"), not a fixed anchor at the literal value 0 —
// clamping everything below 0 to one flat color was what read as a solid
// painted-on shape rather than terrain. A separate color below sea level
// (bathymetric tinting, the standard alongside hypsometric tinting for
// land) is deferred until there's an actual water feature to tie it to.
// See SceneCanvas.tsx, REFERENCES.md.
uniform float uElevationMin;
uniform float uElevationMax;
uniform sampler2D uHeightMap;
uniform float uDisplacementAmplitude;
uniform float uRadius;
uniform mat3 normalMatrix; // Three.js built-in, auto-set but not auto-declared in fragment stage

varying vec2 vUv;
varying vec3 vSphereDirection;
varying vec3 vWorldPosition;

void main() {
  // Analytic sphere tangent basis, matching heightmap.frag.glsl's
  // uvToSpherePosition — smooth and mesh-resolution-independent (unlike a
  // screen-space-derivative normal, which facets per-triangle). Then
  // perturbed by the heightmap's own central-difference gradient for fine
  // per-texel bump detail. See ISSUES.md, 2026-09-16.
  //
  // Derived from the interpolated 3D direction, NOT from vUv: wrapping a
  // rectangular map onto a sphere always leaves UV discontinuous at the
  // seam and poles, which flipped the normal there and rendered as a black
  // slit. Only cos/sin of longitude are ever used below, and those are
  // periodic, so atan's own wrap point is harmless here. See ISSUES.md.
  vec3 sphereDirection = normalize(vSphereDirection);
  float longitude = atan(sphereDirection.z, sphereDirection.x);
  float latitude = asin(clamp(sphereDirection.y, -1.0, 1.0));
  float cosLat = cos(latitude);
  vec3 localNormal = vec3(cosLat * cos(longitude), sin(latitude), cosLat * sin(longitude));
  // Scaled by uRadius so this is in the same real-world units as the
  // displacement term below, instead of unit-sphere-relative — otherwise
  // the height term dwarfs it and dominates the result. See ISSUES.md, 2026-09-16.
  vec3 dPdu = vec3(-cosLat * sin(longitude), 0.0, cosLat * cos(longitude)) * uRadius;
  vec3 dPdv = vec3(-sin(latitude) * cos(longitude), cosLat, -sin(latitude) * sin(longitude)) * uRadius;

  // Sampling several pixels away (not the immediate neighbor) smooths out
  // small per-pixel noise instead of amplifying it into visible roughness.
  // Widened 16→32: this normal is recomputed fresh at every pixel with no
  // blending between pixels at all (unlike the chunk's per-vertex normal,
  // smoothly interpolated across each triangle — see smoothMesh.ts), so a
  // sharp-edged noise type like Voronoi was reading every cell boundary as
  // a spike in the gradient and showing as fine dark speckling under
  // raking light (Dana, 2026-10-13). TODO(DS): still a placeholder spacing,
  // not derived from the active noise frequency.
  float sampleOffset = 32.0 / 1024.0;
  float hL = texture2D(uHeightMap, vUv - vec2(sampleOffset, 0.0)).r;
  float hR = texture2D(uHeightMap, vUv + vec2(sampleOffset, 0.0)).r;
  float hD = texture2D(uHeightMap, vUv - vec2(0.0, sampleOffset)).r;
  float hU = texture2D(uHeightMap, vUv + vec2(0.0, sampleOffset)).r;
  float dHdu = (hR - hL) / (2.0 * sampleOffset);
  float dHdv = (hU - hD) / (2.0 * sampleOffset);

  // Capped independently of the real displacement, not scaled 1:1 with it —
  // the two shared one multiplier before, so raising Height also amplified
  // this per-pixel artifact rather than just making the terrain taller
  // (Dana, 2026-10-13: "worse... tied to the same number" — confirmed not
  // Shininess, which stayed blotchy at the normal default of 24 too). The
  // actual vertex displacement below is untouched; only this bump term is
  // bounded. TODO(DS): chosen well under the default radius's own scale,
  // not derived — likely still needs tuning by eye once Dana sees it.
  const float MAX_BUMP_STRENGTH = 1.0;
  float bumpStrength = min(uDisplacementAmplitude, MAX_BUMP_STRENGTH);
  vec3 tangentU = dPdu + localNormal * dHdu * bumpStrength;
  vec3 tangentV = dPdv + localNormal * dHdv * bumpStrength;
  vec3 normal = normalize(normalMatrix * cross(tangentV, tangentU));

  vec3 lightDir = normalize(uLightDirection);

  // Blinn-Phong: ambient + diffuse (Lambert) + specular, each its own real
  // strength, rather than one curve reshaping the result after the fact.
  // Diffuse scaled by uLightIntensity (the key light), not by distorting its
  // falloff — the conventional way to separate lit from shadow is a
  // brighter key against a dimmer ambient fill, not a contrast curve. See
  // ISSUES.md, 2026-10-13.
  float diffuse = max(dot(normal, lightDir), 0.0) * uLightIntensity;

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 halfVector = normalize(lightDir + viewDir);
  float specAngle = max(dot(normal, halfVector), 0.0);
  float specular = pow(specAngle, uShininess) * uSpecularStrength * uLightIntensity;

  vec3 surfaceColor = uBaseColor;
  float ambient = uAmbient;
  if (uColorByElevation > 0.5) {
    // G, not R — real additive elevation (each layer's own Height), the
    // same channel vertex.glsl displaces from, not the 0..1 shape/paint
    // composite the bump normal above reads from R. See [S14] in SPEC.md.
    float elevationRaw = texture2D(uHeightMap, vUv).g;
    float elevationFraction = (elevationRaw - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    vec3 ramp = terrainRampColor(elevationFraction, uRampColors, uRampPositions, int(uRampCount));
    // The stretch above always fills the full ramp, however small the real
    // relief is — it normalizes against whatever variation currently
    // exists, never an absolute scale, so a paint stroke at Height 0% still
    // showed as solid white (Dana, 2026-10-13: "height is almost nothing,
    // why am I seeing the white streak"). Contrast fades in with the same
    // Height (%) the slider already shows — uDisplacementAmplitude/uRadius
    // recovers that percentage exactly, no new uniform needed — the real
    // absolute scale [S15] established, not a per-dataset relative one.
    // The standard GIS split is "stretched" (always full contrast, what the
    // ramp above does alone) vs "classed/fixed breaks" (an absolute scale);
    // this blends toward the latter as relief actually grows. TODO(DS):
    // REFERENCE_HEIGHT_FRACTION chosen by eye, not derived. See REFERENCES.md.
    const float REFERENCE_HEIGHT_FRACTION = 0.1;
    float heightFraction = uDisplacementAmplitude / max(0.0001, uRadius);
    float colorContrast = clamp(heightFraction / REFERENCE_HEIGHT_FRACTION, 0.0, 1.0);
    surfaceColor = mix(uBaseColor, ramp, colorContrast);
  }

  gl_FragColor = vec4(surfaceColor * (ambient + diffuse) + specular, 1.0);
}

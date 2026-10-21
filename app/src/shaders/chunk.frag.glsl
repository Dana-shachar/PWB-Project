// The land chunk's surface shading. Deliberately the same lighting model as
// the planet's fragment.glsl: ambient floor, plus diffuse by how directly
// the surface faces the light. Same maths, same calibration, so the shared
// Scene controls mean the same thing in both views.
//
// The planet rebuilds its normal from sphere position, since its mesh is a
// smooth sphere and the detail lives in the heightmap. The chunk takes the
// normal straight off the mesh instead, which already carries it: smooth
// per-vertex normals for the smooth style, flat per-face ones for voxel, so
// blocky stays blocky. See ISSUES.md, "Planet mesh and adaptive resolution".
//
// Replaces MeshStandardMaterial, whose physically based response needed
// hand-tuned intensity multipliers to look anything like the planet, and
// which blew the chunk's top surface out to flat white at the shared
// lighting values (Dana, 2026-10-13: "the default light for the flat chunk
// has to change").
uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uLightIntensity;
uniform float uSpecularStrength;
uniform float uShininess;
uniform vec3 uCameraPosition;

// Elevation color ramp + self-shadow. Top surface samples uHeightMap;
// walls/the bottom cap use their own world-space height instead (a vertical
// face has no top-down uv), see REFERENCES.md (Geiss, GPU Gems 3).
uniform sampler2D uHeightMap;
uniform float uColorByElevation;
uniform vec3 uRampColors[MAX_COLOR_STOPS];
uniform float uRampPositions[MAX_COLOR_STOPS];
uniform float uRampCount;
// This patch's own real low and high — see fragment.glsl's matching uniforms.
uniform float uElevationMin;
uniform float uElevationMax;
uniform float uShadowsEnabled;
uniform float uChunkSize; // world units the patch spans
uniform float uMaxHeight; // world-unit height a raw value of 0.5 displaces to (effectiveHeightScale in landChunk.ts)
// Three.js built-in, auto-set but not auto-declared in the fragment stage —
// same reason fragment.glsl (the planet) declares it, needed here to turn a
// locally-rebuilt normal into the same space vNormal's own transform uses.
uniform mat3 normalMatrix;
// 1 texel of uHeightMap, in uv units — lets the gradient sample below scale
// to whatever resolution the bound texture actually is (it's no longer a
// fixed, known size the way the planet's whole-globe map is), rather than a
// hand-picked constant offset.
uniform float uHeightMapTexelSize;
// true (1.0) for smooth mode's heightMap (the planet's own GPU bake format,
// elevation in green), false (0.0) for voxel's (a plain single-channel CPU
// texture, elevation in red) — see chunk.vert.glsl's matching uniform and
// landChunk.ts, ISSUES.md [B32].
uniform float uHeightMapGreenChannel;

float sampleHeight(vec2 uv) {
  vec4 texel = texture2D(uHeightMap, uv);
  return mix(texel.r, texel.g, uHeightMapGreenChannel);
}

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
// 1 where this fragment came from a displaced (real-height) vertex, 0
// where it's one of the fixed, never-displaced vertices — only used for
// vertex positioning now (chunk.vert.glsl); the fragment-shader logic
// below keys off vIsTopSurface instead, see its own comment.
varying float vDisplace;
// 1 for the top surface, 0 for walls/the bottom cap — never mixed within
// one triangle (smoothMesh.ts), unlike vDisplace above, so the elevation
// ramp below can switch its height source with no interpolation seam.
varying float vIsTopSurface;

void main() {
  // Renormalized because interpolating across a triangle shortens it.
  vec3 normal = normalize(vNormal);
  float elevationRaw = sampleHeight(vUv);

  if (vIsTopSurface > 0.5) {
    // Central-difference gradient, the same technique fragment.glsl (the
    // planet) already uses, just against a flat patch instead of a sphere —
    // no tangent-basis complexity needed here. Reads at the texture's own
    // resolution, independent of this mesh's own (now much coarser) vertex
    // density, which is the actual point of this fix: perceived detail
    // scales with the heightmap, not the triangle count.
    // 32 texels, matching fragment.glsl's own validated sampleOffset — a
    // 1-texel gradient read this terrain's own noise as the slope itself.
    float step = uHeightMapTexelSize * 32.0;
    float hL = sampleHeight(vUv - vec2(step, 0.0));
    float hR = sampleHeight(vUv + vec2(step, 0.0));
    float hD = sampleHeight(vUv - vec2(0.0, step));
    float hU = sampleHeight(vUv + vec2(0.0, step));
    float dHdu = (hR - hL) / (2.0 * step);
    float dHdv = (hU - hD) / (2.0 * step);
    // uv spans the whole patch (0..1 over uChunkSize), and raw elevation
    // maps to world height via uMaxHeight — the same two conversions
    // chunk.vert.glsl's own displacement already applies, so the slope this
    // gradient describes agrees with the surface the vertex shader actually
    // draws.
    vec3 localNormal = vec3(-dHdu * uMaxHeight / uChunkSize, 1.0, -dHdv * uMaxHeight / uChunkSize);
    normal = normalize(normalMatrix * localNormal);
  }

  vec3 lightDir = normalize(uLightDirection);

  // Half Lambert (Mitchell, "Shading in Valve's Source Engine," SIGGRAPH
  // 2006, see REFERENCES.md), not a plain clamped Lambert term like
  // fragment.glsl's: the chunk is always a flat patch facing one fixed
  // direction, so a grazing light (legitimate on the sphere, where some
  // point always faces it) can leave the whole chunk close to unlit, with
  // no bright side to compensate. Half Lambert softens the falloff instead
  // of hard-clamping to 0, so there's no fully flat, lightless side. Dana:
  // "the chunk should always have light on it, but i should be able to
  // tweak the lighting settings" — ambient/intensity/specular/shininess/
  // direction still all apply normally on top of this.
  float diffuse = pow(dot(normal, lightDir) * 0.5 + 0.5, 2.0) * uLightIntensity;

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 halfVector = normalize(lightDir + viewDir);
  float specAngle = max(dot(normal, halfVector), 0.0);
  float specular = pow(specAngle, uShininess) * uSpecularStrength * uLightIntensity;

  // TODO(DS): texelStep chosen by eye, same placeholder-spacing convention
  // as fragment.glsl's own sampleOffset — not derived from resolution.
  // Top-surface only, same as the normal block above and for the same
  // reason: the heightmap shadow march assumes a real top-down uv, which
  // only the top surface has.
  if (uShadowsEnabled > 0.5 && vIsTopSurface > 0.5) {
    float shadow = heightmapShadow(uHeightMap, vUv, lightDir, elevationRaw, 0.01, uChunkSize, uMaxHeight, uHeightMapGreenChannel);
    diffuse *= shadow;
    specular *= shadow;
  }

  vec3 surfaceColor = uBaseColor;
  float ambient = uAmbient;
  if (uColorByElevation > 0.5) {
    // Top surface: elevationRaw, sampled from the heightmap, full detail.
    // Walls/bottom cap: a plain mapping of the fragment's own real world
    // height, a separate value entirely, not blended with the top's — see
    // vIsTopSurface's own comment above for why this doesn't seam.
    float sideElevationRaw = (vWorldPosition.y / uMaxHeight) - 0.5;
    float effectiveElevationRaw = vIsTopSurface > 0.5 ? elevationRaw : sideElevationRaw;
    float elevationFraction = (effectiveElevationRaw - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    vec3 ramp = terrainRampColor(elevationFraction, uRampColors, uRampPositions, int(uRampCount));
    // Contrast fades in with real relief — see fragment.glsl's matching
    // comment. uMaxHeight/uChunkSize recovers the same Height (%) the
    // slider shows, the chunk's own version of uDisplacementAmplitude/uRadius.
    const float REFERENCE_HEIGHT_FRACTION = 0.1;
    float heightFraction = uMaxHeight / max(0.0001, uChunkSize);
    float colorContrast = clamp(heightFraction / REFERENCE_HEIGHT_FRACTION, 0.0, 1.0);
    surfaceColor = mix(uBaseColor, ramp, colorContrast);
  }

  gl_FragColor = vec4(surfaceColor * (ambient + diffuse) + specular, 1.0);
}

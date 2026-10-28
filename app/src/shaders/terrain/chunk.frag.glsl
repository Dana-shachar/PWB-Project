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
uniform vec3 uFillColor; // the sky fill's color (scene/fillLight.ts)
uniform float uLightIntensity;
uniform float uSpecularStrength;
uniform float uShininess;
uniform vec3 uCameraPosition;
// Haze uniforms live in shaders/atmosphere/haze.glsl.

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
uniform float uChunkSize; // world units the whole chunk spans
// One patch of the chunk: its width, and where its uv sits on the whole chunk.
// The single mesh (voxel) uses the whole chunk, uv min 0 and max 1.
uniform float uPatchWorldSize;
uniform vec2 uPatchUvMin;
uniform vec2 uPatchUvMax;
// The whole chunk's texture, so shadows march across patch borders without seams.
uniform sampler2D uChunkHeightMap;
// The voxel mesh's gradient step in uv (patches use texelStepUv instead).
uniform float uGradientStepUv;
// A patch's bake size and border; 0 samples means the voxel mesh's plain uv.
uniform float uBakeSamples;
uniform float uBorderTexels;
uniform float uMaxHeight; // world-unit height a raw value of 0.5 displaces to (effectiveHeightScale in landChunk.ts)
// Three.js built-in, auto-set but not auto-declared in the fragment stage —
// same reason fragment.glsl (the planet) declares it, needed here to turn a
// locally-rebuilt normal into the same space vNormal's own transform uses.
uniform mat4 modelMatrix;
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
uniform float uDiffuseWrap;

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
  bool isPatch = uBakeSamples > 0.5;
  vec2 textureUv = isPatch ? borderedTextureUv(vUv, uBakeSamples, uBorderTexels) : vUv;
  float textureScale = isPatch ? (uBakeSamples - 1.0) / (uBakeSamples + 2.0 * uBorderTexels) : 1.0;
  float elevationRaw = sampleHeight(textureUv);

  if (vIsTopSurface > 0.5) {
    // Central-difference gradient, the same technique fragment.glsl (the
    // planet) already uses, just against a flat patch instead of a sphere —
    // no tangent-basis complexity needed here. Reads at the texture's own
    // resolution, independent of this mesh's own (now much coarser) vertex
    // density, which is the actual point of this fix: perceived detail
    // scales with the heightmap, not the triangle count.
    // Patches: one of their own texels ([B55]). Voxel: 32 of 1024 texels ([B34]), at least 2.
    float stepUv = isPatch ? texelStepUv(uBakeSamples) : max(uGradientStepUv, uHeightMapTexelSize * 2.0);
    // The chunk's tangents: u runs along x and v along z, each spanning
    // uPatchWorldSize; raw elevation maps to world height via uMaxHeight, the same
    // conversion chunk.vert.glsl's displacement applies.
    vec3 localNormal = heightfieldNormal(
      uHeightMap, textureUv, stepUv * textureScale, uHeightMapGreenChannel,
      vec3(uPatchWorldSize / textureScale, 0.0, 0.0), vec3(0.0, 0.0, uPatchWorldSize / textureScale), vec3(0.0, 1.0, 0.0), uMaxHeight
    );
    normal = normalize(mat3(modelMatrix) * localNormal); // world space, as in chunk.vert.glsl
  }

  vec3 lightDir = normalize(uLightDirection);

  // The same wrap lighting as the planet (terrain.glsl's softDiffuse), so the
  // Wrap control means the same in both views. The chunk keeps its own light
  // elevation, since a shared one left it in the dark.
  float diffuse = softDiffuse(normal, lightDir, uDiffuseWrap) * uLightIntensity;

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
    // Starts from the chunk texture's own height, so a finer patch can't shadow itself.
    vec2 chunkUv = mix(uPatchUvMin, uPatchUvMax, vUv);
    vec4 chunkTexel = texture2D(uChunkHeightMap, chunkUv);
    float chunkElevationRaw = mix(chunkTexel.r, chunkTexel.g, uHeightMapGreenChannel);
    float shadow = heightmapShadow(uChunkHeightMap, chunkUv, lightDir, chunkElevationRaw, 0.01, uChunkSize, uMaxHeight, uHeightMapGreenChannel);
    diffuse *= shadow;
    specular *= shadow;
  }

  vec3 surfaceColor = uBaseColor;
  vec3 fill = fillLight(normal, normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0)), uFillColor, uAmbient);
  if (uColorByElevation > 0.5) {
    // Top surface: elevationRaw, sampled from the heightmap, full detail.
    // Walls/bottom cap: a plain mapping of the fragment's own real world
    // height, a separate value entirely, not blended with the top's — see
    // vIsTopSurface's own comment above for why this doesn't seam.
    float sideElevationRaw = (vWorldPosition.y / uMaxHeight) - 0.5;
    float effectiveElevationRaw = vIsTopSurface > 0.5 ? elevationRaw : sideElevationRaw;
    float elevationFraction = (effectiveElevationRaw - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    vec3 ramp = terrainRampColor(elevationFraction, uRampColors, uRampPositions, int(uRampCount));
    surfaceColor = ramp;
  }

  vec3 litColor = surfaceColor * (fill + diffuse) + specular;
  gl_FragColor = vec4(applyHaze(litColor, vWorldPosition, uCameraPosition, uLightDirection), 1.0);
}

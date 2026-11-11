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
const float LIFE_MAX_COVER = 0.75; // life's strongest share over the ground
const float TOON_DETAIL = 0.5; // how much angle-based lighting the toon lit side keeps
uniform float uShadeStep; // toon shading (landLayers.glsl toonShadeMask): where light turns to shade, 0 off
uniform float uShadeFeather;
uniform float uShadeLift;
uniform float uShadeChroma;
// The life grid (biome/lifeGrid.ts): R algae, G moss, over the whole chunk square.
uniform sampler2D uLifeState;
uniform float uBiomeOn;
// Per life type (lifeLayers.glsl lifeLayer): hue, shade, mask (x: brightness), velvet (w: shine).
uniform vec4 uAlgaeHue;
uniform vec4 uAlgaeShade;
uniform vec4 uAlgaeMask;
uniform vec4 uAlgaeVelvet;
uniform vec4 uMossHue;
uniform vec4 uMossShade;
uniform vec4 uMossMask;
uniform vec4 uMossVelvet;
// Per-pixel suitability inputs, the grid's (lifeInputs.frag.glsl): base temperature, peak cooling, pole cooling at this
// latitude, rain share; the sun life reads; each type's ranges (temperature, moisture, sunlight).
uniform vec4 uLifeClimate;
uniform sampler2D uLifeInputs; // biome/lifeGrid.ts: G the moisture with hollows, baked once per change
uniform vec3 uLifeSun;
uniform vec4 uAlgaeTemperature;
uniform vec4 uAlgaeMoisture;
uniform vec4 uAlgaeSun;
uniform vec4 uMossTemperature;
uniform vec4 uMossMoisture;
uniform vec4 uMossSun;
uniform float uShadeHueTurn; // Shadow hue as a share of the wheel
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
uniform vec3 uRockColors[MAX_COLOR_STOPS]; // the rock ramp by height (Color > Rock)
uniform float uRockPositions[MAX_COLOR_STOPS];
uniform float uRockCount;
uniform float uRockSlope; // steepness where rock starts, 1 - cos of the slope angle
uniform float uRockSoftness;
const float ROCK_SLOPE_STEP_UV = 8.0 / 4096.0; // the landform scale rock reads its slope at: 8 texels of the chunk's map. Inferred, TUNABLE
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
uniform sampler2D uChunkLakeLevels; // voxel/chunkLakes.ts
// The voxel mesh's gradient step in uv (patches use texelStepUv instead).
uniform float uGradientStepUv;
// A patch's bake size and border; 0 samples means the voxel mesh's plain uv.
uniform float uBakeSamples;
uniform float uBorderTexels;
uniform float uHeightBase; // as chunk.vert.glsl
// Where the edge lies under the sea, the water wall covers the whole side (chunkWaterWall.frag.glsl), so the land's
// side is dropped there: one surface, no layering (Dana, 2026-11-03).
uniform float uWaterOn;
uniform float uSeaLevel;
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

varying float vMorph; // chunk.vert.glsl: how far this patch has blended into its next-coarser level (blue)

// A patch's height blended toward its coarser level, as chunk.vert.glsl displaces it, so shading matches the shape.
float morphedHeight(vec2 uv) {
  vec4 texel = texture2D(uHeightMap, uv);
  return mix(texel.g, texel.b, vMorph);
}

// heightfieldNormal (terrain.glsl) on the blended height, for a patch's flat grid (up is +y).
vec3 morphedFieldNormal(vec2 uv, float stepUv, vec3 dPdu, vec3 dPdv, float amplitude) {
  float dHdu = (morphedHeight(uv + vec2(stepUv, 0.0)) - morphedHeight(uv - vec2(stepUv, 0.0))) / (2.0 * stepUv);
  float dHdv = (morphedHeight(uv + vec2(0.0, stepUv)) - morphedHeight(uv - vec2(0.0, stepUv))) / (2.0 * stepUv);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 normal = normalize(cross(dPdv + up * dHdv * amplitude, dPdu + up * dHdu * amplitude));
  return faceforward(normal, up, -normal);
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
  // A cut side's wall is only ever seen from outside; from inside it stands behind the ground, and far away the depth
  // buffer can't tell them apart, so it streaked through hills (measured, 2026-11-04). Culled by the camera's side.
  if (vIsTopSurface < 0.5) {
    float halfSize = 0.5 * uChunkSize;
    vec2 fromEdge = abs(abs(vWorldPosition.xz) - halfSize);
    if (min(fromEdge.x, fromEdge.y) < uChunkSize * 0.001) {
      bool onXSide = fromEdge.x < fromEdge.y;
      float side = onXSide ? sign(vWorldPosition.x) : sign(vWorldPosition.z);
      float cameraAlong = onXSide ? uCameraPosition.x : uCameraPosition.z;
      if (cameraAlong * side < halfSize) discard;
    }
  }
  // Renormalized because interpolating across a triangle shortens it.
  vec3 normal = normalize(vNormal);
  vec3 rockNormal = normal; // the landform's normal, for the rock (set on the top surface below)
  bool isPatch = uBakeSamples > 0.5;
  vec2 textureUv = isPatch ? borderedTextureUv(vUv, uBakeSamples, uBorderTexels) : vUv;
  float textureScale = isPatch ? (uBakeSamples - 1.0) / (uBakeSamples + 2.0 * uBorderTexels) : 1.0;
  float elevationRaw = isPatch ? morphedHeight(textureUv) : sampleHeight(textureUv);

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
    vec3 dPdu = vec3(uPatchWorldSize / textureScale, 0.0, 0.0);
    vec3 dPdv = vec3(0.0, 0.0, uPatchWorldSize / textureScale);
    vec3 localNormal = isPatch
      ? morphedFieldNormal(textureUv, stepUv * textureScale, dPdu, dPdv, uMaxHeight)
      : heightfieldNormal(uHeightMap, textureUv, stepUv * textureScale, uHeightMapGreenChannel, dPdu, dPdv, vec3(0.0, 1.0, 0.0), uMaxHeight);
    normal = normalize(mat3(modelMatrix) * localNormal); // world space, as in chunk.vert.glsl
    // Rock follows the landform's slope, not every fine bump: per-pixel slope flecked the rock across all detail, which
    // smeared into stripes (measured 2026-11-08: the blotches vanish with rock off). Read from the whole chunk's map.
    vec2 rockUv = vWorldPosition.xz / uChunkSize + 0.5;
    rockNormal = normalize(mat3(modelMatrix) * heightfieldNormal(uChunkHeightMap, rockUv, ROCK_SLOPE_STEP_UV, uHeightMapGreenChannel, vec3(uChunkSize, 0.0, 0.0), vec3(0.0, 0.0, uChunkSize), vec3(0.0, 1.0, 0.0), uMaxHeight));
  }

  vec3 lightDir = normalize(uLightDirection);

  // The same wrap lighting as the planet (terrain.glsl's softDiffuse), so the
  // Wrap control means the same in both views. The chunk keeps its own light
  // elevation, since a shared one left it in the dark.
  float diffuse = softDiffuse(normal, lightDir, uDiffuseWrap) * uLightIntensity;
  float castShadow = 1.0;

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
    castShadow = shadow;
  }

  vec3 surfaceColor = uBaseColor;
  vec3 fill = fillLight(normal, normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0)), uFillColor, uAmbient);
  if (uColorByElevation > 0.5) {
    // Top surface: elevationRaw, sampled from the heightmap, full detail.
    // Walls/bottom cap: a plain mapping of the fragment's own real world
    // height, a separate value entirely, not blended with the top's — see
    // vIsTopSurface's own comment above for why this doesn't seam.
    float sideElevationRaw = (vWorldPosition.y / uMaxHeight) - uHeightBase;
    float effectiveElevationRaw = vIsTopSurface > 0.5 ? elevationRaw : sideElevationRaw;
    float elevationFraction = (effectiveElevationRaw - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    vec3 ramp = terrainRampColor(elevationFraction, uRampColors, uRampPositions, int(uRampCount));
    vec3 rockColor = uRockCount > 0.5 ? terrainRampColor(elevationFraction, uRockColors, uRockPositions, int(uRockCount)) : ramp;
    // Only the top surface: the walls keep the land ramp.
    surfaceColor = vIsTopSurface > 0.5 ? landSurfaceColor(ramp, rockColor, rockNormal, mat3(modelMatrix) * vec3(0.0, 1.0, 0.0), uRockSlope, uRockSoftness) : ramp;
  }
  // Life's colors over the ground (the material function's albedo lerp): algae, then moss.
  // Life on the top surface (lifeLayers.glsl): its cover and colors, after the ground color so its edge can follow the
  // ground's own texture.
  float algaeCover = 0.0;
  float mossCover = 0.0;
  vec3 algaeColor = vec3(0.0);
  vec3 mossColor = vec3(0.0);
  if (uBiomeOn > 0.5 && vIsTopSurface > 0.5) {
    vec2 lifeUv = vWorldPosition.xz / uChunkSize + 0.5;
    vec4 life = lifeSampleSmooth(uLifeState, lifeUv, 512.0); // biome/lifeGrid.ts LIFE_GRID_SIZE
    vec3 up = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    // The landform's normal, as rock reads it: life follows real slopes and shade, not every small bump.
    float upness = dot(rockNormal, up);
    // This pixel's own temperature, moisture and sunlight, by the grid's rules (lifeInputs.frag.glsl), with hollows
    // wetter (water gathers in recessed ground, Unity's Concavity; the wetness index).
    float relief = max(uElevationMax - uElevationMin, 1e-6);
    vec4 lake = texture2D(uChunkLakeLevels, lifeUv);
    float waterLevel = max(lake.b <= uSeaLevel ? uSeaLevel : -1.0e9, lake.r);
    float aboveWater = (elevationRaw - waterLevel) / relief;
    float slope = sqrt(max(1.0 - upness * upness, 0.0)) / max(upness, 0.05);
    float waterline = aboveWater < 0.0 ? 1.5 : exp(-aboveWater / 0.03);
    float hollowWetness = max(lifeSampleSmooth(uLifeInputs, lifeUv, 512.0).g - uLifeClimate.w, 0.0); // the grid's hollows, beyond rain
    float moisture = aboveWater < 0.0 ? 1.5 : clamp(uLifeClimate.w / (1.0 + slope * 3.0) + waterline + hollowWetness * 0.3, 0.0, 1.0);
    float temperature = uLifeClimate.x - uLifeClimate.y * clamp((elevationRaw - uSeaLevel) / max(uElevationMax - uSeaLevel, 1e-6), 0.0, 1.0) - uLifeClimate.z;
    float sunlight = max(dot(rockNormal, normalize(uLifeSun)), 0.0);
    vec3 lifeInputs = vec3(temperature, moisture, sunlight);
    float groundDetail = 1.0 - rgbToHsv(max(surfaceColor, 0.0)).z; // darker ground fills first (the height blend's base layer)
    vec3 algaeInputs = vec3(temperature, waterline, sunlight); // aquatic: the waterline alone
    algaeCover = lifeLayer(life.r, upness, groundDetail, lifeSuitability(algaeInputs, uAlgaeTemperature, uAlgaeMoisture, uAlgaeSun), uAlgaeHue, uAlgaeShade, uAlgaeMask, algaeColor);
    mossCover = lifeLayer(life.g, upness, groundDetail, lifeSuitability(lifeInputs, uMossTemperature, uMossMoisture, uMossSun), uMossHue, uMossShade, uMossMask, mossColor);
  }

  // Never fully opaque, so the ground's color texture always shows through. Inferred, TUNABLE.
  surfaceColor = mix(surfaceColor, lifeTint(surfaceColor, algaeColor, uAlgaeMask.x), algaeCover * LIFE_MAX_COVER);
  surfaceColor = mix(surfaceColor, lifeTint(surfaceColor, mossColor, uMossMask.x), mossCover * LIFE_MAX_COVER);
  // The land's wall always runs from the base up to the ground; water sits on top of it (chunkWaterWall.frag.glsl).

  specular *= mix(1.0, uAlgaeVelvet.w, algaeCover) * mix(1.0, uMossVelvet.w, mossCover); // each type's shine
  vec3 litColor = surfaceColor * (fill + diffuse) + specular;
  // Unity Toon Shader's blend (UniversalToonBodyDoubleShadeWithFeather.hlsl): the base is the surface times the light,
  // not darkened by angle, and the shade its own color. Half-Lambert from the smooth landform normal, Unity's default
  // vertex normal, so fine bumps don't fleck it.
  if (uShadeStep > 0.0) {
    float halfLambert = (0.5 * dot(rockNormal, lightDir) + 0.5) * castShadow;
    float shadeMask = toonShadeMask(halfLambert, uShadeStep, uShadeFeather);
    // The lit side keeps half its angle-based lighting, so ground detail still reads (Unity's base is flat; the half is
    // inferred, TUNABLE), and both sides take the ambient fill, so Ambient light works with Shading on.
    vec3 baseColor = surfaceColor * (fill + mix(uLightIntensity, diffuse, TOON_DETAIL)) + specular;
    vec3 shade = shadeColor(surfaceColor, uShadeHueTurn, uShadeLift, uShadeChroma) + surfaceColor * fill;
    litColor = mix(baseColor, shade, shadeMask);
  }
  gl_FragColor = vec4(applyHaze(litColor, vWorldPosition, uCameraPosition, uLightDirection), 1.0);
}

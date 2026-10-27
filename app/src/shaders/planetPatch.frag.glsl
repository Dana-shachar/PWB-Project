// Fragment shader for one planet patch (planet/PlanetPatchRenderer.ts),
// [B28]'s fix: each patch bakes and samples its own small heightmap instead
// of every pixel on the globe reading one shared 1024x512 map. Identical to
// fragment.glsl (same Blinn-Phong terms, same color ramp, same bump-mapping
// idea) except for one thing: the tangent basis used for bump-mapping.
//
// fragment.glsl derives its tangent basis from longitude/latitude (atan2/
// asin), which is exactly what forced the old pole-unwrapping/seam-splitting
// complexity in planet/mesh.ts (SEAM_FACE, facePatches) — lat/long has a
// real singularity at the poles and a wrap discontinuity at +-180 deg. A
// patch never needs any of that: it's always a well-behaved sub-rectangle of
// one cube face (planet/cubeFace.ts), parameterized by patch-local u,v in
// [0,1] that maps affinely to that face's own u,v in [-1,1], with no pole or
// wrap line anywhere in the parameterization itself. So the analytic tangent
// basis here is the cube-face derivative instead of the lat/long one, which
// is both simpler (constant, trig-free, per face) and removes the
// singularity at its source rather than working around it. See ISSUES.md,
// [B26]/[B28]/[B24].
uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uLightIntensity;
uniform float uSpecularStrength;
uniform float uShininess;
uniform vec3 uCameraPosition;
uniform float uColorByElevation;
uniform vec3 uRampColors[MAX_COLOR_STOPS];
uniform float uRampPositions[MAX_COLOR_STOPS];
uniform float uRampCount;
uniform float uElevationMin;
uniform float uElevationMax;
uniform sampler2D uHeightMap;
uniform float uDisplacementAmplitude;
uniform float uRadius;
// This patch's own bounds on its cube face, face-local u,v in [-1,1] — lets
// the fragment shader recover the same cube-face point vUv already implies
// (vUv is patch-local 0..1; faceU/faceV = mix(min,max,vUv)), and its
// analytic derivative, without needing a second vertex attribute.
uniform vec2 uPatchMin;
uniform vec2 uPatchMax;
// Index into planet/cubeFace.ts's CUBE_FACES, same order: 0=+X 1=-X 2=+Y
// 3=-Y 4=+Z 5=-Z. A float, not an int, since it only ever feeds a chain of
// comparisons below, not array indexing.
uniform float uFace;
// How many texels apart (as a 0..1 UV fraction of this patch's own small
// texture) the central-difference bump sample reaches — fragment.glsl hard-
// codes this against the shared map's fixed 1024 width; a patch's own baked
// texture is a different, per-patch resolution (planet/patch.ts's
// clampPatchSamples), so this has to be a uniform instead of a constant.
// The bake's samples edge to edge, and the border texels past each edge.
uniform float uBakeSamples;
uniform float uBorderTexels;
uniform float uDiffuseWrap;
uniform mat3 normalMatrix;
// Sea level and water look (shaders/water.glsl). uWaterDeepest is the planet's lowest height, where depthShare is 1.
uniform float uWaterEnabled;
uniform float uSeaLevel;
uniform float uWaterDeepest;
uniform vec3 uWaterRampColors[MAX_COLOR_STOPS];
uniform float uWaterRampPositions[MAX_COLOR_STOPS];
uniform float uWaterRampCount;
uniform float uWaterClarity;
uniform vec3 uSkyColor;
uniform float uWaterShininess;
uniform float uWaterDebug; // TEMP debug, planet/waterDebug.ts
uniform float uFoamWidth;
// Ripples appear only when zoomed in close (Dana: movement matters up close, not from orbit), fading in between
// uRippleFadeFar and uRippleFadeNear (scene units from the eye). The same scrolling ripple texture as the chunk.
uniform sampler2D uRippleMap;
uniform float uRippleEnabled;
uniform float uRippleTileSize;
uniform float uRippleFadeNear;
uniform float uRippleFadeFar;
uniform float uTime;
// Seascape at planet scale: ocean units per scene unit, and the view's width.
uniform float uOceanScale;
uniform float uResolution;

// How far ripples tilt the ocean, as the chunk's RIPPLE_STRENGTH.
const float PLANET_RIPPLE_STRENGTH = 0.15;

varying vec2 vUv;
varying vec3 vSphereDirection; // unused here (kept only so vertex.glsl, shared with fragment.glsl, needs no changes) — this shader rebuilds its own cube-face normal instead, see below.
varying vec3 vWorldPosition;

// Mirrors planet/cubeFace.ts's cubeFacePoint() exactly — keep the two
// identical, same rule heightmap.frag.glsl's own mirror already follows.
vec3 cubeFacePoint(float face, float u, float v) {
  if (face < 0.5) return vec3(1.0, v, -u);
  if (face < 1.5) return vec3(-1.0, v, u);
  if (face < 2.5) return vec3(u, 1.0, -v);
  if (face < 3.5) return vec3(u, -1.0, v);
  if (face < 4.5) return vec3(u, v, 1.0);
  return vec3(-u, v, -1.0);
}

// d(cubeFacePoint)/du and /dv, pre-normalization — constant per face, since
// cubeFacePoint is linear in u and v. Read straight off cubeFacePoint's own
// six cases above.
vec3 cubeFaceDPdu(float face) {
  if (face < 0.5) return vec3(0.0, 0.0, -1.0);
  if (face < 1.5) return vec3(0.0, 0.0, 1.0);
  if (face < 2.5) return vec3(1.0, 0.0, 0.0);
  if (face < 3.5) return vec3(1.0, 0.0, 0.0);
  if (face < 4.5) return vec3(1.0, 0.0, 0.0);
  return vec3(-1.0, 0.0, 0.0);
}
vec3 cubeFaceDPdv(float face) {
  if (face < 0.5) return vec3(0.0, 1.0, 0.0);
  if (face < 1.5) return vec3(0.0, 1.0, 0.0);
  if (face < 2.5) return vec3(0.0, 0.0, -1.0);
  if (face < 3.5) return vec3(0.0, 0.0, 1.0);
  if (face < 4.5) return vec3(0.0, 1.0, 0.0);
  return vec3(0.0, 1.0, 0.0);
}

void main() {
  float faceU = mix(uPatchMin.x, uPatchMax.x, vUv.x);
  float faceV = mix(uPatchMin.y, uPatchMax.y, vUv.y);
  vec3 cubePoint = cubeFacePoint(uFace, faceU, faceV);
  float cubeRadius = length(cubePoint);
  vec3 localNormal = cubePoint / cubeRadius;

  // Standard derivative-of-normalize(f(u)) formula: d(f/|f|)/du =
  // (f'(u) - n*(n.f'(u))) / |f|, chain-ruled by this patch's own
  // face-local extent (vUv's 0..1 maps to patchMax-patchMin of face u,v) and
  // by uRadius, so these end up in the same real-world units
  // uDisplacementAmplitude already is, exactly like fragment.glsl's own
  // dPdu/dPdv.
  vec3 rawDPdu = cubeFaceDPdu(uFace);
  vec3 rawDPdv = cubeFaceDPdv(uFace);
  vec3 dPdu = ((rawDPdu - localNormal * dot(localNormal, rawDPdu)) / cubeRadius) * uRadius * (uPatchMax.x - uPatchMin.x);
  vec3 dPdv = ((rawDPdv - localNormal * dot(localNormal, rawDPdv)) / cubeRadius) * uRadius * (uPatchMax.y - uPatchMin.y);

  // Stepped in texture uv; the tangents shrink by the same scale so the slope stays per patch uv.
  float stepUv = texelStepUv(uBakeSamples);
  float textureScale = (uBakeSamples - 1.0) / (uBakeSamples + 2.0 * uBorderTexels);
  vec2 textureUv = borderedTextureUv(vUv, uBakeSamples, uBorderTexels);
  vec3 normal = normalize(normalMatrix * heightfieldNormal(uHeightMap, textureUv, stepUv * textureScale, 1.0, dPdu / textureScale, dPdv / textureScale, localNormal, uDisplacementAmplitude));

  vec3 lightDir = normalize(uLightDirection);
  float diffuse = softDiffuse(normal, lightDir, uDiffuseWrap) * uLightIntensity;

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 halfVector = normalize(lightDir + viewDir);
  float specAngle = max(dot(normal, halfVector), 0.0);
  float specular = pow(specAngle, uShininess) * uSpecularStrength * uLightIntensity;

  vec3 surfaceColor = uBaseColor;
  float ambient = uAmbient;
  float elevationRaw = texture2D(uHeightMap, textureUv).g;
  if (uColorByElevation > 0.5) {
    float elevationFraction = (elevationRaw - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    vec3 ramp = terrainRampColor(elevationFraction, uRampColors, uRampPositions, int(uRampCount));
    surfaceColor = ramp;
  }

  vec3 litColor = surfaceColor * (ambient + diffuse) + specular;
  // The ocean: Seascape's waves and sea color (shaders/oceanWaves.glsl) at a planet scale, in each point's own
  // frame (x along the face, y up), smoothed with distance into a soft glare, with sporadic whitecaps that read from
  // orbit, the seabed showing through the shallows (shaders/water.glsl), and ripples and shore foam up close.
  if (uWaterEnabled > 0.5 && elevationRaw < uSeaLevel) {
    float depthShare = (uSeaLevel - elevationRaw) / max(0.0001, uSeaLevel - uWaterDeepest);
    vec3 seaBase = terrainRampColor(waterRampPosition(depthShare, uWaterClarity), uWaterRampColors, uWaterRampPositions, int(uWaterRampCount));
    vec3 seaWaterColor = uWaterRampColors[0];
    vec3 frameX = normalize(dPdu - localNormal * dot(localNormal, dPdu));
    vec3 frameZ = cross(frameX, localNormal);
    vec3 toPoint = vWorldPosition - uCameraPosition;
    vec2 ocean = vec2(faceU, faceV) * uRadius * uOceanScale;
    gSeaFootprint = length(fwidth(ocean)) * SEA_FREQ; // the pixel footprint for band-limiting (Quilez)
    vec3 distOcean = toPoint * uOceanScale;
    float waveHeight = -sea_height(vec3(ocean.x, 0.0, ocean.y));
    vec3 surfacePoint = vec3(ocean.x, waveHeight, ocean.y);
    float normalStep = dot(distOcean, distOcean) * 0.1 / max(uResolution, 1.0);
    vec3 seaNormal = getNormal(surfacePoint, max(normalStep, 0.01));
    float far = seaFarFactor(normalStep);
    seaNormal = normalize(mix(seaNormal, vec3(0.0, 1.0, 0.0), far));
    float breakup = 0.5;
    float rippleFade = uRippleEnabled * (1.0 - smoothstep(uRippleFadeNear, uRippleFadeFar, length(toPoint)));
    if (rippleFade > 0.0) {
      vec2 rippleUv = vec2(faceU, faceV) * uRadius / uRippleTileSize;
      vec3 rippleA = texture2D(uRippleMap, rippleUv + vec2(0.02, 0.01) * uTime).rgb;
      vec3 rippleB = texture2D(uRippleMap, rippleUv * 0.7 - vec2(0.013, 0.021) * uTime).rgb;
      vec2 tilt = ((rippleA.xy * 2.0 - 1.0) + (rippleB.xy * 2.0 - 1.0)) * PLANET_RIPPLE_STRENGTH * rippleFade;
      seaNormal = normalize(seaNormal + vec3(tilt.x, 0.0, tilt.y));
      breakup = mix(0.5, (rippleA.b + rippleB.b) * 0.5, rippleFade);
    }
    vec3 eyeDir = normalize(toPoint);
    vec3 eyeLocal = vec3(dot(eyeDir, frameX), dot(eyeDir, localNormal), dot(eyeDir, frameZ));
    vec3 sunDir = normalize(uLightDirection);
    vec3 sunLocal = vec3(dot(sunDir, frameX), dot(sunDir, localNormal), dot(sunDir, frameZ));
    vec3 sea = seaColor(surfacePoint, seaNormal, sunLocal, eyeLocal, distOcean, seaBase, seaWaterColor, uSkyColor, mix(60.0, FAR_SPECULAR_POWER, far)) * uLightIntensity;
    float transmittance = waterTransmittance(depthShare, uWaterClarity);
    vec3 seabed = surfaceColor * (ambient + diffuse) * waterFilter(depthShare, uWaterClarity, seaBase);
    litColor = mix(seabed, sea, 1.0 - transmittance);
    float foamLight = (ambient + seaDiffuse(seaNormal, sunLocal, 1.0)) * uLightIntensity;
    // Foam from the wave crests at every distance (averaged far away); shore foam and breaking bands only up close
    // (Dana: a crisp shoreline from orbit read too sharp).
    float foamAmount = clamp(uFoamWidth / 0.05, 0.0, 1.0);
    float whitecap = crestFoam(waveHeight, far, ocean) * foamAmount;
    float shore = max(waterFoam(depthShare, uFoamWidth, breakup), shoreWaveFoam(depthShare, breakup)) * rippleFade * foamAmount;
    float foam = max(shore, whitecap);
    litColor = mix(litColor, FOAM_COLOR * foamLight, foam);
    // TEMP debug: one ingredient at a time.
    if (uWaterDebug > 0.5 && uWaterDebug < 1.5) litColor = vec3(clamp(depthShare, 0.0, 1.0));
    if (uWaterDebug > 1.5 && uWaterDebug < 2.5) litColor = vec3(transmittance);
    if (uWaterDebug > 2.5 && uWaterDebug < 3.5) litColor = seabed * transmittance;
    if (uWaterDebug > 3.5 && uWaterDebug < 4.5) litColor = sea;
    if (uWaterDebug > 4.5 && uWaterDebug < 5.5) litColor = vec3(far);
    if (uWaterDebug > 5.5 && uWaterDebug < 6.5) litColor = vec3(foam);
    if (uWaterDebug > 6.5) litColor = vec3(whitecap);
  }
  gl_FragColor = vec4(litColor, 1.0);
}

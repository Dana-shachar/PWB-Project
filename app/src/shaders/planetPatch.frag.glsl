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
uniform vec3 uColorMid;
uniform vec3 uColorHigh;
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
uniform float uSampleOffset;
uniform mat3 normalMatrix;

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

  float hL = texture2D(uHeightMap, vUv - vec2(uSampleOffset, 0.0)).r;
  float hR = texture2D(uHeightMap, vUv + vec2(uSampleOffset, 0.0)).r;
  float hD = texture2D(uHeightMap, vUv - vec2(0.0, uSampleOffset)).r;
  float hU = texture2D(uHeightMap, vUv + vec2(0.0, uSampleOffset)).r;
  float dHdu = (hR - hL) / (2.0 * uSampleOffset);
  float dHdv = (hU - hD) / (2.0 * uSampleOffset);

  const float MAX_BUMP_STRENGTH = 1.0;
  float bumpStrength = min(uDisplacementAmplitude, MAX_BUMP_STRENGTH);
  vec3 tangentU = dPdu + localNormal * dHdu * bumpStrength;
  vec3 tangentV = dPdv + localNormal * dHdv * bumpStrength;
  vec3 normal = normalize(normalMatrix * cross(tangentV, tangentU));

  vec3 lightDir = normalize(uLightDirection);
  float diffuse = max(dot(normal, lightDir), 0.0) * uLightIntensity;

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 halfVector = normalize(lightDir + viewDir);
  float specAngle = max(dot(normal, halfVector), 0.0);
  float specular = pow(specAngle, uShininess) * uSpecularStrength * uLightIntensity;

  vec3 surfaceColor = uBaseColor;
  float ambient = uAmbient;
  if (uColorByElevation > 0.5) {
    float elevationRaw = texture2D(uHeightMap, vUv).g;
    float elevationFraction = (elevationRaw - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    vec3 ramp = terrainRampColor(elevationFraction, uBaseColor, uColorMid, uColorHigh);
    const float REFERENCE_HEIGHT_FRACTION = 0.1;
    float heightFraction = uDisplacementAmplitude / max(0.0001, uRadius);
    float colorContrast = clamp(heightFraction / REFERENCE_HEIGHT_FRACTION, 0.0, 1.0);
    surfaceColor = mix(uBaseColor, ramp, colorContrast);
  }

  gl_FragColor = vec4(surfaceColor * (ambient + diffuse) + specular, 1.0);
}

// The chunk water's side walls (Dana, 2026-10-30): the water seen from the side, so it reads as a block, not a floating
// sheet. Colored by the water ramp by depth below the surface and clearer near the top, as the sheet shows depth.
uniform sampler2D uChunkHeightMap; // shared with the sheet: the ground under the water
uniform sampler2D uChunkLakeLevels; // voxel/chunkLakes.ts
uniform float uHeightMapGreenChannel;
uniform float uChunkSize;
uniform float uSeaLevel;
uniform float uWaterDeepest;
uniform float uHeightBase;
uniform float uMaxHeight; // world height = (raw + uHeightBase) * uMaxHeight, as the sheet is placed (applyTide)
uniform vec3 uWaterRampColors[MAX_COLOR_STOPS];
uniform float uWaterRampPositions[MAX_COLOR_STOPS];
uniform float uWaterRampCount;
uniform float uWaterClarity;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uLightIntensity;
uniform vec3 uCameraPosition;
varying vec3 vWorldPosition;
const float WALL_GROUND_OVERLAP = 0.002; // raw height. Inferred, TUNABLE

void main() {
  float raw = vWorldPosition.y / max(uMaxHeight, 0.0001) - uHeightBase;
  // The true cross-section (Dana): the land's wall runs from the base up to the ground everywhere (chunk.frag.glsl), and
  // water fills only from the ground up to the sea's or a lake's surface.
  vec2 chunkUv = clamp(vWorldPosition.xz / uChunkSize + 0.5, 0.0, 1.0);
  vec4 heightTexel = texture2D(uChunkHeightMap, chunkUv);
  float groundRaw = mix(heightTexel.r, heightTexel.g, uHeightMapGreenChannel);
  vec4 lakeTexel = texture2D(uChunkLakeLevels, chunkUv);
  // The sea only where it can reach (B, the spill height); the lake's level (R) elsewhere.
  float waterSurface = max(lakeTexel.b <= uSeaLevel ? uSeaLevel : -1000.0, lakeTexel.r);
  // A little below the ground, so the land wall's top (from its own mesh) never leaves a gap under the water.
  if (groundRaw >= waterSurface || raw > waterSurface || raw < groundRaw - WALL_GROUND_OVERLAP) discard;
  // Colored by depth below the surface, as the sheet measures it, so the side matches the water seen from above.
  float depthShare = clamp((waterSurface - raw) / max(0.0001, waterSurface - uWaterDeepest), 0.0, 1.0);
  vec3 rampColor = terrainRampColor(depthShare, uWaterRampColors, uWaterRampPositions, int(uWaterRampCount));
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  vec3 color = rampColor * (uAmbient + uLightIntensity * softDiffuse(normal, normalize(uLightDirection), 0.5));
  color = applyHaze(color, vWorldPosition, uCameraPosition, uLightDirection);
  gl_FragColor = vec4(color, 1.0);
}

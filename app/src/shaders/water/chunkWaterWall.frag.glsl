// The chunk water's side walls (Dana, 2026-10-30): the water seen from the side, so it reads as a block, not a floating
// sheet. Colored by the water ramp by depth below the surface and clearer near the top, as the sheet shows depth.
uniform float uSeaLevel;
uniform float uWaterDeepest;
uniform float uMaxHeight; // world height = (raw + 0.5) * uMaxHeight, as the sheet is placed (applyTide)
uniform vec3 uWaterRampColors[MAX_COLOR_STOPS];
uniform float uWaterRampPositions[MAX_COLOR_STOPS];
uniform float uWaterRampCount;
uniform float uWaterClarity;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uLightIntensity;
uniform vec3 uCameraPosition;
varying vec3 vWorldPosition;

void main() {
  float raw = vWorldPosition.y / max(uMaxHeight, 0.0001) - 0.5;
  float depthShare = clamp((uSeaLevel - raw) / max(0.0001, uSeaLevel - uWaterDeepest), 0.0, 1.0);
  vec3 rampColor = terrainRampColor(waterRampPosition(depthShare, uWaterClarity), uWaterRampColors, uWaterRampPositions, int(uWaterRampCount));
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  vec3 color = rampColor * (uAmbient + uLightIntensity * softDiffuse(normal, normalize(uLightDirection), 0.5));
  color = applyHaze(color, vWorldPosition, uCameraPosition, uLightDirection);
  gl_FragColor = vec4(color, 1.0 - waterTransmittance(depthShare, uWaterClarity) * 0.7);
}

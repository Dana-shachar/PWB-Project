// The chunk's water sheet (voxel/chunkWater.ts), shaded in chunkWater.frag.glsl. Vertices at or next to a lake stand flat at
// its level (voxel/chunkLakes.ts), running under the land so the land stops them. A lake only drops with the tide, since
// it can't stand above its rim.
uniform sampler2D uChunkLakeLevels;
uniform float uLakeEbb; // how far the sea's tide is below its high point, raw height (applyTide)
uniform float uSeaLevel;
uniform float uMaxHeight;
uniform float uHeightBase;
varying vec3 vWorldPosition;
varying float vLake; // above 0 on a lake

const float SHEET_CELL_UV = 1.0 / 1023.0; // WATER_SHEET_SEGMENTS: one vertex per lake cell, reaching one cell

void main() {
  vec2 uv = position.xz + 0.5;
  float level = -1000.0;
  float tideShare = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec4 texel = texture2D(uChunkLakeLevels, uv + vec2(float(i), float(j)) * SHEET_CELL_UV);
      if (texel.r > level) {
        level = texel.r;
        tideShare = texel.g;
      }
    }
  }
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vLake = 0.0;
  // The ground's height rule (chunk.vert.glsl). The mesh can't stand in for the sea: it stops at the chunk's floor (applyTide).
  // A lake also stands where the sea is higher but can't reach it (B, the spill height).
  bool seaReaches = texture2D(uChunkLakeLevels, uv).b <= uSeaLevel;
  if (level > uSeaLevel || (level > -999.0 && !seaReaches)) {
    worldPosition.y = (level - tideShare * uLakeEbb + uHeightBase) * uMaxHeight;
    vLake = 1.0;
  }
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

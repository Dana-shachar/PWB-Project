// The stream power state from the pit-filled globe heights (R): R = meters above sea level, G = no drainage yet, B = ocean.
uniform sampler2D uHeights;
uniform float uSeaLevel;
uniform float uMetersPerUnit;
varying vec2 vUv;

void main() {
  float height = texture2D(uHeights, vUv).r;
  gl_FragColor = vec4((height - uSeaLevel) * uMetersPerUnit, 0.0, height < uSeaLevel ? 1.0 : 0.0, 1.0);
}

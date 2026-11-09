// The stream power state from the pit-filled globe heights (R): R = meters above sea level, G = the settled drainage, B = ocean.
uniform sampler2D uHeights;
uniform float uSeaLevel;
uniform float uMetersPerUnit;
uniform sampler2D uDrainage; // the settled drainage at radius 1 (rivers/drainage.worker.ts, accumulateDrainage)
uniform float uRadiusMeters;
varying vec2 vUv;

void main() {
  float height = texture2D(uHeights, vUv).r;
  gl_FragColor = vec4((height - uSeaLevel) * uMetersPerUnit, texture2D(uDrainage, vUv).r * uRadiusMeters, height < uSeaLevel ? 1.0 : 0.0, 1.0);
}

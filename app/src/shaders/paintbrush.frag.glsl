// Renders one brush dab: blends the previous paint (value, mask) toward
// (uTargetValue, 1) within the brush radius — an absolute "set to this
// gray" brush, not additive (see map/heightmap.ts's paintStroke()).

varying vec2 vUv;

uniform sampler2D uPrevious;
uniform vec2 uCenter;
uniform float uRadius; // total brush radius, in UV units — fixed, never changed by feather
uniform float uTargetValue; // 0..1 — the brush slider's value, remapped from -1..1
uniform float uFeather; // 0=hard edge, 1=fully soft — a fraction of uRadius (Photoshop-style Hardness); never changes the total size

void main() {
  vec2 previous = texture2D(uPrevious, vUv).rg; // (value, mask)
  float dist = distance(vUv, uCenter);
  float innerRadius = uRadius * (1.0 - uFeather);
  float falloff = 1.0 - smoothstep(innerRadius, uRadius, dist);
  // Standard alpha "over" compositing — weights by relative opacity
  // contribution, not raw falloff, so a partial-strength touch still reads
  // as the correct color (not diluted toward the unpainted placeholder).
  float newMask = falloff + previous.g * (1.0 - falloff);
  float newValue = newMask > 0.0
    ? (uTargetValue * falloff + previous.r * previous.g * (1.0 - falloff)) / newMask
    : previous.r;
  gl_FragColor = vec4(newValue, newMask, 0.0, 1.0);
}

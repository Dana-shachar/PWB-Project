uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform float uAmbient;

varying vec3 vNormal;

void main() {
  vec3 normal = normalize(vNormal);

  // Basic diffuse (Lambertian) lighting: how directly the surface faces the light.
  float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);

  // Blend between the ambient floor and full diffuse brightness, so the
  // unlit side of the sphere is dim rather than pure black.
  float lighting = uAmbient + diffuse * (1.0 - uAmbient);

  gl_FragColor = vec4(uBaseColor * lighting, 1.0);
}

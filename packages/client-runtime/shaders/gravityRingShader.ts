export const gravityRingVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// Renders an at-the-silhouette glow ring marking each planet's gravity capture
// boundary. Tuned to read as "atmosphere envelope you'll fall into" — only the
// rim glows; the disc facing camera fades to transparent so it doesn't obscure
// the planet behind it. Additive blending makes overlapping rings (when gravity
// zones intersect) visibly brighten, which is exactly the cue the editor needs.
export const gravityRingFragmentShader = `
  uniform vec3 ringColor;
  uniform float intensity;
  uniform float opacity;
  uniform float ringPower;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float facing = max(dot(viewDir, -vWorldNormal), 0.0);
    float rim = pow(1.0 - facing, ringPower);
    float alpha = rim * opacity;
    gl_FragColor = vec4(ringColor * intensity * rim, alpha);
  }
`;

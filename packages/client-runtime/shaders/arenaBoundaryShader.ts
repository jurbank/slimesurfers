export const arenaBoundaryVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// A faint inward-facing fog shell marking the kill boundary. Players see it as a
// soft haze on the outer edges of the arena — closer to the edge → denser fog,
// so they get a warning before they cross it. Front-faces of the shell are
// drawn so it acts like a fog volume around the arena's interior.
export const arenaBoundaryFragmentShader = `
  uniform vec3 fogColor;
  uniform float intensity;
  uniform float opacity;
  uniform float fresnelPower;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    // Inside the shell, vWorldNormal points outward; viewDir points outward too at
    // the silhouette, so dot(view, normal) → 1 at the rim and → 0 at the centre.
    float edge = pow(max(dot(viewDir, vWorldNormal), 0.0), fresnelPower);
    float alpha = edge * opacity;
    gl_FragColor = vec4(fogColor * intensity, alpha);
  }
`;

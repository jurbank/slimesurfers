export const atmosphereVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const atmosphereFragmentShader = `
  uniform vec3 atmosphereColor;
  uniform float intensity;
  uniform float opacity;
  uniform float fresnelPower;
  uniform float falloffPower;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - max(dot(viewDir, vWorldNormal), 0.0), fresnelPower);
    float falloff = pow(max(dot(viewDir, -vWorldNormal), 0.0), falloffPower);
    float alpha = rim * falloff * opacity;

    gl_FragColor = vec4(atmosphereColor * intensity * rim, alpha);
  }
`;

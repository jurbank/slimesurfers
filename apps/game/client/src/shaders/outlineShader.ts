export const outlineVertexShader = `
  uniform float outlineThickness;
  
  void main() {
    vec3 pos = position + normal * outlineThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const outlineFragmentShader = `
  uniform vec3 outlineColor;

  void main() {
    gl_FragColor = vec4(outlineColor, 1.0);
  }
`;

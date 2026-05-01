export const outlineVertexShader = `
  uniform float outlineThickness;
  varying vec3 vWorldPosition;

  void main() {
    vec3 pos = position + normal * outlineThickness;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const outlineFragmentShader = `
  uniform vec3 outlineColor;
  uniform int tunnelSegmentCount;
  uniform vec3 tunnelStarts[64];
  uniform vec3 tunnelEnds[64];
  uniform float tunnelRadii[64];
  varying vec3 vWorldPosition;

  bool isInsideTunnel(vec3 pos) {
    for (int i = 0; i < 64; i++) {
      if (i >= tunnelSegmentCount) break;

      vec3 a = tunnelStarts[i];
      vec3 b = tunnelEnds[i];
      vec3 ab = b - a;
      float lenSq = dot(ab, ab);
      if (lenSq < 0.0001) continue;

      float t = clamp(dot(pos - a, ab) / lenSq, 0.0, 1.0);
      vec3 closest = a + ab * t;
      if (distance(pos, closest) < tunnelRadii[i]) return true;
    }
    return false;
  }

  void main() {
    if (isInsideTunnel(vWorldPosition)) discard;
    gl_FragColor = vec4(outlineColor, 1.0);
  }
`;

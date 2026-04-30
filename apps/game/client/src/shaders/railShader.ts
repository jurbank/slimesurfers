export const railVertexShader = `
  varying vec2 vUv;
  varying float vArcLength;

  void main() {
    vUv = uv;
    // We expect the arc-length to be passed via a custom attribute or 
    // calculated if possible. Since TubeGeometry doesn't give us arc-length directly
    // in a way that's easy to use for fixed nodes, we use the UV's x coordinate 
    // which represents the progress along the curve (0 to 1).
    vArcLength = uv.x; 

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const railFragmentShader = `
  uniform vec3 uBaseColor;
  uniform vec3 uEmissive;
  uniform vec3 uPaintNodes[64];
  
  varying vec2 vUv;
  varying float vArcLength;

  void main() {
    // Interpolate between nodes based on arc length progress (0 to 1)
    float nodePos = vArcLength * 63.0;
    int index = int(floor(nodePos));
    int nextIndex = min(index + 1, 63);
    float f = fract(nodePos);

    vec3 paintColor;
    
    // Manual interpolation because GLSL 1.0 doesn't support dynamic indexing with non-constants well
    // but in modern WebGL/Three.js it's usually fine. 
    // If this fails on older hardware, we'd use a texture.
    paintColor = mix(uPaintNodes[index], uPaintNodes[nextIndex], f);

    // If the paint color is white (0xffffff), it's unpainted.
    // We use a small epsilon for comparison.
    bool isPainted = length(paintColor - vec3(1.0, 1.0, 1.0)) > 0.01;

    vec3 finalColor = isPainted ? paintColor : uBaseColor;
    
    // Simple shading
    float shade = 0.5 + 0.5 * vUv.y; // pseudo-shading based on radial UV
    gl_FragColor = vec4(finalColor * shade + uEmissive, 1.0);
  }
`;

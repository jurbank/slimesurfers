export const stampVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  }
`;

export const stampFragmentShader = `
  uniform vec3 brushColor;
  uniform vec3 stampNormal;
  uniform float stampRadius;
  uniform float brushSoftness;
  uniform float edgeNoiseScale;
  uniform float edgeNoiseStrength;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    // 1. High-precision inverse mapping (UV to Normal)
    // Matches Three.js SphereGeometry UV mapping exactly
    float u = vUv.x;
    float v = vUv.y;
    float theta = v * 3.14159265359;
    float phi = (1.0 - 2.0 * u) * 3.14159265359;
    
    vec3 pixelNormal;
    pixelNormal.y = -cos(theta);
    pixelNormal.x = sin(theta) * cos(phi);
    pixelNormal.z = sin(theta) * sin(phi);

    // 2. Chord distance between pixel and impact center
    float dist = distance(pixelNormal, stampNormal);

    float edgeNoise = (noise(pixelNormal * edgeNoiseScale) - 0.5) * edgeNoiseStrength;
    float noisyRadius = stampRadius * (1.0 + edgeNoise);

    // 3. Optimized discard
    if (dist > noisyRadius) discard;

    float innerRadius = noisyRadius * (1.0 - brushSoftness);
    float mask = 1.0 - smoothstep(innerRadius, noisyRadius, dist);
    float pooledCenter = 1.0 - smoothstep(0.0, noisyRadius * 0.75, dist);
    mask = clamp(mask + pooledCenter * 0.18, 0.0, 1.0);
    
    gl_FragColor = vec4(brushColor, mask);
  }
`;

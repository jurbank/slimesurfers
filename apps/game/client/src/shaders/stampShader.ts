export const stampVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  }
`;

export const stampFragmentShader = `
  uniform vec3 brushColor;
  uniform int patternId;
  uniform vec3 stampNormal;
  uniform float stampRadius;
  uniform float bloomProgress;
  uniform float bloomStartScale;
  uniform float bloomOvershootScale;
  uniform float brushSoftness;
  uniform float edgeNoiseScale;
  uniform float edgeNoiseStrength;
  uniform vec3 edgeNoiseOffset;
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

  bool isInPattern(float u, float v, int id) {
    float freq = 400.0;
    if (id == 1 || id == 5) return mod(v * freq, 1.0) > 0.5;
    if (id == 2 || id == 6) {
      float dx = mod(u * freq, 1.0) - 0.5;
      float dy = mod(v * freq, 1.0) - 0.5;
      return dx * dx + dy * dy < 0.04;
    }
    if (id == 3) return mod((u + v) * freq, 1.0) > 0.5;
    if (id == 4) return mod(u * freq, 1.0) > 0.5;
    if (id == 7) return mod(floor(u * freq) + floor(v * freq), 2.0) == 0.0;
    return false;
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

    float firstPhase = smoothstep(0.0, 0.65, bloomProgress);
    float settlePhase = smoothstep(0.65, 1.0, bloomProgress);
    float bloomScale = mix(bloomStartScale, bloomOvershootScale, firstPhase);
    bloomScale = mix(bloomScale, 1.0, settlePhase);

    float edgeNoise = (noise(pixelNormal * edgeNoiseScale + edgeNoiseOffset) - 0.5) * edgeNoiseStrength;
    float noisyRadius = stampRadius * bloomScale * (1.0 + edgeNoise);

    // 3. Optimized discard
    if (dist > noisyRadius) discard;

    float innerRadius = noisyRadius * (1.0 - brushSoftness);
    float mask = 1.0 - smoothstep(innerRadius, noisyRadius, dist);
    float pooledCenter = 1.0 - smoothstep(0.0, noisyRadius * 0.75, dist);
    mask = clamp(mask + pooledCenter * 0.18, 0.0, 1.0);
    
    vec3 color = brushColor;
    if (isInPattern(u, v, patternId)) {
      bool isDark = (patternId == 5 || patternId == 6);
      vec3 patternColor = isDark ? vec3(0.0) : vec3(1.0);
      float blend = 0.55;
      color = mix(brushColor, patternColor, blend);
    }

    gl_FragColor = vec4(color, mask);
  }
`;

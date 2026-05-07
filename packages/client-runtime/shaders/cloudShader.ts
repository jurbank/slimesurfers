export const wispyCloudVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const wispyCloudFragmentShader = `
  uniform float time;
  uniform vec3 cloudColor;
  uniform float density;
  uniform float opacity;
  uniform float thickness;
  uniform float coverageScale;
  uniform float movementSpeed;
  uniform vec3 sunDirection;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + 7.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 flow = vec3(time * movementSpeed, 0.0, time * movementSpeed * 0.35);
    float cloud = fbm(n * coverageScale + flow);
    float fine = fbm(n * coverageScale * 2.4 - flow.yzx);
    cloud = mix(cloud, fine, 0.35);
    float cutoff = mix(0.78, 0.32, density);
    float shape = smoothstep(cutoff, cutoff + 0.18, cloud);
    float volume = smoothstep(0.0, 12.0, thickness);
    float light = clamp(dot(n, normalize(sunDirection)) * 0.5 + 0.5, 0.0, 1.0);
    float shade = mix(0.82, 1.0, light);
    float rimFade = smoothstep(0.0, 0.35, abs(dot(n, normalize(cameraPosition - vWorldPosition))));
    float alpha = shape * opacity * mix(0.55, 1.0, volume) * rimFade;

    gl_FragColor = vec4(cloudColor * shade, alpha);
  }
`;

export const puffyCloudVertexShader = `
  uniform float time;
  uniform float density;
  uniform float size;
  uniform float thickness;
  uniform float opacity;
  uniform float movementSpeed;
  uniform vec3 sunDirection;

  attribute vec3 cloudNormal;
  attribute float cloudRandom;
  attribute float cloudCoverage;
  attribute float cloudRadius;

  varying float vCoverage;
  varying float vLight;
  varying float vRadius;
  varying float vRandom;
  varying vec3 vWorldPosition;

  void main() {
    float drift = time * movementSpeed * 0.22;
    float c = cos(drift);
    float s = sin(drift);
    mat3 driftRotation = mat3(
      c, 0.0, -s,
      0.0, 1.0, 0.0,
      s, 0.0, c
    );
    vec3 shellNormal = normalize(driftRotation * cloudNormal);
    vec3 driftedPosition = driftRotation * position;
    vec3 displaced = driftedPosition;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    float perspectiveScale = 420.0 / max(1.0, -mvPosition.z);
    float volumeScale = mix(0.8, 1.65, smoothstep(0.0, 20.0, thickness));
    float normalizedDensity = density <= 1.0 ? density : clamp(density / 14.0, 0.0, 1.0);

    vCoverage = smoothstep(cloudCoverage - 0.22, cloudCoverage + 0.28, normalizedDensity);
    vLight = clamp(dot(shellNormal, normalize(sunDirection)) * 0.5 + 0.5, 0.0, 1.0);
    vRadius = cloudRadius;
    vRandom = cloudRandom;
    vWorldPosition = worldPosition.xyz;
    gl_PointSize = size * cloudRadius * volumeScale * perspectiveScale * opacity;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const puffyCloudFragmentShader = `
  uniform float time;
  uniform vec3 cloudColor;
  uniform float opacity;
  uniform float thickness;
  uniform float movementSpeed;
  uniform vec3 sunDirection;

  varying float vCoverage;
  varying float vLight;
  varying float vRadius;
  varying float vRandom;
  varying vec3 vWorldPosition;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.58;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = p * 2.08 + 6.3;
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float radius = length(uv);
    if (radius > 1.0) discard;

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 flow = vec3(time * movementSpeed * 0.45, -time * movementSpeed * 0.25, vRandom * 7.0);
    float billow = fbm(vec3(uv * (2.4 + vRadius), vRandom * 5.0) + flow);
    float core = smoothstep(0.98, 0.22, radius);
    float feather = smoothstep(1.0, 0.64 + billow * 0.18, radius);
    float volume = smoothstep(1.0, 20.0, thickness);
    float selfShade = mix(0.88, 1.12, vLight);
    float silver = pow(1.0 - max(0.0, dot(viewDir, normalize(sunDirection))), 4.0) * 0.18;
    silver *= 0.65 + billow * 0.35;
    float alpha = core * feather * vCoverage * opacity * mix(0.76, 1.0, volume);
    vec3 color = cloudColor * selfShade + silver;

    gl_FragColor = vec4(color, alpha);
  }
`;

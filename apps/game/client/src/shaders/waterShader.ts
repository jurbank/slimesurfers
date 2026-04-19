export const waterVertexShader = `
  uniform float time;
  uniform float waveSpeed;
  uniform float waveAmplitude;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  void main() {
    vec3 pos = position;
    float wave = sin(pos.x * 3.0 + time * waveSpeed) * cos(pos.z * 2.5 + time * waveSpeed * 0.75) * waveAmplitude;
    wave += sin(pos.y * 4.0 + time * waveSpeed * 1.25) * waveAmplitude * 0.5;
    pos += normal * wave;

    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const waterFragmentShader = `
  uniform float time;
  uniform float fresnelPower;
  uniform float fresnelStrength;
  uniform vec3 glowColor;
  uniform float glowIntensity;
  uniform vec3 deepColor;
  uniform vec3 surfaceColor;
  uniform vec3 rimColor;
  uniform float specularPower;
  uniform float specularStrength;
  uniform float shimmerScale;
  uniform float shimmerSpeed;
  uniform float opacity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

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
    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), fresnelPower);

    // Animated surface shimmer
    vec3 noiseCoord = vWorldPosition * shimmerScale + vec3(time * shimmerSpeed, time * shimmerSpeed * 0.67, time * shimmerSpeed * 0.33);
    float shimmer = noise(noiseCoord) * 0.15;

    // Base water color with fresnel-driven transition
    vec3 waterColor = mix(deepColor, surfaceColor, fresnel * fresnelStrength + shimmer);
    waterColor = mix(waterColor, rimColor, fresnel * 0.4);

    // Lambert lighting
    vec3 lightDir = normalize(vec3(200.0, 300.0, 100.0));
    float diff = max(dot(vNormal, lightDir), 0.0);
    vec3 ambient = vec3(0.45);

    // Specular highlight
    vec3 halfDir = normalize(lightDir + vViewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), specularPower);

    vec3 finalColor = waterColor * (diff + ambient) + vec3(1.0) * spec * specularStrength;

    // Fresnel glow — additive colored rim light
    finalColor += glowColor * fresnel * glowIntensity;

    // Alpha: configurable base opacity, slightly more transparent at edges
    float alpha = mix(opacity * 0.8, opacity, 1.0 - fresnel);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

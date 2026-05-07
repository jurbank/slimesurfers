import { celCommonChunks } from "./celShader.ts";

export const waterVertexShader = `
  uniform float time;
  uniform float waveSpeed;
  uniform float waveAmplitude;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;
  varying float vWaterDepth;

  attribute float waterDepth;

  void main() {
    vec3 pos = position;
    float wave = sin(pos.x * 3.0 + time * waveSpeed) * cos(pos.z * 2.5 + time * waveSpeed * 0.75) * waveAmplitude;
    wave += sin(pos.y * 4.0 + time * waveSpeed * 1.25) * waveAmplitude * 0.5;
    pos += normal * wave;

    vNormal = normalize(normalMatrix * normal);
    vWaterDepth = waterDepth;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const waterFragmentShader = `
  ${celCommonChunks}
  uniform float time;
  uniform float fresnelPower;
  uniform float fresnelStrength;
  uniform vec3 glowColor;
  uniform float glowIntensity;
  uniform vec3 deepColor;
  uniform vec3 surfaceColor;
  uniform vec3 shallowColor;
  uniform float shallowDepth;
  uniform float shallowOpacity;
  uniform float opaqueDepth;
  uniform float coastalGlowDepth;
  uniform float coastalGlowStrength;
  uniform float shoreFadeDepth;
  uniform vec3 shoreLineColor;
  uniform float shoreLineStrength;
  uniform float shoreBandFrequency;
  uniform float shoreBandSpeed;
  uniform float shoreBandSharpness;
  uniform vec3 rimColor;
  uniform float specularPower;
  uniform float specularStrength;
  uniform float rippleScale;
  uniform float rippleStrength;
  uniform float shimmerScale;
  uniform float shimmerSpeed;
  uniform float opacity;
  uniform vec3 sunDirection;
  uniform float planetRadius;
  uniform float puffyCloudShadowStrength;
  uniform float puffyCloudShadowDensity;
  uniform float puffyCloudShadowHeight;
  uniform float puffyCloudShadowSize;
  uniform float puffyCloudShadowMovementSpeed;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;
  varying float vWaterDepth;

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

  float puffyCloudShadow(vec3 surfaceNormal) {
    if (puffyCloudShadowStrength <= 0.0 || puffyCloudShadowDensity <= 0.0) return 1.0;

    vec3 sun = normalize(sunDirection);
    float litSide = smoothstep(-0.2, 0.35, dot(surfaceNormal, sun));
    if (litSide <= 0.0) return 1.0;

    float projectionOffset = clamp(puffyCloudShadowHeight / max(planetRadius, 1.0), 0.01, 0.28);
    vec3 cloudNormal = normalize(surfaceNormal + sun * projectionOffset);
    float drift = time * puffyCloudShadowMovementSpeed * 0.22;
    float normalizedDensity =
      puffyCloudShadowDensity <= 1.0
        ? puffyCloudShadowDensity
        : clamp(puffyCloudShadowDensity / 14.0, 0.0, 1.0);
    float radiusScale = clamp(puffyCloudShadowSize / 14.0, 0.55, 2.4);
    float coverage = 0.0;

    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float y = 1.0 - (fi / 11.0) * 2.0;
      float ringRadius = sqrt(max(0.0, 1.0 - y * y));
      float theta = fi * 2.39996323 + drift;
      float bankSeed = fi * 23.71;
      float bankCoverage = hash(vec3(bankSeed + 0.3, bankSeed + 1.7, bankSeed + 2.9));
      float visible = smoothstep(bankCoverage - 0.22, bankCoverage + 0.28, normalizedDensity);
      vec3 bankNormal = normalize(vec3(cos(theta) * ringRadius, y, sin(theta) * ringRadius));
      float angularFalloff = 1.0 - dot(cloudNormal, bankNormal);
      float width = (0.014 + hash(vec3(bankSeed + 1.3, bankSeed + 3.1, 0.0)) * 0.018) * radiusScale;
      coverage += (1.0 - smoothstep(0.0, width, angularFalloff)) * visible;
    }

    float shadow = clamp(coverage, 0.0, 1.0) * puffyCloudShadowStrength * litSide;
    return 1.0 - shadow * 0.45;
  }

  vec3 rippleNormal(vec3 baseNormal) {
    vec3 referenceUp = abs(baseNormal.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(referenceUp, baseNormal));
    vec3 bitangent = normalize(cross(baseNormal, tangent));
    float rippleA = noise(vWorldPosition * rippleScale + vec3(time * 0.12, -time * 0.08, time * 0.04));
    float rippleB = noise(vWorldPosition * rippleScale * 1.9 - vec3(time * 0.07, time * 0.11, -time * 0.05));
    vec2 ripple = (vec2(rippleA, rippleB) - 0.5) * rippleStrength;
    return normalize(baseNormal + tangent * ripple.x + bitangent * ripple.y);
  }

  void main() {
    vec3 waterNormal = rippleNormal(normalize(vNormal));
    float fresnel = pow(1.0 - max(dot(vViewDir, waterNormal), 0.0), fresnelPower);

    vec3 noiseCoord = vWorldPosition * shimmerScale + vec3(time * shimmerSpeed, time * shimmerSpeed * 0.67, time * shimmerSpeed * 0.33);
    float shimmer = noise(noiseCoord) * 0.15;

    float underwaterMask = smoothstep(0.02, 0.25, vWaterDepth);
    float depth = max(vWaterDepth, 0.0);
    float shallow = (1.0 - smoothstep(0.0, shallowDepth, depth)) * underwaterMask;
    float shoreMask = (1.0 - smoothstep(0.0, shoreFadeDepth, depth)) * underwaterMask;
    float coastalGlow = (1.0 - smoothstep(0.0, coastalGlowDepth, depth)) * underwaterMask;
    float bandPhase = depth * shoreBandFrequency - time * shoreBandSpeed;
    float shoreBand = pow(1.0 - abs(sin(bandPhase)), shoreBandSharpness) * shoreMask;

    vec3 depthColor = mix(deepColor, shallowColor, shallow);
    vec3 waterColor = mix(depthColor, surfaceColor, fresnel * fresnelStrength + shimmer);
    waterColor += shallowColor * coastalGlow * coastalGlowStrength;
    waterColor = mix(waterColor, shoreLineColor, shoreBand * shoreLineStrength);
    waterColor = mix(waterColor, rimColor, fresnel * 0.4);

    vec3 lightDir = normalize(sunDirection);
    float diff = max(dot(waterNormal, lightDir), 0.0);
    diff = getCelLighting(diff);
    vec3 ambient = vec3(0.45);

    vec3 halfDir = normalize(lightDir + vViewDir);
    float spec = pow(max(dot(waterNormal, halfDir), 0.0), specularPower);
    spec = smoothstep(0.4, 0.45, spec);

    vec3 finalColor = waterColor * (diff + ambient) + vec3(1.0) * spec * specularStrength;
    finalColor *= getHatching(gl_FragCoord.xy / 1000.0, diff);
    finalColor *= puffyCloudShadow(normalize(vNormal));
    finalColor += glowColor * fresnel * glowIntensity;

    float deepOpacity = smoothstep(0.0, opaqueDepth, depth);
    float depthAlpha = mix(shallowOpacity, opacity, deepOpacity);

    gl_FragColor = vec4(finalColor, depthAlpha);
  }
`;

export const planetVertexShader = `
  attribute vec3 color;
  attribute vec3 smoothNormal;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vLocalNormal;
  varying vec3 vSmoothLocalNormal;
  varying vec3 vSmoothNormal;
  varying vec3 vWorldPosition;
  varying vec3 vColor;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vLocalNormal = normalize(normal);
    vSmoothLocalNormal = normalize(smoothNormal);
    vSmoothNormal = normalize(normalMatrix * smoothNormal);
    vColor = color;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const planetFragmentShader = `
  uniform sampler2D paintMask;
  uniform float time;
  uniform float edgeNoiseScale;
  uniform float edgeNoiseStrength;
  uniform float normalPerturbationStrength;
  uniform float paintBlendStrength;
  uniform float slimeFlowSpeed;
  uniform float slimeFlowStrength;
  uniform float slimeShineStrength;
  uniform float slimeFresnelStrength;
  uniform float slimeSpecularPower;
  uniform float slimeEdgeWetness;
  uniform float slimePoolDarkening;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vLocalNormal;
  varying vec3 vSmoothLocalNormal;
  varying vec3 vSmoothNormal;
  varying vec3 vWorldPosition;
  varying vec3 vColor;

  // 3D noise for seamless surface variation
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

  vec3 paintNormal(vec3 baseNormal, vec3 localNormal, float flowA, float flowB) {
    vec3 referenceUp = abs(baseNormal.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(referenceUp, baseNormal));
    vec3 bitangent = normalize(cross(baseNormal, tangent));
    vec2 offset = (vec2(flowA, flowB) - 0.5) * 2.0 * normalPerturbationStrength;
    offset += localNormal.xz * slimeFlowStrength * 0.15;
    return normalize(baseNormal + tangent * offset.x + bitangent * offset.y);
  }

  void main() {
    vec4 paintData = texture2D(paintMask, vUv);
    float mask = paintData.a;
    vec3 paintColor = paintData.rgb;

    vec3 smoothLocalNormal = normalize(vSmoothLocalNormal);
    vec3 flowSample = vec3(time * slimeFlowSpeed, -time * slimeFlowSpeed * 0.7, time * 0.13);
    float edgeNoise = noise(smoothLocalNormal * edgeNoiseScale + flowSample);
    float flowA = noise(smoothLocalNormal * edgeNoiseScale * 0.65 + flowSample * 1.6);
    float flowB = noise(smoothLocalNormal * edgeNoiseScale * 1.35 - flowSample * 1.2);
    float goopMix = mix(flowA, flowB, 0.5);

    mask = smoothstep(0.08, 0.92, mask + (edgeNoise - 0.5) * edgeNoiseStrength);
    float glossyMask = smoothstep(0.18, 0.92, mask);
    float edgeBand = smoothstep(0.12, 0.55, mask) * (1.0 - smoothstep(0.55, 0.92, mask));
    float pooledCenter = smoothstep(0.58, 0.98, mask);

    vec3 smoothPaintNormal = normalize(vSmoothNormal);
    vec3 slimyNormal = paintNormal(smoothPaintNormal, smoothLocalNormal, flowA, flowB);
    vec3 lightDir = normalize(vec3(200.0, 300.0, 100.0));
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float terrainDiff = max(dot(vSmoothNormal, lightDir), 0.0);
    float paintDiff = max(dot(slimyNormal, lightDir), 0.0);
    float specular = pow(
      max(dot(reflect(-lightDir, slimyNormal), viewDir), 0.0),
      slimeSpecularPower
    );
    float clearCoat = pow(
      max(dot(reflect(-lightDir, smoothPaintNormal), viewDir), 0.0),
      slimeSpecularPower * 1.8
    );
    float fresnel = pow(1.0 - max(dot(viewDir, slimyNormal), 0.0), 3.0);
    float edgeFresnel = pow(1.0 - max(dot(viewDir, smoothPaintNormal), 0.0), 5.0);

    vec3 ambient = vec3(0.5);

    vec3 pooledColor = paintColor * (1.0 - slimePoolDarkening);
    vec3 goopBase = mix(pooledColor, paintColor * 0.96, 0.35 + goopMix * 0.12);
    vec3 wetEdgeTint = min(paintColor * (1.0 + slimeEdgeWetness), vec3(1.0));
    goopBase = mix(goopBase, wetEdgeTint, edgeBand * slimeEdgeWetness);
    vec3 goopHighlight =
      vec3(specular * slimeShineStrength)
      + vec3(clearCoat * slimeShineStrength * 0.65)
      + paintColor * fresnel * slimeFresnelStrength
      + wetEdgeTint * edgeFresnel * edgeBand * slimeEdgeWetness * 0.9;
    vec3 shadedTerrain = vColor * (terrainDiff + ambient);
    vec3 shadedPaint = (goopBase * (paintDiff + ambient)) + goopHighlight * glossyMask;
    shadedPaint = mix(shadedPaint, shadedPaint + wetEdgeTint * 0.08, edgeBand);
    shadedPaint *= 1.0 - pooledCenter * slimePoolDarkening * 0.18;
    vec3 finalColor = mix(shadedTerrain, shadedPaint, mask * paintBlendStrength);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

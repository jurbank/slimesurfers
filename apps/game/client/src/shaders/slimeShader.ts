import { celCommonChunks } from "./celShader.ts";

export const slimeVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const slimeFragmentShader = `
  ${celCommonChunks}
  uniform sampler2D map;
  uniform vec3 uColor;
  uniform vec3 emissive;
  uniform float emissiveIntensity;
  uniform bool hasMap;
  uniform float opacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 baseColor = uColor;
    if (hasMap) {
      baseColor = texture2D(map, vUv).rgb;
    }

    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
    float diff = max(dot(vNormal, lightDir), 0.0);
    diff = getCelLighting(diff);

    vec3 ambient = vec3(0.35);
    vec3 finalColor = baseColor * (diff * 0.75 + ambient);
    finalColor += emissive * emissiveIntensity;
    finalColor *= getHatching(gl_FragCoord.xy / 1000.0, diff);

    gl_FragColor = vec4(finalColor, opacity);
  }
`;

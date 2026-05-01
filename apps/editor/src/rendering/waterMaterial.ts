import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { MAX_TUNNEL_SHADER_SEGMENTS } from "../tools/tracks/trackCarving.ts";
import { waterVertexShader, waterFragmentShader } from "./waterShader.ts";

export function createWaterMaterial(): THREE.ShaderMaterial {
  const cfg = GAME_CONFIG.shaders.water;
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      fresnelPower: { value: cfg.fresnelPower },
      fresnelStrength: { value: cfg.fresnelStrength },
      glowColor: { value: new THREE.Vector3(...cfg.glowColor) },
      glowIntensity: { value: cfg.glowIntensity },
      deepColor: { value: new THREE.Vector3(...cfg.deepColor) },
      surfaceColor: { value: new THREE.Vector3(...cfg.surfaceColor) },
      shallowColor: { value: new THREE.Vector3(...cfg.shallowColor) },
      shallowDepth: { value: cfg.shallowDepth },
      shallowOpacity: { value: cfg.shallowOpacity },
      opaqueDepth: { value: cfg.opaqueDepth },
      coastalGlowDepth: { value: cfg.coastalGlowDepth },
      coastalGlowStrength: { value: cfg.coastalGlowStrength },
      shoreFadeDepth: { value: cfg.shoreFadeDepth },
      shoreLineColor: { value: new THREE.Vector3(...cfg.shoreLineColor) },
      shoreLineStrength: { value: cfg.shoreLineStrength },
      shoreBandFrequency: { value: cfg.shoreBandFrequency },
      shoreBandSpeed: { value: cfg.shoreBandSpeed },
      shoreBandSharpness: { value: cfg.shoreBandSharpness },
      rimColor: { value: new THREE.Vector3(...cfg.rimColor) },
      specularPower: { value: cfg.specularPower },
      specularStrength: { value: cfg.specularStrength },
      waveSpeed: { value: cfg.waveSpeed },
      waveAmplitude: { value: cfg.waveAmplitude },
      rippleScale: { value: cfg.rippleScale },
      rippleStrength: { value: cfg.rippleStrength },
      shimmerScale: { value: cfg.shimmerScale },
      shimmerSpeed: { value: cfg.shimmerSpeed },
      opacity: { value: cfg.opacity },
      celBands: { value: GAME_CONFIG.shaders.cel.bands },
      celSoftness: { value: GAME_CONFIG.shaders.cel.softness },
      celHatchStrength: { value: GAME_CONFIG.shaders.cel.hatchStrength },
      celHatchScale: { value: GAME_CONFIG.shaders.cel.hatchScale },
      tunnelSegmentCount: { value: 0 },
      tunnelStarts: {
        value: Array.from({ length: MAX_TUNNEL_SHADER_SEGMENTS }, () => new THREE.Vector3()),
      },
      tunnelEnds: {
        value: Array.from({ length: MAX_TUNNEL_SHADER_SEGMENTS }, () => new THREE.Vector3()),
      },
      tunnelRadii: { value: new Float32Array(MAX_TUNNEL_SHADER_SEGMENTS) },
    },
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

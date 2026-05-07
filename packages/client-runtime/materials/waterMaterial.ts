import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import {
  waterVertexShader,
  waterFragmentShader,
} from "@splat/client-runtime/shaders/waterShader.ts";
import type { RuntimeMapCel } from "@splat/content/map/runtimeMapData.ts";

export interface WaterMaterialOptions {
  deepColor: number;
  cel: RuntimeMapCel;
  planetRadius?: number;
  sunDirection?: THREE.Vector3;
  puffyCloudShadows?: {
    enabled: boolean;
    density: number;
    height: number;
    size: number;
    strength: number;
    movementSpeed: number;
  };
}

function hexToVec3(hex: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

export function createWaterMaterial(options: WaterMaterialOptions): THREE.ShaderMaterial {
  const cfg = GAME_CONFIG.shaders.water;
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      fresnelPower: { value: cfg.fresnelPower },
      fresnelStrength: { value: cfg.fresnelStrength },
      glowColor: { value: new THREE.Vector3(...cfg.glowColor) },
      glowIntensity: { value: cfg.glowIntensity },
      deepColor: { value: hexToVec3(options.deepColor) },
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
      sunDirection: { value: options.sunDirection?.clone() ?? new THREE.Vector3(0.5, 0.7, 0.5) },
      celEnabled: { value: "enabled" in options.cel && options.cel.enabled === false ? 0 : 1 },
      celBands: { value: options.cel.bands },
      celSoftness: { value: options.cel.softness },
      celHatchStrength: { value: options.cel.hatchStrength },
      celHatchScale: { value: options.cel.hatchScale },
      planetRadius: { value: options.planetRadius ?? 1 },
      puffyCloudShadowStrength: {
        value: options.puffyCloudShadows?.enabled ? options.puffyCloudShadows.strength : 0,
      },
      puffyCloudShadowDensity: { value: options.puffyCloudShadows?.density ?? 0 },
      puffyCloudShadowHeight: { value: options.puffyCloudShadows?.height ?? 0 },
      puffyCloudShadowSize: { value: options.puffyCloudShadows?.size ?? 0 },
      puffyCloudShadowMovementSpeed: {
        value: options.puffyCloudShadows?.movementSpeed ?? 0,
      },
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

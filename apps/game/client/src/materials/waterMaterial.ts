import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { waterVertexShader, waterFragmentShader } from "../shaders/waterShader.ts";

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
      rimColor: { value: new THREE.Vector3(...cfg.rimColor) },
      specularPower: { value: cfg.specularPower },
      specularStrength: { value: cfg.specularStrength },
      waveSpeed: { value: cfg.waveSpeed },
      waveAmplitude: { value: cfg.waveAmplitude },
      shimmerScale: { value: cfg.shimmerScale },
      shimmerSpeed: { value: cfg.shimmerSpeed },
      opacity: { value: cfg.opacity },
    },
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

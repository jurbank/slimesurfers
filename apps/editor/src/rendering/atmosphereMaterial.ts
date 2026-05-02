import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "@splat/client-runtime/shaders/atmosphereShader.ts";

export function createAtmosphereMaterial(): THREE.ShaderMaterial {
  const cfg = GAME_CONFIG.shaders.atmosphere;
  return new THREE.ShaderMaterial({
    uniforms: {
      atmosphereColor: { value: new THREE.Color(...cfg.color) },
      intensity: { value: cfg.intensity },
      opacity: { value: cfg.opacity },
      fresnelPower: { value: cfg.fresnelPower },
      falloffPower: { value: cfg.falloffPower },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}

import * as THREE from "three";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "@splat/client-runtime/shaders/atmosphereShader.ts";
import type { RuntimeMapAtmosphere } from "@splat/content/map/runtimeMapData.ts";

export function createAtmosphereMaterial(cfg: RuntimeMapAtmosphere): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      atmosphereColor: { value: new THREE.Color(cfg.color) },
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

import * as THREE from "three";
import {
  arenaBoundaryVertexShader,
  arenaBoundaryFragmentShader,
} from "@splat/client-runtime/shaders/arenaBoundaryShader.ts";

export interface ArenaBoundaryConfig {
  color: number;
  intensity: number;
  opacity: number;
  fresnelPower: number;
}

export const DEFAULT_ARENA_BOUNDARY: ArenaBoundaryConfig = {
  color: 0xff5d73,
  intensity: 0.8,
  opacity: 0.35,
  fresnelPower: 3.5,
};

export function createArenaBoundaryMaterial(
  cfg: ArenaBoundaryConfig = DEFAULT_ARENA_BOUNDARY,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      fogColor: { value: new THREE.Color(cfg.color) },
      intensity: { value: cfg.intensity },
      opacity: { value: cfg.opacity },
      fresnelPower: { value: cfg.fresnelPower },
    },
    vertexShader: arenaBoundaryVertexShader,
    fragmentShader: arenaBoundaryFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
}

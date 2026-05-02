import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import {
  outlineVertexShader,
  outlineFragmentShader,
} from "@splat/client-runtime/shaders/outlineShader.ts";

export function createOutlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      outlineThickness: { value: GAME_CONFIG.shaders.cel.outlineThickness },
      outlineColor: { value: new THREE.Vector3(...GAME_CONFIG.shaders.cel.outlineColor) },
    },
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.BackSide,
  });
}

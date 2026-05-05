import * as THREE from "three";
import { RENDER_CONFIG } from "@splat/content/config/renderConfig.ts";
import {
  outlineVertexShader,
  outlineFragmentShader,
} from "@splat/client-runtime/shaders/outlineShader.ts";

export function createOutlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      outlineThickness: { value: RENDER_CONFIG.celOutline.thickness },
      outlineColor: { value: new THREE.Vector3(...RENDER_CONFIG.celOutline.color) },
    },
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.BackSide,
  });
}

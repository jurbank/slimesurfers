import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { MAX_TUNNEL_SHADER_SEGMENTS } from "../tools/tracks/trackCarving.ts";
import { outlineVertexShader, outlineFragmentShader } from "./outlineShader.ts";

export function createOutlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      outlineThickness: { value: GAME_CONFIG.shaders.cel.outlineThickness },
      outlineColor: { value: new THREE.Vector3(...GAME_CONFIG.shaders.cel.outlineColor) },
      tunnelSegmentCount: { value: 0 },
      tunnelStarts: {
        value: Array.from({ length: MAX_TUNNEL_SHADER_SEGMENTS }, () => new THREE.Vector3()),
      },
      tunnelEnds: {
        value: Array.from({ length: MAX_TUNNEL_SHADER_SEGMENTS }, () => new THREE.Vector3()),
      },
      tunnelRadii: { value: new Float32Array(MAX_TUNNEL_SHADER_SEGMENTS) },
    },
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.BackSide,
  });
}

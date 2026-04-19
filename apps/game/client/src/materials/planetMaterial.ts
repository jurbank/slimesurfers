import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { planetVertexShader, planetFragmentShader } from "../shaders/planetShader.ts";

export interface PlanetMaterialOptions {
  paintMask: THREE.Texture | null;
}

export function createPlanetMaterial(options: PlanetMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      paintMask: { value: options.paintMask },
      time: { value: 0 },
      edgeNoiseScale: { value: GAME_CONFIG.paint.edgeNoiseScale },
      edgeNoiseStrength: { value: GAME_CONFIG.paint.edgeNoiseStrength },
      normalPerturbationStrength: { value: GAME_CONFIG.paint.normalPerturbationStrength },
      paintBlendStrength: { value: GAME_CONFIG.paint.paintBlendStrength },
      slimeFlowSpeed: { value: GAME_CONFIG.paint.slimeFlowSpeed },
      slimeFlowStrength: { value: GAME_CONFIG.paint.slimeFlowStrength },
      slimeShineStrength: { value: GAME_CONFIG.paint.slimeShineStrength },
      slimeFresnelStrength: { value: GAME_CONFIG.paint.slimeFresnelStrength },
      slimeSpecularPower: { value: GAME_CONFIG.paint.slimeSpecularPower },
      slimeEdgeWetness: { value: GAME_CONFIG.paint.slimeEdgeWetness },
      slimePoolDarkening: { value: GAME_CONFIG.paint.slimePoolDarkening },
    },
    vertexShader: planetVertexShader,
    fragmentShader: planetFragmentShader,
  });
}

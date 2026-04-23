import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { planetVertexShader, planetFragmentShader } from "../shaders/planetShader.ts";

export interface PlanetMaterialOptions {
  paintMask: THREE.Texture | null;
  planetCenter: THREE.Vector3;
  waterRadius: number;
}

export function createPlanetMaterial(options: PlanetMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      paintMask: { value: options.paintMask },
      planetCenter: { value: options.planetCenter },
      planetRadius: { value: GAME_CONFIG.planet.radius },
      waterRadius: { value: options.waterRadius },
      waterLevel: { value: GAME_CONFIG.terrain.waterLevel },
      sandBand: { value: GAME_CONFIG.terrain.sandBand },
      snowLevel: { value: GAME_CONFIG.terrain.snowLevel },
      rockLevel: { value: GAME_CONFIG.terrain.rockLevel },
      waterDeepColor: { value: new THREE.Vector3(...GAME_CONFIG.shaders.water.deepColor) },
      sandColor: { value: new THREE.Color(GAME_CONFIG.shaders.terrain.sandColor) },
      grassColor: { value: new THREE.Color(GAME_CONFIG.shaders.terrain.grassColor) },
      rockColor: { value: new THREE.Color(GAME_CONFIG.shaders.terrain.rockColor) },
      snowColor: { value: new THREE.Color(GAME_CONFIG.shaders.terrain.snowColor) },
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
      celBands: { value: GAME_CONFIG.shaders.cel.bands },
      celSoftness: { value: GAME_CONFIG.shaders.cel.softness },
      celHatchStrength: { value: GAME_CONFIG.shaders.cel.hatchStrength },
      celHatchScale: { value: GAME_CONFIG.shaders.cel.hatchScale },
    },
    vertexShader: planetVertexShader,
    fragmentShader: planetFragmentShader,
  });
}

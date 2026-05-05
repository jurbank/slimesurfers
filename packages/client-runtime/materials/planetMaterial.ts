import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import {
  planetVertexShader,
  planetFragmentShader,
} from "@splat/client-runtime/shaders/planetShader.ts";
import type {
  RuntimeMapCel,
  RuntimeMapColors,
  RuntimeMapLighting,
} from "@splat/content/map/runtimeMapData.ts";

export interface PlanetMaterialOptions {
  paintMask: THREE.Texture | null;
  planetCenter: THREE.Vector3;
  planetRadius: number;
  waterRadius: number;
  waterLevel: number;
  sandBand: number;
  snowLevel: number;
  rockLevel: number;
  colors: RuntimeMapColors;
  cel: RuntimeMapCel;
  lighting: RuntimeMapLighting;
}

function hexToVec3(hex: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

function sunDirectionFromLighting(lighting: RuntimeMapLighting): THREE.Vector3 {
  const azRad = (lighting.sunAzimuth * Math.PI) / 180;
  const elRad = (lighting.sunElevation * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(elRad) * Math.sin(azRad),
    Math.sin(elRad),
    Math.cos(elRad) * Math.cos(azRad),
  );
}

export function createPlanetMaterial(options: PlanetMaterialOptions): THREE.ShaderMaterial {
  const { colors, cel, lighting } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      paintMask: { value: options.paintMask },
      planetCenter: { value: options.planetCenter },
      planetRadius: { value: options.planetRadius },
      waterRadius: { value: options.waterRadius },
      waterLevel: { value: options.waterLevel },
      sandBand: { value: options.sandBand },
      snowLevel: { value: options.snowLevel },
      rockLevel: { value: options.rockLevel },
      waterDeepColor: { value: hexToVec3(colors.waterDeep) },
      sandColor: { value: new THREE.Color(colors.sand) },
      grassColor: { value: new THREE.Color(colors.grass) },
      rockColor: { value: new THREE.Color(colors.rock) },
      snowColor: { value: new THREE.Color(colors.snow) },
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
      celBands: { value: cel.bands },
      celSoftness: { value: cel.softness },
      celHatchStrength: { value: cel.hatchStrength },
      celHatchScale: { value: cel.hatchScale },
      sunDirection: { value: sunDirectionFromLighting(lighting) },
      sunIntensity: { value: lighting.sunIntensity },
      ambientIntensity: { value: lighting.ambientIntensity },
      rimColor: { value: new THREE.Color(lighting.rimColor) },
      rimStrength: { value: lighting.rimStrength },
      rimPower: { value: lighting.rimPower },
    },
    vertexShader: planetVertexShader,
    fragmentShader: planetFragmentShader,
  });
}

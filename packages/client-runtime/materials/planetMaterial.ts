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
  slimeMask: THREE.Texture | null;
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
  puffyCloudShadows?: {
    enabled: boolean;
    density: number;
    height: number;
    size: number;
    strength: number;
    movementSpeed: number;
  };
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
      slimeMask: { value: options.slimeMask },
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
      edgeNoiseScale: { value: GAME_CONFIG.slimeStamp.edgeNoiseScale },
      edgeNoiseStrength: { value: GAME_CONFIG.slimeStamp.edgeNoiseStrength },
      normalPerturbationStrength: { value: GAME_CONFIG.slimeStamp.normalPerturbationStrength },
      slimeBlendStrength: { value: GAME_CONFIG.slimeStamp.slimeBlendStrength },
      slimeFlowSpeed: { value: GAME_CONFIG.slimeStamp.slimeFlowSpeed },
      slimeFlowStrength: { value: GAME_CONFIG.slimeStamp.slimeFlowStrength },
      slimeShineStrength: { value: GAME_CONFIG.slimeStamp.slimeShineStrength },
      slimeFresnelStrength: { value: GAME_CONFIG.slimeStamp.slimeFresnelStrength },
      slimeSpecularPower: { value: GAME_CONFIG.slimeStamp.slimeSpecularPower },
      slimeEdgeWetness: { value: GAME_CONFIG.slimeStamp.slimeEdgeWetness },
      slimePoolDarkening: { value: GAME_CONFIG.slimeStamp.slimePoolDarkening },
      celEnabled: { value: "enabled" in cel && cel.enabled === false ? 0 : 1 },
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
      puffyCloudShadowStrength: {
        value: options.puffyCloudShadows?.enabled ? options.puffyCloudShadows.strength : 0,
      },
      puffyCloudShadowDensity: { value: options.puffyCloudShadows?.density ?? 0 },
      puffyCloudShadowHeight: { value: options.puffyCloudShadows?.height ?? 0 },
      puffyCloudShadowSize: { value: options.puffyCloudShadows?.size ?? 0 },
      puffyCloudShadowMovementSpeed: {
        value: options.puffyCloudShadows?.movementSpeed ?? 0,
      },
    },
    vertexShader: planetVertexShader,
    fragmentShader: planetFragmentShader,
  });
}

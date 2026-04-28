import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";

export interface EditorConfig {
  planet: { radius: number };
  terrain: {
    // Geometry params — require mesh rebuild
    seed: number;
    baseAmplitude: number;
    frequency: number;
    octaves: number;
    lacunarity: number;
    persistence: number;
    heightSmoothingStrength: number;
    heightSmoothingSampleAngle: number;
    icosahedronDetail: number;
    // Biome thresholds — uniform-only
    waterLevel: number;
    sandBand: number;
    rockLevel: number;
    snowLevel: number;
  };
  colors: {
    sand: number;
    grass: number;
    rock: number;
    snow: number;
    waterDeep: number;
  };
  shaders: {
    cel: {
      bands: number;
      softness: number;
      hatchStrength: number;
      hatchScale: number;
    };
    atmosphere: {
      color: number;
      intensity: number;
      opacity: number;
      fresnelPower: number;
      falloffPower: number;
    };
    lighting: {
      sunAzimuth: number;
      sunElevation: number;
      sunIntensity: number;
      ambientIntensity: number;
      rimColor: number;
      rimStrength: number;
      rimPower: number;
    };
  };
}

function rgbToHex(r: number, g: number, b: number): number {
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

export function defaultEditorConfig(): EditorConfig {
  const g = GAME_CONFIG;
  const [wr, wg, wb] = g.shaders.water.deepColor;
  const [ar, ag, ab] = g.shaders.atmosphere.color;
  return {
    planet: { radius: g.planet.radius },
    terrain: {
      seed: g.terrain.seed,
      baseAmplitude: g.terrain.baseAmplitude,
      frequency: g.terrain.frequency,
      octaves: g.terrain.octaves,
      lacunarity: g.terrain.lacunarity,
      persistence: g.terrain.persistence,
      heightSmoothingStrength: g.terrain.heightSmoothingStrength,
      heightSmoothingSampleAngle: g.terrain.heightSmoothingSampleAngle,
      icosahedronDetail: 30,
      waterLevel: g.terrain.waterLevel,
      sandBand: g.terrain.sandBand,
      rockLevel: g.terrain.rockLevel,
      snowLevel: g.terrain.snowLevel,
    },
    colors: {
      sand: g.shaders.terrain.sandColor,
      grass: g.shaders.terrain.grassColor,
      rock: g.shaders.terrain.rockColor,
      snow: g.shaders.terrain.snowColor,
      waterDeep: rgbToHex(wr, wg, wb),
    },
    shaders: {
      cel: {
        bands: g.shaders.cel.bands,
        softness: g.shaders.cel.softness,
        hatchStrength: g.shaders.cel.hatchStrength,
        hatchScale: g.shaders.cel.hatchScale,
      },
      atmosphere: {
        color: rgbToHex(ar, ag, ab),
        intensity: g.shaders.atmosphere.intensity,
        opacity: g.shaders.atmosphere.opacity,
        fresnelPower: g.shaders.atmosphere.fresnelPower,
        falloffPower: g.shaders.atmosphere.falloffPower,
      },
      lighting: {
        sunAzimuth: 63,
        sunElevation: 53,
        sunIntensity: 1.0,
        ambientIntensity: 0.5,
        rimColor: 0x8ab4ff,
        rimStrength: 0.4,
        rimPower: 3.0,
      },
    },
  };
}

export const GEOMETRY_TERRAIN_KEYS: ReadonlySet<keyof EditorConfig["terrain"]> = new Set([
  "seed",
  "baseAmplitude",
  "frequency",
  "octaves",
  "lacunarity",
  "persistence",
  "heightSmoothingStrength",
  "heightSmoothingSampleAngle",
  "icosahedronDetail",
]);

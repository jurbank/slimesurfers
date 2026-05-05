import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";

export type BrushMode = "raise" | "lower" | "smooth" | "flatten";
export type BrushFalloff = "smooth" | "linear" | "sharp";
export type PropId =
  | "lowPolyTree"
  | "palmTree"
  | "mushroom"
  | "cactus"
  | "bush"
  | "flower"
  | "ramp";

export interface BrushState {
  mode: BrushMode;
  size: number;
  strength: number;
  falloff: BrushFalloff;
}

export interface PropBrushState {
  propId: PropId;
  size: number;
  density: number;
  scale: number;
}

export interface PreviewSpawnState {
  normal: [number, number, number];
}

export interface EditorPlanet {
  id: string;
  center: { x: number; y: number; z: number };
  radius: number;
  terrain: {
    seed: number;
    baseAmplitude: number;
    frequency: number;
    octaves: number;
    lacunarity: number;
    persistence: number;
    heightSmoothingStrength: number;
    heightSmoothingSampleAngle: number;
    icosahedronDetail: number;
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
  atmosphere: {
    enabled: boolean;
    height: number;
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
  props: {
    treeDensity: number;
    cactusDensity: number;
    seed: number;
    rocketEnabled: boolean;
  };
  hasWater: boolean;
}

export interface EditorConfig {
  planets: EditorPlanet[];
  shaders: {
    cel: {
      bands: number;
      softness: number;
      hatchStrength: number;
      hatchScale: number;
    };
  };
}

export interface PerformanceMetricGroup {
  id: string;
  label: string;
  triangles: number;
  drawCalls: number;
  meshes: number;
  instances?: number;
  notes?: string;
}

export interface PerformanceStats {
  updatedAt: number;
  totals: {
    triangles: number;
    drawCalls: number;
    meshes: number;
    instancedMeshes: number;
    instances: number;
    shaderMaterials: number;
    transparentObjects: number;
    geometries: number;
    textures: number;
  };
  groups: PerformanceMetricGroup[];
}

function rgbToHex(r: number, g: number, b: number): number {
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

export function defaultEditorPlanet(id: string, center = { x: 0, y: 0, z: 0 }): EditorPlanet {
  const g = GAME_CONFIG;
  const [wr, wg, wb] = g.shaders.water.deepColor;
  const [ar, ag, ab] = g.shaders.atmosphere.color;
  return {
    id,
    center,
    radius: g.planet.radius,
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
    atmosphere: {
      enabled: true,
      height: g.shaders.atmosphere.height,
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
    props: {
      treeDensity: g.shaders.props.treeDensity,
      cactusDensity: g.shaders.props.cactusDensity,
      seed: g.shaders.props.seed,
      rocketEnabled: g.shaders.props.rocketEnabled,
    },
    hasWater: true,
  };
}

export function defaultEditorConfig(): EditorConfig {
  const g = GAME_CONFIG;
  return {
    planets: [defaultEditorPlanet("planet-0")],
    shaders: {
      cel: {
        bands: g.shaders.cel.bands,
        softness: g.shaders.cel.softness,
        hatchStrength: g.shaders.cel.hatchStrength,
        hatchScale: g.shaders.cel.hatchScale,
      },
    },
  };
}

export const GEOMETRY_TERRAIN_KEYS: ReadonlySet<keyof EditorPlanet["terrain"]> = new Set([
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

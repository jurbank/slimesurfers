import {
  DEFAULT_RUNTIME_CEL,
  DEFAULT_RUNTIME_PLANET_ATMOSPHERE,
  DEFAULT_RUNTIME_PLANET_COLORS,
  DEFAULT_RUNTIME_PLANET_LIGHTING,
  DEFAULT_RUNTIME_PLANET_PROPS,
  DEFAULT_RUNTIME_PLANET_RADIUS,
  DEFAULT_RUNTIME_PLANET_TERRAIN,
} from "@splat/content/map/runtimeMapData.ts";

export type BrushMode = "raise" | "lower" | "smooth" | "flatten";
export type BrushFalloff = "smooth" | "linear" | "sharp";
export type ShaderBlendMode = "normal" | "additive" | "multiply";
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
    blendMode: ShaderBlendMode;
    fresnelPower: number;
    falloffPower: number;
    clouds: {
      enabled: boolean;
      height: number;
      thickness: number;
      density: number;
      color: number;
      shadowStrength: number;
      coverageScale: number;
      movementSpeed: number;
      opacity: number;
      blendMode: ShaderBlendMode;
      puffs: {
        enabled: boolean;
        height: number;
        thickness: number;
        density: number;
        size: number;
        color: number;
        opacity: number;
        blendMode: ShaderBlendMode;
        shadowStrength: number;
        movementSpeed: number;
      };
    };
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
      enabled: boolean;
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

export function defaultEditorPlanet(id: string, center = { x: 0, y: 0, z: 0 }): EditorPlanet {
  return {
    id,
    center,
    radius: DEFAULT_RUNTIME_PLANET_RADIUS,
    terrain: {
      seed: DEFAULT_RUNTIME_PLANET_TERRAIN.seed,
      baseAmplitude: DEFAULT_RUNTIME_PLANET_TERRAIN.baseAmplitude,
      frequency: DEFAULT_RUNTIME_PLANET_TERRAIN.frequency,
      octaves: DEFAULT_RUNTIME_PLANET_TERRAIN.octaves,
      lacunarity: DEFAULT_RUNTIME_PLANET_TERRAIN.lacunarity,
      persistence: DEFAULT_RUNTIME_PLANET_TERRAIN.persistence,
      heightSmoothingStrength: DEFAULT_RUNTIME_PLANET_TERRAIN.heightSmoothingStrength,
      heightSmoothingSampleAngle: DEFAULT_RUNTIME_PLANET_TERRAIN.heightSmoothingSampleAngle,
      icosahedronDetail: 30,
      waterLevel: DEFAULT_RUNTIME_PLANET_TERRAIN.waterLevel,
      sandBand: DEFAULT_RUNTIME_PLANET_TERRAIN.sandBand,
      rockLevel: DEFAULT_RUNTIME_PLANET_TERRAIN.rockLevel,
      snowLevel: DEFAULT_RUNTIME_PLANET_TERRAIN.snowLevel,
    },
    colors: {
      sand: DEFAULT_RUNTIME_PLANET_COLORS.sand,
      grass: DEFAULT_RUNTIME_PLANET_COLORS.grass,
      rock: DEFAULT_RUNTIME_PLANET_COLORS.rock,
      snow: DEFAULT_RUNTIME_PLANET_COLORS.snow,
      waterDeep: DEFAULT_RUNTIME_PLANET_COLORS.waterDeep,
    },
    atmosphere: {
      enabled: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.enabled,
      height: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.height,
      color: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.color,
      intensity: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.intensity,
      opacity: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.opacity,
      blendMode: "normal",
      fresnelPower: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.fresnelPower,
      falloffPower: DEFAULT_RUNTIME_PLANET_ATMOSPHERE.falloffPower,
      clouds: {
        enabled: true,
        height: 26,
        thickness: 4,
        density: 0.48,
        color: 0xffffff,
        shadowStrength: 0.34,
        coverageScale: 3.6,
        movementSpeed: 0.08,
        opacity: 0.72,
        blendMode: "normal",
        puffs: {
          enabled: true,
          height: 18,
          thickness: 10,
          density: 10,
          size: 14,
          color: 0xffffff,
          opacity: 0.78,
          blendMode: "normal",
          shadowStrength: 0.28,
          movementSpeed: 0.04,
        },
      },
    },
    lighting: {
      sunAzimuth: DEFAULT_RUNTIME_PLANET_LIGHTING.sunAzimuth,
      sunElevation: DEFAULT_RUNTIME_PLANET_LIGHTING.sunElevation,
      sunIntensity: DEFAULT_RUNTIME_PLANET_LIGHTING.sunIntensity,
      ambientIntensity: DEFAULT_RUNTIME_PLANET_LIGHTING.ambientIntensity,
      rimColor: DEFAULT_RUNTIME_PLANET_LIGHTING.rimColor,
      rimStrength: DEFAULT_RUNTIME_PLANET_LIGHTING.rimStrength,
      rimPower: DEFAULT_RUNTIME_PLANET_LIGHTING.rimPower,
    },
    props: {
      treeDensity: DEFAULT_RUNTIME_PLANET_PROPS.treeDensity,
      cactusDensity: DEFAULT_RUNTIME_PLANET_PROPS.cactusDensity,
      seed: DEFAULT_RUNTIME_PLANET_PROPS.seed,
      rocketEnabled: DEFAULT_RUNTIME_PLANET_PROPS.rocketEnabled,
    },
    hasWater: true,
  };
}

export function defaultEditorConfig(): EditorConfig {
  return {
    planets: [defaultEditorPlanet("planet-0")],
    shaders: {
      cel: {
        enabled: true,
        bands: DEFAULT_RUNTIME_CEL.bands,
        softness: DEFAULT_RUNTIME_CEL.softness,
        hatchStrength: DEFAULT_RUNTIME_CEL.hatchStrength,
        hatchScale: DEFAULT_RUNTIME_CEL.hatchScale,
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

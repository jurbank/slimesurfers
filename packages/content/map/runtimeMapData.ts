import { RAIL_DEFS, type RailDef } from "../config/railDefs.ts";
import type { SpawnPolicy } from "../modes/gameModes.ts";

export interface RuntimeMapTerrain {
  seed: number;
  baseAmplitude: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  heightSmoothingStrength: number;
  heightSmoothingSampleAngle: number;
  waterLevel: number;
  snowLevel: number;
  sandBand: number;
  rockLevel: number;
  icosahedronDetail: number;
}

export interface RuntimeMapColors {
  sand: number;
  grass: number;
  rock: number;
  snow: number;
  waterDeep: number;
}

export interface RuntimeMapAtmosphere {
  enabled: boolean;
  height: number;
  color: number;
  intensity: number;
  opacity: number;
  fresnelPower: number;
  falloffPower: number;
}

export interface RuntimeMapLighting {
  sunAzimuth: number;
  sunElevation: number;
  sunIntensity: number;
  ambientIntensity: number;
  rimColor: number;
  rimStrength: number;
  rimPower: number;
}

export interface RuntimeMapProps {
  treeDensity: number;
  cactusDensity: number;
  seed: number;
  rocketEnabled: boolean;
}

export interface RuntimeMapCel {
  bands: number;
  softness: number;
  hatchStrength: number;
  hatchScale: number;
}

export interface RuntimeMapPlanet {
  id: string;
  center: { x: number; y: number; z: number };
  radius: number;
  terrain: RuntimeMapTerrain;
  colors: RuntimeMapColors;
  atmosphere: RuntimeMapAtmosphere;
  lighting: RuntimeMapLighting;
  props: RuntimeMapProps;
  hasWater: boolean;
}

export interface RuntimeMapData {
  version: number;
  mapId: string;
  name: string;
  planets: RuntimeMapPlanet[];
  cel: RuntimeMapCel;
  rails: RailDef[];
  spawns: Record<string, SpawnPolicy>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const TERRAIN_NUMERIC_FIELDS: ReadonlyArray<keyof RuntimeMapTerrain> = [
  "seed",
  "baseAmplitude",
  "frequency",
  "octaves",
  "lacunarity",
  "persistence",
  "heightSmoothingStrength",
  "heightSmoothingSampleAngle",
  "waterLevel",
  "snowLevel",
  "sandBand",
  "rockLevel",
  "icosahedronDetail",
];

function validateFiniteNumber(
  value: unknown,
  field: string,
  errors: ValidationError[],
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field, message: "must be a finite number" });
    return false;
  }
  return true;
}

function validateTerrain(t: unknown, prefix: string, errors: ValidationError[]): void {
  if (typeof t !== "object" || t === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return;
  }
  const terrain = t as Record<string, unknown>;
  for (const field of TERRAIN_NUMERIC_FIELDS) {
    validateFiniteNumber(terrain[field], `${prefix}.${field}`, errors);
  }
  if (
    typeof terrain.octaves === "number" &&
    (!Number.isInteger(terrain.octaves) || terrain.octaves < 1)
  ) {
    errors.push({ field: `${prefix}.octaves`, message: "must be a positive integer" });
  }
}

function validateColors(c: unknown, prefix: string, errors: ValidationError[]): void {
  if (typeof c !== "object" || c === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return;
  }
  const colors = c as Record<string, unknown>;
  for (const field of ["sand", "grass", "rock", "snow", "waterDeep"] as const) {
    validateFiniteNumber(colors[field], `${prefix}.${field}`, errors);
  }
}

function validateAtmosphere(a: unknown, prefix: string, errors: ValidationError[]): void {
  if (typeof a !== "object" || a === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return;
  }
  const atmo = a as Record<string, unknown>;
  if (typeof atmo.enabled !== "boolean") {
    errors.push({ field: `${prefix}.enabled`, message: "must be a boolean" });
  }
  for (const field of [
    "height",
    "color",
    "intensity",
    "opacity",
    "fresnelPower",
    "falloffPower",
  ] as const) {
    validateFiniteNumber(atmo[field], `${prefix}.${field}`, errors);
  }
}

function validateLighting(l: unknown, prefix: string, errors: ValidationError[]): void {
  if (typeof l !== "object" || l === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return;
  }
  const lighting = l as Record<string, unknown>;
  for (const field of [
    "sunAzimuth",
    "sunElevation",
    "sunIntensity",
    "ambientIntensity",
    "rimColor",
    "rimStrength",
    "rimPower",
  ] as const) {
    validateFiniteNumber(lighting[field], `${prefix}.${field}`, errors);
  }
}

function validateProps(p: unknown, prefix: string, errors: ValidationError[]): void {
  if (typeof p !== "object" || p === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return;
  }
  const props = p as Record<string, unknown>;
  for (const field of ["treeDensity", "cactusDensity", "seed"] as const) {
    validateFiniteNumber(props[field], `${prefix}.${field}`, errors);
  }
  if (typeof props.rocketEnabled !== "boolean") {
    errors.push({ field: `${prefix}.rocketEnabled`, message: "must be a boolean" });
  }
}

function validateCel(c: unknown, prefix: string, errors: ValidationError[]): void {
  if (typeof c !== "object" || c === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return;
  }
  const cel = c as Record<string, unknown>;
  for (const field of ["bands", "softness", "hatchStrength", "hatchScale"] as const) {
    validateFiniteNumber(cel[field], `${prefix}.${field}`, errors);
  }
}

export function validateRuntimeMapData(map: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof map !== "object" || map === null) {
    return { valid: false, errors: [{ field: "root", message: "must be an object" }] };
  }

  const m = map as Record<string, unknown>;

  if (typeof m.version !== "number" || !Number.isInteger(m.version) || m.version < 1) {
    errors.push({ field: "version", message: "must be a positive integer" });
  }
  if (typeof m.mapId !== "string" || m.mapId.trim() === "") {
    errors.push({ field: "mapId", message: "must be a non-empty string" });
  }
  if (typeof m.name !== "string" || m.name.trim() === "") {
    errors.push({ field: "name", message: "must be a non-empty string" });
  }

  validateCel(m.cel, "cel", errors);

  const planetIds = new Set<string>();

  if (!Array.isArray(m.planets) || m.planets.length === 0) {
    errors.push({ field: "planets", message: "must be a non-empty array" });
  } else {
    for (let i = 0; i < m.planets.length; i++) {
      const p = m.planets[i] as Record<string, unknown>;
      if (typeof p.id !== "string" || p.id.trim() === "") {
        errors.push({ field: `planets[${i}].id`, message: "must be a non-empty string" });
      } else if (planetIds.has(p.id)) {
        errors.push({ field: `planets[${i}].id`, message: `duplicate planet id "${p.id}"` });
      } else {
        planetIds.add(p.id);
      }
      if (typeof p.radius !== "number" || p.radius <= 0 || !Number.isFinite(p.radius)) {
        errors.push({ field: `planets[${i}].radius`, message: "must be a positive finite number" });
      }
      const center = p.center as Record<string, unknown> | null | undefined;
      if (typeof center !== "object" || center === null) {
        errors.push({ field: `planets[${i}].center`, message: "must be an object" });
      } else {
        for (const axis of ["x", "y", "z"]) {
          if (typeof center[axis] !== "number" || !Number.isFinite(center[axis] as number)) {
            errors.push({
              field: `planets[${i}].center.${axis}`,
              message: "must be a finite number",
            });
          }
        }
      }
      if (typeof p.hasWater !== "boolean") {
        errors.push({ field: `planets[${i}].hasWater`, message: "must be a boolean" });
      }
      validateTerrain(p.terrain, `planets[${i}].terrain`, errors);
      validateColors(p.colors, `planets[${i}].colors`, errors);
      validateAtmosphere(p.atmosphere, `planets[${i}].atmosphere`, errors);
      validateLighting(p.lighting, `planets[${i}].lighting`, errors);
      validateProps(p.props, `planets[${i}].props`, errors);
    }
  }

  if (!Array.isArray(m.rails)) {
    errors.push({ field: "rails", message: "must be an array" });
  } else {
    for (let i = 0; i < m.rails.length; i++) {
      const r = m.rails[i] as Record<string, unknown>;
      if (typeof r.planetId === "string" && planetIds.size > 0 && !planetIds.has(r.planetId)) {
        errors.push({
          field: `rails[${i}].planetId`,
          message: `references unknown planet "${r.planetId}"`,
        });
      }
      if (!Array.isArray(r.controlPoints) || r.controlPoints.length < 2) {
        errors.push({
          field: `rails[${i}].controlPoints`,
          message: "must have at least 2 control points",
        });
      } else {
        for (let j = 0; j < r.controlPoints.length; j++) {
          const cp = r.controlPoints[j] as Record<string, unknown>;
          const nx = cp.nx as number;
          const ny = cp.ny as number;
          const nz = cp.nz as number;
          if (
            typeof nx !== "number" ||
            typeof ny !== "number" ||
            typeof nz !== "number" ||
            !Number.isFinite(nx) ||
            !Number.isFinite(ny) ||
            !Number.isFinite(nz)
          ) {
            errors.push({
              field: `rails[${i}].controlPoints[${j}]`,
              message: "nx/ny/nz must be finite numbers",
            });
          } else {
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (Math.abs(len - 1) > 0.01) {
              errors.push({
                field: `rails[${i}].controlPoints[${j}]`,
                message: `normal length ${len.toFixed(4)} deviates from 1 by more than 0.01`,
              });
            }
          }
        }
      }
    }
  }

  if (typeof m.spawns !== "object" || m.spawns === null) {
    errors.push({ field: "spawns", message: "must be an object" });
  } else {
    const spawns = m.spawns as Record<string, unknown>;
    for (const [modeId, policy] of Object.entries(spawns)) {
      if (typeof policy !== "object" || policy === null) {
        errors.push({ field: `spawns.${modeId}`, message: "must be an object" });
        continue;
      }
      const p = policy as Record<string, unknown>;
      const kind = p.kind;
      if (kind !== "ffa-spread" && kind !== "team-zones" && kind !== "cluster") {
        errors.push({
          field: `spawns.${modeId}.kind`,
          message: `unknown spawn policy kind "${String(kind)}"`,
        });
        continue;
      }
      if (kind === "team-zones") {
        if (!Array.isArray(p.teamAnchors) || p.teamAnchors.length === 0) {
          errors.push({
            field: `spawns.${modeId}.teamAnchors`,
            message: "must be a non-empty array",
          });
        } else {
          for (let i = 0; i < p.teamAnchors.length; i++) {
            validateSpawnAnchor(
              p.teamAnchors[i],
              `spawns.${modeId}.teamAnchors[${i}]`,
              planetIds,
              errors,
            );
          }
        }
      }
      if (kind === "cluster") {
        validateSpawnAnchor(p.anchor, `spawns.${modeId}.anchor`, planetIds, errors);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateSpawnAnchor(
  anchor: unknown,
  field: string,
  planetIds: Set<string>,
  errors: ValidationError[],
): void {
  if (typeof anchor !== "object" || anchor === null) {
    errors.push({ field, message: "must be an object" });
    return;
  }
  const a = anchor as Record<string, unknown>;
  if (typeof a.planetId === "string" && planetIds.size > 0 && !planetIds.has(a.planetId)) {
    errors.push({
      field: `${field}.planetId`,
      message: `references unknown planet "${a.planetId}"`,
    });
  }
  const normal = a.normal as Record<string, unknown> | null | undefined;
  if (typeof normal !== "object" || normal === null) {
    errors.push({ field: `${field}.normal`, message: "must be an object" });
  } else {
    for (const axis of ["x", "y", "z"]) {
      if (typeof normal[axis] !== "number" || !Number.isFinite(normal[axis] as number)) {
        errors.push({ field: `${field}.normal.${axis}`, message: "must be a finite number" });
      }
    }
  }
}

const DEV_PLANET_TERRAIN: RuntimeMapTerrain = {
  seed: 42,
  baseAmplitude: 54.0,
  frequency: 1.4,
  octaves: 3,
  lacunarity: 2.2,
  persistence: 0.45,
  heightSmoothingStrength: 0.45,
  heightSmoothingSampleAngle: 0.035,
  waterLevel: -3.0,
  snowLevel: 9.0,
  sandBand: 1.5,
  rockLevel: 7.0,
  icosahedronDetail: 50,
};

const DEV_PLANET_COLORS: RuntimeMapColors = {
  sand: 0xd4c078,
  grass: 0x3da33d,
  rock: 0x8a8a7a,
  snow: 0xeef4f8,
  waterDeep: 0x0a3873,
};

const DEV_PLANET_ATMOSPHERE: RuntimeMapAtmosphere = {
  enabled: true,
  height: 18.0,
  color: 0x61b8ff,
  intensity: 0.85,
  opacity: 0.42,
  fresnelPower: 2.4,
  falloffPower: 1.5,
};

const DEV_PLANET_LIGHTING: RuntimeMapLighting = {
  sunAzimuth: 63,
  sunElevation: 53,
  sunIntensity: 1.0,
  ambientIntensity: 0.5,
  rimColor: 0x8ab4ff,
  rimStrength: 0.4,
  rimPower: 3.0,
};

const DEV_PLANET_PROPS: RuntimeMapProps = {
  treeDensity: 400,
  cactusDensity: 200,
  seed: 12345,
  rocketEnabled: true,
};

export const DEV_MAP: RuntimeMapData = {
  version: 1,
  mapId: "dev",
  name: "Dev Planet",
  planets: [
    {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: 100,
      terrain: DEV_PLANET_TERRAIN,
      colors: DEV_PLANET_COLORS,
      atmosphere: DEV_PLANET_ATMOSPHERE,
      lighting: DEV_PLANET_LIGHTING,
      props: DEV_PLANET_PROPS,
      hasWater: true,
    },
  ],
  cel: {
    bands: 3.0,
    softness: 0.02,
    hatchStrength: 0.15,
    hatchScale: 5.0,
  },
  rails: RAIL_DEFS,
  spawns: {
    ffa: { kind: "ffa-spread" },
    teams: {
      kind: "team-zones",
      zoneRadius: 9,
      teamAnchors: [
        { planetId: "planet-0", normal: { x: 0.92, y: 0.26, z: 0.28 } },
        { planetId: "planet-0", normal: { x: -0.92, y: 0.26, z: -0.28 } },
      ],
    },
    dev: {
      kind: "cluster",
      radius: 7,
      anchor: { planetId: "planet-0", normal: { x: 0.18, y: 0.96, z: 0.2 } },
    },
  },
};

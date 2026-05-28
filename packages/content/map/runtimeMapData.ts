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

export interface RuntimeTerrainFeaturePoint {
  nx: number;
  ny: number;
  nz: number;
  heightOffset: number;
  width?: number;
  bank?: number;
  edgeFalloff?: number;
  smoothing?: number;
}

export interface RuntimeTerrainSlopeFeature {
  id: string;
  kind: "slope";
  enabled: boolean;
  width: number;
  bank: number;
  edgeFalloff: number;
  smoothing: number;
  transitionLength: number;
  points: RuntimeTerrainFeaturePoint[];
}

export interface RuntimeTerrainJumpFeature {
  id: string;
  kind: "jump";
  enabled: boolean;
  nx: number;
  ny: number;
  nz: number;
  tx: number;
  ty: number;
  tz: number;
  width: number;
  length: number;
  height: number;
  edgeFalloff: number;
  smoothing: number;
}

export type RuntimeTerrainFeature = RuntimeTerrainSlopeFeature | RuntimeTerrainJumpFeature;

export interface RuntimeBlastPad {
  id: string;
  planetId: string;
  normal: { x: number; y: number; z: number };
  tangent: { x: number; y: number; z: number };
  targetPlanetId: string;
  targetNormal: { x: number; y: number; z: number };
  radius: number;
  /** @deprecated Per-player cooldown was replaced by slime-charge ownership; ignored. */
  cooldownMs?: number;
  launchSpeed: number;
  upwardBias: number;
  cameraProfile: "planetHop";
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
  gravityRadius?: number;
  captureRadius?: number;
  terrain: RuntimeMapTerrain;
  colors: RuntimeMapColors;
  atmosphere: RuntimeMapAtmosphere;
  lighting: RuntimeMapLighting;
  props: RuntimeMapProps;
  hasWater: boolean;
  terrainFeatures?: RuntimeTerrainFeature[];
}

export interface RuntimeMapData {
  version: number;
  mapId: string;
  name: string;
  planets: RuntimeMapPlanet[];
  cel: RuntimeMapCel;
  rails: RailDef[];
  blastPads?: RuntimeBlastPad[];
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

function validatePositiveNumber(value: unknown, field: string, errors: ValidationError[]): void {
  if (!validateFiniteNumber(value, field, errors)) return;
  if (value <= 0) errors.push({ field, message: "must be greater than 0" });
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

function validateUnitNormal(
  value: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
): void {
  const nx = value.nx;
  const ny = value.ny;
  const nz = value.nz;
  if (
    typeof nx !== "number" ||
    typeof ny !== "number" ||
    typeof nz !== "number" ||
    !Number.isFinite(nx) ||
    !Number.isFinite(ny) ||
    !Number.isFinite(nz)
  ) {
    errors.push({ field, message: "nx/ny/nz must be finite numbers" });
    return;
  }
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (Math.abs(len - 1) > 0.01) {
    errors.push({
      field,
      message: `normal length ${len.toFixed(4)} deviates from 1 by more than 0.01`,
    });
  }
}

function validateUnitVec3(
  value: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
): void {
  const x = value.x;
  const y = value.y;
  const z = value.z;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    errors.push({ field, message: "x/y/z must be finite numbers" });
    return;
  }
  const len = Math.sqrt(x * x + y * y + z * z);
  if (Math.abs(len - 1) > 0.01) {
    errors.push({
      field,
      message: `vector length ${len.toFixed(4)} deviates from 1 by more than 0.01`,
    });
  }
}

function validateUnitTangent(
  value: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
): void {
  const tx = value.tx;
  const ty = value.ty;
  const tz = value.tz;
  const nx = value.nx;
  const ny = value.ny;
  const nz = value.nz;
  if (
    typeof tx !== "number" ||
    typeof ty !== "number" ||
    typeof tz !== "number" ||
    !Number.isFinite(tx) ||
    !Number.isFinite(ty) ||
    !Number.isFinite(tz)
  ) {
    errors.push({ field, message: "tx/ty/tz must be finite numbers" });
    return;
  }
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (Math.abs(len - 1) > 0.01) {
    errors.push({
      field,
      message: `tangent length ${len.toFixed(4)} deviates from 1 by more than 0.01`,
    });
  }
  if (
    typeof nx === "number" &&
    typeof ny === "number" &&
    typeof nz === "number" &&
    Number.isFinite(nx) &&
    Number.isFinite(ny) &&
    Number.isFinite(nz) &&
    Math.abs(nx * tx + ny * ty + nz * tz) > 0.02
  ) {
    errors.push({ field, message: "tangent must be perpendicular to normal" });
  }
}

function validateTerrainFeatures(
  features: unknown,
  prefix: string,
  errors: ValidationError[],
): void {
  if (features === undefined) return;
  if (!Array.isArray(features)) {
    errors.push({ field: prefix, message: "must be an array" });
    return;
  }

  const ids = new Set<string>();
  for (let i = 0; i < features.length; i++) {
    const feature = features[i] as Record<string, unknown>;
    const field = `${prefix}[${i}]`;
    if (typeof feature !== "object" || feature === null) {
      errors.push({ field, message: "must be an object" });
      continue;
    }
    if (typeof feature.id !== "string" || feature.id.trim() === "") {
      errors.push({ field: `${field}.id`, message: "must be a non-empty string" });
    } else if (ids.has(feature.id)) {
      errors.push({ field: `${field}.id`, message: `duplicate feature id "${feature.id}"` });
    } else {
      ids.add(feature.id);
    }
    if (feature.kind !== "slope" && feature.kind !== "jump") {
      errors.push({
        field: `${field}.kind`,
        message: `unknown terrain feature kind "${String(feature.kind)}"`,
      });
    }
    if (typeof feature.enabled !== "boolean") {
      errors.push({ field: `${field}.enabled`, message: "must be a boolean" });
    }
    validatePositiveNumber(feature.width, `${field}.width`, errors);
    if (
      !validateFiniteNumber(feature.edgeFalloff, `${field}.edgeFalloff`, errors) ||
      (typeof feature.edgeFalloff === "number" && feature.edgeFalloff < 0)
    ) {
      if (typeof feature.edgeFalloff === "number") {
        errors.push({ field: `${field}.edgeFalloff`, message: "must be 0 or greater" });
      }
    }
    validateFiniteNumber(feature.smoothing, `${field}.smoothing`, errors);

    if (feature.kind === "jump") {
      validateUnitNormal(feature, field, errors);
      validateUnitTangent(feature, field, errors);
      validatePositiveNumber(feature.length, `${field}.length`, errors);
      validateFiniteNumber(feature.height, `${field}.height`, errors);
      continue;
    }

    validateFiniteNumber(feature.bank, `${field}.bank`, errors);
    if (
      !validateFiniteNumber(feature.transitionLength, `${field}.transitionLength`, errors) ||
      (typeof feature.transitionLength === "number" && feature.transitionLength < 0)
    ) {
      if (typeof feature.transitionLength === "number") {
        errors.push({ field: `${field}.transitionLength`, message: "must be 0 or greater" });
      }
    }

    if (!Array.isArray(feature.points) || feature.points.length < 2) {
      errors.push({ field: `${field}.points`, message: "must have at least 2 points" });
    } else {
      for (let j = 0; j < feature.points.length; j++) {
        const point = feature.points[j] as Record<string, unknown>;
        const pointField = `${field}.points[${j}]`;
        if (typeof point !== "object" || point === null) {
          errors.push({ field: pointField, message: "must be an object" });
          continue;
        }
        validateUnitNormal(point, pointField, errors);
        validateFiniteNumber(point.heightOffset, `${pointField}.heightOffset`, errors);
        if (point.width !== undefined) {
          if (
            !validateFiniteNumber(point.width, `${pointField}.width`, errors) ||
            (typeof point.width === "number" && point.width <= 0)
          ) {
            if (typeof point.width === "number") {
              errors.push({ field: `${pointField}.width`, message: "must be greater than 0" });
            }
          }
        }
        if (point.edgeFalloff !== undefined) {
          if (
            !validateFiniteNumber(point.edgeFalloff, `${pointField}.edgeFalloff`, errors) ||
            (typeof point.edgeFalloff === "number" && point.edgeFalloff < 0)
          ) {
            if (typeof point.edgeFalloff === "number") {
              errors.push({
                field: `${pointField}.edgeFalloff`,
                message: "must be 0 or greater",
              });
            }
          }
        }
        if (point.bank !== undefined) {
          validateFiniteNumber(point.bank, `${pointField}.bank`, errors);
        }
        if (point.smoothing !== undefined) {
          validateFiniteNumber(point.smoothing, `${pointField}.smoothing`, errors);
        }
      }
    }
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
      if ("gravityRadius" in p)
        validatePositiveNumber(p.gravityRadius, `planets[${i}].gravityRadius`, errors);
      if ("captureRadius" in p)
        validatePositiveNumber(p.captureRadius, `planets[${i}].captureRadius`, errors);
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
      if ("terrainFeatures" in p) {
        validateTerrainFeatures(p.terrainFeatures, `planets[${i}].terrainFeatures`, errors);
      }
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
            validateUnitNormal(cp, `rails[${i}].controlPoints[${j}]`, errors);
          }
        }
      }
    }
  }

  if ("blastPads" in m) {
    if (!Array.isArray(m.blastPads)) {
      errors.push({ field: "blastPads", message: "must be an array" });
    } else {
      for (let i = 0; i < m.blastPads.length; i++) {
        validateBlastPad(m.blastPads[i], `blastPads[${i}]`, planetIds, errors);
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

function validateBlastPad(
  pad: unknown,
  field: string,
  planetIds: Set<string>,
  errors: ValidationError[],
): void {
  if (typeof pad !== "object" || pad === null) {
    errors.push({ field, message: "must be an object" });
    return;
  }
  const p = pad as Record<string, unknown>;
  if (typeof p.id !== "string" || p.id.trim() === "") {
    errors.push({ field: `${field}.id`, message: "must be a non-empty string" });
  }
  for (const key of ["planetId", "targetPlanetId"] as const) {
    if (typeof p[key] !== "string" || p[key].trim() === "") {
      errors.push({ field: `${field}.${key}`, message: "must be a non-empty string" });
    } else if (planetIds.size > 0 && !planetIds.has(p[key])) {
      errors.push({ field: `${field}.${key}`, message: `references unknown planet "${p[key]}"` });
    }
  }
  for (const key of ["normal", "tangent", "targetNormal"] as const) {
    const value = p[key];
    if (typeof value !== "object" || value === null) {
      errors.push({ field: `${field}.${key}`, message: "must be an object" });
      continue;
    }
    const vec = value as Record<string, unknown>;
    for (const axis of ["x", "y", "z"]) {
      if (typeof vec[axis] !== "number" || !Number.isFinite(vec[axis] as number)) {
        errors.push({ field: `${field}.${key}.${axis}`, message: "must be a finite number" });
      }
    }
    validateUnitVec3(vec, `${field}.${key}`, errors);
  }
  validatePositiveNumber(p.radius, `${field}.radius`, errors);
  if (p.cooldownMs !== undefined) {
    validatePositiveNumber(p.cooldownMs, `${field}.cooldownMs`, errors);
  }
  validatePositiveNumber(p.launchSpeed, `${field}.launchSpeed`, errors);
  validateFiniteNumber(p.upwardBias, `${field}.upwardBias`, errors);
  if (p.cameraProfile !== "planetHop") {
    errors.push({ field: `${field}.cameraProfile`, message: 'must be "planetHop"' });
  }
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

export const DEFAULT_RUNTIME_PLANET_RADIUS = 100;

export const DEFAULT_RUNTIME_PLANET_TERRAIN: RuntimeMapTerrain = {
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

export const DEFAULT_RUNTIME_PLANET_COLORS: RuntimeMapColors = {
  sand: 0xd4c078,
  grass: 0x3da33d,
  rock: 0x8a8a7a,
  snow: 0xeef4f8,
  waterDeep: 0x0a3873,
};

export const DEFAULT_RUNTIME_PLANET_ATMOSPHERE: RuntimeMapAtmosphere = {
  enabled: true,
  height: 18.0,
  color: 0x61b8ff,
  intensity: 0.85,
  opacity: 0.42,
  fresnelPower: 2.4,
  falloffPower: 1.5,
};

export const DEFAULT_RUNTIME_PLANET_LIGHTING: RuntimeMapLighting = {
  sunAzimuth: 63,
  sunElevation: 53,
  sunIntensity: 1.0,
  ambientIntensity: 0.5,
  rimColor: 0x8ab4ff,
  rimStrength: 0.4,
  rimPower: 3.0,
};

export const DEFAULT_RUNTIME_PLANET_PROPS: RuntimeMapProps = {
  treeDensity: 400,
  cactusDensity: 200,
  seed: 12345,
  rocketEnabled: true,
};

export const DEFAULT_RUNTIME_CEL: RuntimeMapCel = {
  bands: 3.0,
  softness: 0.02,
  hatchStrength: 0.15,
  hatchScale: 5.0,
};

export const DEV_MAP: RuntimeMapData = {
  version: 1,
  mapId: "dev",
  name: "Dev Planet",
  planets: [
    {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: DEFAULT_RUNTIME_PLANET_RADIUS,
      terrain: DEFAULT_RUNTIME_PLANET_TERRAIN,
      colors: DEFAULT_RUNTIME_PLANET_COLORS,
      atmosphere: DEFAULT_RUNTIME_PLANET_ATMOSPHERE,
      lighting: DEFAULT_RUNTIME_PLANET_LIGHTING,
      props: DEFAULT_RUNTIME_PLANET_PROPS,
      hasWater: true,
    },
    {
      id: "planet-1",
      center: { x: 280, y: 35, z: 20 },
      radius: DEFAULT_RUNTIME_PLANET_RADIUS,
      terrain: { ...DEFAULT_RUNTIME_PLANET_TERRAIN, seed: 84 },
      colors: {
        sand: 0xf6d28b,
        grass: 0x7bd96b,
        rock: 0x7d8290,
        snow: 0xf4fbff,
        waterDeep: 0x265fd9,
      },
      atmosphere: { ...DEFAULT_RUNTIME_PLANET_ATMOSPHERE, color: 0x89ffcf },
      lighting: DEFAULT_RUNTIME_PLANET_LIGHTING,
      props: { ...DEFAULT_RUNTIME_PLANET_PROPS, seed: 6789 },
      hasWater: true,
    },
  ],
  cel: DEFAULT_RUNTIME_CEL,
  rails: RAIL_DEFS,
  blastPads: [
    {
      id: "dev-blast-pad-north",
      planetId: "planet-0",
      normal: { x: 0.07, y: 0.998, z: 0 },
      tangent: { x: 0.998, y: -0.07, z: 0 },
      targetPlanetId: "planet-1",
      targetNormal: { x: -0.92, y: -0.12, z: -0.37 },
      radius: 5,
      cooldownMs: 1500,
      launchSpeed: 78,
      upwardBias: 0.45,
      cameraProfile: "planetHop",
    },
    {
      id: "dev-blast-pad-ffa-ring",
      planetId: "planet-0",
      // Previous normal (0.462, 0.887, 0) sat in a terrain depression below water level.
      // Moved to the same latitude (~28° from pole) at +z longitude where terrain is
      // consistently above water (minH ~7 wu vs waterLevel -3).
      normal: { x: 0, y: 0.883, z: 0.469 },
      tangent: { x: 1, y: 0, z: 0 },
      targetPlanetId: "planet-1",
      targetNormal: { x: -0.92, y: -0.12, z: -0.37 },
      radius: 5,
      launchSpeed: 78,
      upwardBias: 0.45,
      cameraProfile: "planetHop",
    },
    {
      id: "dev-blast-pad-autojoin-human",
      planetId: "planet-1",
      normal: { x: -0.329, y: 0.884, z: 0.332 },
      tangent: { x: -0.977, y: -0.2, z: -0.075 },
      targetPlanetId: "planet-0",
      targetNormal: { x: 1, y: 0, z: 0 },
      radius: 5,
      cooldownMs: 1500,
      launchSpeed: 78,
      upwardBias: 0.45,
      cameraProfile: "planetHop",
    },
  ],
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

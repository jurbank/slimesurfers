import { RAIL_DEFS, type RailDef } from "../config/railDefs.ts";
import type { SpawnPolicy } from "../modes/gameModes.ts";

export interface RuntimeMapPlanet {
  id: string;
  center: { x: number; y: number; z: number };
  radius: number;
}

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

export interface RuntimeMapData {
  version: number;
  mapId: string;
  name: string;
  planets: RuntimeMapPlanet[];
  terrain: RuntimeMapTerrain;
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
    }
  }

  if (typeof m.terrain !== "object" || m.terrain === null) {
    errors.push({ field: "terrain", message: "must be an object" });
  } else {
    const t = m.terrain as Record<string, unknown>;
    const numericFields = [
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
    ] as const;
    for (const field of numericFields) {
      if (typeof t[field] !== "number" || !Number.isFinite(t[field] as number)) {
        errors.push({ field: `terrain.${field}`, message: "must be a finite number" });
      }
    }
    if (typeof t.octaves === "number" && (!Number.isInteger(t.octaves) || t.octaves < 1)) {
      errors.push({ field: "terrain.octaves", message: "must be a positive integer" });
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

export const DEV_MAP: RuntimeMapData = {
  version: 1,
  mapId: "dev",
  name: "Dev Planet",
  planets: [{ id: "planet-0", center: { x: 0, y: 0, z: 0 }, radius: 100 }],
  terrain: {
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

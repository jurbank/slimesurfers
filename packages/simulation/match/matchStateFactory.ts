import { type GameModeDefinition } from "@splat/content/modes/gameModes.ts";
import { type WeaponPickupLayout } from "@splat/content/combat/weaponDefs.ts";
import {
  GAME_CONFIG,
  getPlanetSurfaceChordRadius,
  getSlimeTerritoryDimensions,
} from "@splat/content/config/gameConfig.ts";
import { type RuntimeMapData, type RuntimeMapPlanet } from "@splat/content/map/runtimeMapData.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { RAIL_SLIME_NODES } from "@splat/protocol/schemas/slimedState.ts";
import { createWeaponPickups } from "../combat/weaponPickups.ts";
import { createHealthPickups } from "../combat/healthPickups.ts";
import { type PlanetData, type StepConfig } from "../movement/simulatedMovement.ts";
import { buildComputedRail, type ComputedRail } from "../movement/railSpline.ts";
import { createTerrainConfig } from "../terrain/planetTerrain.ts";
import { appendSlimeStamp, createStampBuckets } from "../slime/slimeDetection.ts";
import { createTerritoryCells } from "../slime/territoryGrid.ts";
import { type SimMatchState, type SimPlanetSlimeState } from "./simState.ts";

export function buildPlanets(map: RuntimeMapData): PlanetData[] {
  return map.planets.map((p) => ({
    id: p.id,
    center: { x: p.center.x, y: p.center.y, z: p.center.z },
    radius: p.radius,
    gravityRadius: p.gravityRadius,
    captureRadius: p.captureRadius,
  }));
}

export function buildStepConfig(map: RuntimeMapData, planet = map.planets[0]!): StepConfig {
  return {
    ...createTerrainConfig(planet),
    movement: GAME_CONFIG.movement,
    rail: GAME_CONFIG.rail,
  };
}

export function buildRails(map: RuntimeMapData): ComputedRail[] {
  return map.rails.map((def) => {
    const planet = map.planets.find((p) => p.id === def.planetId) ?? map.planets[0]!;
    const cfg = buildStepConfig(map, planet);
    return buildComputedRail(def, planet.center, cfg);
  });
}

export function createSimPlanetState(planet: RuntimeMapPlanet): SimPlanetSlimeState {
  const { rows, cols } = getSlimeTerritoryDimensions(planet.radius);
  return {
    planetId: planet.id,
    territoryRows: rows,
    territoryCols: cols,
    cells: createTerritoryCells(rows, cols),
    stamps: [],
    stampBuckets: createStampBuckets(rows, cols),
  };
}

export function seedTestSlime(simState: SimMatchState, mode: GameModeDefinition): void {
  const planet = simState.planets.get("planet-0");
  if (!planet) return;
  const planetDef = simState.planetDefs.find((p) => p.id === planet.planetId);
  if (!planetDef) return;
  const largeSeedSurfaceRadius = 50 * (2 * Math.asin(1.15 * 0.5));
  const mediumSeedSurfaceRadius = 50 * (2 * Math.asin(0.55 * 0.5));
  const seedColors = mode.isTeamBased ? mode.teamColors : GAME_CONFIG.match.ffaColors;

  const stamps = [
    {
      slimeGroupId: 0,
      color: seedColors[0] ?? 0x00e5ff,
      patternId: 0,
      nx: 0,
      ny: 1,
      nz: 0,
      radius: getPlanetSurfaceChordRadius(largeSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
    {
      slimeGroupId: 1,
      color: seedColors[1] ?? 0xff6200,
      patternId: 0,
      nx: 0,
      ny: -1,
      nz: 0,
      radius: getPlanetSurfaceChordRadius(largeSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
    {
      slimeGroupId: 1,
      color: seedColors[1] ?? 0xff6200,
      patternId: 0,
      nx: 0.55,
      ny: 0.55,
      nz: 0.62,
      radius: getPlanetSurfaceChordRadius(mediumSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
    {
      slimeGroupId: 0,
      color: seedColors[0] ?? 0x00e5ff,
      patternId: 0,
      nx: -0.5,
      ny: -0.45,
      nz: -0.74,
      radius: getPlanetSurfaceChordRadius(mediumSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
  ] as const;

  for (const stamp of stamps) {
    appendSlimeStamp(planet, stamp);
  }
}

export function createSimMatchState(
  mode: GameModeDefinition,
  seedSlime: boolean,
  lobbyEnabled: boolean,
  weaponPickupLayout: WeaponPickupLayout,
  planetDefs: RuntimeMapPlanet[],
  rails: ComputedRail[],
  stepCfg: StepConfig,
): SimMatchState {
  const pickupCfg = { ...GAME_CONFIG, ...stepCfg };
  const simState: SimMatchState = {
    players: new Map(),
    planetDefs,
    mapTerrain: stepCfg.terrain,
    planets: new Map(planetDefs.map((planet) => [planet.id, createSimPlanetState(planet)])),
    railStates: new Map(
      rails.map((rail, idx) => [
        idx,
        {
          railId: idx,
          nodes: Array(RAIL_SLIME_NODES).fill(0xffffff),
        },
      ]),
    ),
    blastPadStates: new Map(),
    projectiles: new Map(),
    pickups: createWeaponPickups(pickupCfg, weaponPickupLayout, planetDefs),
    healthPickups: createHealthPickups(pickupCfg, planetDefs),
    matchPhase: lobbyEnabled ? MatchPhase.Lobby : MatchPhase.Active,
    matchTimer: lobbyEnabled ? 0 : GAME_CONFIG.match.durationSeconds,
    slimeSeq: 0,
    trickSeq: 0,
    scores: new Map(),
    elapsedMs: 0,
    nextProjectileId: 0,
  };
  if (seedSlime) {
    seedTestSlime(simState, mode);
  }
  return simState;
}

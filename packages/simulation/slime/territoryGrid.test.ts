import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_WEAPON_ID } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG, getSlimeTerritoryDimensions } from "@splat/content/config/gameConfig.ts";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { createStampBuckets } from "./slimeDetection.ts";
import {
  applySlimeToTerritoryAtPoint,
  countSlimeableTerritoryCells,
  createTerritoryCells,
  isTerritoryCellSlimeable,
} from "./territoryGrid.ts";
import type { SimMatchState, SimPlayerState } from "../match/simState.ts";

const DEV_PLANET_RADIUS = DEV_MAP.planets[0]!.radius;

function createPlayer(sessionId: string, slimeGroupId: number, slimeColor: number): SimPlayerState {
  return {
    sessionId,
    isBot: false,
    name: sessionId,
    teamId: 255,
    slimeGroupId,
    paletteIndex: slimeGroupId,
    patternId: 0,
    slimeColor,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: "planet-0",
    spawnPlanetId: "planet-0",
    spawnNormal: { x: 0, y: 1, z: 0 },
    movementState: 0,
    surfState: 0,
    isCarving: false,
    skiJumpCharge: 0,
    grindRailId: -1,
    grindT: 0,
    lastGrindT: 0,
    grindSpeed: 0,
    grindCooldownMs: 0,
    isOnFriendlySlime: false,
    gravityAnchorPlanetId: "planet-0",
    loadedPadId: "",
    padLoadProgress: 0,
    padChargeProgress: 0,
    padCancelArmed: false,
    inputSeq: 0,
    airTrickCombo: 0,
    airTrickAirTimeMs: 0,
    airTrickInputSequence: [],
    airTrickInputAgeMs: 0,
    lastAirTrickTimeMs: -Infinity,
    airTrickSpinDegrees: 0,
    airTrickSpinMilestoneIndex: 0,
    airTrickSpinBlocked: false,
    airTrickFlipDegrees: 0,
    airTrickFrontFlipMilestoneIndex: 0,
    airTrickBackFlipMilestoneIndex: 0,
    airTrickFlipBlocked: false,
    airTrickSlimeMultiplier: 1,
    equippedWeaponId: DEFAULT_WEAPON_ID,
    disposableShotsRemaining: 0,
    health: 100,
    slimeLevel: GAME_CONFIG.slime.maxLevel,
    slimeScore: 0,
    killCount: 0,
    deathCount: 0,
    respawnTimer: 0,
    lastFireTimeMs: 0,
    weaponTriggerHeldSinceMs: -1,
  };
}

function createSimState(): SimMatchState {
  return {
    players: new Map([
      ["session-1", createPlayer("session-1", 0, 0x00e5ff)],
      ["session-2", createPlayer("session-2", 1, 0xff6200)],
    ]),
    planetDefs: DEV_MAP.planets,
    mapTerrain: DEV_MAP.planets[0]!.terrain,
    planets: new Map(),
    railStates: new Map(),
    blastPadStates: new Map(),
    projectiles: new Map(),
    pickups: new Map(),
    matchPhase: MatchPhase.Active,
    matchTimer: GAME_CONFIG.match.durationSeconds,
    slimeSeq: 0,
    trickSeq: 0,
    scores: new Map(),
    elapsedMs: 0,
    nextProjectileId: 0,
    healthPickups: new Map(),
  };
}

function surfacePointForCell(row: number, col: number): { x: number; y: number; z: number } {
  const { rows, cols } = getSlimeTerritoryDimensions(DEV_PLANET_RADIUS);
  const v = (row + 0.5) / rows;
  const u = (col + 0.5) / cols;
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  const normal = {
    x: sinTheta * Math.cos(phi),
    y: Math.cos(theta),
    z: sinTheta * Math.sin(phi),
  };
  const planet = DEV_MAP.planets[0]!;

  return {
    x: planet.center.x + normal.x * planet.radius,
    y: planet.center.y + normal.y * planet.radius,
    z: planet.center.z + normal.z * planet.radius,
  };
}

describe("territoryGrid", () => {
  it("counts only slimeable cells toward total territory coverage", () => {
    const planet = DEV_MAP.planets[0]!;
    const terrainCfg = { planet: { radius: planet.radius }, terrain: DEV_MAP.planets[0]!.terrain };
    const { rows, cols } = getSlimeTerritoryDimensions(DEV_PLANET_RADIUS);
    const totalCells = rows * cols;
    const slimeableCells = countSlimeableTerritoryCells(rows, cols, terrainCfg);

    expect(slimeableCells).toBeGreaterThan(0);
    expect(slimeableCells).toBeLessThan(totalCells);

    let blockedCellCount = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!isTerritoryCellSlimeable(row, col, rows, cols, terrainCfg)) {
          blockedCellCount++;
        }
      }
    }

    expect(blockedCellCount).toBe(totalCells - slimeableCells);
    expect(blockedCellCount).toBeGreaterThan(0);
  });

  it("claims neutral cells once and does not double-count re-sliming the same owned area", () => {
    const simState = createSimState();
    const { rows, cols } = getSlimeTerritoryDimensions(DEV_PLANET_RADIUS);
    const planetState = {
      planetId: "planet-0",
      territoryRows: rows,
      territoryCols: cols,
      cells: createTerritoryCells(rows, cols),
      stamps: [],
      stampBuckets: createStampBuckets(rows, cols),
    };
    const impactPoint = surfacePointForCell(5, 7);

    const firstChanged = applySlimeToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        slimeGroupId: 0,
        slimeColor: 0x00e5ff,
      },
      simState,
      planetState,
    );
    const secondChanged = applySlimeToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        slimeGroupId: 0,
        slimeColor: 0x00e5ff,
      },
      simState,
      planetState,
    );

    expect(firstChanged).toBeGreaterThan(0);
    expect(secondChanged).toBe(0);
    expect(simState.scores.get("0")).toBe(firstChanged);
    expect(simState.players.get("session-1")?.slimeScore).toBe(firstChanged);
  });

  it("transfers ownership and score when re-sliming enemy-controlled territory", () => {
    const simState = createSimState();
    const { rows, cols } = getSlimeTerritoryDimensions(DEV_PLANET_RADIUS);
    const planetState = {
      planetId: "planet-0",
      territoryRows: rows,
      territoryCols: cols,
      cells: createTerritoryCells(rows, cols),
      stamps: [],
      stampBuckets: createStampBuckets(rows, cols),
    };
    const impactPoint = surfacePointForCell(5, 7);

    const firstChanged = applySlimeToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        slimeGroupId: 1,
        slimeColor: 0xff6200,
      },
      simState,
      planetState,
    );
    const secondChanged = applySlimeToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        slimeGroupId: 0,
        slimeColor: 0x00e5ff,
      },
      simState,
      planetState,
    );

    expect(firstChanged).toBeGreaterThan(0);
    expect(secondChanged).toBe(firstChanged);
    expect(simState.scores.get("0")).toBe(secondChanged);
    expect(simState.scores.get("1")).toBe(0);
    expect(simState.players.get("session-1")?.slimeScore).toBe(secondChanged);
    expect(simState.players.get("session-2")?.slimeScore).toBe(0);
  });
});

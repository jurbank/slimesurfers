import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_WEAPON_ID } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG, getPaintTerritoryDimensions } from "@splat/content/config/gameConfig.ts";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { createStampBuckets } from "./paintDetection.ts";
import {
  applyPaintToTerritoryAtPoint,
  countPaintableTerritoryCells,
  createTerritoryCells,
  isTerritoryCellPaintable,
} from "./territoryGrid.ts";
import type { SimMatchState, SimPlayerState } from "../match/simState.ts";

function createPlayer(sessionId: string, paintGroupId: number, slimeColor: number): SimPlayerState {
  return {
    sessionId,
    isBot: false,
    name: sessionId,
    teamId: 255,
    paintGroupId,
    paletteIndex: paintGroupId,
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
    isOnFriendlyPaint: false,
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
    airTrickPaintMultiplier: 1,
    equippedWeaponId: DEFAULT_WEAPON_ID,
    disposableShotsRemaining: 0,
    health: 100,
    slimeLevel: GAME_CONFIG.slime.maxLevel,
    paintScore: 0,
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
    projectiles: new Map(),
    pickups: new Map(),
    matchPhase: MatchPhase.Active,
    matchTimer: GAME_CONFIG.match.durationSeconds,
    paintSeq: 0,
    trickSeq: 0,
    scores: new Map(),
    elapsedMs: 0,
    nextProjectileId: 0,
    healthPickups: new Map(),
  };
}

function surfacePointForCell(row: number, col: number): { x: number; y: number; z: number } {
  const { rows, cols } = getPaintTerritoryDimensions();
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
  it("counts only paintable cells toward total territory coverage", () => {
    const planet = DEV_MAP.planets[0]!;
    const terrainCfg = { planet: { radius: planet.radius }, terrain: DEV_MAP.planets[0]!.terrain };
    const { rows, cols } = getPaintTerritoryDimensions();
    const totalCells = rows * cols;
    const paintableCells = countPaintableTerritoryCells(rows, cols, terrainCfg);

    expect(paintableCells).toBeGreaterThan(0);
    expect(paintableCells).toBeLessThan(totalCells);

    let blockedCellCount = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!isTerritoryCellPaintable(row, col, rows, cols, terrainCfg)) {
          blockedCellCount++;
        }
      }
    }

    expect(blockedCellCount).toBe(totalCells - paintableCells);
    expect(blockedCellCount).toBeGreaterThan(0);
  });

  it("claims neutral cells once and does not double-count repainting the same owned area", () => {
    const simState = createSimState();
    const { rows, cols } = getPaintTerritoryDimensions();
    const planetState = {
      planetId: "planet-0",
      territoryRows: rows,
      territoryCols: cols,
      cells: createTerritoryCells(rows, cols),
      stamps: [],
      stampBuckets: createStampBuckets(rows, cols),
    };
    const impactPoint = surfacePointForCell(5, 7);

    const firstChanged = applyPaintToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        paintGroupId: 0,
        slimeColor: 0x00e5ff,
      },
      simState,
      planetState,
    );
    const secondChanged = applyPaintToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        paintGroupId: 0,
        slimeColor: 0x00e5ff,
      },
      simState,
      planetState,
    );

    expect(firstChanged).toBeGreaterThan(0);
    expect(secondChanged).toBe(0);
    expect(simState.scores.get("0")).toBe(firstChanged);
    expect(simState.players.get("session-1")?.paintScore).toBe(firstChanged);
  });

  it("transfers ownership and score when repainting enemy-controlled territory", () => {
    const simState = createSimState();
    const { rows, cols } = getPaintTerritoryDimensions();
    const planetState = {
      planetId: "planet-0",
      territoryRows: rows,
      territoryCols: cols,
      cells: createTerritoryCells(rows, cols),
      stamps: [],
      stampBuckets: createStampBuckets(rows, cols),
    };
    const impactPoint = surfacePointForCell(5, 7);

    const firstChanged = applyPaintToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        paintGroupId: 1,
        slimeColor: 0xff6200,
      },
      simState,
      planetState,
    );
    const secondChanged = applyPaintToTerritoryAtPoint(
      {
        planetId: planetState.planetId,
        pos: impactPoint,
        paintGroupId: 0,
        slimeColor: 0x00e5ff,
      },
      simState,
      planetState,
    );

    expect(firstChanged).toBeGreaterThan(0);
    expect(secondChanged).toBe(firstChanged);
    expect(simState.scores.get("0")).toBe(secondChanged);
    expect(simState.scores.get("1")).toBe(0);
    expect(simState.players.get("session-1")?.paintScore).toBe(secondChanged);
    expect(simState.players.get("session-2")?.paintScore).toBe(0);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { GAME_CONFIG, getPaintTerritoryDimensions } from "@splat/content/config/gameConfig.ts";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { NO_PAINT_GROUP_ID } from "@splat/protocol/schemas/paintedState.ts";
import { createStampBuckets } from "./paintDetection.ts";
import { applyPaintImpact } from "./stampPaint.ts";
import { createTerritoryCells } from "./territoryGrid.ts";
import type { SimMatchState } from "../match/simState.ts";
import { getTerrainHeight, getTerrainRadius } from "../terrain/planetTerrain.ts";

const DEV_PLANET_RADIUS = DEV_MAP.planets[0]!.radius;

function createSimState(): SimMatchState {
  return {
    players: new Map(),
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

function createPlanetState() {
  const { rows, cols } = getPaintTerritoryDimensions(DEV_PLANET_RADIUS);
  return {
    planetId: "planet-0",
    territoryRows: rows,
    territoryCols: cols,
    cells: createTerritoryCells(rows, cols),
    stamps: [],
    stampBuckets: createStampBuckets(rows, cols),
  };
}

function findTerrainNormal(predicate: (height: number) => boolean): {
  x: number;
  y: number;
  z: number;
} {
  const rows = 48;
  const cols = 96;
  for (let row = 0; row < rows; row++) {
    const v = (row + 0.5) / rows;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    for (let col = 0; col < cols; col++) {
      const u = col / cols;
      const phi = u * Math.PI * 2;
      const normal = {
        x: sinTheta * Math.cos(phi),
        y: Math.cos(theta),
        z: sinTheta * Math.sin(phi),
      };
      const terrainCfg = {
        planet: { radius: DEV_MAP.planets[0]!.radius },
        terrain: DEV_MAP.planets[0]!.terrain,
      };
      const height = getTerrainHeight(normal.x, normal.y, normal.z, terrainCfg);
      if (predicate(height)) {
        return normal;
      }
    }
  }

  throw new Error("expected a terrain sample matching the requested predicate");
}

describe("stampPaint", () => {
  it("increments paintSeq monotonically and emits stamp payloads for valid impacts", () => {
    const simState = createSimState();
    const planetState = createPlanetState();
    const planet = DEV_MAP.planets[0]!;
    const impactPos = {
      x: planet.center.x,
      y: planet.center.y + planet.radius,
      z: planet.center.z,
    };

    const first = applyPaintImpact(simState, planetState, {
      planetId: "planet-0",
      pos: impactPos,
      paintGroupId: 0,
      slimeColor: 0x00e5ff,
      patternId: 0,
      radiusMultiplier: 1,
    });
    const second = applyPaintImpact(simState, planetState, {
      planetId: "planet-0",
      pos: impactPos,
      paintGroupId: 1,
      slimeColor: 0xff6200,
      patternId: 0,
      radiusMultiplier: 1,
    });

    expect(first?.seq).toBe(1);
    expect(second?.seq).toBe(2);
    expect(simState.paintSeq).toBe(2);
    expect(first?.planetId).toBe("planet-0");
    expect(second?.paintGroupId).toBe(1);
  });

  it("ignores impacts for unknown planets without mutating paint sequence", () => {
    const simState = createSimState();
    const planetState = createPlanetState();

    const stamp = applyPaintImpact(simState, planetState, {
      planetId: "missing-planet",
      pos: { x: 0, y: 0, z: 0 },
      paintGroupId: 0,
      slimeColor: 0x00e5ff,
      patternId: 0,
      radiusMultiplier: 1,
    });

    expect(stamp).toBeNull();
    expect(simState.paintSeq).toBe(0);
  });

  it("allows impacts in shallow water", () => {
    const simState = createSimState();
    const planetState = createPlanetState();
    const planet = DEV_MAP.planets[0]!;
    const terrainCfg = { planet: { radius: planet.radius }, terrain: DEV_MAP.planets[0]!.terrain };
    const normal = findTerrainNormal((height) => {
      const depth = DEV_MAP.planets[0]!.terrain.waterLevel - height;
      return depth > 0 && depth <= DEV_MAP.planets[0]!.terrain.sandBand;
    });
    const radius = getTerrainRadius(normal.x, normal.y, normal.z, terrainCfg);

    const stamp = applyPaintImpact(simState, planetState, {
      planetId: "planet-0",
      pos: {
        x: planet.center.x + normal.x * radius,
        y: planet.center.y + normal.y * radius,
        z: planet.center.z + normal.z * radius,
      },
      paintGroupId: 0,
      slimeColor: 0x00e5ff,
      patternId: 0,
      radiusMultiplier: 1,
    });

    expect(stamp).not.toBeNull();
    expect(simState.paintSeq).toBe(1);
    expect(planetState.stamps).toHaveLength(1);
  });

  it("ignores impacts in deep water without mutating territory or paint sequence", () => {
    const simState = createSimState();
    const planetState = createPlanetState();
    const planet = DEV_MAP.planets[0]!;
    const terrainCfg = { planet: { radius: planet.radius }, terrain: DEV_MAP.planets[0]!.terrain };
    const normal = findTerrainNormal(
      (height) =>
        DEV_MAP.planets[0]!.terrain.waterLevel - height > DEV_MAP.planets[0]!.terrain.sandBand,
    );
    const radius = getTerrainRadius(normal.x, normal.y, normal.z, terrainCfg);

    const stamp = applyPaintImpact(simState, planetState, {
      planetId: "planet-0",
      pos: {
        x: planet.center.x + normal.x * radius,
        y: planet.center.y + normal.y * radius,
        z: planet.center.z + normal.z * radius,
      },
      paintGroupId: 0,
      slimeColor: 0x00e5ff,
      patternId: 0,
      radiusMultiplier: 1,
    });

    expect(stamp).toBeNull();
    expect(simState.paintSeq).toBe(0);
    expect(simState.scores.size).toBe(0);
    expect(planetState.stamps).toHaveLength(0);
    expect(
      planetState.cells.every(
        (cell) => cell.ownerPaintGroupId === NO_PAINT_GROUP_ID && cell.color === 0,
      ),
    ).toBe(true);
  });
});

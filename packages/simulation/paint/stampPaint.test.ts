import { describe, expect, it } from "vite-plus/test";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { createStampBuckets } from "./paintDetection.ts";
import { applyPaintImpact } from "./stampPaint.ts";
import { createTerritoryCells } from "./territoryGrid.ts";
import type { SimMatchState } from "../match/simState.ts";

function createSimState(): SimMatchState {
  return {
    players: new Map(),
    planets: new Map(),
    projectiles: new Map(),
    pickups: new Map(),
    matchPhase: MatchPhase.Active,
    matchTimer: GAME_CONFIG.match.durationSeconds,
    paintSeq: 0,
    scores: new Map(),
    elapsedMs: 0,
    nextProjectileId: 0,
  };
}

function createPlanetState() {
  return {
    planetId: "planet-0",
    territoryRows: GAME_CONFIG.paint.territoryRows,
    territoryCols: GAME_CONFIG.paint.territoryCols,
    cells: createTerritoryCells(GAME_CONFIG.paint.territoryRows, GAME_CONFIG.paint.territoryCols),
    stamps: [],
    stampBuckets: createStampBuckets(
      GAME_CONFIG.paint.territoryRows,
      GAME_CONFIG.paint.territoryCols,
    ),
  };
}

describe("stampPaint", () => {
  it("increments paintSeq monotonically and emits stamp payloads for valid impacts", () => {
    const simState = createSimState();
    const planetState = createPlanetState();
    const planet = PLANET_POSITIONS[0]!;
    const impactPos = { x: planet.x, y: planet.y + GAME_CONFIG.planet.radius, z: planet.z };

    const first = applyPaintImpact(simState, planetState, {
      planetId: "planet-0",
      pos: impactPos,
      paintGroupId: 0,
      slimeColor: 0x00e5ff,
      radiusMultiplier: 1,
    });
    const second = applyPaintImpact(simState, planetState, {
      planetId: "planet-0",
      pos: impactPos,
      paintGroupId: 1,
      slimeColor: 0xff6200,
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
      radiusMultiplier: 1,
    });

    expect(stamp).toBeNull();
    expect(simState.paintSeq).toBe(0);
  });
});

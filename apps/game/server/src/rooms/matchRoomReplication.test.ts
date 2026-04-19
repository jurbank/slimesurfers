import { describe, expect, it } from "vite-plus/test";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { MatchSimulation } from "@splat/simulation/match/matchSimulation.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import {
  addSimPlayerToRoomState,
  buildJoinBootstrap,
  buildTickBroadcasts,
  createRoomState,
  syncRoomStateFromSimulation,
} from "./matchRoomReplication.ts";

describe("matchRoomReplication", () => {
  it("projects simulation players into room schema state", () => {
    const simulation = new MatchSimulation();
    const alpha = simulation.addPlayer("session-1", "Alpha");
    const state = createRoomState(simulation.matchState);

    addSimPlayerToRoomState(state, alpha);
    alpha.paintScore = 12;
    alpha.health = 42;
    alpha.slimeLevel = 27.5;
    syncRoomStateFromSimulation(state, simulation.matchState);

    const schemaPlayer = state.players.get("session-1");
    expect(schemaPlayer?.name).toBe("Alpha");
    expect(schemaPlayer?.paintScore).toBe(12);
    expect(schemaPlayer?.health).toBe(42);
    expect(schemaPlayer?.slimeLevel).toBe(27.5);
  });

  it("builds bootstrap payloads for newly joined clients", () => {
    const simulation = new MatchSimulation();
    simulation.addPlayer("session-1", "Alpha");
    simulation.tick(simulation.tickIntervalMs);

    const bootstrap = buildJoinBootstrap(simulation);

    expect(bootstrap.snapshot.players).toHaveLength(1);
    expect(Array.isArray(bootstrap.paintStamps)).toBe(true);
  });

  it("builds outbound broadcasts from simulation tick results", () => {
    const simulation = new MatchSimulation();
    simulation.addPlayer("session-1", "Alpha");

    const broadcasts = buildTickBroadcasts(
      {
        shouldBroadcastLeaderboard: true,
        shouldBroadcastMatchPhase: true,
        shouldBroadcastSnapshot: true,
      },
      simulation,
    );

    expect(broadcasts.snapshot?.players).toHaveLength(1);
    expect(broadcasts.leaderboard?.entries).toHaveLength(1);
    expect(broadcasts.leaderboard?.entries[0]?.killCount).toBe(0);
    expect(broadcasts.leaderboard?.entries[0]?.deathCount).toBe(0);
    expect(broadcasts.matchPhase?.phase).toBe(MatchPhase.Active);
    expect(broadcasts.paintStamps).toHaveLength(0);
  });

  it("syncs authoritative territory scores and cell ownership into room schema state", () => {
    const simulation = new MatchSimulation();
    const alpha = simulation.addPlayer("session-1", "Alpha");
    const state = createRoomState(simulation.matchState);

    addSimPlayerToRoomState(state, alpha);
    const planet = simulation.matchState.planets.get("planet-0");
    if (!planet) {
      throw new Error("expected planet-0 paint state");
    }

    planet.cells[0]!.ownerPaintGroupId = alpha.paintGroupId;
    planet.cells[0]!.color = alpha.slimeColor;
    simulation.matchState.scores.set(alpha.paintGroupId.toString(), 1);
    alpha.paintScore = 1;
    syncRoomStateFromSimulation(state, simulation.matchState);

    expect(state.scores.get(alpha.paintGroupId.toString())).toBe(1);
    expect(state.players.get(alpha.sessionId)?.paintScore).toBe(1);
    expect(state.planets.get("planet-0")?.cells[0]?.ownerPaintGroupId).toBe(alpha.paintGroupId);
    expect(state.planets.get("planet-0")?.territoryRows).toBe(GAME_CONFIG.paint.territoryRows);
  });
});

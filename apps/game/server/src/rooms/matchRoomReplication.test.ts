import { describe, expect, it } from "vite-plus/test";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
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
    expect(broadcasts.killEvents).toHaveLength(0);
    expect(broadcasts.paintStamps).toHaveLength(0);
  });

  it("drains kill events into outbound broadcasts", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    for (let shot = 0; shot < 3; shot++) {
      simulation.matchState.projectiles.set(`replication-kill-${shot}`, {
        id: `replication-kill-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
        slimeColor: shooter.slimeColor,
        patternId: shooter.patternId,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        planetId: target.planetId,
        lifeMs: 1000,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    const broadcasts = buildTickBroadcasts(
      {
        shouldBroadcastLeaderboard: false,
        shouldBroadcastMatchPhase: false,
        shouldBroadcastSnapshot: false,
      },
      simulation,
    );

    expect(broadcasts.killEvents).toHaveLength(1);
    expect(broadcasts.killEvents[0]?.killerSessionId).toBe(shooter.sessionId);
    expect(broadcasts.killEvents[0]?.victimSessionId).toBe(target.sessionId);
    expect(simulation.drainKillEventMessages()).toHaveLength(0);
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

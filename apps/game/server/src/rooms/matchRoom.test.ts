import { describe, expect, it } from "vite-plus/test";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import { getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { MatchSimulation } from "@splat/simulation/match/matchSimulation.ts";
import { MatchRoom } from "./matchRoom.ts";

const MACHINE_GUN_KILL_SHOTS = Math.ceil(
  GAME_CONFIG.player.maxHealth / getWeaponDefinition(WeaponId.MachineGun).directDamage,
);

interface FakeClientMessage {
  type: string;
  payload: unknown;
}

interface FakeBroadcast {
  type: string;
  payload: unknown;
  options?: unknown;
}

function createFakeClient(sessionId: string) {
  const sent: FakeClientMessage[] = [];

  return {
    client: {
      sessionId,
      send(type: string, payload: unknown) {
        sent.push({ type, payload });
      },
    },
    sent,
  };
}

function createRoomHarness(options?: Parameters<MatchRoom["onCreate"]>[0]) {
  const room = new MatchRoom();
  const broadcasts: FakeBroadcast[] = [];
  const messageHandlers = new Map<string, (client: unknown, payload: unknown) => void>();
  let scheduledIntervalMs = 0;

  (room as unknown as { setState(state: unknown): void }).setState = (state: unknown) => {
    (room as unknown as { state: unknown }).state = state;
  };
  (
    room as unknown as {
      onMessage(type: string, cb: (client: unknown, payload: unknown) => void): void;
    }
  ).onMessage = (type: string, cb: (client: unknown, payload: unknown) => void) => {
    messageHandlers.set(type, cb);
  };
  (
    room as unknown as {
      setSimulationInterval(cb: (dt: number) => void, ms: number): void;
    }
  ).setSimulationInterval = (_cb: (dt: number) => void, ms: number) => {
    scheduledIntervalMs = ms;
  };
  (
    room as unknown as { broadcast(type: string, payload: unknown, options?: unknown): void }
  ).broadcast = (type: string, payload: unknown, options?: unknown) => {
    broadcasts.push({ type, payload, options });
  };
  (room as unknown as { setMetadata(metadata: any): Promise<void> }).setMetadata = (
    _metadata: any,
  ) => {
    return Promise.resolve();
  };

  room.onCreate(options);

  return {
    room,
    broadcasts,
    messageHandlers,
    scheduledIntervalMs,
  };
}

describe("MatchRoom", () => {
  it("uses the requested room match mode", () => {
    const harness = createRoomHarness({ matchMode: "teams" });

    expect((harness.room as unknown as { simulation: MatchSimulation }).simulation.mode.id).toBe(
      "teams",
    );
  });

  it("falls back to ffa for unknown requested match modes", () => {
    const harness = createRoomHarness({ matchMode: "bogus" });

    expect((harness.room as unknown as { simulation: MatchSimulation }).simulation.mode.id).toBe(
      "ffa",
    );
  });

  it("uses dev cluster spawns when requested by a dev client", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";

      const harness = createRoomHarness({ devClusterSpawns: true });

      expect((harness.room as unknown as { simulation: MatchSimulation }).simulation.mode.id).toBe(
        "dev",
      );
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("does not let dev cluster spawns override the requested match mode", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";

      const harness = createRoomHarness({ matchMode: "teams", devClusterSpawns: true });

      expect((harness.room as unknown as { simulation: MatchSimulation }).simulation.mode.id).toBe(
        "teams",
      );
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("enables seeded paint only when SEED_TEST_PAINT is true", () => {
    const previousSeedTestPaint = process.env.SEED_TEST_PAINT;
    try {
      process.env.SEED_TEST_PAINT = "true";

      const harness = createRoomHarness();
      const simulation = (harness.room as unknown as { simulation: MatchSimulation }).simulation;

      expect(simulation.getRecentPaintStamps().length).toBeGreaterThan(0);
    } finally {
      if (previousSeedTestPaint === undefined) {
        delete process.env.SEED_TEST_PAINT;
      } else {
        process.env.SEED_TEST_PAINT = previousSeedTestPaint;
      }
    }
  });

  it("clusters weapon pickups only when CLUSTER_WEAPON_PICKUPS is true", () => {
    const previousClusterWeaponPickups = process.env.CLUSTER_WEAPON_PICKUPS;
    try {
      process.env.CLUSTER_WEAPON_PICKUPS = "true";

      const harness = createRoomHarness();
      const simulation = (harness.room as unknown as { simulation: MatchSimulation }).simulation;
      const pickups = Array.from(simulation.matchState.pickups.values());
      const highestPairDistance = pickups.reduce((maxDistance, pickup, index) => {
        for (const other of pickups.slice(index + 1)) {
          const dx = pickup.pos.x - other.pos.x;
          const dy = pickup.pos.y - other.pos.y;
          const dz = pickup.pos.z - other.pos.z;
          maxDistance = Math.max(maxDistance, Math.hypot(dx, dy, dz));
        }
        return maxDistance;
      }, 0);

      expect(highestPairDistance).toBeLessThan(50);
    } finally {
      if (previousClusterWeaponPickups === undefined) {
        delete process.env.CLUSTER_WEAPON_PICKUPS;
      } else {
        process.env.CLUSTER_WEAPON_PICKUPS = previousClusterWeaponPickups;
      }
    }
  });

  it("wires room lifecycle setup on create", () => {
    const harness = createRoomHarness();
    const configuredBotCount =
      GAME_CONFIG.bot.namedBots.length + GAME_CONFIG.bot.generatedBots.count;

    expect(harness.room.state.players.size).toBe(configuredBotCount);
    expect(harness.messageHandlers.has(MessageType.Input)).toBe(true);
    expect(harness.scheduledIntervalMs).toBeGreaterThan(0);
  });

  it("adds joined players to authoritative room state and sends snapshot bootstrap", () => {
    const harness = createRoomHarness();
    const alpha = createFakeClient("session-1");

    harness.room.onJoin(alpha.client as never, { name: "Alpha" });

    expect(harness.room.state.players.get("session-1")?.name).toBe("Alpha");
    expect(alpha.sent).toHaveLength(2);
    expect(alpha.sent[0]?.type).toBe(MessageType.MapData);
    expect(alpha.sent[1]?.type).toBe(MessageType.Snapshot);
    expect(harness.broadcasts).toHaveLength(1);
    expect(harness.broadcasts[0]?.type).toBe(MessageType.Snapshot);
    expect(harness.broadcasts[0]?.options).toEqual({ except: alpha.client });
  });

  it("honors a requested team in teams mode", () => {
    const harness = createRoomHarness({ matchMode: "teams" });
    const alpha = createFakeClient("session-1");

    harness.room.onJoin(alpha.client as never, { name: "Alpha", teamId: 1 });

    expect(harness.room.state.players.get("session-1")?.teamId).toBe(1);
  });

  it("removes players from room state on leave", () => {
    const harness = createRoomHarness();
    const alpha = createFakeClient("session-1");

    harness.room.onJoin(alpha.client as never, { name: "Alpha" });
    expect(harness.room.state.players.has("session-1")).toBe(true);

    harness.room.onLeave(alpha.client as never);

    expect(harness.room.state.players.has("session-1")).toBe(false);
  });

  it("broadcasts kill-feed events from simulation ticks", () => {
    const harness = createRoomHarness();
    const alpha = createFakeClient("session-1");
    const bravo = createFakeClient("session-2");

    harness.room.onJoin(alpha.client as never, { name: "Alpha" });
    harness.room.onJoin(bravo.client as never, { name: "Bravo" });

    const simulation = (harness.room as unknown as { simulation: MatchSimulation }).simulation;
    const shooter = simulation.players.get("session-1");
    const target = simulation.players.get("session-2");
    if (!shooter || !target) {
      throw new Error("expected joined players in simulation");
    }

    // Advance past lobby and countdown (countdownSeconds may be 0, so two ticks suffice)
    const advanceTick = () =>
      (harness.room as unknown as { tick(dt: number): void }).tick(simulation.tickIntervalMs);
    advanceTick(); // Lobby → Countdown
    advanceTick(); // Countdown → Active (resets match state; no projectiles placed yet)

    for (let shot = 0; shot < MACHINE_GUN_KILL_SHOTS; shot++) {
      simulation.matchState.projectiles.set(`room-kill-${shot}`, {
        id: `room-kill-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
        slimeColor: shooter.slimeColor,
        patternId: shooter.patternId,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        planetId: target.planetId,
        lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
      });
      (harness.room as unknown as { tick(dt: number): void }).tick(simulation.tickIntervalMs);
    }

    const killBroadcast = harness.broadcasts.find(
      (broadcast) => broadcast.type === MessageType.KillEvents,
    );
    expect(killBroadcast).toBeDefined();
    expect(killBroadcast?.payload).toMatchObject({
      events: [
        {
          killerSessionId: shooter.sessionId,
          victimSessionId: target.sessionId,
          weaponId: WeaponId.MachineGun,
        },
      ],
    });
  });
});

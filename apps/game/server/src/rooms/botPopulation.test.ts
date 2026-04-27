import { describe, expect, it } from "vite-plus/test";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { MatchRoom } from "./matchRoom.ts";

function createRoomHarness() {
  const room = new MatchRoom();
  (room as any).setState = (state: any) => {
    (room as any).state = state;
  };
  (room as any).onMessage = () => { };
  (room as any).setSimulationInterval = () => { };
  (room as any).broadcast = () => { };
  (room as any).setMetadata = () => Promise.resolve();

  room.onCreate();
  return { room };
}

function createFakeClient(sessionId: string) {
  return { sessionId, send: () => { } };
}

function withTargetBotPopulation(value: string, run: () => void) {
  const previous = process.env.TARGET_BOT_POPULATION;
  try {
    process.env.TARGET_BOT_POPULATION = value;
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.TARGET_BOT_POPULATION;
    } else {
      process.env.TARGET_BOT_POPULATION = previous;
    }
  }
}

describe("Bot Population", () => {
  it("fills the room with bots when no humans are present", () => {
    withTargetBotPopulation("4", () => {
      const { room } = createRoomHarness();

      const players = Array.from((room as any).simulation.players.values());
      const bots = players.filter((p: any) => p.isBot);
      const humans = players.filter((p: any) => !p.isBot);

      expect(humans.length).toBe(0);
      expect(bots.length).toBe(4);
      expect(bots.every((p: any) => typeof p.name === "string" && p.name.endsWith(" Bot"))).toBe(
        true,
      );
      expect(room.state.players.size).toBe(4);
    });
  });

  it("removes a bot when a human joins", () => {
    withTargetBotPopulation("4", () => {
      const { room } = createRoomHarness();

      const client = createFakeClient("human-1");
      room.onJoin(client as any, { name: "Human" });

      const players = Array.from((room as any).simulation.players.values());
      const bots = players.filter((p: any) => p.isBot);
      const humans = players.filter((p: any) => !p.isBot);

      expect(humans.length).toBe(1);
      expect(bots.length).toBe(3);
      expect(room.state.players.size).toBe(4);
    });
  });

  it("removes all bots when enough humans join", () => {
    withTargetBotPopulation("2", () => {
      const { room } = createRoomHarness();

      room.onJoin(createFakeClient("human-1") as any, { name: "H1" });
      room.onJoin(createFakeClient("human-2") as any, { name: "H2" });
      room.onJoin(createFakeClient("human-3") as any, { name: "H3" });

      const players = Array.from((room as any).simulation.players.values());
      const bots = players.filter((p: any) => p.isBot);
      const humans = players.filter((p: any) => !p.isBot);

      expect(humans.length).toBe(3);
      expect(bots.length).toBe(0);
      expect(room.state.players.size).toBe(3);
    });
  });

  it("adds a bot when a human leaves", () => {
    withTargetBotPopulation("4", () => {
      const { room } = createRoomHarness();

      const client = createFakeClient("human-1");
      room.onJoin(client as any, { name: "Human" });
      expect(
        Array.from((room as any).simulation.players.values()).filter((p: any) => p.isBot).length,
      ).toBe(3);

      room.onLeave(client as any);

      const players = Array.from((room as any).simulation.players.values());
      const bots = players.filter((p: any) => p.isBot);
      expect(bots.length).toBe(4);
    });
  });

  it("keeps bot-only rooms in lobby until a human joins", () => {
    withTargetBotPopulation("4", () => {
      const { room } = createRoomHarness();
      const simulation = (room as any).simulation;

      (room as any).tick(simulation.tickIntervalMs);

      expect(simulation.matchState.matchPhase).toBe(MatchPhase.Lobby);
    });
  });
});

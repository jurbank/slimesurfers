import { describe, expect, it, vi } from "vite-plus/test";
import {
  GAME_CONFIG,
  type BotConfigEntry,
  type WeightedBotConfigEntry,
} from "@splat/content/config/gameConfig.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { MatchRoom } from "./matchRoom.ts";

function createRoomHarness() {
  const room = new MatchRoom();
  const broadcasts: Array<{ type: string; payload: unknown }> = [];
  (room as any).setState = (state: any) => {
    (room as any).state = state;
  };
  (room as any).onMessage = () => {};
  (room as any).setSimulationInterval = () => {};
  (room as any).broadcast = (type: string, payload: unknown) => {
    broadcasts.push({ type, payload });
  };
  (room as any).setMetadata = () => Promise.resolve();

  room.onCreate();
  return { room, broadcasts };
}

function createFakeClient(sessionId: string) {
  return { sessionId, send: () => {} };
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

function withBotConfig(
  patch: {
    namedBots: BotConfigEntry[];
    generatedBots: {
      count: number;
      mix: WeightedBotConfigEntry[];
    };
  },
  run: () => void,
) {
  const previousNamedBots = GAME_CONFIG.bot.namedBots;
  const previousGeneratedBots = GAME_CONFIG.bot.generatedBots;
  try {
    (GAME_CONFIG.bot as { namedBots: typeof GAME_CONFIG.bot.namedBots }).namedBots =
      patch.namedBots;
    (
      GAME_CONFIG.bot as {
        generatedBots: {
          count: number;
          mix: WeightedBotConfigEntry[];
        };
      }
    ).generatedBots = patch.generatedBots;
    run();
  } finally {
    (GAME_CONFIG.bot as { namedBots: typeof GAME_CONFIG.bot.namedBots }).namedBots =
      previousNamedBots;
    (
      GAME_CONFIG.bot as {
        generatedBots: {
          count: number;
          mix: WeightedBotConfigEntry[];
        };
      }
    ).generatedBots = previousGeneratedBots;
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

  it("spawns named bots first and fills remaining slots from generated mixes", () => {
    withBotConfig(
      {
        namedBots: [
          {
            name: "Shaper",
            aggression: 3,
            prefersAttackBias: 0.2,
            prefersTerritoryBias: 1,
            prefersSurfBias: 0.1,
          },
          {
            name: "Hunter",
            aggression: 9,
            prefersAttackBias: 1,
            prefersTerritoryBias: 0.2,
            prefersSurfBias: 0.1,
          },
        ],
        generatedBots: {
          count: 2,
          mix: [
            {
              weight: 1,
              aggression: 2,
              prefersAttackBias: 0.1,
              prefersTerritoryBias: 0.2,
              prefersSurfBias: 1,
            },
          ],
        },
      },
      () => {
        const { room } = createRoomHarness();
        const players = Array.from((room as any).simulation.players.values()).filter(
          (p: any) => p.isBot,
        );

        expect(players).toHaveLength(4);
        expect(players.filter((p: any) => p.botOrigin === "named")).toHaveLength(2);
        expect(players.filter((p: any) => p.botOrigin === "generated")).toHaveLength(2);
        expect(
          players.some((p: any) => typeof p.name === "string" && p.name.endsWith("Shaper Bot")),
        ).toBe(true);
        expect(
          players.some((p: any) => typeof p.name === "string" && p.name.endsWith("Hunter Bot")),
        ).toBe(true);
      },
    );
  });

  it("allows bots to broadcast temperament-based emote events", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      withBotConfig(
        {
          namedBots: [
            {
              name: "Cheer",
              aggression: 3,
              prefersAttackBias: 0.2,
              prefersTerritoryBias: 0.6,
              prefersSurfBias: 0.4,
              emoteTemperament: "friendly",
              emoteFrequency: 1,
            },
          ],
          generatedBots: {
            count: 0,
            mix: [],
          },
        },
        () => {
          const { room, broadcasts } = createRoomHarness();
          const simulation = (room as any).simulation;
          simulation.matchState.matchPhase = MatchPhase.Active;
          simulation.matchState.matchTimer = 30;

          (room as any).tick(simulation.tickIntervalMs);

          const emoteBroadcast = broadcasts.find((entry) => entry.type === MessageType.EmoteEvents);
          expect(emoteBroadcast).toBeDefined();
          const payload = emoteBroadcast!.payload as {
            events: Array<{ playerId: string; emoteIds: string[] }>;
          };
          expect(payload.events[0]?.playerId).toMatch(/^bot-/);
          expect(payload.events[0]?.emoteIds.length).toBeGreaterThan(0);
        },
      );
    } finally {
      randomSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });
});

import { describe, expect, it } from "vite-plus/test";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { MatchRoom } from "./matchRoom.ts";

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

function createRoomHarness() {
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

  room.onCreate();

  return {
    room,
    broadcasts,
    messageHandlers,
    scheduledIntervalMs,
  };
}

describe("MatchRoom", () => {
  it("wires room lifecycle setup on create", () => {
    const harness = createRoomHarness();

    expect(harness.room.state.players.size).toBe(0);
    expect(harness.messageHandlers.has(MessageType.Input)).toBe(true);
    expect(harness.scheduledIntervalMs).toBeGreaterThan(0);
  });

  it("adds joined players to authoritative room state and broadcasts bootstrap snapshot to others", () => {
    const harness = createRoomHarness();
    const alpha = createFakeClient("session-1");

    harness.room.onJoin(alpha.client as never, { name: "Alpha" });

    expect(harness.room.state.players.get("session-1")?.name).toBe("Alpha");
    expect(alpha.sent).toHaveLength(1);
    expect(alpha.sent[0]?.type).toBe(MessageType.Snapshot);
    expect(harness.broadcasts).toHaveLength(1);
    expect(harness.broadcasts[0]?.type).toBe(MessageType.Snapshot);
    expect(harness.broadcasts[0]?.options).toEqual({ except: alpha.client });
  });

  it("removes players from room state on leave", () => {
    const harness = createRoomHarness();
    const alpha = createFakeClient("session-1");

    harness.room.onJoin(alpha.client as never, { name: "Alpha" });
    expect(harness.room.state.players.has("session-1")).toBe(true);

    harness.room.onLeave(alpha.client as never);

    expect(harness.room.state.players.has("session-1")).toBe(false);
  });
});

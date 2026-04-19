import { getStateCallbacks, type Room } from "@colyseus/sdk";
import { colyseusClient } from "./colyseusClient.ts";
import { GameState } from "@splat/protocol/schemas/gameState.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import type { InputMessage } from "@splat/protocol/network/clientMessages.ts";
import type {
  LeaderboardMessage,
  PaintStampBatchMessage,
  PaintStampMessage,
  SnapshotMessage,
} from "@splat/protocol/network/serverMessages.ts";
import type { PlayerState } from "@splat/protocol/schemas/playerState.ts";

export interface RoomCallbacks {
  onPlayerAdded(sessionId: string, slimeColor: number, paintGroupId: number): void;
  onPlayerRemoved(sessionId: string): void;
  // Snapshots and paint stamps drive frame-critical client state; schema stays
  // focused on persistent room membership and shared territory state.
  onPaintStamps(stamps: PaintStampMessage[]): void;
  onSnapshot(snapshot: SnapshotMessage, receivedAtMs: number): void;
  onLeaderboard(message: LeaderboardMessage): void;
  onDisconnect(): void;
}

export class RoomConnection {
  private room: Room<unknown, GameState> | null = null;

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  async join(name: string, callbacks: RoomCallbacks): Promise<void> {
    this.room = await colyseusClient.joinOrCreate("match", { name }, GameState);

    this.room.onMessage(MessageType.Snapshot, (snapshot: SnapshotMessage) => {
      callbacks.onSnapshot(snapshot, performance.now());
    });

    this.room.onMessage(MessageType.Leaderboard, (message: LeaderboardMessage) => {
      callbacks.onLeaderboard(message);
    });

    this.room.onMessage(MessageType.PaintStamps, (message: PaintStampBatchMessage) => {
      callbacks.onPaintStamps(message.stamps);
    });

    const $ = getStateCallbacks(this.room);

    $(this.room.state.players).onAdd((player: PlayerState, sessionId: string) => {
      callbacks.onPlayerAdded(sessionId, player.slimeColor, player.paintGroupId);
    });

    $(this.room.state.players).onRemove((_player: PlayerState, sessionId: string) => {
      callbacks.onPlayerRemoved(sessionId);
    });

    const players = this.room.state.players;
    players?.forEach((player: PlayerState, sessionId: string) => {
      callbacks.onPlayerAdded(sessionId, player.slimeColor, player.paintGroupId);
    });

    this.room.onLeave(() => {
      this.room = null;
      callbacks.onDisconnect();
    });
  }

  sendInput(msg: InputMessage): void {
    this.room?.send(MessageType.Input, msg);
  }
}

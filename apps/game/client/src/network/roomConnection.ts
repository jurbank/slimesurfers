import { getStateCallbacks, type Room } from "@colyseus/sdk";
import { colyseusClient } from "./colyseusClient.ts";
import { GameState } from "@splat/protocol/schemas/gameState.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type { EmotePostMessage, InputMessage } from "@splat/protocol/network/clientMessages.ts";
import type {
  EmoteEventBatchMessage,
  EmoteEventMessage,
  KillEventBatchMessage,
  KillEventMessage,
  LeaderboardMessage,
  PaintStampBatchMessage,
  PaintStampMessage,
  SnapshotMessage,
  TrickEventBatchMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import type { PlayerState } from "@splat/protocol/schemas/playerState.ts";

export interface RoomCallbacks {
  onPlayerInit(
    sessionId: string,
    slimeColor: number,
    patternId: number,
    paintGroupId: number,
  ): void;
  onPlayerAdded(
    sessionId: string,
    name: string,
    slimeColor: number,
    patternId: number,
    paintGroupId: number,
  ): void;
  onPlayerRemoved(sessionId: string): void;
  // Snapshots and paint stamps drive frame-critical client state; schema stays
  // focused on persistent room membership and shared territory state.
  onPaintStamps(stamps: PaintStampMessage[]): void;
  onTrickEvents(events: TrickEventMessage[]): void;
  onEmoteEvents(events: EmoteEventMessage[]): void;
  onKillEvents(events: KillEventMessage[]): void;
  onSnapshot(snapshot: SnapshotMessage, receivedAtMs: number): void;
  onLeaderboard(message: LeaderboardMessage): void;
  onMatchPhase(phase: MatchPhase, timer: number): void;
  onDisconnect(): void;
}

export class RoomConnection {
  private room: Room<unknown, GameState> | null = null;

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get roomState(): GameState | undefined {
    return this.room?.state;
  }

  get matchTimer(): number {
    return this.room?.state.matchTimer ?? 0;
  }

  get matchPhase(): MatchPhase {
    return this.room?.state.matchPhase ?? MatchPhase.Lobby;
  }

  async fetchTakenColorIndices(): Promise<number[]> {
    try {
      const res = await colyseusClient.http.get<{ takenColorIndices: number[] }>("/colors");
      return res.data.takenColorIndices ?? [];
    } catch {
      return [];
    }
  }

  async join(
    name: string,
    colorIndex: number,
    playerUuid: string | null,
    callbacks: RoomCallbacks,
  ): Promise<void> {
    this.room = await colyseusClient.joinOrCreate(
      "match",
      { name, colorIndex, playerUuid },
      GameState,
    );

    this.room.onMessage(MessageType.Snapshot, (snapshot: SnapshotMessage) => {
      callbacks.onSnapshot(snapshot, performance.now());
    });

    this.room.onMessage(MessageType.Leaderboard, (message: LeaderboardMessage) => {
      callbacks.onLeaderboard(message);
    });

    this.room.onMessage(MessageType.PaintStamps, (message: PaintStampBatchMessage) => {
      callbacks.onPaintStamps(message.stamps);
    });

    this.room.onMessage(MessageType.TrickEvents, (message: TrickEventBatchMessage) => {
      callbacks.onTrickEvents(message.events);
    });

    this.room.onMessage(MessageType.EmoteEvents, (message: EmoteEventBatchMessage) => {
      callbacks.onEmoteEvents(message.events);
    });

    this.room.onMessage(MessageType.KillEvents, (message: KillEventBatchMessage) => {
      callbacks.onKillEvents(message.events);
    });

    let lastPhase: MatchPhase | null = null;
    this.room.onStateChange((state: GameState) => {
      if (state.matchPhase !== lastPhase) {
        lastPhase = state.matchPhase;
        callbacks.onMatchPhase(state.matchPhase, state.matchTimer);
      }
    });

    const $ = getStateCallbacks(this.room);

    $(this.room.state.players).onAdd((player: PlayerState, sessionId: string) => {
      callbacks.onPlayerAdded(
        sessionId,
        player.name,
        player.slimeColor,
        player.patternId,
        player.paintGroupId,
      );
    });

    $(this.room.state.players).onRemove((_player: PlayerState, sessionId: string) => {
      callbacks.onPlayerRemoved(sessionId);
    });

    const players = this.room.state.players;
    players?.forEach((player: PlayerState, sessionId: string) => {
      callbacks.onPlayerInit(sessionId, player.slimeColor, player.patternId, player.paintGroupId);
    });

    this.room.onLeave(() => {
      this.room = null;
      callbacks.onDisconnect();
    });
  }

  leave(): void {
    void this.room?.leave();
  }

  sendInput(msg: InputMessage): void {
    this.room?.send(MessageType.Input, msg);
  }

  sendEmotePost(emoteIds: string[]): void {
    const message: EmotePostMessage = { emoteIds };
    this.room?.send(MessageType.EmotePost, message);
  }
}

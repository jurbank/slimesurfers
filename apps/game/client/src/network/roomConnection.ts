import { getStateCallbacks, type Room } from "@colyseus/sdk";
import { colyseusClient } from "./colyseusClient.ts";
import { GameState, NO_WINNING_TEAM_ID } from "@splat/protocol/schemas/gameState.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  EmotePostMessage,
  InputMessage,
  MatchModeId,
} from "@splat/protocol/network/clientMessages.ts";
import type {
  EmoteEventBatchMessage,
  EmoteEventMessage,
  KillEventBatchMessage,
  KillEventMessage,
  LeaderboardMessage,
  MapDataMessage,
  MatchPhaseMessage,
  SlimeStampBatchMessage,
  SlimeStampMessage,
  SnapshotMessage,
  TrickEventBatchMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import type { PlayerState } from "@splat/protocol/schemas/playerState.ts";

export interface RoomCallbacks {
  onPlayerInit(
    sessionId: string,
    name: string,
    slimeColor: number,
    patternId: number,
    slimeGroupId: number,
  ): void;
  onPlayerAdded(
    sessionId: string,
    name: string,
    slimeColor: number,
    patternId: number,
    slimeGroupId: number,
  ): void;
  onPlayerRemoved(sessionId: string): void;
  // Snapshots and slime stamps drive frame-critical client state; schema stays
  // focused on persistent room membership and shared territory state.
  onSlimeStamps(stamps: SlimeStampMessage[]): void;
  onTrickEvents(events: TrickEventMessage[]): void;
  onEmoteEvents(events: EmoteEventMessage[]): void;
  onKillEvents(events: KillEventMessage[]): void;
  onMapData(message: MapDataMessage): void;
  onSnapshot(snapshot: SnapshotMessage, receivedAtMs: number): void;
  onLeaderboard(message: LeaderboardMessage): void;
  onMatchPhase(phase: MatchPhase, timer: number, winningTeamId?: number): void;
  onDisconnect(): void;
}

export interface MatchJoinConfig {
  name: string;
  colorIndex: number;
  playerUuid: string | null;
  matchMode: MatchModeId;
  teamId?: number;
}

export class RoomConnection {
  private room: Room<unknown, GameState> | null = null;
  private _winningTeamId: number | undefined = undefined;

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

  get winningTeamId(): number | undefined {
    const schemaWinningTeamId = this.room?.state.winningTeamId;
    if (schemaWinningTeamId !== undefined && schemaWinningTeamId !== NO_WINNING_TEAM_ID) {
      return schemaWinningTeamId;
    }
    return this._winningTeamId;
  }

  async fetchTakenColorIndices(): Promise<number[]> {
    try {
      const res = await colyseusClient.http.get<{ takenColorIndices: number[] }>("/colors");
      return res.data.takenColorIndices ?? [];
    } catch {
      return [];
    }
  }

  async join(options: MatchJoinConfig, callbacks: RoomCallbacks): Promise<void> {
    this._winningTeamId = undefined;
    const devClusterSpawns =
      import.meta.env.DEV && import.meta.env.VITE_CLUSTER_PLAYER_SPAWNS === "true";
    this.room = await colyseusClient.joinOrCreate(
      "match",
      { ...options, devClusterSpawns },
      GameState,
    );

    this.room.onMessage(MessageType.MapData, (message: MapDataMessage) => {
      callbacks.onMapData(message);
    });

    this.room.onMessage(MessageType.Snapshot, (snapshot: SnapshotMessage) => {
      callbacks.onSnapshot(snapshot, performance.now());
    });

    this.room.onMessage(MessageType.Leaderboard, (message: LeaderboardMessage) => {
      callbacks.onLeaderboard(message);
    });

    this.room.onMessage(MessageType.SlimeStamps, (message: SlimeStampBatchMessage) => {
      callbacks.onSlimeStamps(message.stamps);
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

    this.room.onMessage(MessageType.MatchPhase, (message: MatchPhaseMessage) => {
      if (message.winningTeamId !== undefined) {
        this._winningTeamId = message.winningTeamId;
      }
    });

    let lastPhase: MatchPhase | null = null;
    this.room.onStateChange((state: GameState) => {
      if (state.matchPhase !== lastPhase) {
        lastPhase = state.matchPhase;
        const winningTeamId =
          state.winningTeamId === NO_WINNING_TEAM_ID ? undefined : state.winningTeamId;
        callbacks.onMatchPhase(state.matchPhase, state.matchTimer, winningTeamId);
      }
    });

    const $ = getStateCallbacks(this.room);

    $(this.room.state.players).onAdd((player: PlayerState, sessionId: string) => {
      callbacks.onPlayerAdded(
        sessionId,
        player.name,
        player.slimeColor,
        player.patternId,
        player.slimeGroupId,
      );
    });

    $(this.room.state.players).onRemove((_player: PlayerState, sessionId: string) => {
      callbacks.onPlayerRemoved(sessionId);
    });

    const players = this.room.state.players;
    players?.forEach((player: PlayerState, sessionId: string) => {
      callbacks.onPlayerInit(
        sessionId,
        player.name,
        player.slimeColor,
        player.patternId,
        player.slimeGroupId,
      );
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

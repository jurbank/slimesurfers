import { Room, type Client } from "@colyseus/core";
import { EMOTE_CONFIG, isEmoteId } from "@splat/content/emotes/emoteDefs.ts";
import type { EmotePostMessage, InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { GameState } from "@splat/protocol/schemas/gameState.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { MatchSimulation } from "@splat/simulation/match/matchSimulation.ts";
import {
  addSimPlayerToRoomState,
  buildJoinBootstrap,
  buildTickBroadcasts,
  createRoomState,
  syncRoomStateFromSimulation,
} from "./matchRoomReplication.ts";

export class MatchRoom extends Room<{ state: GameState }> {
  private simulation = new MatchSimulation();
  private emoteSeq = 0;
  private readonly lastEmotePostMs = new Map<string, number>();

  onCreate() {
    this.setState(createRoomState(this.simulation.matchState));
    this.maxClients = NETWORK_CONFIG.rooms.maxPlayers;

    this.onMessage(MessageType.Input, (client: Client, msg: InputMessage) => {
      this.simulation.recordInput(client.sessionId, msg);
    });

    this.onMessage(MessageType.EmotePost, (client: Client, msg: EmotePostMessage) => {
      this.handleEmotePost(client, msg);
    });

    this.setSimulationInterval((dt) => this.tick(dt), this.simulation.tickIntervalMs);
  }

  onJoin(client: Client, options: { name?: unknown; colorIndex?: unknown } = {}) {
    const simPlayer = this.simulation.addPlayer(client.sessionId, options.name, options.colorIndex);
    addSimPlayerToRoomState(this.state, simPlayer);
    void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });

    const bootstrap = buildJoinBootstrap(this.simulation);
    if (bootstrap.paintStamps.length > 0) {
      client.send(MessageType.PaintStamps, { stamps: [...bootstrap.paintStamps] });
    }
    client.send(MessageType.Snapshot, bootstrap.snapshot);
    this.broadcast(MessageType.Snapshot, bootstrap.snapshot, { except: client });
  }

  onLeave(client: Client) {
    this.simulation.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.lastEmotePostMs.delete(client.sessionId);
    void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });
  }

  private handleEmotePost(client: Client, msg: EmotePostMessage): void {
    if (!this.state.players.has(client.sessionId)) return;
    if (!Array.isArray(msg.emoteIds)) return;
    if (msg.emoteIds.length > EMOTE_CONFIG.maxPostPayloadIds) return;

    const now = Date.now();
    const lastPostMs = this.lastEmotePostMs.get(client.sessionId) ?? 0;
    if (now - lastPostMs < EMOTE_CONFIG.postCooldownMs) return;
    this.lastEmotePostMs.set(client.sessionId, now);

    const emoteIds: string[] = [];
    for (const emoteId of msg.emoteIds) {
      if (typeof emoteId !== "string" || !isEmoteId(emoteId)) continue;
      if (emoteIds.includes(emoteId)) continue;
      emoteIds.push(emoteId);
      if (emoteIds.length >= EMOTE_CONFIG.maxSelected) break;
    }
    if (emoteIds.length === 0) return;

    this.broadcast(MessageType.EmoteEvents, {
      events: [
        {
          playerId: client.sessionId,
          emoteIds,
          seq: ++this.emoteSeq,
        },
      ],
    });
  }

  private tick(dt: number): void {
    const result = this.simulation.tick(dt);
    syncRoomStateFromSimulation(this.state, this.simulation.matchState);

    const broadcasts = buildTickBroadcasts(result, this.simulation);
    if (broadcasts.matchPhase) {
      this.broadcast(MessageType.MatchPhase, broadcasts.matchPhase);
    }
    if (broadcasts.snapshot) {
      this.broadcast(MessageType.Snapshot, broadcasts.snapshot);
    }
    if (broadcasts.leaderboard) {
      this.broadcast(MessageType.Leaderboard, broadcasts.leaderboard);
    }
    if (broadcasts.killEvents.length > 0) {
      this.broadcast(MessageType.KillEvents, { events: broadcasts.killEvents });
    }
    if (broadcasts.paintStamps.length > 0) {
      this.broadcast(MessageType.PaintStamps, { stamps: broadcasts.paintStamps });
    }
    if (broadcasts.trickEvents.length > 0) {
      this.broadcast(MessageType.TrickEvents, { events: broadcasts.trickEvents });
    }
  }
}

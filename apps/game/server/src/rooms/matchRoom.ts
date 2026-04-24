import { Room, type Client } from "@colyseus/core";
import { EMOTE_CONFIG, isEmoteId } from "@splat/content/emotes/emoteDefs.ts";
import { FFA_MODE, resolveGameMode } from "@splat/content/modes/gameModes.ts";
import type { EmotePostMessage, InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
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
import type { LeaderboardEntry } from "@splat/protocol/network/serverMessages.ts";
import { SupabaseService } from "../db/supabaseService.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DepartedEntry = LeaderboardEntry & { playerUuid?: string };

export class MatchRoom extends Room<{ state: GameState }> {
  private simulation = new MatchSimulation(FFA_MODE, { lobbyEnabled: true });
  private emoteSeq = 0;
  private readonly lastEmotePostMs = new Map<string, number>();
  private readonly db = new SupabaseService();
  private readonly playerUuids = new Map<string, string>();
  private readonly departedPlayers = new Map<string, DepartedEntry>();

  onCreate() {
    this.simulation = new MatchSimulation(resolveGameMode(process.env.MATCH_MODE), {
      lobbyEnabled: true,
    });
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

  onJoin(
    client: Client,
    options: { name?: unknown; colorIndex?: unknown; playerUuid?: unknown } = {},
  ) {
    const simPlayer = this.simulation.addPlayer(client.sessionId, options.name, options.colorIndex);
    addSimPlayerToRoomState(this.state, simPlayer);
    void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });

    if (typeof options.playerUuid === "string" && UUID_RE.test(options.playerUuid)) {
      this.playerUuids.set(client.sessionId, options.playerUuid);
    }

    const bootstrap = buildJoinBootstrap(this.simulation);
    if (bootstrap.paintStamps.length > 0) {
      client.send(MessageType.PaintStamps, { stamps: [...bootstrap.paintStamps] });
    }
    client.send(MessageType.Snapshot, bootstrap.snapshot);
    this.broadcast(MessageType.Snapshot, bootstrap.snapshot, { except: client });
  }

  onLeave(client: Client) {
    if (this.simulation.matchState.matchPhase === MatchPhase.Active) {
      const sim = this.simulation.matchState.players.get(client.sessionId);
      if (sim) {
        this.departedPlayers.set(client.sessionId, {
          sessionId: sim.sessionId,
          name: sim.name,
          teamId: sim.teamId,
          paintGroupId: sim.paintGroupId,
          slimeColor: sim.slimeColor,
          patternId: sim.patternId,
          paintScore: sim.paintScore,
          killCount: sim.killCount,
          deathCount: sim.deathCount,
          playerUuid: this.playerUuids.get(client.sessionId),
        });
      }
    }
    this.simulation.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.lastEmotePostMs.delete(client.sessionId);
    this.playerUuids.delete(client.sessionId);
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
      if (broadcasts.matchPhase.phase === MatchPhase.Ended) {
        void this.persistMatchResults();
        void this.lock();
      }
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

  private async persistMatchResults(): Promise<void> {
    const leaderboard = this.simulation.buildLeaderboardMessage();

    // Merge still-connected players with anyone who left during the match
    const allEntries: DepartedEntry[] = leaderboard.entries.map((e) => ({
      ...e,
      playerUuid: this.playerUuids.get(e.sessionId),
    }));
    for (const [sessionId, departed] of this.departedPlayers) {
      if (!allEntries.some((e) => e.sessionId === sessionId)) {
        allEntries.push(departed);
      }
    }

    // Same sort order as buildLeaderboardMessage
    allEntries.sort(
      (a, b) =>
        b.paintScore - a.paintScore ||
        b.killCount - a.killCount ||
        a.deathCount - b.deathCount ||
        a.name.localeCompare(b.name),
    );

    await this.db.saveMatch({
      entries: allEntries.map((entry, index) => ({
        ...entry,
        placement: index + 1,
      })),
    });
  }
}

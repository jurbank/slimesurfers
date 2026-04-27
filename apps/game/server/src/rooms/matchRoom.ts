import { Room, type Client } from "@colyseus/core";
import { BOT_EMOTE_LEXICONS, EMOTE_CONFIG, isEmoteId } from "@splat/content/emotes/emoteDefs.ts";
import {
  GAME_CONFIG,
  resolveBotBehaviorProfile,
  type BotConfigEntry,
} from "@splat/content/config/gameConfig.ts";
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

type DepartedEntry = LeaderboardEntry & { playerUuid?: string; isBot?: boolean };

function isEnvFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

function resolveWeaponPickupLayout(): "map" | "cluster" {
  return isEnvFlagEnabled(process.env.CLUSTER_WEAPON_PICKUPS) ? "cluster" : "map";
}

export class MatchRoom extends Room<{ state: GameState }> {
  private simulation = new MatchSimulation(FFA_MODE, { lobbyEnabled: true });
  private emoteSeq = 0;
  private nextBotId = 0;
  private readonly lastEmotePostMs = new Map<string, number>();
  private readonly db = new SupabaseService();
  private readonly playerUuids = new Map<string, string>();
  private readonly departedPlayers = new Map<string, DepartedEntry>();

  onCreate() {
    this.simulation = new MatchSimulation(resolveGameMode(process.env.MATCH_MODE), {
      lobbyEnabled: true,
      seedTestPaint: isEnvFlagEnabled(process.env.SEED_TEST_PAINT),
      weaponPickupLayout: resolveWeaponPickupLayout(),
    });
    this.setState(createRoomState(this.simulation.matchState));
    this.maxClients = NETWORK_CONFIG.rooms.maxPlayers;

    this.onMessage(MessageType.Input, (client: Client, msg: InputMessage) => {
      this.simulation.recordInput(client.sessionId, msg);
    });

    this.onMessage(MessageType.EmotePost, (client: Client, msg: EmotePostMessage) => {
      this.handleEmotePost(client, msg);
    });

    this.evaluateBotPopulation();
    this.setSimulationInterval((dt) => this.tick(dt), this.simulation.tickIntervalMs);
  }

  onJoin(
    client: Client,
    options: { name?: unknown; colorIndex?: unknown; playerUuid?: unknown } = {},
  ) {
    const simPlayer = this.simulation.addPlayer(client.sessionId, options.name, options.colorIndex);
    addSimPlayerToRoomState(this.state, simPlayer);
    this.evaluateBotPopulation();
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
          isBot: sim.isBot,
        });
      }
    }
    this.simulation.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.lastEmotePostMs.delete(client.sessionId);
    this.playerUuids.delete(client.sessionId);
    this.evaluateBotPopulation();
    void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });
  }

  onDispose() {
    for (const player of this.simulation.players.values()) {
      if (player.isBot) {
        this.simulation.removePlayer(player.sessionId);
      }
    }
  }

  private resolveTargetBotPopulation(): number {
    const configuredBotCount =
      GAME_CONFIG.bot.namedBots.length + Math.max(0, GAME_CONFIG.bot.generatedBots.count);
    const parsed = Number.parseInt(
      process.env.TARGET_BOT_POPULATION ??
        String(configuredBotCount > 0 ? configuredBotCount : GAME_CONFIG.bot.targetPopulation),
      10,
    );
    const configured = Number.isFinite(parsed)
      ? parsed
      : configuredBotCount > 0
        ? configuredBotCount
        : GAME_CONFIG.bot.targetPopulation;
    return Math.max(0, Math.min(this.simulation.maxPlayers, configured));
  }

  private pickGeneratedBotTemplate(): BotConfigEntry {
    const mix = GAME_CONFIG.bot.generatedBots.mix;
    if (mix.length === 0) return {};

    const totalWeight = mix.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (totalWeight <= 0) return mix[0] ?? {};

    let roll = Math.random() * totalWeight;
    for (const entry of mix) {
      const weight = Math.max(0, entry.weight);
      if (roll < weight) return entry;
      roll -= weight;
    }

    return mix[mix.length - 1] ?? {};
  }

  private createBotSessionId(): string {
    return `bot-${this.roomId || "room"}-${this.nextBotId++}`;
  }

  private evaluateBotPopulation(): void {
    const players = Array.from(this.simulation.players.values());
    const humanCount = players.filter((p) => !p.isBot).length;
    const botPlayers = players.filter((p) => p.isBot);
    const targetPopulation = this.resolveTargetBotPopulation();
    const targetBotCount =
      this.simulation.matchState.matchPhase === MatchPhase.Ended
        ? 0
        : Math.max(0, targetPopulation - humanCount);
    const desiredNamedCount = Math.min(GAME_CONFIG.bot.namedBots.length, targetBotCount);
    const desiredGeneratedCount = Math.max(0, targetBotCount - desiredNamedCount);

    const existingNamedByIndex = new Map<number, (typeof botPlayers)[number]>();
    const existingGenerated: typeof botPlayers = [];
    for (const bot of botPlayers) {
      if (bot.botOrigin === "named" && typeof bot.botConfigIndex === "number") {
        existingNamedByIndex.set(bot.botConfigIndex, bot);
      } else {
        existingGenerated.push(bot);
      }
    }

    let changed = false;

    for (let index = 0; index < desiredNamedCount; index++) {
      if (existingNamedByIndex.has(index)) continue;
      const config = GAME_CONFIG.bot.namedBots[index] ?? {};
      const botId = this.createBotSessionId();
      const simPlayer = this.simulation.addBot(botId, config.name, {
        profile: resolveBotBehaviorProfile(config),
        emoteTemperament: config.emoteTemperament,
        emoteFrequency: config.emoteFrequency,
        origin: "named",
        configIndex: index,
      });
      addSimPlayerToRoomState(this.state, simPlayer);
      changed = true;
    }

    for (const [index, bot] of existingNamedByIndex) {
      if (index < desiredNamedCount) continue;
      this.simulation.removePlayer(bot.sessionId);
      this.state.players.delete(bot.sessionId);
      changed = true;
    }

    if (existingGenerated.length < desiredGeneratedCount) {
      const botsToAdd = desiredGeneratedCount - existingGenerated.length;
      for (let i = 0; i < botsToAdd; i++) {
        const template = this.pickGeneratedBotTemplate();
        const botId = this.createBotSessionId();
        const simPlayer = this.simulation.addBot(botId, template.name, {
          profile: resolveBotBehaviorProfile(template),
          emoteTemperament: template.emoteTemperament,
          emoteFrequency: template.emoteFrequency,
          origin: "generated",
        });
        addSimPlayerToRoomState(this.state, simPlayer);
      }
      changed = true;
    } else if (existingGenerated.length > desiredGeneratedCount) {
      const botsToRemove = existingGenerated.length - desiredGeneratedCount;
      for (let i = 0; i < botsToRemove; i++) {
        const bot = existingGenerated[i];
        if (!bot) continue;
        this.simulation.removePlayer(bot.sessionId);
        this.state.players.delete(bot.sessionId);
      }
      changed = true;
    }

    if (changed) {
      void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });
    }
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

  private maybePostBotEmotes(dt: number): void {
    if (this.simulation.matchState.matchPhase !== MatchPhase.Active) return;

    const now = Date.now();
    const cooldownMs = EMOTE_CONFIG.postCooldownMs;

    for (const bot of this.simulation.players.values()) {
      if (!bot.isBot || bot.respawnTimer > 0 || !bot.botEmoteTemperament) continue;
      const lastPostMs = this.lastEmotePostMs.get(bot.sessionId) ?? 0;
      if (now - lastPostMs < cooldownMs) continue;

      const frequency = Math.max(0, Math.min(1, bot.botEmoteFrequency ?? 0));
      if (frequency <= 0) continue;
      const chance = frequency * (dt / cooldownMs);
      if (Math.random() >= chance) continue;

      const lexicon = BOT_EMOTE_LEXICONS[bot.botEmoteTemperament];
      if (!lexicon || lexicon.length === 0) continue;

      const emoteCount = Math.random() < 0.2 ? 2 : 1;
      const emoteIds: string[] = [];
      for (let i = 0; i < emoteCount; i++) {
        const choice = lexicon[Math.floor(Math.random() * lexicon.length)];
        if (!choice || emoteIds.includes(choice)) continue;
        emoteIds.push(choice);
      }
      if (emoteIds.length === 0) continue;

      this.lastEmotePostMs.set(bot.sessionId, now);
      this.broadcast(MessageType.EmoteEvents, {
        events: [
          {
            playerId: bot.sessionId,
            emoteIds,
            seq: ++this.emoteSeq,
          },
        ],
      });
    }
  }

  private tick(dt: number): void {
    if (this.simulation.matchState.elapsedMs % 5000 < dt) {
      this.evaluateBotPopulation();
    }
    const result = this.simulation.tick(dt);
    this.maybePostBotEmotes(dt);
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
      isBot: this.simulation.players.get(e.sessionId)?.isBot ?? false,
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
      entries: allEntries
        .filter((entry) => !entry.isBot)
        .map((entry, index) => ({
          ...entry,
          placement: index + 1,
        })),
    });
  }
}

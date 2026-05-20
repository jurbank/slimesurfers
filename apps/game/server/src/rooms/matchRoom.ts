import { readFileSync } from "node:fs";
import { Room, type Client } from "@colyseus/core";
import { EMOTE_CONFIG, isEmoteId } from "@splat/content/emotes/emoteDefs.ts";
import { GAME_CONFIG, resolveConfiguredBotCount } from "@splat/content/config/gameConfig.ts";
import { FFA_MODE, resolveGameMode } from "@splat/content/modes/gameModes.ts";
import {
  DEFAULT_RUNTIME_CEL,
  DEFAULT_RUNTIME_PLANET_RADIUS,
  DEFAULT_RUNTIME_PLANET_TERRAIN,
  DEV_MAP,
  validateRuntimeMapData,
  type RuntimeMapData,
} from "@splat/content/map/runtimeMapData.ts";
import type {
  EmotePostMessage,
  InputMessage,
  JoinOptions,
  MatchModeId,
} from "@splat/protocol/network/clientMessages.ts";
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
  syncRoomWinnerFromSimulation,
  syncRoomStateFromSimulation,
} from "./matchRoomReplication.ts";
import type { LeaderboardEntry } from "@splat/protocol/network/serverMessages.ts";
import { SupabaseService } from "../db/supabaseService.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DepartedEntry = LeaderboardEntry & { playerUuid?: string; isBot?: boolean };

interface MatchRoomCreateOptions {
  devClusterSpawns?: unknown;
  matchMode?: unknown;
  mapData?: unknown;
}

interface LobbyPlayerMetadata {
  name: string;
  isBot: boolean;
  teamId: number;
  colorIndex: number;
  slimeColor: number;
  patternId: number;
}

export interface MatchRoomMetadata {
  devClusterSpawns: boolean;
  matchMode: MatchModeId;
  isTeamBased: boolean;
  takenColorIndices?: number[];
  players: LobbyPlayerMetadata[];
  teamCounts: number[];
  suggestedTeamId?: number;
}

function isEnvFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

function resolveWeaponPickupLayout(): "map" | "cluster" {
  return isEnvFlagEnabled(process.env.CLUSTER_WEAPON_PICKUPS) ? "cluster" : "map";
}

function resolveMatchMode(options: MatchRoomCreateOptions): string | undefined {
  if (typeof options.matchMode === "string") return options.matchMode;
  if (process.env.NODE_ENV !== "production" && options.devClusterSpawns === true) return "dev";
  return "ffa";
}

function toPublicMatchMode(modeId: string): MatchModeId {
  return modeId === "teams" ? "teams" : "ffa";
}

function migrateMapData(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const m = data as Record<string, unknown>;

  if (!Array.isArray(m.planets)) {
    // Old format: per-planet fields lived at the top level of RuntimeMapData.
    // Hoist them into the planets array the new format requires.
    const legacyPlanet = (
      typeof m.planet === "object" && m.planet !== null ? m.planet : {}
    ) as Record<string, unknown>;
    const radius =
      typeof m.radius === "number"
        ? m.radius
        : typeof legacyPlanet.radius === "number"
          ? legacyPlanet.radius
          : DEFAULT_RUNTIME_PLANET_RADIUS;
    const center =
      typeof m.center === "object" && m.center !== null
        ? m.center
        : typeof legacyPlanet.center === "object" && legacyPlanet.center !== null
          ? legacyPlanet.center
          : { x: 0, y: 0, z: 0 };
    const terrain = (
      typeof m.terrain === "object" && m.terrain !== null ? m.terrain : {}
    ) as Record<string, unknown>;
    if (typeof terrain.icosahedronDetail !== "number") {
      terrain.icosahedronDetail = DEFAULT_RUNTIME_PLANET_TERRAIN.icosahedronDetail;
    }
    m.planets = [
      {
        id: "planet-0",
        center,
        radius,
        terrain,
        colors: m.colors ?? {},
        atmosphere: m.atmosphere ?? {},
        lighting: m.lighting ?? {},
        props: m.props ?? {},
        hasWater: typeof m.hasWater === "boolean" ? m.hasWater : true,
        ...(Array.isArray(m.terrainFeatures) ? { terrainFeatures: m.terrainFeatures } : {}),
      },
    ];
  } else {
    // New format: apply icosahedronDetail backfill per planet.
    for (const planet of m.planets) {
      if (typeof planet !== "object" || planet === null) continue;
      const p = planet as Record<string, unknown>;
      if (typeof p.terrain === "object" && p.terrain !== null) {
        const t = p.terrain as Record<string, unknown>;
        if (typeof t.icosahedronDetail !== "number") {
          t.icosahedronDetail = DEFAULT_RUNTIME_PLANET_TERRAIN.icosahedronDetail;
        }
      }
    }
  }

  if (typeof m.cel !== "object" || m.cel === null) {
    m.cel = {
      bands: DEFAULT_RUNTIME_CEL.bands,
      softness: DEFAULT_RUNTIME_CEL.softness,
      hatchStrength: DEFAULT_RUNTIME_CEL.hatchStrength,
      hatchScale: DEFAULT_RUNTIME_CEL.hatchScale,
    };
  }

  return data;
}

function resolveMap(options: MatchRoomCreateOptions): RuntimeMapData {
  if (options.mapData != null) {
    const migrated = migrateMapData(options.mapData);
    const result = validateRuntimeMapData(migrated);
    if (!result.valid) {
      throw new Error(
        `Invalid mapData option: ${result.errors.map((e) => `${e.field}: ${e.message}`).join(", ")}`,
      );
    }
    return migrated as RuntimeMapData;
  }

  const mapFile = process.env.MAP_FILE;
  if (mapFile) {
    const raw = readFileSync(mapFile, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const migrated = migrateMapData(parsed);
    const result = validateRuntimeMapData(migrated);
    if (!result.valid) {
      throw new Error(
        `Invalid MAP_FILE "${mapFile}": ${result.errors.map((e) => `${e.field}: ${e.message}`).join(", ")}`,
      );
    }
    return migrated as RuntimeMapData;
  }

  return DEV_MAP;
}

export class MatchRoom extends Room<{ state: GameState; metadata: MatchRoomMetadata }> {
  private simulation = new MatchSimulation(FFA_MODE, DEV_MAP, { lobbyEnabled: true });
  private map: RuntimeMapData = DEV_MAP;
  private emoteSeq = 0;
  private nextBotId = 0;
  private devClusterSpawns = false;
  private readonly db = new SupabaseService();
  private readonly playerUuids = new Map<string, string>();
  private readonly departedPlayers = new Map<string, DepartedEntry>();

  onCreate(options: MatchRoomCreateOptions = {}) {
    this.devClusterSpawns =
      process.env.NODE_ENV !== "production" && options.devClusterSpawns === true;
    this.map = resolveMap(options);
    this.simulation = new MatchSimulation(resolveGameMode(resolveMatchMode(options)), this.map, {
      lobbyEnabled: true,
      seedTestSlime: isEnvFlagEnabled(process.env.SEED_TEST_SLIME),
      weaponPickupLayout: resolveWeaponPickupLayout(),
    });
    this.setState(createRoomState(this.simulation.matchState, this.simulation.mode));
    void this.updateRoomMetadata();
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

  onJoin(client: Client, options: JoinOptions = {}) {
    const simPlayer = this.simulation.addPlayer(
      client.sessionId,
      options.name,
      options.colorIndex,
      options.teamId,
    );
    addSimPlayerToRoomState(this.state, simPlayer);
    this.evaluateBotPopulation();
    void this.updateRoomMetadata();

    if (typeof options.playerUuid === "string" && UUID_RE.test(options.playerUuid)) {
      this.playerUuids.set(client.sessionId, options.playerUuid);
    }

    client.send(MessageType.MapData, {
      mapId: this.map.mapId,
      name: this.map.name,
      cel: this.map.cel,
      planets: this.map.planets.map((planet) => ({
        ...planet,
        terrainFeatures: planet.terrainFeatures ?? [],
      })),
      rails: this.map.rails,
    });

    const bootstrap = buildJoinBootstrap(this.simulation);
    if (bootstrap.slimeStamps.length > 0) {
      client.send(MessageType.SlimeStamps, { stamps: [...bootstrap.slimeStamps] });
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
          slimeGroupId: sim.slimeGroupId,
          slimeColor: sim.slimeColor,
          patternId: sim.patternId,
          slimeScore: sim.slimeScore,
          killCount: sim.killCount,
          deathCount: sim.deathCount,
          playerUuid: this.playerUuids.get(client.sessionId),
          isBot: sim.isBot,
        });
      }
    }
    this.simulation.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.playerUuids.delete(client.sessionId);
    this.evaluateBotPopulation();
    void this.updateRoomMetadata();
  }

  onDispose() {
    for (const player of this.simulation.players.values()) {
      if (player.isBot) {
        this.simulation.removePlayer(player.sessionId);
      }
    }
  }

  private resolveTargetBotPopulation(): number {
    const configuredBotCount = resolveConfiguredBotCount();
    const parsed = Number.parseInt(
      process.env.TARGET_BOT_POPULATION ?? String(configuredBotCount),
      10,
    );
    const configured = Number.isFinite(parsed) ? parsed : configuredBotCount;
    const targetPopulation =
      this.simulation.mode.isTeamBased && this.simulation.mode.teamCount > 1
        ? Math.ceil(Math.max(0, configured) / this.simulation.mode.teamCount) *
          this.simulation.mode.teamCount
        : configured;
    return Math.max(0, Math.min(this.simulation.maxPlayers, targetPopulation));
  }

  private createBotSessionId(): string {
    return `bot-${this.roomId || "room"}-${this.nextBotId++}`;
  }

  private updateRoomMetadata(): Promise<void> {
    const teamCounts = this.simulation.buildTeamCounts();
    return this.setMetadata({
      devClusterSpawns: this.devClusterSpawns,
      matchMode: toPublicMatchMode(this.simulation.mode.id),
      isTeamBased: this.simulation.mode.isTeamBased,
      takenColorIndices: this.simulation.takenColorIndices(),
      players: Array.from(this.simulation.players.values()).map((player) => ({
        name: player.name,
        isBot: player.isBot,
        teamId: player.teamId,
        colorIndex: player.paletteIndex,
        slimeColor: player.slimeColor,
        patternId: player.patternId,
      })),
      teamCounts,
      suggestedTeamId: this.simulation.mode.isTeamBased
        ? this.resolveSuggestedTeamId(teamCounts)
        : undefined,
    });
  }

  private resolveSuggestedTeamId(teamCounts: readonly number[]): number | undefined {
    if (teamCounts.length === 0) return undefined;
    let suggested = 0;
    for (let teamId = 1; teamId < teamCounts.length; teamId++) {
      if ((teamCounts[teamId] ?? 0) < (teamCounts[suggested] ?? 0)) suggested = teamId;
    }
    return suggested;
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

    let changed = false;

    if (botPlayers.length > targetBotCount) {
      const toRemove = this.simulation.selectBotsToRemove(botPlayers.length - targetBotCount);
      for (const bot of toRemove) {
        this.simulation.removePlayer(bot.sessionId);
        this.state.players.delete(bot.sessionId);
      }
      changed = toRemove.length > 0;
      if (changed) void this.updateRoomMetadata();
      return;
    }

    const existingNamedByIndex = new Map<number, (typeof botPlayers)[number]>();
    for (const bot of botPlayers) {
      if (bot.botOrigin === "named" && typeof bot.botConfigIndex === "number") {
        existingNamedByIndex.set(bot.botConfigIndex, bot);
      }
    }

    let botCount = botPlayers.length;
    for (
      let index = 0;
      index < GAME_CONFIG.bot.namedBots.length && botCount < targetBotCount;
      index++
    ) {
      if (existingNamedByIndex.has(index)) continue;
      const simPlayer = this.simulation.addNamedBot(this.createBotSessionId(), index);
      addSimPlayerToRoomState(this.state, simPlayer);
      botCount++;
      changed = true;
    }

    while (botCount < targetBotCount) {
      const simPlayer = this.simulation.addGeneratedBot(this.createBotSessionId());
      addSimPlayerToRoomState(this.state, simPlayer);
      botCount++;
      changed = true;
    }

    if (changed) {
      void this.updateRoomMetadata();
    }
  }

  private handleEmotePost(client: Client, msg: EmotePostMessage): void {
    if (!this.state.players.has(client.sessionId)) return;
    if (!Array.isArray(msg.emoteIds)) return;
    if (msg.emoteIds.length > EMOTE_CONFIG.maxPostPayloadIds) return;
    if (!this.simulation.tryPostEmote(client.sessionId, Date.now())) return;

    const emoteIds: string[] = [];
    for (const emoteId of msg.emoteIds) {
      if (typeof emoteId !== "string" || !isEmoteId(emoteId)) continue;
      if (emoteIds.includes(emoteId)) continue;
      emoteIds.push(emoteId);
      if (emoteIds.length >= EMOTE_CONFIG.maxSelected) break;
    }
    if (emoteIds.length === 0) return;

    this.broadcast(MessageType.EmoteEvents, {
      events: [{ playerId: client.sessionId, emoteIds, seq: ++this.emoteSeq }],
    });
  }

  private tick(dt: number): void {
    if (this.simulation.matchState.elapsedMs % 5000 < dt) {
      this.evaluateBotPopulation();
    }
    const result = this.simulation.tick(dt);

    for (const event of this.simulation.drainBotEmoteEvents(dt, Date.now())) {
      this.broadcast(MessageType.EmoteEvents, {
        events: [{ ...event, seq: ++this.emoteSeq }],
      });
    }

    syncRoomStateFromSimulation(this.state, this.simulation.matchState);
    syncRoomWinnerFromSimulation(this.state, this.simulation);

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
    if (broadcasts.slimeStamps.length > 0) {
      this.broadcast(MessageType.SlimeStamps, { stamps: broadcasts.slimeStamps });
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
        b.slimeScore - a.slimeScore ||
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

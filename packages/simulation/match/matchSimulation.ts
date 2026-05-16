import {
  FFA_MODE,
  type AssignedPlayerSlot,
  type GameModeDefinition,
} from "@splat/content/modes/gameModes.ts";
import { DEFAULT_WEAPON_ID, type WeaponPickupLayout } from "@splat/content/combat/weaponDefs.ts";
import {
  GAME_CONFIG,
  getSlimeStampChordRadius,
  getPlanetSurfaceChordRadius,
  getSlimeTerritoryDimensions,
  resolveBotBehaviorProfile,
  resolveBotEmoteFrequency,
  resolveBotEmoteTemperament,
  type BotBehaviorProfile,
  type BotConfigEntry,
} from "@splat/content/config/gameConfig.ts";
import {
  BOT_EMOTE_LEXICONS,
  EMOTE_CONFIG,
  type BotEmoteTemperament,
} from "@splat/content/emotes/emoteDefs.ts";
import {
  DEV_MAP,
  type RuntimeMapData,
  type RuntimeMapPlanet,
} from "@splat/content/map/runtimeMapData.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  KillEventMessage,
  LeaderboardEntry,
  LeaderboardMessage,
  SlimeStampMessage,
  SnapshotMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import {
  rechargePlayerSlime,
  tickProjectiles,
  tryFireHitscan,
  tryFireProjectile,
  type CombatConfig,
} from "../combat/projectiles.ts";
import {
  collectWeaponPickup,
  createWeaponPickups,
  tickWeaponPickups,
} from "../combat/weaponPickups.ts";
import {
  collectHealthPickup,
  createHealthPickups,
  tickHealthPickups,
} from "../combat/healthPickups.ts";
import { stepPlayer, type PlanetData, type StepConfig } from "../movement/simulatedMovement.ts";
import { buildComputedRail, type ComputedRail, sampleRailAt } from "../movement/railSpline.ts";
import { appendSlimeStamp, createStampBuckets } from "../slime/slimeDetection.ts";
import { applySlimeImpact } from "../slime/stampSlime.ts";
import { createTerritoryCells } from "../slime/territoryGrid.ts";
import { generateBotInput, removeBotState } from "../ai/botController.ts";
import { RAIL_SLIME_NODES } from "@splat/protocol/schemas/slimedState.ts";
import {
  isTrickMovementState,
  processAirTricks,
  settleAirTricksOnLanding,
} from "../tricks/airTricks.ts";
import { cleanName } from "@splat/content/utils/profanity.ts";
import { generateGuestPlayerName } from "@splat/content/utils/guestPlayerNames.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type BotOrigin,
  type SimMatchState,
  type SimPlanetSlimeState,
  type SimPlayerState,
} from "./simState.ts";
import { selectSpawnSurface } from "./spawnSelection.ts";

const TICK_MS = 1000 / NETWORK_CONFIG.simulation.tickRateHz;
const SNAPSHOT_EVERY =
  NETWORK_CONFIG.simulation.tickRateHz / NETWORK_CONFIG.simulation.snapshotRateHz;
const LEADERBOARD_EVERY =
  NETWORK_CONFIG.simulation.tickRateHz / NETWORK_CONFIG.simulation.leaderboardRateHz;

const TICK_DT_SEC = TICK_MS / 1000;
const ALLOWED_INPUT_KEYS =
  InputKey.Forward |
  InputKey.Backward |
  InputKey.Left |
  InputKey.Right |
  InputKey.Anchor |
  InputKey.Fire |
  InputKey.Submerge;
const MAX_LOCKED_TARGET_ID_LENGTH = 128;

function buildPlanets(map: RuntimeMapData): PlanetData[] {
  return map.planets.map((p) => ({
    id: p.id,
    center: { x: p.center.x, y: p.center.y, z: p.center.z },
    radius: p.radius,
  }));
}

function buildStepConfig(map: RuntimeMapData, planet = map.planets[0]!): StepConfig {
  return {
    planet: { radius: planet.radius },
    terrain: planet.terrain,
    movement: GAME_CONFIG.movement,
    rail: GAME_CONFIG.rail,
  };
}

function buildRails(map: RuntimeMapData): ComputedRail[] {
  const cfg = buildStepConfig(map);
  return map.rails.map((def) => {
    const planet = map.planets.find((p) => p.id === def.planetId) ?? map.planets[0]!;
    return buildComputedRail(def, planet.center, cfg);
  });
}

// Used when no client input has arrived for a player this tick.
const IDLE_INPUT: InputMessage = {
  seq: 0,
  keys: 0,
  aimDir: { x: 0, y: 0, z: 1 },
  dt: TICK_DT_SEC,
};

export interface TickResult {
  shouldBroadcastLeaderboard: boolean;
  shouldBroadcastMatchPhase: boolean;
  shouldBroadcastSnapshot: boolean;
}

function isPlayerShooting(player: SimPlayerState, nowMs: number): boolean {
  return nowMs - player.lastFireTimeMs <= GAME_CONFIG.player.shootingRevealDurationMs;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteVec3(value: unknown): InputMessage["aimDir"] | null {
  if (!isPlainRecord(value)) return null;
  const { x, y, z } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }
  return { x, y, z };
}

function parseInputKeys(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value & ALLOWED_INPUT_KEYS;
}

function sanitizeInputMessage(value: unknown): InputMessage | null {
  if (!isPlainRecord(value)) return null;

  const seq = value.seq;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq <= 0) return null;

  const keys = parseInputKeys(value.keys);
  if (keys === null) return null;

  const aimDir = parseFiniteVec3(value.aimDir);
  if (!aimDir) return null;

  const rawDt = value.dt;
  if (typeof rawDt !== "number" || !Number.isFinite(rawDt) || rawDt < 0) return null;

  const input: InputMessage = {
    seq,
    keys,
    aimDir,
    dt: Math.min(rawDt, TICK_DT_SEC),
  };

  const pressedKeys = parseInputKeys(value.pressedKeys);
  if (pressedKeys !== null) {
    input.pressedKeys = pressedKeys;
  }

  const aimPoint = parseFiniteVec3(value.aimPoint);
  if (aimPoint) {
    input.aimPoint = aimPoint;
  }

  if (typeof value.lockedTargetId === "string") {
    input.lockedTargetId = value.lockedTargetId.slice(0, MAX_LOCKED_TARGET_ID_LENGTH);
  }

  if (value.guaranteedHoming === true) {
    input.guaranteedHoming = true;
  }

  if (typeof value.chargeProgress === "number" && Number.isFinite(value.chargeProgress)) {
    input.chargeProgress = Math.max(0, Math.min(1, value.chargeProgress));
  }

  return input;
}

function createSimPlanetState(planet: RuntimeMapPlanet): SimPlanetSlimeState {
  const { rows, cols } = getSlimeTerritoryDimensions(planet.radius);
  return {
    planetId: planet.id,
    territoryRows: rows,
    territoryCols: cols,
    cells: createTerritoryCells(rows, cols),
    stamps: [],
    stampBuckets: createStampBuckets(rows, cols),
  };
}

function seedTestSlime(simState: SimMatchState, mode: GameModeDefinition): void {
  const planet = simState.planets.get("planet-0");
  if (!planet) return;
  const planetDef = simState.planetDefs.find((p) => p.id === planet.planetId);
  if (!planetDef) return;
  const largeSeedSurfaceRadius = 50 * (2 * Math.asin(1.15 * 0.5));
  const mediumSeedSurfaceRadius = 50 * (2 * Math.asin(0.55 * 0.5));
  const seedColors = mode.isTeamBased ? mode.teamColors : GAME_CONFIG.match.ffaColors;

  const stamps = [
    {
      slimeGroupId: 0,
      color: seedColors[0] ?? 0x00e5ff,
      patternId: 0,
      nx: 0,
      ny: 1,
      nz: 0,
      radius: getPlanetSurfaceChordRadius(largeSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
    {
      slimeGroupId: 1,
      color: seedColors[1] ?? 0xff6200,
      patternId: 0,
      nx: 0,
      ny: -1,
      nz: 0,
      radius: getPlanetSurfaceChordRadius(largeSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
    {
      slimeGroupId: 1,
      color: seedColors[1] ?? 0xff6200,
      patternId: 0,
      nx: 0.55,
      ny: 0.55,
      nz: 0.62,
      radius: getPlanetSurfaceChordRadius(mediumSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
    {
      slimeGroupId: 0,
      color: seedColors[0] ?? 0x00e5ff,
      patternId: 0,
      nx: -0.5,
      ny: -0.45,
      nz: -0.74,
      radius: getPlanetSurfaceChordRadius(mediumSeedSurfaceRadius, planetDef.radius),
      seq: ++simState.slimeSeq,
    },
  ] as const;

  for (const stamp of stamps) {
    appendSlimeStamp(planet, stamp);
  }
}

function createSimMatchState(
  mode: GameModeDefinition,
  seedSlime: boolean,
  lobbyEnabled: boolean,
  weaponPickupLayout: WeaponPickupLayout,
  planetDefs: RuntimeMapPlanet[],
  rails: ComputedRail[],
  stepCfg: StepConfig,
): SimMatchState {
  const pickupCfg = { ...GAME_CONFIG, planet: stepCfg.planet, terrain: stepCfg.terrain };
  const simState: SimMatchState = {
    players: new Map(),
    planetDefs,
    mapTerrain: stepCfg.terrain,
    planets: new Map(planetDefs.map((planet) => [planet.id, createSimPlanetState(planet)])),
    railStates: new Map(
      rails.map((rail, idx) => [
        idx,
        {
          railId: idx,
          nodes: Array(RAIL_SLIME_NODES).fill(0xffffff),
        },
      ]),
    ),
    projectiles: new Map(),
    pickups: createWeaponPickups(pickupCfg, weaponPickupLayout, planetDefs),
    healthPickups: createHealthPickups(pickupCfg, planetDefs),
    matchPhase: lobbyEnabled ? MatchPhase.Lobby : MatchPhase.Active,
    matchTimer: lobbyEnabled ? 0 : GAME_CONFIG.match.durationSeconds,
    slimeSeq: 0,
    trickSeq: 0,
    scores: new Map(),
    elapsedMs: 0,
    nextProjectileId: 0,
  };
  if (seedSlime) {
    seedTestSlime(simState, mode);
  }
  return simState;
}

export interface MatchSimulationOptions {
  seedTestSlime?: boolean;
  lobbyEnabled?: boolean;
  weaponPickupLayout?: WeaponPickupLayout;
}

function createSimPlayer(
  sessionId: string,
  isBot: boolean,
  playerIndex: number,
  name: unknown,
  paletteIndex: number,
  mode: GameModeDefinition,
  existingPlayers: Iterable<SimPlayerState>,
  planetDefs: RuntimeMapPlanet[],
  botOptions?: {
    profile?: Partial<BotBehaviorProfile>;
    emoteTemperament?: BotEmoteTemperament;
    emoteFrequency?: number;
    origin?: BotOrigin;
    configIndex?: number;
  },
  assignedSlot?: AssignedPlayerSlot,
): SimPlayerState {
  const slot = { ...(assignedSlot ?? mode.assignPlayerSlot(playerIndex)), paletteIndex };
  const spawn = selectSpawnSurface(
    mode,
    existingPlayers,
    { playerIndex, teamId: slot.teamId },
    sessionId,
    planetDefs,
  );
  const planetPos = planetDefs.find((planet) => planet.id === spawn.planetId) ?? planetDefs[0]!;
  const cleanedName = cleanName(name, generateGuestPlayerName(playerIndex));
  const resolvedName = isBot && !cleanedName.endsWith(" Bot") ? `${cleanedName} Bot` : cleanedName;

  return {
    sessionId,
    isBot,
    name: resolvedName,
    botProfile: isBot ? resolveBotBehaviorProfile(botOptions?.profile) : undefined,
    botEmoteTemperament: isBot
      ? resolveBotEmoteTemperament(botOptions?.emoteTemperament)
      : undefined,
    botEmoteFrequency: isBot ? resolveBotEmoteFrequency(botOptions?.emoteFrequency) : undefined,
    botOrigin: isBot ? botOptions?.origin : undefined,
    botConfigIndex: isBot ? botOptions?.configIndex : undefined,
    teamId: slot.teamId,
    slimeGroupId: slot.slimeGroupId,
    paletteIndex: slot.paletteIndex,
    patternId: mode.slots[slot.paletteIndex]?.patternId ?? 0,
    slimeColor: mode.slots[slot.paletteIndex]?.color ?? 0xffffff,
    pos: {
      x: spawn.surfacePos.x,
      y: spawn.surfacePos.y,
      z: spawn.surfacePos.z,
    },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: planetPos.id,
    spawnPlanetId: planetPos.id,
    spawnNormal: { ...spawn.normal },
    movementState: PlayerMovementState.Idle,
    surfState: PlayerSurfState.SurfingVisible,
    isCarving: false,
    skiJumpCharge: 0,
    grindRailId: -1,
    grindT: 0,
    lastGrindT: 0,
    grindSpeed: 0,
    grindCooldownMs: 0,
    isOnFriendlySlime: false,
    inputSeq: 0,
    airTrickCombo: 0,
    airTrickAirTimeMs: 0,
    airTrickInputSequence: [],
    airTrickInputAgeMs: 0,
    lastAirTrickTimeMs: -Infinity,
    airTrickSpinDegrees: 0,
    airTrickSpinMilestoneIndex: 0,
    airTrickSpinBlocked: false,
    airTrickFlipDegrees: 0,
    airTrickFrontFlipMilestoneIndex: 0,
    airTrickBackFlipMilestoneIndex: 0,
    airTrickFlipBlocked: false,
    airTrickSlimeMultiplier: 1,
    equippedWeaponId: DEFAULT_WEAPON_ID,
    disposableShotsRemaining: 0,
    health: GAME_CONFIG.player.maxHealth,
    slimeLevel: GAME_CONFIG.slime.maxLevel,
    slimeScore: 0,
    killCount: 0,
    deathCount: 0,
    respawnTimer: 0,
    lastFireTimeMs: -1000,
    weaponTriggerHeldSinceMs: -1,
  };
}

export class MatchSimulation {
  readonly mode: GameModeDefinition;
  private readonly planets: PlanetData[];
  private readonly rails: ComputedRail[];
  private readonly stepCfg: StepConfig;
  private readonly stepCfgs: Map<string, StepConfig>;
  private readonly simState: SimMatchState;
  private readonly inputQueues = new Map<string, InputMessage[]>();
  private readonly recentSlimeStamps = new Map<string, SlimeStampMessage[]>();
  private readonly pendingSlimeStamps: SlimeStampMessage[] = [];
  private readonly pendingTrickEvents: TrickEventMessage[] = [];
  private readonly pendingKillEvents: KillEventMessage[] = [];
  private playerCount = 0;
  private tickCount = 0;
  private killSeq = 0;
  private readonly lastEmotePostMs = new Map<string, number>();

  constructor(
    mode: GameModeDefinition = FFA_MODE,
    map: RuntimeMapData = DEV_MAP,
    options: MatchSimulationOptions = {},
  ) {
    this.mode = mode;
    this.planets = buildPlanets(map);
    this.stepCfg = buildStepConfig(map);
    this.stepCfgs = new Map(map.planets.map((planet) => [planet.id, buildStepConfig(map, planet)]));
    this.rails = buildRails(map);
    this.simState = createSimMatchState(
      mode,
      options.seedTestSlime ?? false,
      options.lobbyEnabled ?? false,
      options.weaponPickupLayout ?? "map",
      map.planets,
      this.rails,
      this.stepCfg,
    );
  }

  get players(): ReadonlyMap<string, SimPlayerState> {
    return this.simState.players;
  }

  get matchState(): SimMatchState {
    return this.simState;
  }

  get tickIntervalMs(): number {
    return TICK_MS;
  }

  get maxPlayers(): number {
    return NETWORK_CONFIG.rooms.maxPlayers;
  }

  private getStepConfig(planetId: string): StepConfig {
    return this.stepCfgs.get(planetId) ?? this.stepCfg;
  }

  private getGameplayConfig(planetId: string): CombatConfig {
    const stepCfg = this.getStepConfig(planetId);
    return { ...GAME_CONFIG, planet: stepCfg.planet, terrain: stepCfg.terrain };
  }

  takenColorIndices(): number[] {
    return Array.from(this.simState.players.values()).map((p) => p.paletteIndex);
  }

  private resolveBalancedSlot(playerIndex: number, requestedTeamId?: unknown): AssignedPlayerSlot {
    if (!this.mode.isTeamBased || this.mode.teamCount === 0) {
      return this.mode.assignPlayerSlot(playerIndex);
    }
    if (
      typeof requestedTeamId === "number" &&
      Number.isSafeInteger(requestedTeamId) &&
      requestedTeamId >= 0 &&
      requestedTeamId < this.mode.teamCount
    ) {
      return { teamId: requestedTeamId, slimeGroupId: requestedTeamId };
    }
    const counts: number[] = [];
    for (let t = 0; t < this.mode.teamCount; t++) counts.push(0);
    for (const player of this.simState.players.values()) {
      if (player.teamId >= 0 && player.teamId < this.mode.teamCount) {
        counts[player.teamId] = (counts[player.teamId] ?? 0) + 1;
      }
    }
    let smallestTeam = 0;
    for (let t = 1; t < this.mode.teamCount; t++) {
      if (counts[t]! < counts[smallestTeam]!) smallestTeam = t;
    }
    return { teamId: smallestTeam, slimeGroupId: smallestTeam };
  }

  private resolvePaletteIndex(
    playerIndex: number,
    requestedColorIndex: unknown,
    assignedTeamId: number,
  ): number {
    const taken = new Set(this.takenColorIndices());
    const paletteLen = this.mode.slots.length;
    const requestedPaletteIndex =
      !this.mode.isTeamBased &&
      typeof requestedColorIndex === "number" &&
      Number.isSafeInteger(requestedColorIndex)
        ? requestedColorIndex
        : null;
    const matchesTeam = (paletteIndex: number): boolean =>
      !this.mode.isTeamBased || this.mode.slots[paletteIndex]?.teamId === assignedTeamId;

    if (
      requestedPaletteIndex !== null &&
      requestedPaletteIndex >= 0 &&
      requestedPaletteIndex < paletteLen &&
      !taken.has(requestedPaletteIndex) &&
      matchesTeam(requestedPaletteIndex)
    ) {
      return requestedPaletteIndex;
    }

    for (let i = 0; i < paletteLen; i++) {
      const idx = (playerIndex + i) % paletteLen;
      if (!taken.has(idx) && matchesTeam(idx)) return idx;
    }

    for (let i = 0; i < paletteLen; i++) {
      const idx = (playerIndex + i) % paletteLen;
      if (!taken.has(idx)) return idx;
    }

    return playerIndex % paletteLen;
  }

  addPlayer(
    sessionId: string,
    name?: unknown,
    requestedColorIndex?: unknown,
    requestedTeamId?: unknown,
  ): SimPlayerState {
    const playerIndex = this.playerCount++;
    const assignedSlot = this.resolveBalancedSlot(playerIndex, requestedTeamId);
    const paletteIndex = this.resolvePaletteIndex(
      playerIndex,
      requestedColorIndex,
      assignedSlot.teamId,
    );
    const player = createSimPlayer(
      sessionId,
      false,
      playerIndex,
      name,
      paletteIndex,
      this.mode,
      this.simState.players.values(),
      this.simState.planetDefs,
      undefined,
      assignedSlot,
    );
    this.simState.players.set(sessionId, player);
    this.inputQueues.set(sessionId, []);
    return player;
  }

  addBot(
    sessionId: string,
    name?: unknown,
    botOptions?: {
      profile?: Partial<BotBehaviorProfile>;
      emoteTemperament?: BotEmoteTemperament;
      emoteFrequency?: number;
      origin?: BotOrigin;
      configIndex?: number;
    },
  ): SimPlayerState {
    const playerIndex = this.playerCount++;
    const assignedSlot = this.resolveBalancedSlot(playerIndex);
    const paletteIndex = this.resolvePaletteIndex(playerIndex, null, assignedSlot.teamId);
    const player = createSimPlayer(
      sessionId,
      true,
      playerIndex,
      name ?? generateGuestPlayerName(playerIndex),
      paletteIndex,
      this.mode,
      this.simState.players.values(),
      this.simState.planetDefs,
      botOptions,
      assignedSlot,
    );
    this.simState.players.set(sessionId, player);
    return player;
  }

  addNamedBot(sessionId: string, configIndex: number): SimPlayerState {
    const config = GAME_CONFIG.bot.namedBots[configIndex] ?? {};
    return this.addBot(sessionId, config.name, {
      profile: resolveBotBehaviorProfile(config),
      emoteTemperament: config.emoteTemperament,
      emoteFrequency: config.emoteFrequency,
      origin: "named",
      configIndex,
    });
  }

  addGeneratedBot(sessionId: string): SimPlayerState {
    const template = this.pickGeneratedBotTemplate();
    return this.addBot(sessionId, template.name, {
      profile: resolveBotBehaviorProfile(template),
      emoteTemperament: template.emoteTemperament,
      emoteFrequency: template.emoteFrequency,
      origin: "generated",
    });
  }

  removePlayer(sessionId: string): void {
    this.simState.players.delete(sessionId);
    this.inputQueues.delete(sessionId);
    this.lastEmotePostMs.delete(sessionId);
    removeBotState(sessionId);
  }

  getRecentSlimeStamps(): readonly SlimeStampMessage[] {
    const messages: SlimeStampMessage[] = [];
    this.simState.planets.forEach((planet) => {
      for (const stamp of planet.stamps) {
        messages.push({ planetId: planet.planetId, ...stamp });
      }
    });
    messages.sort((a, b) => a.seq - b.seq);
    return messages;
  }

  buildTeamCounts(): number[] {
    if (!this.mode.isTeamBased || this.mode.teamCount === 0) return [];
    const counts = Array.from({ length: this.mode.teamCount }, () => 0);
    for (const player of this.simState.players.values()) {
      if (player.teamId >= 0 && player.teamId < counts.length) {
        counts[player.teamId] = (counts[player.teamId] ?? 0) + 1;
      }
    }
    return counts;
  }

  selectBotsToRemove(count: number): SimPlayerState[] {
    const bots = Array.from(this.simState.players.values()).filter((p) => p.isBot);
    const selected: SimPlayerState[] = [];
    const remaining = [...bots];
    for (let i = 0; i < count; i++) {
      let bestIndex = 0;
      let bestScore = Infinity;
      for (let index = 0; index < remaining.length; index++) {
        const candidate = remaining[index];
        if (!candidate) continue;
        const score = this.scoreBotRemoval(candidate, remaining, selected);
        if (score < bestScore) {
          bestIndex = index;
          bestScore = score;
        }
      }
      const [removed] = remaining.splice(bestIndex, 1);
      if (removed) selected.push(removed);
    }
    return selected;
  }

  private scoreBotRemoval(
    candidate: SimPlayerState,
    remainingBots: readonly SimPlayerState[],
    alreadySelected: readonly SimPlayerState[],
  ): number {
    if (!this.mode.isTeamBased || this.mode.teamCount <= 1) {
      return candidate.botOrigin === "generated" ? 0 : 1;
    }
    const counts = this.buildTeamCounts();
    const decrement = (teamId: number): void => {
      if (teamId >= 0 && teamId < counts.length) {
        counts[teamId] = Math.max(0, (counts[teamId] ?? 0) - 1);
      }
    };
    for (const bot of alreadySelected) decrement(bot.teamId);
    decrement(candidate.teamId);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const originPenalty = candidate.botOrigin === "generated" ? 0 : 0.01;
    const sameTeamBotsAfterRemoval = remainingBots.filter(
      (bot) => bot !== candidate && bot.teamId === candidate.teamId,
    ).length;
    return (max - min) * 100 + originPenalty - sameTeamBotsAfterRemoval * 0.001;
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

  tryPostEmote(sessionId: string, nowMs: number): boolean {
    const lastPostMs = this.lastEmotePostMs.get(sessionId) ?? 0;
    if (nowMs - lastPostMs < EMOTE_CONFIG.postCooldownMs) return false;
    this.lastEmotePostMs.set(sessionId, nowMs);
    return true;
  }

  drainBotEmoteEvents(dtMs: number, nowMs: number): { playerId: string; emoteIds: string[] }[] {
    if (this.simState.matchPhase !== MatchPhase.Active) return [];
    const events: { playerId: string; emoteIds: string[] }[] = [];
    const cooldownMs = EMOTE_CONFIG.postCooldownMs;
    for (const bot of this.simState.players.values()) {
      if (!bot.isBot || bot.respawnTimer > 0 || !bot.botEmoteTemperament) continue;
      const lastPostMs = this.lastEmotePostMs.get(bot.sessionId) ?? 0;
      if (nowMs - lastPostMs < cooldownMs) continue;
      const frequency = Math.max(0, Math.min(1, bot.botEmoteFrequency ?? 0));
      if (frequency <= 0) continue;
      const chance = frequency * (dtMs / cooldownMs);
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
      this.lastEmotePostMs.set(bot.sessionId, nowMs);
      events.push({ playerId: bot.sessionId, emoteIds });
    }
    return events;
  }

  drainSlimeStampMessages(): SlimeStampMessage[] {
    return this.pendingSlimeStamps.splice(0, this.pendingSlimeStamps.length);
  }

  drainTrickEventMessages(): TrickEventMessage[] {
    return this.pendingTrickEvents.splice(0, this.pendingTrickEvents.length);
  }

  drainKillEventMessages(): KillEventMessage[] {
    return this.pendingKillEvents.splice(0, this.pendingKillEvents.length);
  }

  private resetMatchState(): void {
    for (const [id, planet] of this.simState.planets) {
      const { territoryRows: rows, territoryCols: cols } = planet;
      this.simState.planets.set(id, {
        ...planet,
        cells: createTerritoryCells(rows, cols),
        stamps: [],
        stampBuckets: createStampBuckets(rows, cols),
      });
    }
    for (const railState of this.simState.railStates.values()) {
      railState.nodes.fill(0xffffff);
    }
    this.simState.scores.clear();
    this.recentSlimeStamps.clear();
    this.simState.projectiles.clear();
    this.simState.players.forEach((player) => {
      player.slimeScore = 0;
      player.killCount = 0;
      player.deathCount = 0;
    });
  }

  private recordSlimeStamp(message: SlimeStampMessage): void {
    this.pendingSlimeStamps.push(message);

    const planetMessages = this.recentSlimeStamps.get(message.planetId) ?? [];
    planetMessages.push(message);
    if (planetMessages.length > GAME_CONFIG.slimeStamp.maxVisualStampsPerPlanet) {
      planetMessages.splice(
        0,
        planetMessages.length - GAME_CONFIG.slimeStamp.maxVisualStampsPerPlanet,
      );
    }
    this.recentSlimeStamps.set(message.planetId, planetMessages);
  }

  private maybeStampRailCorridor(player: SimPlayerState, prevGrindId: number): void {
    if (player.grindRailId === -1 || player.grindRailId !== prevGrindId) return;
    const rail = this.rails[player.grindRailId];
    const planetState = this.simState.planets.get(rail?.planetId ?? "");
    const railState = this.simState.railStates.get(player.grindRailId);
    if (!rail || !planetState || !railState) return;

    const planetDef = this.simState.planetDefs.find((p) => p.id === rail.planetId);
    if (!planetDef) return;

    const radiusMultiplier =
      getPlanetSurfaceChordRadius(rail.slimeCorridorRadius, planetDef.radius) /
      getSlimeStampChordRadius(planetDef.radius);

    // Use incremental painting between last position and current position
    const startT = player.lastGrindT;
    const endT = player.grindT;
    const dist = Math.abs(endT - startT);
    const step = GAME_CONFIG.rail.slimeStampSpacing;

    // Stamp the ground
    if (dist > 0.01) {
      const dir = Math.sign(endT - startT);
      // Ensure we stamp at both start and end, and enough points in between
      const numStamps = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= numStamps; i++) {
        const t = startT + (i / numStamps) * dist * dir;
        const { pos } = sampleRailAt(rail, t);
        const msg = applySlimeImpact(this.simState, planetState, {
          planetId: rail.planetId,
          pos,
          slimeGroupId: player.slimeGroupId,
          slimeColor: player.slimeColor,
          patternId: player.patternId,
          radiusMultiplier,
        });
        if (msg) this.recordSlimeStamp(msg);
      }
    }

    // Update rail nodes
    const nodesPerUnit = (RAIL_SLIME_NODES - 1) / rail.totalLength;
    const nodeStart = Math.min(startT, endT) * nodesPerUnit;
    const nodeEnd = Math.max(startT, endT) * nodesPerUnit;

    for (let i = Math.floor(nodeStart); i <= Math.ceil(nodeEnd); i++) {
      if (i >= 0 && i < RAIL_SLIME_NODES) {
        railState.nodes[i] = player.slimeColor;
      }
    }
  }

  private recordKillEvent(message: Omit<KillEventMessage, "seq">): void {
    this.pendingKillEvents.push({
      ...message,
      seq: ++this.killSeq,
    });
  }

  recordInput(sessionId: string, msg: unknown): void {
    const player = this.simState.players.get(sessionId);
    const queue = this.inputQueues.get(sessionId);
    if (!player || !queue) return;

    const input = sanitizeInputMessage(msg);
    if (!input) return;

    if (input.seq <= player.inputSeq) return;

    const queuedTailSeq = queue[queue.length - 1]?.seq ?? player.inputSeq;
    if (input.seq <= queuedTailSeq) return;

    queue.push(input);
    if (queue.length > NETWORK_CONFIG.input.maxBufferedInputs) {
      queue.splice(0, queue.length - NETWORK_CONFIG.input.maxBufferedInputs);
    }
  }

  tick(dtMs: number): TickResult {
    this.tickCount++;
    const serverDtSec = dtMs / 1000;
    let shouldBroadcastMatchPhase = false;
    const hasHumanPlayers = Array.from(this.simState.players.values()).some(
      (player) => !player.isBot,
    );

    if (this.simState.matchPhase === MatchPhase.Lobby) {
      if (hasHumanPlayers) {
        this.simState.matchPhase = MatchPhase.Countdown;
        this.simState.matchTimer = GAME_CONFIG.match.countdownSeconds;
        shouldBroadcastMatchPhase = true;
      }
    } else if (this.simState.matchPhase === MatchPhase.Countdown) {
      const nextTimer = Math.max(0, this.simState.matchTimer - serverDtSec);
      if (nextTimer === 0) {
        this.simState.matchPhase = MatchPhase.Active;
        this.simState.matchTimer = GAME_CONFIG.match.durationSeconds;
        shouldBroadcastMatchPhase = true;
        this.resetMatchState();
      } else {
        this.simState.matchTimer = nextTimer;
      }
    } else if (this.simState.matchPhase === MatchPhase.Active) {
      const nextTimer = Math.max(0, this.simState.matchTimer - serverDtSec);
      shouldBroadcastMatchPhase = nextTimer !== this.simState.matchTimer && nextTimer === 0;
      this.simState.matchTimer = nextTimer;
      if (this.simState.matchTimer === 0) {
        this.simState.matchPhase = MatchPhase.Ended;
      }
    }

    tickWeaponPickups(this.simState, serverDtSec);
    tickHealthPickups(this.simState, serverDtSec);

    this.simState.players.forEach((player, sessionId) => {
      const queue = player.isBot
        ? [generateBotInput(player, this.simState, dtMs)]
        : this.inputQueues.get(sessionId);
      if (queue && queue.length > 0) {
        const actionNowMs = this.simState.elapsedMs;
        const inputDtSec = serverDtSec / queue.length;
        for (const input of queue) {
          const wasTrickActive = isTrickMovementState(player.movementState);
          const prevGrindId = player.grindRailId;
          stepPlayer(
            player,
            input,
            inputDtSec,
            this.planets,
            this.getStepConfig(player.planetId),
            this.simState.planets,
            this.rails,
          );
          this.maybeStampRailCorridor(player, prevGrindId);
          if (isTrickMovementState(player.movementState)) {
            const tricks = processAirTricks(
              this.simState,
              player,
              input,
              inputDtSec * 1000,
              actionNowMs,
            );
            this.pendingTrickEvents.push(...tricks.trickEvents);
          } else if (wasTrickActive) {
            for (const stamp of settleAirTricksOnLanding(this.simState, player)) {
              this.recordSlimeStamp(stamp);
            }
          }
          collectWeaponPickup(this.simState, player, GAME_CONFIG);
          collectHealthPickup(this.simState, player, GAME_CONFIG);
          const gameplayCfg = this.getGameplayConfig(player.planetId);
          rechargePlayerSlime(this.simState, player, inputDtSec, actionNowMs, gameplayCfg);
          if (
            this.simState.matchPhase === MatchPhase.Active ||
            this.simState.matchPhase === MatchPhase.Countdown
          ) {
            for (const stamp of tryFireProjectile(
              this.simState,
              player,
              input,
              actionNowMs,
              this.planets,
              gameplayCfg,
              (event) => this.recordKillEvent(event),
            )) {
              this.recordSlimeStamp(stamp);
            }
            for (const stamp of tryFireHitscan(
              this.simState,
              player,
              input,
              actionNowMs,
              this.planets,
              gameplayCfg,
              (event) => this.recordKillEvent(event),
            )) {
              this.recordSlimeStamp(stamp);
            }
          }
        }
        player.inputSeq = queue[queue.length - 1]!.seq;
        if (!player.isBot) {
          queue.length = 0;
        }
      } else {
        player.weaponTriggerHeldSinceMs = -1;
        const wasTrickActive = isTrickMovementState(player.movementState);
        const prevGrindId = player.grindRailId;
        stepPlayer(
          player,
          IDLE_INPUT,
          serverDtSec,
          this.planets,
          this.getStepConfig(player.planetId),
          this.simState.planets,
          this.rails,
        );
        this.maybeStampRailCorridor(player, prevGrindId);
        if (isTrickMovementState(player.movementState)) {
          const tricks = processAirTricks(
            this.simState,
            player,
            IDLE_INPUT,
            serverDtSec * 1000,
            this.simState.elapsedMs,
          );
          this.pendingTrickEvents.push(...tricks.trickEvents);
        } else if (wasTrickActive) {
          for (const stamp of settleAirTricksOnLanding(this.simState, player)) {
            this.recordSlimeStamp(stamp);
          }
        }
        collectWeaponPickup(this.simState, player, GAME_CONFIG);
        collectHealthPickup(this.simState, player, GAME_CONFIG);
        rechargePlayerSlime(
          this.simState,
          player,
          serverDtSec,
          this.simState.elapsedMs,
          this.getGameplayConfig(player.planetId),
        );
      }
    });

    const slimeStamps = tickProjectiles(
      this.simState,
      dtMs,
      this.planets,
      GAME_CONFIG,
      (player) =>
        selectSpawnSurface(
          this.mode,
          this.simState.players.values(),
          {
            playerIndex: player.slimeGroupId + player.deathCount,
            teamId: player.teamId,
          },
          player.sessionId,
          this.simState.planetDefs,
        ),
      (event) => this.recordKillEvent(event),
    );
    for (const stamp of slimeStamps) {
      this.recordSlimeStamp(stamp);
    }

    this.simState.elapsedMs += dtMs;

    return {
      shouldBroadcastMatchPhase,
      shouldBroadcastSnapshot: this.tickCount % SNAPSHOT_EVERY === 0,
      shouldBroadcastLeaderboard: this.tickCount % LEADERBOARD_EVERY === 0,
    };
  }

  buildSnapshotMessage(): SnapshotMessage {
    const players: SnapshotMessage["players"] = [];
    this.simState.players.forEach((player) => {
      players.push({
        sessionId: player.sessionId,
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        vel: { x: player.vel.x, y: player.vel.y, z: player.vel.z },
        rot: { x: player.rot.x, y: player.rot.y, z: player.rot.z, w: player.rot.w },
        planetId: player.planetId,
        slimeGroupId: player.slimeGroupId,
        movementState: player.movementState,
        surfState: player.surfState,
        isCarving: player.isCarving,
        skiJumpCharge: player.skiJumpCharge,
        grindRailId: player.grindRailId,
        grindT: player.grindT,
        lastGrindT: player.lastGrindT,
        grindSpeed: player.grindSpeed,
        grindCooldownMs: player.grindCooldownMs,
        isShooting: isPlayerShooting(player, this.simState.elapsedMs),
        equippedWeaponId: player.equippedWeaponId,
        disposableShotsRemaining: player.disposableShotsRemaining,
        health: player.health,
        slimeLevel: player.slimeLevel,
        respawnTimer: player.respawnTimer,
        isOnFriendlySlime: player.isOnFriendlySlime,
        slimeColor: player.slimeColor,
        patternId: player.patternId,
        inputSeq: player.inputSeq,
      });
    });

    const projectiles: SnapshotMessage["projectiles"] = [];
    this.simState.projectiles.forEach((projectile) => {
      projectiles.push({
        id: projectile.id,
        ownerId: projectile.ownerId,
        weaponId: projectile.weaponId,
        slimeGroupId: projectile.slimeGroupId,
        slimeColor: projectile.slimeColor,
        patternId: projectile.patternId,
        pos: { x: projectile.pos.x, y: projectile.pos.y, z: projectile.pos.z },
        vel: { x: projectile.vel.x, y: projectile.vel.y, z: projectile.vel.z },
        planetId: projectile.planetId,
        lifeMs: projectile.lifeMs,
        homingTargetId: projectile.homingTargetId,
        guaranteedHoming: projectile.guaranteedHoming,
      });
    });

    const pickups: SnapshotMessage["pickups"] = [];
    this.simState.pickups.forEach((pickup) => {
      if (!pickup.active) return;
      pickups.push({
        id: pickup.id,
        weaponId: pickup.weaponId,
        planetId: pickup.planetId,
        pos: { x: pickup.pos.x, y: pickup.pos.y, z: pickup.pos.z },
      });
    });

    const healthPickups: SnapshotMessage["healthPickups"] = [];
    this.simState.healthPickups.forEach((pickup) => {
      if (!pickup.active) return;
      healthPickups.push({
        id: pickup.id,
        pos: { x: pickup.pos.x, y: pickup.pos.y, z: pickup.pos.z },
      });
    });

    return { tick: this.tickCount, players, projectiles, pickups, healthPickups };
  }

  computeWinningTeamId(): number | undefined {
    if (!this.mode.isTeamBased || this.mode.teamCount === 0) return undefined;
    const { teamScores } = this.buildLeaderboardMessage();
    if (teamScores.length === 0) return undefined;
    let winner = 0;
    for (let t = 1; t < teamScores.length; t++) {
      if ((teamScores[t] ?? 0) > (teamScores[winner] ?? 0)) winner = t;
    }
    return winner;
  }

  buildLeaderboardMessage(): LeaderboardMessage {
    const entries: LeaderboardEntry[] = [];
    this.simState.players.forEach((player) => {
      entries.push({
        sessionId: player.sessionId,
        name: player.name,
        teamId: player.teamId,
        slimeGroupId: player.slimeGroupId,
        slimeColor: player.slimeColor,
        patternId: player.patternId,
        slimeScore: player.slimeScore,
        killCount: player.killCount,
        deathCount: player.deathCount,
      });
    });
    entries.sort(
      (a, b) =>
        b.slimeScore - a.slimeScore ||
        b.killCount - a.killCount ||
        a.deathCount - b.deathCount ||
        a.name.localeCompare(b.name),
    );

    const teamScores = Array.from({ length: this.mode.teamCount }, () => 0);
    if (this.mode.isTeamBased) {
      for (let teamId = 0; teamId < this.mode.teamCount; teamId++) {
        teamScores[teamId] = this.simState.scores.get(teamId.toString()) ?? 0;
      }
    }

    return { entries, teamScores };
  }
}

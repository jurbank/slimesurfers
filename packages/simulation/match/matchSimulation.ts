import { FFA_MODE, type GameModeDefinition } from "@splat/content/modes/gameModes.ts";
import { type WeaponPickupLayout } from "@splat/content/combat/weaponDefs.ts";
import {
  GAME_CONFIG,
  getSlimeStampChordRadius,
  getPlanetSurfaceChordRadius,
} from "@splat/content/config/gameConfig.ts";
import { DEV_MAP, type RuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  KillEventMessage,
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
import { collectWeaponPickup, tickWeaponPickups } from "../combat/weaponPickups.ts";
import { collectHealthPickup, tickHealthPickups } from "../combat/healthPickups.ts";
import { stepPlayer, type PlanetData, type StepConfig } from "../movement/simulatedMovement.ts";
import { type ComputedRail, sampleRailAt } from "../movement/railSpline.ts";
import { createStampBuckets } from "../slime/slimeDetection.ts";
import { applySlimeImpact } from "../slime/stampSlime.ts";
import { createTerritoryCells } from "../slime/territoryGrid.ts";
import { generateBotInput, removeBotState } from "../ai/botController.ts";
import { RAIL_SLIME_NODES } from "@splat/protocol/schemas/slimedState.ts";
import {
  isTrickMovementState,
  processAirTricks,
  settleAirTricksOnLanding,
} from "../tricks/airTricks.ts";
import { type SimMatchState, type SimPlayerState } from "./simState.ts";
import { selectSpawnSurface } from "./spawnSelection.ts";
import { sanitizeInputMessage } from "./inputSanitizer.ts";
import {
  buildPlanets,
  buildRails,
  buildStepConfig,
  createSimMatchState,
} from "./matchStateFactory.ts";
import {
  buildLeaderboardMessage as serializeLeaderboard,
  buildSnapshotMessage as serializeSnapshot,
  computeWinningTeamId as computeWinner,
} from "./matchSerializer.ts";
import {
  drainBotEmoteEvents as drainBotEmotesFn,
  tryPostEmote as tryPostEmoteFn,
} from "./botEmoteController.ts";
import {
  buildTeamCounts as buildTeamCountsFn,
  createSimPlayer,
  pickGeneratedBotTemplate,
  resolveBalancedSlot,
  resolvePaletteIndex,
  selectBotsToRemove as selectBotsToRemoveFn,
  type BotOptions,
} from "./playerRoster.ts";

const TICK_MS = 1000 / NETWORK_CONFIG.simulation.tickRateHz;
const SNAPSHOT_EVERY =
  NETWORK_CONFIG.simulation.tickRateHz / NETWORK_CONFIG.simulation.snapshotRateHz;
const LEADERBOARD_EVERY =
  NETWORK_CONFIG.simulation.tickRateHz / NETWORK_CONFIG.simulation.leaderboardRateHz;

const TICK_DT_SEC = TICK_MS / 1000;

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

export interface MatchSimulationOptions {
  seedTestSlime?: boolean;
  lobbyEnabled?: boolean;
  weaponPickupLayout?: WeaponPickupLayout;
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
  private readonly lastEmotePostMs = new Map<string, number>();
  private playerCount = 0;
  private humanPlayerCount = 0;
  private tickCount = 0;
  private killSeq = 0;

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

  addPlayer(
    sessionId: string,
    name?: unknown,
    requestedColorIndex?: unknown,
    requestedTeamId?: unknown,
  ): SimPlayerState {
    const playerIndex = this.playerCount++;
    const assignedSlot = resolveBalancedSlot(
      this.mode,
      this.simState.players.values(),
      playerIndex,
      requestedTeamId,
    );
    const paletteIndex = resolvePaletteIndex(
      this.mode,
      new Set(this.takenColorIndices()),
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
    this.humanPlayerCount++;
    return player;
  }

  addBot(sessionId: string, name?: unknown, botOptions?: BotOptions): SimPlayerState {
    const playerIndex = this.playerCount++;
    const assignedSlot = resolveBalancedSlot(
      this.mode,
      this.simState.players.values(),
      playerIndex,
    );
    const paletteIndex = resolvePaletteIndex(
      this.mode,
      new Set(this.takenColorIndices()),
      playerIndex,
      null,
      assignedSlot.teamId,
    );
    const player = createSimPlayer(
      sessionId,
      true,
      playerIndex,
      name,
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
      profile: config,
      emoteTemperament: config.emoteTemperament,
      emoteFrequency: config.emoteFrequency,
      origin: "named",
      configIndex,
    });
  }

  addGeneratedBot(sessionId: string): SimPlayerState {
    const template = pickGeneratedBotTemplate();
    return this.addBot(sessionId, template.name, {
      profile: template,
      emoteTemperament: template.emoteTemperament,
      emoteFrequency: template.emoteFrequency,
      origin: "generated",
    });
  }

  removePlayer(sessionId: string): void {
    const player = this.simState.players.get(sessionId);
    if (player && !player.isBot) this.humanPlayerCount--;
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
    return buildTeamCountsFn(this.mode, this.simState.players.values());
  }

  selectBotsToRemove(count: number): SimPlayerState[] {
    return selectBotsToRemoveFn(this.mode, this.simState.players, count);
  }

  tryPostEmote(sessionId: string, nowMs: number): boolean {
    return tryPostEmoteFn(sessionId, nowMs, this.lastEmotePostMs);
  }

  drainBotEmoteEvents(dtMs: number, nowMs: number): { playerId: string; emoteIds: string[] }[] {
    return drainBotEmotesFn(
      this.simState.players,
      this.lastEmotePostMs,
      this.simState.matchPhase,
      dtMs,
      nowMs,
    );
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

  buildSnapshotMessage(): SnapshotMessage {
    return serializeSnapshot(this.simState, this.tickCount);
  }

  buildLeaderboardMessage(): LeaderboardMessage {
    return serializeLeaderboard(this.simState, this.mode);
  }

  computeWinningTeamId(): number | undefined {
    return computeWinner(this.simState, this.mode);
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

  private recordKillEvent(message: Omit<KillEventMessage, "seq">): void {
    this.pendingKillEvents.push({ ...message, seq: ++this.killSeq });
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

    const startT = player.lastGrindT;
    const endT = player.grindT;
    const dist = Math.abs(endT - startT);
    const step = GAME_CONFIG.rail.slimeStampSpacing;

    if (dist > 0.01) {
      const dir = Math.sign(endT - startT);
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

    const nodesPerUnit = (RAIL_SLIME_NODES - 1) / rail.totalLength;
    const nodeStart = Math.min(startT, endT) * nodesPerUnit;
    const nodeEnd = Math.max(startT, endT) * nodesPerUnit;

    for (let i = Math.floor(nodeStart); i <= Math.ceil(nodeEnd); i++) {
      if (i >= 0 && i < RAIL_SLIME_NODES) {
        railState.nodes[i] = player.slimeColor;
      }
    }
  }

  private stepPlayerForInput(
    player: SimPlayerState,
    input: InputMessage,
    dtSec: number,
    nowMs: number,
  ): void {
    const wasTrickActive = isTrickMovementState(player.movementState);
    const prevGrindId = player.grindRailId;
    stepPlayer(
      player,
      input,
      dtSec,
      this.planets,
      this.getStepConfig(player.planetId),
      this.simState.planets,
      this.rails,
    );
    this.maybeStampRailCorridor(player, prevGrindId);
    if (isTrickMovementState(player.movementState)) {
      const tricks = processAirTricks(this.simState, player, input, dtSec * 1000, nowMs);
      this.pendingTrickEvents.push(...tricks.trickEvents);
    } else if (wasTrickActive) {
      for (const stamp of settleAirTricksOnLanding(this.simState, player)) {
        this.recordSlimeStamp(stamp);
      }
    }
    collectWeaponPickup(this.simState, player, GAME_CONFIG);
    collectHealthPickup(this.simState, player, GAME_CONFIG);
    const gameplayCfg = this.getGameplayConfig(player.planetId);
    rechargePlayerSlime(this.simState, player, dtSec, nowMs, gameplayCfg);
    if (
      this.simState.matchPhase === MatchPhase.Active ||
      this.simState.matchPhase === MatchPhase.Countdown
    ) {
      for (const stamp of tryFireProjectile(
        this.simState,
        player,
        input,
        nowMs,
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
        nowMs,
        this.planets,
        gameplayCfg,
        (event) => this.recordKillEvent(event),
      )) {
        this.recordSlimeStamp(stamp);
      }
    }
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

  tick(dtMs: number): TickResult {
    this.tickCount++;
    const serverDtSec = dtMs / 1000;
    let shouldBroadcastMatchPhase = false;

    if (this.simState.matchPhase === MatchPhase.Lobby) {
      if (this.humanPlayerCount > 0) {
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
          this.stepPlayerForInput(player, input, inputDtSec, actionNowMs);
        }
        player.inputSeq = queue[queue.length - 1]!.seq;
        if (!player.isBot) queue.length = 0;
      } else {
        player.weaponTriggerHeldSinceMs = -1;
        this.stepPlayerForInput(player, IDLE_INPUT, serverDtSec, this.simState.elapsedMs);
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
}

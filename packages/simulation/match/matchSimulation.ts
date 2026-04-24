import { FFA_MODE, type GameModeDefinition } from "@splat/content/modes/gameModes.ts";
import { DEFAULT_WEAPON_ID } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  KillEventMessage,
  LeaderboardEntry,
  LeaderboardMessage,
  PaintStampMessage,
  SnapshotMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import {
  rechargePlayerSlime,
  tickProjectiles,
  tryFireHitscan,
  tryFireProjectile,
} from "../combat/projectiles.ts";
import {
  collectWeaponPickup,
  createWeaponPickups,
  tickWeaponPickups,
} from "../combat/weaponPickups.ts";
import { stepPlayer, type PlanetData } from "../movement/simulatedMovement.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";
import { appendPaintStamp, createStampBuckets } from "../paint/paintDetection.ts";
import { createTerritoryCells } from "../paint/territoryGrid.ts";
import { processAirTricks, settleAirTricksOnLanding } from "../tricks/airTricks.ts";
import { cleanName } from "@splat/content/utils/profanity.ts";
import { generateGuestPlayerName } from "@splat/content/utils/guestPlayerNames.ts";
import {
  NO_TEAM_ID,
  PlayerMovementState,
  PlayerSwimState,
  type SimMatchState,
  type SimPlanetPaintState,
  type SimPlayerState,
} from "./simState.ts";

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

const PLANETS: PlanetData[] = PLANET_POSITIONS.map((p) => ({
  id: p.id,
  center: { x: p.x, y: p.y, z: p.z },
  radius: GAME_CONFIG.planet.radius,
}));

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

function createSimPlanetState(planetId: string): SimPlanetPaintState {
  return {
    planetId,
    territoryRows: GAME_CONFIG.paint.territoryRows,
    territoryCols: GAME_CONFIG.paint.territoryCols,
    cells: createTerritoryCells(GAME_CONFIG.paint.territoryRows, GAME_CONFIG.paint.territoryCols),
    stamps: [],
    stampBuckets: createStampBuckets(
      GAME_CONFIG.paint.territoryRows,
      GAME_CONFIG.paint.territoryCols,
    ),
  };
}

function seedTestPaint(simState: SimMatchState): void {
  const planet = simState.planets.get("planet-0");
  if (!planet) return;

  const stamps = [
    {
      paintGroupId: 0,
      color: GAME_CONFIG.match.ffaColors[0] ?? 0x00e5ff,
      patternId: 0,
      nx: 0,
      ny: 1,
      nz: 0,
      radius: 1.15,
      seq: ++simState.paintSeq,
    },
    {
      paintGroupId: 1,
      color: GAME_CONFIG.match.ffaColors[1] ?? 0xff6200,
      patternId: 0,
      nx: 0,
      ny: -1,
      nz: 0,
      radius: 1.15,
      seq: ++simState.paintSeq,
    },
    {
      paintGroupId: 1,
      color: GAME_CONFIG.match.ffaColors[1] ?? 0xff6200,
      patternId: 0,
      nx: 0.55,
      ny: 0.55,
      nz: 0.62,
      radius: 0.55,
      seq: ++simState.paintSeq,
    },
    {
      paintGroupId: 0,
      color: GAME_CONFIG.match.ffaColors[0] ?? 0x00e5ff,
      patternId: 0,
      nx: -0.5,
      ny: -0.45,
      nz: -0.74,
      radius: 0.55,
      seq: ++simState.paintSeq,
    },
  ] as const;

  for (const stamp of stamps) {
    appendPaintStamp(planet, stamp);
  }
}

function createSimMatchState(seedPaint: boolean, lobbyEnabled: boolean): SimMatchState {
  const simState: SimMatchState = {
    players: new Map(),
    planets: new Map(
      PLANET_POSITIONS.map((planet) => [planet.id, createSimPlanetState(planet.id)]),
    ),
    projectiles: new Map(),
    pickups: createWeaponPickups(GAME_CONFIG),
    matchPhase: lobbyEnabled ? MatchPhase.Lobby : MatchPhase.Active,
    matchTimer: lobbyEnabled ? 0 : GAME_CONFIG.match.durationSeconds,
    paintSeq: 0,
    trickSeq: 0,
    scores: new Map(),
    elapsedMs: 0,
    nextProjectileId: 0,
  };
  if (seedPaint) {
    seedTestPaint(simState);
  }
  return simState;
}

export interface MatchSimulationOptions {
  seedTestPaint?: boolean;
  lobbyEnabled?: boolean;
}

function createSimPlayer(
  sessionId: string,
  playerIndex: number,
  name: unknown,
  paletteIndex: number,
  maxPlayers: number,
  mode: GameModeDefinition,
): SimPlayerState {
  const slot = { ...mode.assignPlayerSlot(playerIndex), paletteIndex };
  const spawnPlanetId = mode.selectSpawnPlanet(playerIndex);
  const planetPos =
    PLANET_POSITIONS.find((planet) => planet.id === spawnPlanetId) ?? PLANET_POSITIONS[0]!;
  const angle = (playerIndex / Math.max(1, maxPlayers)) * Math.PI * 2;
  const spread = GAME_CONFIG.planet.radius * 0.15;

  return {
    sessionId,
    name: cleanName(name, generateGuestPlayerName(playerIndex)),
    teamId: slot.teamId,
    paintGroupId: slot.paintGroupId,
    paletteIndex: slot.paletteIndex,
    patternId: mode.slots[slot.paletteIndex]?.patternId ?? 0,
    slimeColor: mode.slots[slot.paletteIndex]?.color ?? 0xffffff,
    pos: {
      x: planetPos.x + Math.cos(angle) * spread,
      y:
        planetPos.y + getTerrainRadius(0, 1, 0, GAME_CONFIG) + GAME_CONFIG.movement.collisionRadius,
      z: planetPos.z + Math.sin(angle) * spread,
    },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: planetPos.id,
    spawnPlanetId: planetPos.id,
    movementState: PlayerMovementState.Idle,
    swimState: PlayerSwimState.None,
    isCarving: false,
    skiJumpCharge: 0,
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
    airTrickPaintMultiplier: 1,
    equippedWeaponId: DEFAULT_WEAPON_ID,
    disposableShotsRemaining: 0,
    health: GAME_CONFIG.player.maxHealth,
    slimeLevel: GAME_CONFIG.slime.maxLevel,
    paintScore: 0,
    killCount: 0,
    deathCount: 0,
    respawnTimer: 0,
    lastFireTimeMs: -1000,
    weaponTriggerHeldSinceMs: -1,
  };
}

export class MatchSimulation {
  readonly mode: GameModeDefinition;
  private readonly simState: SimMatchState;
  private readonly inputQueues = new Map<string, InputMessage[]>();
  private readonly recentPaintStamps = new Map<string, PaintStampMessage[]>();
  private readonly pendingPaintStamps: PaintStampMessage[] = [];
  private readonly pendingTrickEvents: TrickEventMessage[] = [];
  private readonly pendingKillEvents: KillEventMessage[] = [];
  private playerCount = 0;
  private tickCount = 0;
  private killSeq = 0;

  constructor(mode: GameModeDefinition = FFA_MODE, options: MatchSimulationOptions = {}) {
    this.mode = mode;
    this.simState = createSimMatchState(
      options.seedTestPaint ?? true,
      options.lobbyEnabled ?? false,
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

  takenColorIndices(): number[] {
    return Array.from(this.simState.players.values()).map((p) => p.paletteIndex);
  }

  addPlayer(sessionId: string, name?: unknown, requestedColorIndex?: unknown): SimPlayerState {
    const playerIndex = this.playerCount++;
    const taken = new Set(this.takenColorIndices());
    const paletteLen = this.mode.slots.length;
    let paletteIndex = playerIndex % paletteLen;
    const requestedPaletteIndex =
      typeof requestedColorIndex === "number" && Number.isSafeInteger(requestedColorIndex)
        ? requestedColorIndex
        : null;
    if (
      requestedPaletteIndex !== null &&
      requestedPaletteIndex >= 0 &&
      requestedPaletteIndex < paletteLen &&
      !taken.has(requestedPaletteIndex)
    ) {
      paletteIndex = requestedPaletteIndex;
    } else {
      for (let i = 0; i < paletteLen; i++) {
        const idx = (playerIndex + i) % paletteLen;
        if (!taken.has(idx)) {
          paletteIndex = idx;
          break;
        }
      }
    }
    const player = createSimPlayer(
      sessionId,
      playerIndex,
      name,
      paletteIndex,
      this.maxPlayers,
      this.mode,
    );
    this.simState.players.set(sessionId, player);
    this.inputQueues.set(sessionId, []);
    return player;
  }

  removePlayer(sessionId: string): void {
    this.simState.players.delete(sessionId);
    this.inputQueues.delete(sessionId);
  }

  getRecentPaintStamps(): readonly PaintStampMessage[] {
    const messages: PaintStampMessage[] = [];
    this.simState.planets.forEach((planet) => {
      for (const stamp of planet.stamps) {
        messages.push({ planetId: planet.planetId, ...stamp });
      }
    });
    messages.sort((a, b) => a.seq - b.seq);
    return messages;
  }

  drainPaintStampMessages(): PaintStampMessage[] {
    return this.pendingPaintStamps.splice(0, this.pendingPaintStamps.length);
  }

  drainTrickEventMessages(): TrickEventMessage[] {
    return this.pendingTrickEvents.splice(0, this.pendingTrickEvents.length);
  }

  drainKillEventMessages(): KillEventMessage[] {
    return this.pendingKillEvents.splice(0, this.pendingKillEvents.length);
  }

  private recordPaintStamp(message: PaintStampMessage): void {
    this.pendingPaintStamps.push(message);

    const planetMessages = this.recentPaintStamps.get(message.planetId) ?? [];
    planetMessages.push(message);
    if (planetMessages.length > GAME_CONFIG.paint.maxVisualStampsPerPlanet) {
      planetMessages.splice(0, planetMessages.length - GAME_CONFIG.paint.maxVisualStampsPerPlanet);
    }
    this.recentPaintStamps.set(message.planetId, planetMessages);
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

    if (this.simState.matchPhase === MatchPhase.Lobby) {
      if (this.simState.players.size > 0) {
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

    this.simState.players.forEach((player, sessionId) => {
      const queue = this.inputQueues.get(sessionId);
      if (queue && queue.length > 0) {
        const actionNowMs = this.simState.elapsedMs;
        const inputDtSec = serverDtSec / queue.length;
        for (const input of queue) {
          const wasAirborne = player.movementState === PlayerMovementState.Airborne;
          stepPlayer(player, input, inputDtSec, PLANETS, GAME_CONFIG, this.simState.planets);
          if (player.movementState === PlayerMovementState.Airborne) {
            const tricks = processAirTricks(
              this.simState,
              player,
              input,
              inputDtSec * 1000,
              actionNowMs,
            );
            this.pendingTrickEvents.push(...tricks.trickEvents);
          } else if (wasAirborne) {
            for (const stamp of settleAirTricksOnLanding(this.simState, player)) {
              this.recordPaintStamp(stamp);
            }
          }
          collectWeaponPickup(this.simState, player, GAME_CONFIG);
          rechargePlayerSlime(this.simState, player, inputDtSec, actionNowMs, GAME_CONFIG);
          if (this.simState.matchPhase === MatchPhase.Active) {
            for (const stamp of tryFireProjectile(
              this.simState,
              player,
              input,
              actionNowMs,
              PLANETS,
              GAME_CONFIG,
              (event) => this.recordKillEvent(event),
            )) {
              this.recordPaintStamp(stamp);
            }
            for (const stamp of tryFireHitscan(
              this.simState,
              player,
              input,
              actionNowMs,
              PLANETS,
              GAME_CONFIG,
              (event) => this.recordKillEvent(event),
            )) {
              this.recordPaintStamp(stamp);
            }
          }
        }
        player.inputSeq = queue[queue.length - 1]!.seq;
        queue.length = 0;
      } else {
        player.weaponTriggerHeldSinceMs = -1;
        const wasAirborne = player.movementState === PlayerMovementState.Airborne;
        stepPlayer(player, IDLE_INPUT, serverDtSec, PLANETS, GAME_CONFIG, this.simState.planets);
        if (player.movementState === PlayerMovementState.Airborne) {
          const tricks = processAirTricks(
            this.simState,
            player,
            IDLE_INPUT,
            serverDtSec * 1000,
            this.simState.elapsedMs,
          );
          this.pendingTrickEvents.push(...tricks.trickEvents);
        } else if (wasAirborne) {
          for (const stamp of settleAirTricksOnLanding(this.simState, player)) {
            this.recordPaintStamp(stamp);
          }
        }
        collectWeaponPickup(this.simState, player, GAME_CONFIG);
        rechargePlayerSlime(
          this.simState,
          player,
          serverDtSec,
          this.simState.elapsedMs,
          GAME_CONFIG,
        );
      }
    });

    const paintStamps = tickProjectiles(this.simState, dtMs, PLANETS, GAME_CONFIG, (event) =>
      this.recordKillEvent(event),
    );
    for (const stamp of paintStamps) {
      this.recordPaintStamp(stamp);
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
        paintGroupId: player.paintGroupId,
        movementState: player.movementState,
        swimState: player.swimState,
        isCarving: player.isCarving,
        skiJumpCharge: player.skiJumpCharge,
        isShooting: isPlayerShooting(player, this.simState.elapsedMs),
        equippedWeaponId: player.equippedWeaponId,
        disposableShotsRemaining: player.disposableShotsRemaining,
        health: player.health,
        slimeLevel: player.slimeLevel,
        respawnTimer: player.respawnTimer,
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
        paintGroupId: projectile.paintGroupId,
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

    return { tick: this.tickCount, players, projectiles, pickups };
  }

  buildLeaderboardMessage(): LeaderboardMessage {
    const entries: LeaderboardEntry[] = [];
    this.simState.players.forEach((player) => {
      entries.push({
        sessionId: player.sessionId,
        name: player.name,
        teamId: player.teamId,
        paintGroupId: player.paintGroupId,
        slimeColor: player.slimeColor,
        patternId: player.patternId,
        paintScore: player.paintScore,
        killCount: player.killCount,
        deathCount: player.deathCount,
      });
    });
    entries.sort(
      (a, b) =>
        b.paintScore - a.paintScore ||
        b.killCount - a.killCount ||
        a.deathCount - b.deathCount ||
        a.name.localeCompare(b.name),
    );

    const teamScores = Array.from({ length: this.mode.teamCount }, () => 0);
    for (const entry of entries) {
      if (this.mode.isTeamBased && entry.teamId !== NO_TEAM_ID) {
        teamScores[entry.teamId] = (teamScores[entry.teamId] ?? 0) + entry.paintScore;
      }
    }

    return { entries, teamScores };
  }
}

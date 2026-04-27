import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimMatchState,
  type SimPlayerState,
} from "../match/simState.ts";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { getPaintAtPoint } from "../paint/paintDetection.ts";

export interface BotState {
  state: "wandering" | "combat" | "refilling";
  targetPos: { x: number; y: number; z: number } | null;
  targetSessionId: string | null;
  nextDecisionTimeMs: number;
  nextFireTimeMs: number;
  wanderingTimerMs: number;
}

const botStates = new Map<string, BotState>();

function getBotState(sessionId: string): BotState {
  let state = botStates.get(sessionId);
  if (!state) {
    state = {
      state: "wandering",
      targetPos: null,
      targetSessionId: null,
      nextDecisionTimeMs: 0,
      nextFireTimeMs: 0,
      wanderingTimerMs: 0,
    };
    botStates.set(sessionId, state);
  }
  return state;
}

export function removeBotState(sessionId: string): void {
  botStates.delete(sessionId);
}

function vlen(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const l = vlen(v);
  return l < 1e-8 ? { x: 0, y: 1, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

function sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function getRandomPointOnSphere(radius: number): { x: number; y: number; z: number } {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  };
}

function getBotWanderTarget(bot: SimPlayerState): { x: number; y: number; z: number } {
  const normal = getRandomPointOnSphere(1);
  const planet =
    PLANET_POSITIONS.find((entry) => entry.id === bot.planetId) ?? PLANET_POSITIONS[0]!;
  const radius = GAME_CONFIG.planet.radius + 5;
  return {
    x: planet.x + normal.x * radius,
    y: planet.y + normal.y * radius,
    z: planet.z + normal.z * radius,
  };
}

function isRecentlyShooting(player: SimPlayerState, nowMs: number): boolean {
  return nowMs - player.lastFireTimeMs <= GAME_CONFIG.player.shootingRevealDurationMs;
}

function isInvisibleToBots(
  target: SimPlayerState,
  simState: SimMatchState,
  nowMs: number,
): boolean {
  const submerged =
    target.surfState === PlayerSurfState.SurfmingMoving ||
    target.surfState === PlayerSurfState.SurfmingHidden;
  if (!submerged || isRecentlyShooting(target, nowMs)) return false;

  const paint = getPaintAtPoint(target.pos, target.planetId, simState.planets);
  return paint?.paintGroupId === target.paintGroupId;
}

export function generateBotInput(
  bot: SimPlayerState,
  simState: SimMatchState,
  _dtMs: number,
): InputMessage {
  const state = getBotState(bot.sessionId);
  const nowMs = simState.elapsedMs;

  const humanCount = Array.from(simState.players.values()).filter((p) => !p.isBot).length;
  // Dynamic scaling: Fewer humans = higher difficulty.
  // 1 human -> difficulty 1.0 (hardest)
  // 4 humans -> difficulty 0.2 (easiest)
  const difficultyFactor = Math.max(0.2, Math.min(1.0, 1.2 - humanCount * 0.2));

  const reactionTimeMs =
    GAME_CONFIG.bot.maxReactionTimeMs -
    (GAME_CONFIG.bot.maxReactionTimeMs - GAME_CONFIG.bot.minReactionTimeMs) * difficultyFactor;

  if (nowMs < state.nextDecisionTimeMs) {
    // Keep doing what we were doing, but update aim and movement based on current state.
    return buildInputFromState(bot, simState, state, difficultyFactor);
  }

  // Decision logic
  state.nextDecisionTimeMs = nowMs + reactionTimeMs;

  // 1. Refill check
  if (bot.slimeLevel < GAME_CONFIG.bot.refillSlimeThreshold) {
    state.state = "refilling";
  } else if (state.state === "refilling" && bot.slimeLevel >= GAME_CONFIG.slime.maxLevel * 0.9) {
    state.state = "wandering";
  }

  // 2. Combat check
  if (state.state !== "refilling") {
    let nearestEnemy: SimPlayerState | null = null;
    let nearestDist: number = GAME_CONFIG.bot.scanRadius;

    simState.players.forEach((other) => {
      if (other.sessionId === bot.sessionId) return;
      if (other.movementState === PlayerMovementState.Dead) return;
      if (isInvisibleToBots(other, simState, nowMs)) return;
      // In FFA, everyone is an enemy. In Team, check teamId.
      if (other.teamId !== bot.teamId || bot.teamId === 255) {
        const dist = vlen(sub(other.pos, bot.pos));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestEnemy = other;
        }
      }
    });

    if (nearestEnemy) {
      state.state = "combat";
      state.targetSessionId = (nearestEnemy as SimPlayerState).sessionId;
    } else if (state.state === "combat") {
      state.state = "wandering";
      state.targetSessionId = null;
    }
  }

  // 3. Wandering check
  if (state.state === "wandering") {
    state.wanderingTimerMs -= reactionTimeMs;
    if (!state.targetPos || state.wanderingTimerMs <= 0) {
      state.targetPos = getBotWanderTarget(bot);
      state.wanderingTimerMs = 3000 + Math.random() * 5000;
    }
  }

  return buildInputFromState(bot, simState, state, difficultyFactor);
}

function buildInputFromState(
  bot: SimPlayerState,
  simState: SimMatchState,
  state: BotState,
  difficultyFactor: number,
): InputMessage {
  let keys = 0;
  let aimDir = { x: 0, y: 0, z: 1 };
  const nowMs = simState.elapsedMs;

  if (state.state === "refilling") {
    keys |= InputKey.Submerge;
    // Just keep moving slowly or stay still.
    if (state.targetPos) {
      const toTarget = sub(state.targetPos, bot.pos);
      aimDir = normalize(toTarget);
      keys |= InputKey.Forward;
    }
  } else if (state.state === "combat" && state.targetSessionId) {
    const target = simState.players.get(state.targetSessionId);
    if (
      target &&
      target.movementState !== PlayerMovementState.Dead &&
      !isInvisibleToBots(target, simState, nowMs)
    ) {
      const toTarget = sub(target.pos, bot.pos);
      const dist = vlen(toTarget);

      // Jitter aim based on difficulty
      const maxJitter =
        GAME_CONFIG.bot.minAccuracyRadius +
        (GAME_CONFIG.bot.maxAccuracyRadius - GAME_CONFIG.bot.minAccuracyRadius) *
          (1 - difficultyFactor);
      const jitter = {
        x: (Math.random() - 0.5) * maxJitter,
        y: (Math.random() - 0.5) * maxJitter,
        z: (Math.random() - 0.5) * maxJitter,
      };

      aimDir = normalize(add(toTarget, jitter));

      if (dist < GAME_CONFIG.bot.shootRadius && nowMs >= state.nextFireTimeMs) {
        keys |= InputKey.Fire;
        const fireIntervalMs =
          GAME_CONFIG.bot.maxFireRateMs -
          (GAME_CONFIG.bot.maxFireRateMs - GAME_CONFIG.bot.minFireRateMs) * difficultyFactor;
        state.nextFireTimeMs = nowMs + fireIntervalMs;
      }

      // Move toward target if too far, or just strafe
      if (dist > 15) {
        keys |= InputKey.Forward;
      } else if (dist < 8) {
        keys |= InputKey.Backward;
      }

      // Periodic jumping/submerging for "flavour"
      if (Math.random() < 0.02 * difficultyFactor) keys |= InputKey.Anchor;
      if (Math.random() < 0.01 * difficultyFactor) keys |= InputKey.Submerge;
    } else {
      state.state = "wandering";
      state.targetSessionId = null;
    }
  } else if (state.state === "wandering" && state.targetPos) {
    const toTarget = sub(state.targetPos, bot.pos);
    const dist = vlen(toTarget);
    aimDir = normalize(toTarget);

    if (dist > 2) {
      keys |= InputKey.Forward;
    } else {
      state.targetPos = null; // Pick new target next time
    }

    // Occasionally submerge to paint
    if (Math.random() < 0.05) keys |= InputKey.Submerge;
  }

  return {
    seq: bot.inputSeq + 1,
    keys,
    aimDir,
    dt: 1 / 20, // Match simulation tick rate
  };
}

function add(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

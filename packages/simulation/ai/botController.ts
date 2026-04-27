import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimMatchState,
  type SimPlayerState,
} from "../match/simState.ts";
import {
  GAME_CONFIG,
  resolveBotBehaviorProfile,
  type BotBehaviorProfile,
} from "@splat/content/config/gameConfig.ts";
import { PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { getPaintAtPoint } from "../paint/paintDetection.ts";
import { isTerritoryCellPaintable } from "../paint/territoryGrid.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

export interface BotState {
  state: "wandering" | "combat" | "refilling";
  targetPos: { x: number; y: number; z: number } | null;
  targetSessionId: string | null;
  nextDecisionTimeMs: number;
  nextFireTimeMs: number;
  wanderingTimerMs: number;
  airborneTrickStep: number;
}

const SURFER_TRICK_SEQUENCE = [
  InputKey.Left,
  InputKey.Forward,
  InputKey.Right,
  InputKey.Backward,
] as const;

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
      airborneTrickStep: 0,
    };
    botStates.set(sessionId, state);
  }
  return state;
}

export function removeBotState(sessionId: string): void {
  botStates.delete(sessionId);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBotProfile(bot: SimPlayerState): BotBehaviorProfile {
  return bot.botProfile ?? resolveBotBehaviorProfile();
}

function getAggressionLevel(profile: BotBehaviorProfile): number {
  return clamp(profile.aggression, 0, 10);
}

function getAggressionFactor(profile: BotBehaviorProfile): number {
  return getAggressionLevel(profile) / 10;
}

function normalizeBiases(profile: BotBehaviorProfile): {
  surf: number;
  attack: number;
  territory: number;
} {
  const surf = Math.max(0, profile.prefersSurfBias);
  const attack = Math.max(0, profile.prefersAttackBias);
  const territory = Math.max(0, profile.prefersTerritoryBias);
  const total = surf + attack + territory;
  if (total <= 1e-6) {
    return { surf: 1 / 3, attack: 1 / 3, territory: 1 / 3 };
  }
  return {
    surf: surf / total,
    attack: attack / total,
    territory: territory / total,
  };
}

function getPursuitRadius(bot: SimPlayerState, profile: BotBehaviorProfile): number {
  const aggression = getAggressionFactor(profile);
  const bias = normalizeBiases(profile);
  const base = GAME_CONFIG.bot.scanRadius * (0.7 + bias.attack * 1.1 - bias.surf * 0.25);
  if (bot.teamId === 255 && aggression >= 0.9) {
    return base * 3;
  }
  return base * (0.7 + aggression * 1.8);
}

function getShootRadius(profile: BotBehaviorProfile): number {
  const aggression = getAggressionFactor(profile);
  const bias = normalizeBiases(profile);
  return GAME_CONFIG.bot.shootRadius * (0.65 + bias.attack * 0.45 + aggression * 0.45);
}

function getAirTrickChance(profile: BotBehaviorProfile): number {
  const bias = normalizeBiases(profile);
  return clamp(0.12 + bias.surf * 0.78, 0, 0.95);
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

function getCellNormal(
  row: number,
  col: number,
  rows: number,
  cols: number,
): { x: number; y: number; z: number } {
  const v = (row + 0.5) / rows;
  const u = (col + 0.5) / cols;
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  return {
    x: sinTheta * Math.cos(phi),
    y: Math.cos(theta),
    z: sinTheta * Math.sin(phi),
  };
}

function getCellWorldPosition(
  planetId: string,
  row: number,
  col: number,
  rows: number,
  cols: number,
): { x: number; y: number; z: number } | null {
  const planet =
    PLANET_POSITIONS.find((entry) => entry.id === planetId) ?? PLANET_POSITIONS[0] ?? null;
  if (!planet) return null;

  const normal = getCellNormal(row, col, rows, cols);
  const radius = getTerrainRadius(normal.x, normal.y, normal.z, GAME_CONFIG);
  return {
    x: planet.x + normal.x * radius,
    y: planet.y + normal.y * radius,
    z: planet.z + normal.z * radius,
  };
}

function choosePaintTarget(
  bot: SimPlayerState,
  simState: SimMatchState,
  profile: BotBehaviorProfile,
  preferFriendlyPaint: boolean,
): { x: number; y: number; z: number } | null {
  const planetState = simState.planets.get(bot.planetId);
  if (!planetState) return null;
  const minTravelDistSq = 16;
  const bias = normalizeBiases(profile);

  let bestFriendly: { pos: { x: number; y: number; z: number }; distSq: number } | null = null;
  let bestEnemy: { pos: { x: number; y: number; z: number }; distSq: number } | null = null;
  let bestNeutral: { pos: { x: number; y: number; z: number }; distSq: number } | null = null;

  for (let row = 0; row < planetState.territoryRows; row++) {
    for (let col = 0; col < planetState.territoryCols; col++) {
      if (
        !isTerritoryCellPaintable(row, col, planetState.territoryRows, planetState.territoryCols)
      ) {
        continue;
      }

      const index = row * planetState.territoryCols + col;
      const cell = planetState.cells[index];
      if (!cell) continue;

      const pos = getCellWorldPosition(
        bot.planetId,
        row,
        col,
        planetState.territoryRows,
        planetState.territoryCols,
      );
      if (!pos) continue;

      const dx = pos.x - bot.pos.x;
      const dy = pos.y - bot.pos.y;
      const dz = pos.z - bot.pos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (cell.ownerPaintGroupId === bot.paintGroupId) {
        if (!bestFriendly || distSq < bestFriendly.distSq) bestFriendly = { pos, distSq };
      } else if (cell.ownerPaintGroupId === 255) {
        if (distSq < minTravelDistSq) continue;
        if (!bestNeutral || distSq < bestNeutral.distSq) bestNeutral = { pos, distSq };
      } else {
        if (distSq < minTravelDistSq) continue;
        if (!bestEnemy || distSq < bestEnemy.distSq) bestEnemy = { pos, distSq };
      }
    }
  }

  if (preferFriendlyPaint || bias.surf > Math.max(bias.attack, bias.territory)) {
    return bestFriendly?.pos ?? bestNeutral?.pos ?? bestEnemy?.pos ?? null;
  }

  if (bias.attack > bias.territory) {
    return bestNeutral?.pos ?? bestEnemy?.pos ?? bestFriendly?.pos ?? null;
  }

  return bestEnemy?.pos ?? bestNeutral?.pos ?? bestFriendly?.pos ?? null;
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
  const profile = getBotProfile(bot);
  const aggressionFactor = getAggressionFactor(profile);
  const bias = normalizeBiases(profile);

  const humanCount = Array.from(simState.players.values()).filter((p) => !p.isBot).length;
  // Dynamic scaling: Fewer humans = higher difficulty.
  // 1 human -> difficulty 1.0 (hardest)
  // 4 humans -> difficulty 0.2 (easiest)
  const difficultyFactor = Math.max(0.2, Math.min(1.0, 1.2 - humanCount * 0.2));

  const reactivityBias = 0.85 + bias.attack * 0.45 - bias.surf * 0.1;
  const reactivity = clamp(
    difficultyFactor * (0.55 + aggressionFactor * 0.9) * reactivityBias,
    0,
    1,
  );
  const reactionTimeMs =
    GAME_CONFIG.bot.maxReactionTimeMs -
    (GAME_CONFIG.bot.maxReactionTimeMs - GAME_CONFIG.bot.minReactionTimeMs) * reactivity;

  if (nowMs < state.nextDecisionTimeMs) {
    // Keep doing what we were doing, but update aim and movement based on current state.
    return buildInputFromState(bot, simState, state, profile, difficultyFactor);
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
  if (state.state !== "refilling" && getAggressionLevel(profile) > 0 && bias.attack > 0) {
    let nearestEnemy: SimPlayerState | null = null;
    const pursuitRadius = getPursuitRadius(bot, profile);
    let nearestDist: number = pursuitRadius;

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
      state.targetPos = null;
    } else if (state.state === "combat") {
      state.state = "wandering";
      state.targetSessionId = null;
    }
  }

  // 3. Territory / movement target selection
  if (state.state === "refilling") {
    state.targetSessionId = null;
    state.targetPos = choosePaintTarget(bot, simState, profile, true) ?? getBotWanderTarget(bot);
  } else if (state.state === "wandering") {
    state.targetSessionId = null;
    state.wanderingTimerMs -= reactionTimeMs;
    if (!state.targetPos || state.wanderingTimerMs <= 0) {
      const prefersRoaming = bias.surf > bias.territory && Math.random() < bias.surf;
      state.targetPos = prefersRoaming
        ? getBotWanderTarget(bot)
        : (choosePaintTarget(bot, simState, profile, false) ?? getBotWanderTarget(bot));
      state.wanderingTimerMs = prefersRoaming
        ? 900 + Math.random() * 1600
        : 1500 + Math.random() * 2500;
    }
  }

  return buildInputFromState(bot, simState, state, profile, difficultyFactor);
}

function buildInputFromState(
  bot: SimPlayerState,
  simState: SimMatchState,
  state: BotState,
  profile: BotBehaviorProfile,
  difficultyFactor: number,
): InputMessage {
  let keys = 0;
  let pressedKeys = 0;
  let aimDir = { x: 0, y: 0, z: 1 };
  const nowMs = simState.elapsedMs;
  const aggressionFactor = getAggressionFactor(profile);
  const bias = normalizeBiases(profile);
  const needsSurfToggle =
    bot.movementState !== PlayerMovementState.Dead &&
    bot.planetId !== "" &&
    bot.surfState === PlayerSurfState.None;
  const canTrickAirborne =
    bot.movementState === PlayerMovementState.Airborne &&
    bot.surfState !== PlayerSurfState.None &&
    Math.random() < getAirTrickChance(profile);

  if (!canTrickAirborne) {
    state.airborneTrickStep = 0;
  }

  if (state.state === "refilling") {
    if (state.targetPos) {
      const toTarget = sub(state.targetPos, bot.pos);
      aimDir = normalize(toTarget);
      if (vlen(toTarget) > 2) {
        keys |= InputKey.Forward;
      }
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

      if (dist < getShootRadius(profile) && nowMs >= state.nextFireTimeMs) {
        keys |= InputKey.Fire;
        const fireIntervalMs =
          GAME_CONFIG.bot.maxFireRateMs -
          (GAME_CONFIG.bot.maxFireRateMs - GAME_CONFIG.bot.minFireRateMs) *
            clamp(difficultyFactor * (0.65 + aggressionFactor * 0.7), 0, 1);
        state.nextFireTimeMs = nowMs + fireIntervalMs;
      }

      // Move toward target if too far, or just strafe
      if (dist > 15 || aggressionFactor >= 0.8) {
        keys |= InputKey.Forward;
      } else if (dist < 8) {
        keys |= InputKey.Backward;
      }

      if (Math.random() < (0.02 + bias.surf * 0.1) * (0.5 + difficultyFactor)) {
        keys |= InputKey.Anchor;
      }
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

    const shouldPaintTerrain =
      bias.territory >= 0.2 &&
      nowMs >= state.nextFireTimeMs &&
      bot.slimeLevel >= GAME_CONFIG.slime.shotCost;
    if (shouldPaintTerrain) {
      keys |= InputKey.Fire;
      const fireIntervalMs =
        GAME_CONFIG.bot.maxFireRateMs -
        (GAME_CONFIG.bot.maxFireRateMs - GAME_CONFIG.bot.minFireRateMs) *
          clamp(difficultyFactor * (0.45 + bias.territory * 0.55), 0, 1);
      state.nextFireTimeMs = nowMs + fireIntervalMs;
    } else if (
      Math.random() < 0.04 + bias.surf * 0.12 ||
      bot.movementState === PlayerMovementState.Airborne
    ) {
      keys |= InputKey.Anchor;
    }
  }

  if (canTrickAirborne) {
    const trickKey = SURFER_TRICK_SEQUENCE[state.airborneTrickStep % SURFER_TRICK_SEQUENCE.length]!;
    keys |= trickKey;
    pressedKeys |= trickKey;
    state.airborneTrickStep++;
  }

  if (needsSurfToggle) {
    keys |= InputKey.Submerge;
  }

  return {
    seq: bot.inputSeq + 1,
    keys,
    pressedKeys: pressedKeys || undefined,
    aimDir,
    dt: 1 / 20, // Match simulation tick rate
  };
}

function add(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

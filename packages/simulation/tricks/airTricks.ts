import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import {
  AIR_TRICK_DEFS,
  getAirTrickDefinition,
  type AirTrickDefinition,
} from "@splat/content/tricks/airTrickDefs.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import type {
  PaintStampMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import {
  PlayerMovementState,
  PlayerSwimState,
  type SimMatchState,
  type SimPlayerState,
} from "../match/simState.ts";
import { applyPaintImpact } from "../paint/stampPaint.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

const TRICK_DIRECTION_MASK = InputKey.Forward | InputKey.Backward | InputKey.Left | InputKey.Right;
const SPIN_TRICKS = AIR_TRICK_DEFS.filter(
  (trick): trick is AirTrickDefinition & { degrees: number } =>
    trick.kind === "spin" && typeof trick.degrees === "number",
).sort((a, b) => a.degrees - b.degrees);
const FRONT_FLIP_TRICKS = AIR_TRICK_DEFS.filter(
  (trick): trick is AirTrickDefinition & { degrees: number } =>
    trick.kind === "flip" && typeof trick.degrees === "number" && trick.degrees > 0,
).sort((a, b) => a.degrees - b.degrees);
const BACK_FLIP_TRICKS = AIR_TRICK_DEFS.filter(
  (trick): trick is AirTrickDefinition & { degrees: number } =>
    trick.kind === "flip" && typeof trick.degrees === "number" && trick.degrees < 0,
).sort((a, b) => Math.abs(a.degrees) - Math.abs(b.degrees));
const SEQUENCE_TRICKS = AIR_TRICK_DEFS.filter(
  (trick): trick is AirTrickDefinition & { sequence: readonly number[] } =>
    trick.kind === "sequence" && Array.isArray(trick.sequence),
).sort((a, b) => b.sequence.length - a.sequence.length);

function normalize(vec: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const length = Math.hypot(vec.x, vec.y, vec.z);
  if (length < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: vec.x / length, y: vec.y / length, z: vec.z / length };
}

function resetAirTrickState(player: SimPlayerState): void {
  player.airTrickCombo = 0;
  player.airTrickAirTimeMs = 0;
  player.airTrickInputSequence.length = 0;
  player.airTrickInputAgeMs = 0;
  player.lastAirTrickTimeMs = -Infinity;
  player.airTrickSpinDegrees = 0;
  player.airTrickSpinMilestoneIndex = 0;
  player.airTrickSpinBlocked = true;
  player.airTrickFlipDegrees = 0;
  player.airTrickFrontFlipMilestoneIndex = 0;
  player.airTrickBackFlipMilestoneIndex = 0;
  player.airTrickFlipBlocked = true;
  player.airTrickPaintMultiplier = 1;
}

function nearestPlanet(player: SimPlayerState) {
  let nearest = PLANET_POSITIONS[0] ?? null;
  let nearestDist = Infinity;
  for (const planet of PLANET_POSITIONS) {
    const dist = Math.hypot(
      player.pos.x - planet.x,
      player.pos.y - planet.y,
      player.pos.z - planet.z,
    );
    if (dist < nearestDist) {
      nearest = planet;
      nearestDist = dist;
    }
  }
  return nearest;
}

function emitLandingSplat(simState: SimMatchState, player: SimPlayerState): PaintStampMessage[] {
  if (player.airTrickCombo <= 0) return [];

  const planet = nearestPlanet(player);
  if (!planet) return [];

  const planetState = simState.planets.get(planet.id);
  if (!planetState) return [];

  const baseNormal = normalize({
    x: player.pos.x - planet.x,
    y: player.pos.y - planet.y,
    z: player.pos.z - planet.z,
  });
  const radiusMultiplier = Math.min(
    GAME_CONFIG.tricks.maxRadiusMultiplier,
    (GAME_CONFIG.tricks.radiusMultiplier +
      Math.max(0, player.airTrickCombo - 1) * GAME_CONFIG.tricks.comboRadiusBonus) *
      player.airTrickPaintMultiplier,
  );
  const stamps: PaintStampMessage[] = [];

  const radius = getTerrainRadius(baseNormal.x, baseNormal.y, baseNormal.z, GAME_CONFIG);
  const stamp = applyPaintImpact(simState, planetState, {
    planetId: planet.id,
    pos: {
      x: planet.x + baseNormal.x * radius,
      y: planet.y + baseNormal.y * radius,
      z: planet.z + baseNormal.z * radius,
    },
    paintGroupId: player.paintGroupId,
    slimeColor: player.slimeColor,
    patternId: player.patternId,
    radiusMultiplier,
  });
  if (stamp) stamps.push(stamp);

  return stamps;
}

function getPressedDirections(input: InputMessage): number[] {
  const directionPresses = (input.pressedKeys ?? 0) & TRICK_DIRECTION_MASK;
  const directions: number[] = [];
  if (directionPresses & InputKey.Forward) directions.push(InputKey.Forward);
  if (directionPresses & InputKey.Backward) directions.push(InputKey.Backward);
  if (directionPresses & InputKey.Left) directions.push(InputKey.Left);
  if (directionPresses & InputKey.Right) directions.push(InputKey.Right);
  return directions;
}

function matchesSuffix(sequence: readonly number[], suffix: readonly number[]): boolean {
  if (suffix.length > sequence.length) return false;
  const offset = sequence.length - suffix.length;
  for (let i = 0; i < suffix.length; i++) {
    if (sequence[offset + i] !== suffix[i]) return false;
  }
  return true;
}

function getSequenceTrick(player: SimPlayerState): AirTrickDefinition | null {
  for (const trick of SEQUENCE_TRICKS) {
    if (matchesSuffix(player.airTrickInputSequence, trick.sequence)) return trick;
  }
  return null;
}

function getSpinTrick(player: SimPlayerState): AirTrickDefinition | null {
  const nextSpin = SPIN_TRICKS[player.airTrickSpinMilestoneIndex];
  if (!nextSpin) return null;
  if (player.airTrickSpinDegrees < nextSpin.degrees) return null;
  player.airTrickSpinMilestoneIndex++;
  return nextSpin;
}

function getFlipTrick(player: SimPlayerState): AirTrickDefinition | null {
  if (player.airTrickFlipDegrees >= 0) {
    const nextFlip = FRONT_FLIP_TRICKS[player.airTrickFrontFlipMilestoneIndex];
    if (!nextFlip) return null;
    if (player.airTrickFlipDegrees < nextFlip.degrees) return null;
    player.airTrickFrontFlipMilestoneIndex++;
    return nextFlip;
  }

  const nextFlip = BACK_FLIP_TRICKS[player.airTrickBackFlipMilestoneIndex];
  if (!nextFlip) return null;
  if (Math.abs(player.airTrickFlipDegrees) < Math.abs(nextFlip.degrees)) return null;
  player.airTrickBackFlipMilestoneIndex++;
  return nextFlip;
}

function buildTrickResult(
  simState: SimMatchState,
  player: SimPlayerState,
  trick: AirTrickDefinition,
  nowMs: number,
): AirTrickResult {
  player.airTrickCombo = Math.min(
    GAME_CONFIG.tricks.maxCombo,
    player.airTrickCombo + trick.comboValue,
  );
  player.slimeLevel = Math.max(0, player.slimeLevel - GAME_CONFIG.tricks.slimeCostPerTrick);
  player.lastAirTrickTimeMs = nowMs;
  player.airTrickInputSequence.length = 0;
  player.airTrickInputAgeMs = 0;
  player.airTrickPaintMultiplier = Math.max(player.airTrickPaintMultiplier, trick.paintMultiplier);

  const event: TrickEventMessage = {
    playerId: player.sessionId,
    trickId: trick.id,
    combo: player.airTrickCombo,
    seq: ++simState.trickSeq,
  };

  return {
    paintStamps: [],
    trickEvents: [event],
  };
}

export interface AirTrickResult {
  paintStamps: PaintStampMessage[];
  trickEvents: TrickEventMessage[];
}

export function processAirTricks(
  simState: SimMatchState,
  player: SimPlayerState,
  input: InputMessage,
  dtMs: number,
  nowMs: number,
): AirTrickResult {
  const empty: AirTrickResult = { paintStamps: [], trickEvents: [] };
  if (player.movementState === PlayerMovementState.Dead) {
    resetAirTrickState(player);
    return empty;
  }

  if (player.movementState !== PlayerMovementState.Airborne) {
    resetAirTrickState(player);
    return empty;
  }

  player.airTrickAirTimeMs += dtMs;
  player.airTrickInputAgeMs += dtMs;

  if (player.swimState === PlayerSwimState.None) return empty;
  if (player.airTrickAirTimeMs < GAME_CONFIG.tricks.minAirTimeMs) return empty;

  if (player.airTrickInputAgeMs > GAME_CONFIG.tricks.inputWindowMs) {
    player.airTrickInputSequence.length = 0;
  }

  const spinDirection =
    (input.keys & InputKey.Left ? -1 : 0) + (input.keys & InputKey.Right ? 1 : 0);
  if (spinDirection === 0) {
    player.airTrickSpinBlocked = false;
  } else if (!player.airTrickSpinBlocked) {
    player.airTrickSpinDegrees += (GAME_CONFIG.tricks.spinDegreesPerSecond * dtMs) / 1000;
  }
  const flipDirection =
    (input.keys & InputKey.Forward ? 1 : 0) + (input.keys & InputKey.Backward ? -1 : 0);
  if (flipDirection === 0) {
    player.airTrickFlipBlocked = false;
  } else if (!player.airTrickFlipBlocked) {
    player.airTrickFlipDegrees +=
      (flipDirection * (GAME_CONFIG.tricks.spinDegreesPerSecond * dtMs)) / 1000;
  }

  const pressedDirections = getPressedDirections(input);
  if (pressedDirections.length > 0) {
    player.airTrickInputSequence.push(...pressedDirections);
    if (player.airTrickInputSequence.length > 4) {
      player.airTrickInputSequence.splice(0, player.airTrickInputSequence.length - 4);
    }
    player.airTrickInputAgeMs = 0;
  }

  if (nowMs - player.lastAirTrickTimeMs < GAME_CONFIG.tricks.trickCooldownMs) return empty;
  if (player.slimeLevel < GAME_CONFIG.tricks.minSlimeToTrick) return empty;

  const sequenceTrick = getSequenceTrick(player);
  if (sequenceTrick) return buildTrickResult(simState, player, sequenceTrick, nowMs);

  const spinTrick = getSpinTrick(player);
  if (spinTrick) {
    player.airTrickSpinBlocked = true;
    return buildTrickResult(simState, player, getAirTrickDefinition(spinTrick.id), nowMs);
  }

  const flipTrick = getFlipTrick(player);
  if (flipTrick) {
    player.airTrickFlipBlocked = true;
    return buildTrickResult(simState, player, getAirTrickDefinition(flipTrick.id), nowMs);
  }

  return empty;
}

export function settleAirTricksOnLanding(
  simState: SimMatchState,
  player: SimPlayerState,
): PaintStampMessage[] {
  const stamps = emitLandingSplat(simState, player);
  resetAirTrickState(player);
  return stamps;
}

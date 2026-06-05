import {
  type AssignedPlayerSlot,
  type GameModeDefinition,
} from "@splat/content/modes/gameModes.ts";
import {
  GAME_CONFIG,
  resolveBotBehaviorProfile,
  resolveBotEmoteFrequency,
  resolveBotEmoteTemperament,
  type BotBehaviorProfile,
  type BotConfigEntry,
} from "@splat/content/config/gameConfig.ts";
import { type BotEmoteTemperament } from "@splat/content/emotes/emoteDefs.ts";
import { DEFAULT_WEAPON_ID } from "@splat/content/combat/weaponDefs.ts";
import { type RuntimeMapPlanet } from "@splat/content/map/runtimeMapData.ts";
import { cleanName } from "@splat/content/utils/profanity.ts";
import { generateGuestPlayerName } from "@splat/content/utils/guestPlayerNames.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type BotOrigin,
  type SimPlayerState,
} from "./simState.ts";
import { selectSpawnSurface } from "./spawnSelection.ts";

export interface BotOptions {
  profile?: Partial<BotBehaviorProfile>;
  emoteTemperament?: BotEmoteTemperament;
  emoteFrequency?: number;
  origin?: BotOrigin;
  configIndex?: number;
}

export function resolveBalancedSlot(
  mode: GameModeDefinition,
  players: Iterable<SimPlayerState>,
  playerIndex: number,
  requestedTeamId?: unknown,
): AssignedPlayerSlot {
  if (!mode.isTeamBased || mode.teamCount === 0) {
    return mode.assignPlayerSlot(playerIndex);
  }
  if (
    typeof requestedTeamId === "number" &&
    Number.isSafeInteger(requestedTeamId) &&
    requestedTeamId >= 0 &&
    requestedTeamId < mode.teamCount
  ) {
    return { teamId: requestedTeamId, slimeGroupId: requestedTeamId };
  }
  const counts: number[] = [];
  for (let t = 0; t < mode.teamCount; t++) counts.push(0);
  for (const player of players) {
    if (player.teamId >= 0 && player.teamId < mode.teamCount) {
      counts[player.teamId] = (counts[player.teamId] ?? 0) + 1;
    }
  }
  let smallestTeam = 0;
  for (let t = 1; t < mode.teamCount; t++) {
    if (counts[t]! < counts[smallestTeam]!) smallestTeam = t;
  }
  return { teamId: smallestTeam, slimeGroupId: smallestTeam };
}

export function resolvePaletteIndex(
  mode: GameModeDefinition,
  takenIndices: ReadonlySet<number>,
  playerIndex: number,
  requestedColorIndex: unknown,
  assignedTeamId: number,
): number {
  const paletteLen = mode.slots.length;
  const requestedPaletteIndex =
    !mode.isTeamBased &&
    typeof requestedColorIndex === "number" &&
    Number.isSafeInteger(requestedColorIndex)
      ? requestedColorIndex
      : null;
  const matchesTeam = (paletteIndex: number): boolean =>
    !mode.isTeamBased || mode.slots[paletteIndex]?.teamId === assignedTeamId;

  if (
    requestedPaletteIndex !== null &&
    requestedPaletteIndex >= 0 &&
    requestedPaletteIndex < paletteLen &&
    !takenIndices.has(requestedPaletteIndex) &&
    matchesTeam(requestedPaletteIndex)
  ) {
    return requestedPaletteIndex;
  }

  for (let i = 0; i < paletteLen; i++) {
    const idx = (playerIndex + i) % paletteLen;
    if (!takenIndices.has(idx) && matchesTeam(idx)) return idx;
  }

  for (let i = 0; i < paletteLen; i++) {
    const idx = (playerIndex + i) % paletteLen;
    if (!takenIndices.has(idx)) return idx;
  }

  return playerIndex % paletteLen;
}

export function buildTeamCounts(
  mode: GameModeDefinition,
  players: Iterable<SimPlayerState>,
): number[] {
  if (!mode.isTeamBased || mode.teamCount === 0) return [];
  const counts = Array.from({ length: mode.teamCount }, () => 0);
  for (const player of players) {
    if (player.teamId >= 0 && player.teamId < counts.length) {
      counts[player.teamId] = (counts[player.teamId] ?? 0) + 1;
    }
  }
  return counts;
}

function scoreBotRemoval(
  mode: GameModeDefinition,
  allPlayers: Iterable<SimPlayerState>,
  candidate: SimPlayerState,
  remainingBots: readonly SimPlayerState[],
  alreadySelected: readonly SimPlayerState[],
): number {
  if (!mode.isTeamBased || mode.teamCount <= 1) {
    return candidate.botOrigin === "generated" ? 0 : 1;
  }
  const counts = buildTeamCounts(mode, allPlayers);
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

export function selectBotsToRemove(
  mode: GameModeDefinition,
  players: ReadonlyMap<string, SimPlayerState>,
  count: number,
): SimPlayerState[] {
  const bots = Array.from(players.values()).filter((p) => p.isBot);
  const selected: SimPlayerState[] = [];
  const remaining = [...bots];
  for (let i = 0; i < count; i++) {
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index];
      if (!candidate) continue;
      const score = scoreBotRemoval(mode, players.values(), candidate, remaining, selected);
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

export function pickGeneratedBotTemplate(): BotConfigEntry {
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

export function createSimPlayer(
  sessionId: string,
  isBot: boolean,
  playerIndex: number,
  name: unknown,
  paletteIndex: number,
  mode: GameModeDefinition,
  existingPlayers: Iterable<SimPlayerState>,
  planetDefs: RuntimeMapPlanet[],
  botOptions?: BotOptions,
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
    splatCooldownMs: 0,
    isOnFriendlySlime: false,
    gravityAnchorPlanetId: planetPos.id,
    loadedPadId: "",
    padLoadProgress: 0,
    padChargeProgress: 0,
    padCancelArmed: false,
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

import { GAME_CONFIG } from "../config/gameConfig.ts";
import { NETWORK_CONFIG } from "../config/networkConfig.ts";

const BASE_COLORS = [
  0x00e5ff, 0xff6200, 0x39ff14, 0xff1493, 0xffe600, 0xbf5fff, 0xff4444, 0x00ffaa,
];

/**
 * Pattern IDs for slime visual identity:
 * 0 = solid
 * 1 = horizontal stripes (white)
 * 2 = polka dots (white)
 * 3 = diagonal stripes (white)
 * 4 = vertical stripes (white)
 * 5 = horizontal stripes (dark)
 * 6 = polka dots (dark)
 * 7 = checkerboard (white)
 */
export const PATTERN_COUNT = 8;

export interface PlayerSlotDefinition {
  color: number;
  patternId: number;
  teamId?: number;
}

export interface AssignedPlayerSlot {
  teamId: number;
  paintGroupId: number;
}

export interface SpawnAnchorDefinition {
  planetId: string;
  normal: { x: number; y: number; z: number };
}

export type SpawnPolicy =
  | { kind: "ffa-spread" }
  | {
      kind: "team-zones";
      zoneRadius: number;
      teamAnchors: readonly SpawnAnchorDefinition[];
    }
  | {
      kind: "cluster";
      radius: number;
      anchor: SpawnAnchorDefinition;
    };

export interface GameModeDefinition {
  id: string;
  displayName: string;
  isTeamBased: boolean;
  spawnPlanetId: string;
  spawnPolicy: SpawnPolicy;
  teamCount: number;
  teamColors: readonly number[];
  slots: readonly PlayerSlotDefinition[];
  /** Derived color array (slots[i].color) — kept for convenience. */
  palette: readonly number[];
  assignPlayerSlot(playerIndex: number): AssignedPlayerSlot;
  selectSpawnPlanet(playerIndex: number): string;
}

function buildSlots(count: number): readonly PlayerSlotDefinition[] {
  const slots: PlayerSlotDefinition[] = [];
  for (let patternId = 0; patternId < PATTERN_COUNT && slots.length < count; patternId++) {
    const limit = patternId === 7 ? 4 : BASE_COLORS.length;
    for (let ci = 0; ci < limit && slots.length < count; ci++) {
      slots.push({ color: BASE_COLORS[ci]!, patternId });
    }
  }
  return slots;
}

function buildTeamSlots(
  count: number,
  teamColors: readonly number[],
): readonly PlayerSlotDefinition[] {
  const slots: PlayerSlotDefinition[] = [];
  const teamCount = Math.max(1, teamColors.length);
  for (let playerIndex = 0; playerIndex < count; playerIndex++) {
    const teamId = playerIndex % teamCount;
    slots.push({
      color: teamColors[teamId] ?? 0xffffff,
      patternId: 0,
      teamId,
    });
  }
  return slots;
}

const FFA_NO_TEAM_ID = 255;
const FFA_SLOTS = buildSlots(NETWORK_CONFIG.rooms.maxPlayers);
const TEAM_SLOTS = buildTeamSlots(NETWORK_CONFIG.rooms.maxPlayers, GAME_CONFIG.match.teamColors);

const TEAM_ANCHORS = [
  { planetId: "planet-0", normal: { x: 0.92, y: 0.26, z: 0.28 } },
  { planetId: "planet-0", normal: { x: -0.92, y: 0.26, z: -0.28 } },
] as const;

const DEV_CLUSTER_ANCHOR = {
  planetId: "planet-0",
  normal: { x: 0.18, y: 0.96, z: 0.2 },
} as const;

export const FFA_MODE: GameModeDefinition = {
  id: "ffa",
  displayName: "Free For All",
  isTeamBased: false,
  spawnPlanetId: "planet-0",
  spawnPolicy: { kind: "ffa-spread" },
  teamCount: 0,
  teamColors: [],
  slots: FFA_SLOTS,
  palette: FFA_SLOTS.map((s) => s.color),
  assignPlayerSlot(playerIndex) {
    return {
      teamId: FFA_NO_TEAM_ID,
      paintGroupId: playerIndex,
    };
  },
  selectSpawnPlanet() {
    return this.spawnPlanetId;
  },
};

export const TEAMS_MODE: GameModeDefinition = {
  id: "teams",
  displayName: "Teams",
  isTeamBased: true,
  spawnPlanetId: "planet-0",
  spawnPolicy: {
    kind: "team-zones",
    zoneRadius: 9,
    teamAnchors: TEAM_ANCHORS,
  },
  teamCount: GAME_CONFIG.match.teamCount,
  teamColors: GAME_CONFIG.match.teamColors,
  slots: TEAM_SLOTS,
  palette: TEAM_SLOTS.map((s) => s.color),
  assignPlayerSlot(playerIndex) {
    const teamId = playerIndex % this.teamCount;
    return {
      teamId,
      paintGroupId: teamId,
    };
  },
  selectSpawnPlanet(playerIndex) {
    return this.spawnPolicy.kind === "team-zones"
      ? (this.spawnPolicy.teamAnchors[playerIndex % this.teamCount]?.planetId ?? this.spawnPlanetId)
      : this.spawnPlanetId;
  },
};

export const DEV_MODE: GameModeDefinition = {
  id: "dev",
  displayName: "Dev Combat",
  isTeamBased: false,
  spawnPlanetId: DEV_CLUSTER_ANCHOR.planetId,
  spawnPolicy: {
    kind: "cluster",
    radius: 7,
    anchor: DEV_CLUSTER_ANCHOR,
  },
  teamCount: 0,
  teamColors: [],
  slots: FFA_SLOTS,
  palette: FFA_SLOTS.map((s) => s.color),
  assignPlayerSlot(playerIndex) {
    return {
      teamId: FFA_NO_TEAM_ID,
      paintGroupId: playerIndex,
    };
  },
  selectSpawnPlanet() {
    return this.spawnPlanetId;
  },
};

export const GAME_MODES = [FFA_MODE, TEAMS_MODE, DEV_MODE] as const;

export function resolveGameMode(modeId: unknown): GameModeDefinition {
  if (typeof modeId !== "string") return FFA_MODE;
  return GAME_MODES.find((mode) => mode.id === modeId) ?? FFA_MODE;
}

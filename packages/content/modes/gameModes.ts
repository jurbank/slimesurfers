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
}

export interface AssignedPlayerSlot {
  teamId: number;
  paintGroupId: number;
  paletteIndex: number;
}

export interface GameModeDefinition {
  id: string;
  displayName: string;
  isTeamBased: boolean;
  spawnPlanetId: string;
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
    // Pattern 7 (checkerboard) only fills 4 entries to reach exactly 60
    const limit = patternId === 7 ? 4 : BASE_COLORS.length;
    for (let ci = 0; ci < limit && slots.length < count; ci++) {
      slots.push({ color: BASE_COLORS[ci]!, patternId });
    }
  }
  return slots;
}

const FFA_NO_TEAM_ID = 255;

const FFA_SLOTS = buildSlots(NETWORK_CONFIG.rooms.maxPlayers);

export const FFA_MODE: GameModeDefinition = {
  id: "ffa",
  displayName: "Free For All",
  isTeamBased: false,
  spawnPlanetId: "planet-0",
  teamCount: 0,
  teamColors: [],
  slots: FFA_SLOTS,
  palette: FFA_SLOTS.map((s) => s.color),
  assignPlayerSlot(playerIndex) {
    return {
      teamId: FFA_NO_TEAM_ID,
      paintGroupId: playerIndex,
      paletteIndex: playerIndex % this.slots.length,
    };
  },
  selectSpawnPlanet() {
    return this.spawnPlanetId;
  },
};

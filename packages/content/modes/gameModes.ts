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
  palette: readonly number[];
  assignPlayerSlot(playerIndex: number): AssignedPlayerSlot;
  selectSpawnPlanet(playerIndex: number): string;
}

const FFA_NO_TEAM_ID = 255;

export const FFA_MODE: GameModeDefinition = {
  id: "ffa",
  displayName: "Free For All",
  isTeamBased: false,
  spawnPlanetId: "planet-0",
  teamCount: 0,
  teamColors: [],
  palette: [0x00e5ff, 0xff6200, 0x39ff14, 0xff1493, 0xffe600, 0xbf5fff, 0xff4444, 0x00ffaa],
  assignPlayerSlot(playerIndex) {
    return {
      teamId: FFA_NO_TEAM_ID,
      paintGroupId: playerIndex,
      paletteIndex: playerIndex % this.palette.length,
    };
  },
  selectSpawnPlanet() {
    return this.spawnPlanetId;
  },
};

const TEAM_COLOR_NAMES = new Map<number, string>([
  [0x00aaff, "Cyan"],
  [0xff6600, "Orange"],
]);

export function getTeamName(teamId: number, teamColor?: number): string {
  if (teamColor !== undefined) {
    const knownName = TEAM_COLOR_NAMES.get(teamColor);
    if (knownName) return knownName;
  }
  return `Team ${teamId + 1}`;
}

export function getTeamLabel(teamId: number, teamColor?: number): string {
  const name = getTeamName(teamId, teamColor);
  return name.startsWith("Team ") ? name : `Team ${name}`;
}

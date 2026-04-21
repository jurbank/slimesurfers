import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import type {
  LeaderboardEntry,
  LeaderboardMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { swatchBackground } from "./uiUtils.ts";

const MAX_DISPLAY_ENTRIES = 10;
const TOTAL_CELLS =
  GAME_CONFIG.paint.territoryRows * GAME_CONFIG.paint.territoryCols * GAME_CONFIG.planet.count;

export class LeaderboardOverlay {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      width: "280px",
      padding: "12px",
      borderRadius: "10px",
      background: "rgba(8, 10, 20, 0.82)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      color: "#f6f7fb",
      fontFamily: "sans-serif",
      backdropFilter: "blur(10px)",
      zIndex: "15",
      pointerEvents: "none",
      display: "none",
    });

    this.title = document.createElement("div");
    this.title.textContent = "Leaderboard";
    Object.assign(this.title.style, {
      fontSize: "0.8rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "#9fb3c8",
      marginBottom: "10px",
    });

    this.list = document.createElement("div");
    Object.assign(this.list.style, {
      display: "grid",
      gap: "6px",
      marginBottom: "12px",
    });

    this.progressBar = document.createElement("div");
    Object.assign(this.progressBar.style, {
      height: "8px",
      width: "100%",
      background: "rgba(255, 255, 255, 0.1)",
      borderRadius: "4px",
      overflow: "hidden",
      display: "flex",
    });

    this.root.append(this.title, this.list, this.progressBar);
    document.body.appendChild(this.root);
  }

  update(message: LeaderboardMessage, localSessionId: string | null): void {
    this.list.replaceChildren();
    this.progressBar.replaceChildren();

    if (message.entries.length === 0) {
      this.root.style.display = "none";
      return;
    }

    const isTeamMode = message.teamScores && message.teamScores.length > 0;

    // Header for the grid
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "grid",
      gridTemplateColumns: "1fr 30px 30px 45px",
      gap: "4px",
      fontSize: "0.7rem",
      color: "#6b7d8f",
      textTransform: "uppercase",
      padding: "0 8px",
      marginBottom: "2px",
    });
    const hName = document.createElement("span");
    hName.textContent = "Player";
    const hK = document.createElement("span");
    hK.textContent = "K";
    hK.style.textAlign = "center";
    const hD = document.createElement("span");
    hD.textContent = "D";
    hD.style.textAlign = "center";
    const hS = document.createElement("span");
    hS.textContent = "Pts";
    hS.style.textAlign = "right";
    header.append(hName, hK, hD, hS);
    this.list.appendChild(header);

    if (isTeamMode) {
      this.renderTeamGroups(message, localSessionId);
      this.renderTeamProgressBar(message);
    } else {
      this.renderFFAEntries(message, localSessionId);
      this.renderFFAProgressBar(message);
    }

    this.root.style.display = "block";
  }

  private renderTeamGroups(message: LeaderboardMessage, localSessionId: string | null): void {
    // Group entries by team
    const teams = new Map<number, LeaderboardEntry[]>();
    for (const entry of message.entries) {
      const list = teams.get(entry.teamId) || [];
      list.push(entry);
      teams.set(entry.teamId, list);
    }

    // Render each team group
    message.teamScores.forEach((teamScore, teamId) => {
      const teamColor = GAME_CONFIG.match.teamColors[teamId] ?? 0xffffff;
      const colorHex = `#${teamColor.toString(16).padStart(6, "0")}`;

      const teamHeader = document.createElement("div");
      Object.assign(teamHeader.style, {
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 8px",
        fontSize: "0.75rem",
        fontWeight: "bold",
        color: colorHex,
        background: `rgba(${parseInt(colorHex.slice(1, 3), 16)}, ${parseInt(colorHex.slice(3, 5), 16)}, ${parseInt(colorHex.slice(5, 7), 16)}, 0.15)`,
        borderRadius: "4px",
        marginTop: "4px",
      });
      teamHeader.innerHTML = `<span>Team ${teamId + 1}</span> <span>${Math.round(teamScore)}</span>`;
      this.list.appendChild(teamHeader);

      const teamEntries = teams.get(teamId) || [];
      // Limit team entries if there are many
      teamEntries.slice(0, 5).forEach((entry) => this.renderEntry(entry, localSessionId));
    });
  }

  private renderFFAEntries(message: LeaderboardMessage, localSessionId: string | null): void {
    const topEntries = message.entries.slice(0, MAX_DISPLAY_ENTRIES);
    topEntries.forEach((entry) => this.renderEntry(entry, localSessionId));
  }

  private renderEntry(entry: LeaderboardEntry, localSessionId: string | null): void {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "20px 1fr 30px 30px 45px",
      gap: "4px",
      alignItems: "center",
      padding: "4px 8px",
      borderRadius: "6px",
      fontSize: "0.85rem",
      background: entry.sessionId === localSessionId ? "rgba(255, 255, 255, 0.1)" : "transparent",
    });

    const swatch = document.createElement("div");
    const bg = swatchBackground({ color: entry.slimeColor, patternId: entry.patternId });
    Object.assign(swatch.style, {
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      backgroundImage: bg.backgroundImage,
      backgroundSize: bg.backgroundSize,
      flexShrink: "0",
    });

    const name = document.createElement("span");
    name.textContent = entry.sessionId === localSessionId ? `${entry.name}*` : entry.name;
    name.style.color = `#${entry.slimeColor.toString(16).padStart(6, "0")}`;
    name.style.whiteSpace = "nowrap";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";

    const k = document.createElement("span");
    k.textContent = `${entry.killCount}`;
    k.style.textAlign = "center";
    k.style.fontSize = "0.75rem";
    k.style.color = "#9fb3c8";

    const d = document.createElement("span");
    d.textContent = `${entry.deathCount}`;
    d.style.textAlign = "center";
    d.style.fontSize = "0.75rem";
    d.style.color = "#9fb3c8";

    const score = document.createElement("span");
    score.textContent = `${Math.round(entry.paintScore)}`;
    score.style.textAlign = "right";
    score.style.fontVariantNumeric = "tabular-nums";
    score.style.fontWeight = "bold";

    row.append(swatch, name, k, d, score);
    this.list.appendChild(row);
  }

  private renderTeamProgressBar(message: LeaderboardMessage): void {
    let totalClaimed = 0;
    message.teamScores.forEach((score, teamId) => {
      const width = (score / TOTAL_CELLS) * 100;
      totalClaimed += width;
      if (width > 0) {
        const segment = this.createProgressSegment(
          GAME_CONFIG.match.teamColors[teamId] ?? 0xffffff,
          0,
          width,
        );
        this.progressBar.appendChild(segment);
      }
    });
    this.addUncontestedSegment(totalClaimed);
  }

  private renderFFAProgressBar(message: LeaderboardMessage): void {
    let totalClaimed = 0;

    // Sort by sessionId to ensure a stable segment order in the progress bar
    const stableEntries = [...message.entries].sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId),
    );

    stableEntries.forEach((entry) => {
      const width = (entry.paintScore / TOTAL_CELLS) * 100;
      totalClaimed += width;
      if (width > 0.5) {
        // Only show visible segments
        const segment = this.createProgressSegment(entry.slimeColor, entry.patternId, width);
        this.progressBar.appendChild(segment);
      }
    });
    this.addUncontestedSegment(totalClaimed);
  }

  private createProgressSegment(color: number, patternId: number, width: number): HTMLDivElement {
    const segment = document.createElement("div");
    const bg = swatchBackground({ color, patternId });
    Object.assign(segment.style, {
      height: "100%",
      width: `${width}%`,
      backgroundImage: bg.backgroundImage,
      backgroundSize: bg.backgroundSize,
      transition: "width 300ms ease-out",
    });
    return segment;
  }

  private addUncontestedSegment(claimedWidth: number): void {
    const uncontestedWidth = Math.max(0, 100 - claimedWidth);
    if (uncontestedWidth > 0) {
      const segment = document.createElement("div");
      Object.assign(segment.style, {
        height: "100%",
        width: `${uncontestedWidth}%`,
        background: "rgba(255, 255, 255, 0.1)",
        transition: "width 300ms ease-out",
      });
      this.progressBar.appendChild(segment);
    }
  }
}

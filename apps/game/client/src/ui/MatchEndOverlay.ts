import type {
  LeaderboardEntry,
  LeaderboardMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { getTeamLabel } from "./teamPresentation.ts";
import { swatchBackground } from "./uiUtils.ts";

export class MatchEndOverlay {
  private readonly root: HTMLDivElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly list: HTMLDivElement;

  constructor(onPlayAgain: () => void, onChangeSetup: () => void) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      background: "rgba(4, 6, 14, 0.94)",
      backdropFilter: "blur(8px)",
      zIndex: "25",
      fontFamily: "sans-serif",
      color: "#f6f7fb",
      overflowY: "auto",
      padding: "40px 0",
      boxSizing: "border-box",
    });

    const contentWrapper = document.createElement("div");
    Object.assign(contentWrapper.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
      margin: "auto",
      width: "100%",
    });

    const title = document.createElement("h2");
    title.textContent = "MATCH OVER";
    Object.assign(title.style, {
      margin: "0",
      fontSize: "2rem",
      letterSpacing: "0.2em",
      color: "#f6f7fb",
    });

    this.subtitle = document.createElement("p");
    Object.assign(this.subtitle.style, {
      margin: "0",
      fontSize: "0.95rem",
      color: "#9fb3c8",
    });

    this.list = document.createElement("div");
    Object.assign(this.list.style, {
      width: "320px",
      background: "rgba(8, 10, 20, 0.82)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      borderRadius: "10px",
      padding: "12px",
    });

    const playAgain = document.createElement("button");
    playAgain.textContent = "PLAY AGAIN";
    Object.assign(playAgain.style, {
      padding: "12px 40px",
      fontSize: "1rem",
      fontWeight: "bold",
      letterSpacing: "0.1em",
      borderRadius: "6px",
      border: "none",
      background: "#00e5ff",
      color: "#000",
      cursor: "pointer",
    });
    playAgain.addEventListener("click", onPlayAgain);

    const changeSetup = document.createElement("button");
    changeSetup.textContent = "Exit to change name / color";
    Object.assign(changeSetup.style, {
      background: "none",
      border: "none",
      color: "#6b7d8f",
      fontSize: "0.8rem",
      cursor: "pointer",
      textDecoration: "underline",
      padding: "0",
    });
    changeSetup.addEventListener("click", onChangeSetup);

    contentWrapper.append(title, this.subtitle, this.list, playAgain, changeSetup);
    this.root.appendChild(contentWrapper);
    document.body.appendChild(this.root);
  }

  show(
    message: LeaderboardMessage | null,
    localSessionId: string | null,
    winningTeamId?: number,
    teamColors: readonly number[] = [],
  ): void {
    this.list.replaceChildren();

    const isTeamMode = winningTeamId !== undefined;

    if (isTeamMode && message) {
      this.renderTeamResult(message, localSessionId, winningTeamId, teamColors);
    } else {
      this.renderFFAResult(message, localSessionId);
    }

    this.root.style.display = "flex";
  }

  private renderTeamResult(
    message: LeaderboardMessage,
    localSessionId: string | null,
    winningTeamId: number,
    teamColors: readonly number[],
  ): void {
    const localEntry = message.entries.find((e) => e.sessionId === localSessionId);
    const localTeamId = localEntry?.teamId;
    const localWon = localTeamId !== undefined && localTeamId === winningTeamId;
    const winningTeamColor = teamColors[winningTeamId] ?? 0xffffff;
    const winningTeamLabel = getTeamLabel(winningTeamId, winningTeamColor);

    // Subtitle — personal outcome
    if (localEntry) {
      this.subtitle.textContent = `${winningTeamLabel} wins! ${localWon ? "Victory" : "Defeat"}`;
      this.subtitle.style.color = localWon
        ? `#${winningTeamColor.toString(16).padStart(6, "0")}`
        : "#9fb3c8";
    } else {
      this.subtitle.textContent = `${winningTeamLabel} wins!`;
      this.subtitle.style.color = `#${winningTeamColor.toString(16).padStart(6, "0")}`;
    }
    Object.assign(this.subtitle.style, {
      background: "",
      padding: "",
      borderRadius: "",
      fontWeight: "bold",
      fontSize: "1rem",
    });

    // Team score comparison banner
    if (message.teamScores.length >= 2) {
      this.list.appendChild(
        this.renderTeamScoreBanner(message.teamScores, winningTeamId, teamColors),
      );
    }

    // Column header
    this.list.appendChild(this.renderColumnHeader(false));

    // Entries grouped by team, winning team first
    const byTeam = new Map<number, LeaderboardEntry[]>();
    for (const entry of message.entries) {
      const group = byTeam.get(entry.teamId) ?? [];
      group.push(entry);
      byTeam.set(entry.teamId, group);
    }

    const teamOrder = [...byTeam.keys()].sort((a, b) => {
      if (a === winningTeamId) return -1;
      if (b === winningTeamId) return 1;
      return a - b;
    });

    for (const teamId of teamOrder) {
      const entries = byTeam.get(teamId) ?? [];
      const color = teamColors[teamId] ?? 0xffffff;
      this.list.appendChild(this.renderTeamHeader(teamId, color, teamId === winningTeamId));
      for (const [i, entry] of entries.entries()) {
        this.list.appendChild(this.renderEntry(entry, i + 1, localSessionId, false, color, 0));
      }
    }
  }

  private renderFFAResult(message: LeaderboardMessage | null, localSessionId: string | null): void {
    if (message && message.entries.length > 0) {
      const localIndex = message.entries.findIndex((e) => e.sessionId === localSessionId);
      if (localIndex !== -1) {
        const placement = localIndex + 1;
        const suffix =
          placement === 1 ? "st" : placement === 2 ? "nd" : placement === 3 ? "rd" : "th";
        this.subtitle.textContent = `You placed ${placement}${suffix}`;
      } else {
        this.subtitle.textContent = "";
      }
    } else {
      this.subtitle.textContent = "";
    }
    Object.assign(this.subtitle.style, {
      color: "#9fb3c8",
      background: "",
      padding: "",
      borderRadius: "",
      fontWeight: "",
      fontSize: "0.95rem",
    });

    if (message && message.entries.length > 0) {
      this.list.appendChild(this.renderColumnHeader(true));
      for (const [index, entry] of message.entries.entries()) {
        this.list.appendChild(this.renderEntry(entry, index + 1, localSessionId, true));
      }
    }
  }

  private renderTeamScoreBanner(
    teamScores: number[],
    winningTeamId: number,
    teamColors: readonly number[],
  ): HTMLDivElement {
    const banner = document.createElement("div");
    Object.assign(banner.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      marginBottom: "10px",
      borderRadius: "8px",
      background: "rgba(255,255,255,0.04)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    });

    teamScores.forEach((score, teamId) => {
      const color = teamColors[teamId] ?? 0xffffff;
      const hex = `#${color.toString(16).padStart(6, "0")}`;
      const isWinner = teamId === winningTeamId;

      const teamBlock = document.createElement("div");
      Object.assign(teamBlock.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: teamId === 0 ? "flex-start" : "flex-end",
        flex: "1",
      });

      const label = document.createElement("div");
      label.textContent = `Team ${teamId + 1}`;
      Object.assign(label.style, {
        fontSize: "0.65rem",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: hex,
        opacity: "0.8",
      });

      const scoreEl = document.createElement("div");
      scoreEl.textContent = `${Math.round(score)}`;
      Object.assign(scoreEl.style, {
        fontSize: isWinner ? "1.5rem" : "1.2rem",
        fontWeight: "bold",
        color: isWinner ? hex : "#9fb3c8",
        fontVariantNumeric: "tabular-nums",
      });

      if (isWinner) {
        const crown = document.createElement("div");
        crown.textContent = "★ WINNER";
        Object.assign(crown.style, {
          fontSize: "0.6rem",
          letterSpacing: "0.12em",
          color: hex,
          fontWeight: "bold",
        });
        teamBlock.append(label, scoreEl, crown);
      } else {
        teamBlock.append(label, scoreEl);
      }

      banner.appendChild(teamBlock);

      if (teamId < teamScores.length - 1) {
        const sep = document.createElement("div");
        sep.textContent = "vs";
        Object.assign(sep.style, {
          fontSize: "0.7rem",
          color: "#3d4d5e",
          padding: "0 12px",
          flexShrink: "0",
        });
        banner.appendChild(sep);
      }
    });

    return banner;
  }

  private renderTeamHeader(teamId: number, color: number, isWinner: boolean): HTMLDivElement {
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "4px 8px",
      marginTop: "6px",
      marginBottom: "2px",
      borderRadius: "4px",
      fontSize: "0.72rem",
      fontWeight: "bold",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: hex,
      background: `rgba(${r},${g},${b},0.12)`,
    });
    const teamLabel = getTeamLabel(teamId, color);
    header.textContent = isWinner ? `${teamLabel}  ★` : teamLabel;
    return header;
  }

  private renderColumnHeader(showPlacement: boolean): HTMLDivElement {
    const header = document.createElement("div");
    const cols = showPlacement ? "24px 1fr 30px 30px 50px" : "1fr 30px 30px 50px";
    Object.assign(header.style, {
      display: "grid",
      gridTemplateColumns: cols,
      gap: "4px",
      fontSize: "0.7rem",
      color: "#6b7d8f",
      textTransform: "uppercase",
      padding: "0 8px 6px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      marginBottom: "4px",
    });
    const cells = showPlacement ? ["#", "Player", "K", "D", "Pts"] : ["Player", "K", "D", "Pts"];
    for (const text of cells) {
      const cell = document.createElement("span");
      cell.textContent = text;
      if (text !== "#" && text !== "Player") cell.style.textAlign = "center";
      if (text === "Pts") cell.style.textAlign = "right";
      header.appendChild(cell);
    }
    return header;
  }

  hide(): void {
    this.root.style.display = "none";
  }

  private renderEntry(
    entry: LeaderboardEntry,
    placement: number,
    localSessionId: string | null,
    showPlacement: boolean,
    visualColor = entry.slimeColor,
    visualPatternId = entry.patternId,
  ): HTMLDivElement {
    const cols = showPlacement ? "24px 1fr 30px 30px 50px" : "1fr 30px 30px 50px";
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: cols,
      gap: "4px",
      alignItems: "center",
      padding: "5px 8px",
      borderRadius: "6px",
      fontSize: "0.85rem",
      background: entry.sessionId === localSessionId ? "rgba(255, 255, 255, 0.1)" : "transparent",
    });

    const bg = swatchBackground({ color: visualColor, patternId: visualPatternId });
    const swatch = document.createElement("div");
    Object.assign(swatch.style, {
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      backgroundImage: bg.backgroundImage,
      backgroundSize: bg.backgroundSize,
      flexShrink: "0",
    });

    const nameCell = document.createElement("div");
    Object.assign(nameCell.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      overflow: "hidden",
    });
    const name = document.createElement("span");
    name.textContent = entry.sessionId === localSessionId ? `${entry.name}*` : entry.name;
    Object.assign(name.style, {
      color: `#${visualColor.toString(16).padStart(6, "0")}`,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    nameCell.append(swatch, name);

    const k = document.createElement("span");
    k.textContent = `${entry.killCount}`;
    Object.assign(k.style, { textAlign: "center", fontSize: "0.75rem", color: "#9fb3c8" });

    const d = document.createElement("span");
    d.textContent = `${entry.deathCount}`;
    Object.assign(d.style, { textAlign: "center", fontSize: "0.75rem", color: "#9fb3c8" });

    const score = document.createElement("span");
    score.textContent = `${Math.round(entry.slimeScore)}`;
    Object.assign(score.style, {
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      fontWeight: "bold",
    });

    if (showPlacement) {
      const place = document.createElement("span");
      place.textContent = `${placement}`;
      Object.assign(place.style, {
        color: placement === 1 ? "#ffd166" : "#6b7d8f",
        fontWeight: placement === 1 ? "bold" : "normal",
        fontSize: "0.75rem",
      });
      row.append(place, nameCell, k, d, score);
    } else {
      row.append(nameCell, k, d, score);
    }

    return row;
  }
}

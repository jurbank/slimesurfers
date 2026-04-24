import { GAME_CONFIG, getPaintTerritoryDimensions } from "@splat/content/config/gameConfig.ts";
import type {
  KillEventMessage,
  LeaderboardEntry,
  LeaderboardMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { formatKillFeedLine, type FormattedKillFeedLine } from "./formatKillFeedLine.ts";
import { swatchBackground } from "./uiUtils.ts";

const MAX_DISPLAY_ENTRIES = 10;
const MAX_KILL_FEED_ITEMS = 5;
const KILL_FEED_LIFETIME_MS = 4000;
const KILL_FEED_ENTER_MS = 180;
const KILL_FEED_FADE_MS = 900;
const { rows: TOTAL_TERRITORY_ROWS, cols: TOTAL_TERRITORY_COLS } = getPaintTerritoryDimensions();
const TOTAL_CELLS = TOTAL_TERRITORY_ROWS * TOTAL_TERRITORY_COLS * GAME_CONFIG.planet.count;

interface ActiveKillFeedItem {
  createdAtMs: number;
  expiresAtMs: number;
  id: number;
  row: HTMLDivElement;
}

export class LeaderboardOverlay {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly timerEl: HTMLSpanElement;
  private readonly list: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private readonly killFeedSection: HTMLDivElement;
  private readonly killFeedHeader: HTMLDivElement;
  private readonly killFeedList: HTMLDivElement;

  private readonly activeKillFeed: ActiveKillFeedItem[] = [];
  private isLeaderboardVisible = false;
  private lastKillTemplateId: string | null = null;

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
    Object.assign(this.title.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      fontSize: "0.8rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "#9fb3c8",
      marginBottom: "10px",
    });
    const titleLabel = document.createElement("span");
    titleLabel.textContent = "Leaderboard";
    this.timerEl = document.createElement("span");
    this.timerEl.style.fontVariantNumeric = "tabular-nums";
    this.title.append(titleLabel, this.timerEl);

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

    this.killFeedSection = document.createElement("div");
    Object.assign(this.killFeedSection.style, {
      display: "none",
      marginTop: "12px",
      paddingTop: "10px",
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    });

    this.killFeedHeader = document.createElement("div");
    this.killFeedHeader.textContent = "Kill Log";
    Object.assign(this.killFeedHeader.style, {
      fontSize: "0.72rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "#9fb3c8",
      marginBottom: "8px",
    });

    this.killFeedList = document.createElement("div");
    Object.assign(this.killFeedList.style, {
      display: "grid",
      gap: "6px",
    });

    this.killFeedSection.append(this.killFeedHeader, this.killFeedList);
    this.root.append(this.title, this.list, this.progressBar, this.killFeedSection);
    document.body.appendChild(this.root);
  }

  update(message: LeaderboardMessage, localSessionId: string | null, matchTimerSeconds = 0): void {
    this.timerEl.textContent =
      matchTimerSeconds > 0 ? LeaderboardOverlay.formatTimer(matchTimerSeconds) : "";
    this.list.replaceChildren();
    this.progressBar.replaceChildren();

    if (message.entries.length === 0) {
      this.isLeaderboardVisible = false;
      this.updateVisibility();
      return;
    }

    const isTeamMode = message.teamScores && message.teamScores.length > 0;
    this.isLeaderboardVisible = true;

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

    this.updateVisibility();
  }

  pushKillEvents(events: KillEventMessage[], localSessionId: string | null): void {
    const nowMs = performance.now();

    for (const event of events) {
      const formatted = formatKillFeedLine(event, localSessionId, this.lastKillTemplateId);
      this.lastKillTemplateId = formatted.templateId;
      const row = this.createKillFeedRow(formatted);
      this.killFeedList.prepend(row);
      this.activeKillFeed.unshift({
        createdAtMs: nowMs,
        expiresAtMs: nowMs + KILL_FEED_LIFETIME_MS,
        id: event.seq,
        row,
      });
    }

    while (this.activeKillFeed.length > MAX_KILL_FEED_ITEMS) {
      const removed = this.activeKillFeed.pop();
      removed?.row.remove();
    }

    this.updateKillFeedStyles(nowMs);
    this.updateVisibility();
  }

  tick(nowMs: number): void {
    let didChange = false;
    for (let index = this.activeKillFeed.length - 1; index >= 0; index--) {
      const item = this.activeKillFeed[index];
      if (!item || item.expiresAtMs > nowMs) continue;
      item.row.remove();
      this.activeKillFeed.splice(index, 1);
      didChange = true;
    }

    if (this.activeKillFeed.length > 0) {
      this.updateKillFeedStyles(nowMs);
    } else if (didChange) {
      this.updateVisibility();
    }
  }

  clear(): void {
    this.list.replaceChildren();
    this.progressBar.replaceChildren();
    this.killFeedList.replaceChildren();
    this.activeKillFeed.length = 0;
    this.lastKillTemplateId = null;
    this.isLeaderboardVisible = false;
    this.updateVisibility();
  }

  private renderTeamGroups(message: LeaderboardMessage, localSessionId: string | null): void {
    const teams = new Map<number, LeaderboardEntry[]>();
    for (const entry of message.entries) {
      const list = teams.get(entry.teamId) || [];
      list.push(entry);
      teams.set(entry.teamId, list);
    }

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
    const stableEntries = [...message.entries].sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId),
    );

    stableEntries.forEach((entry) => {
      const width = (entry.paintScore / TOTAL_CELLS) * 100;
      totalClaimed += width;
      if (width > 0.5) {
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

  private createKillFeedRow(formatted: FormattedKillFeedLine): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      padding: "7px 9px",
      borderRadius: "8px",
      fontSize: "0.78rem",
      lineHeight: "1.3",
      color: "#d9e4ee",
      background: this.killFeedBackground(formatted.involvement),
      border: "1px solid rgba(255, 255, 255, 0.08)",
      boxShadow: "0 8px 18px rgba(0, 0, 0, 0.18)",
      transform: "translateY(-8px)",
      opacity: "0",
      transition: "opacity 120ms linear, transform 120ms ease-out",
      overflow: "hidden",
    });

    for (const segment of formatted.segments) {
      const span = document.createElement("span");
      span.textContent = segment.text;
      if (segment.color !== undefined) {
        span.style.color = `#${segment.color.toString(16).padStart(6, "0")}`;
        span.style.fontWeight = "700";
      }
      row.appendChild(span);
    }

    return row;
  }

  private updateKillFeedStyles(nowMs: number): void {
    for (const item of this.activeKillFeed) {
      const remainingMs = Math.max(0, item.expiresAtMs - nowMs);
      const ageMs = Math.max(0, nowMs - item.createdAtMs);
      const enterProgress = Math.min(1, ageMs / KILL_FEED_ENTER_MS);
      const fadeProgress =
        remainingMs >= KILL_FEED_FADE_MS ? 1 : Math.max(0, remainingMs / KILL_FEED_FADE_MS);
      const opacity = Math.max(0, Math.min(1, enterProgress * fadeProgress));
      const translateY = (1 - enterProgress) * -8 + (1 - fadeProgress) * 6;
      item.row.style.opacity = opacity.toFixed(3);
      item.row.style.transform = `translateY(${translateY.toFixed(1)}px)`;
    }
    this.updateVisibility();
  }

  private killFeedBackground(involvement: FormattedKillFeedLine["involvement"]): string {
    if (involvement === "killer") {
      return "linear-gradient(135deg, rgba(29, 71, 54, 0.92), rgba(13, 24, 27, 0.92))";
    }
    if (involvement === "victim") {
      return "linear-gradient(135deg, rgba(87, 36, 36, 0.92), rgba(26, 15, 20, 0.92))";
    }
    return "rgba(17, 24, 34, 0.86)";
  }

  private static formatTimer(seconds: number): string {
    const s = Math.ceil(Math.max(0, seconds));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, "0")}`;
  }

  private updateVisibility(): void {
    this.killFeedSection.style.display = this.activeKillFeed.length > 0 ? "block" : "none";
    this.root.style.display =
      this.isLeaderboardVisible || this.activeKillFeed.length > 0 ? "block" : "none";
  }
}

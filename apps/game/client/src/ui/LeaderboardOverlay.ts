import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type {
  KillEventMessage,
  LeaderboardEntry,
  LeaderboardMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { formatKillFeedLine, type FormattedKillFeedLine } from "./formatKillFeedLine.ts";
import { getTeamLabel } from "./teamPresentation.ts";
import { swatchBackground } from "./uiUtils.ts";

const MAX_DISPLAY_ENTRIES = 10;
const MAX_KILL_FEED_ITEMS = 5;
const KILL_FEED_LIFETIME_MS = 4000;
const KILL_FEED_ENTER_MS = 180;
const KILL_FEED_FADE_MS = 900;
const JOIN_PILL_LIFETIME_MS = 5000;
const COUNTDOWN_PROGRESS_COLOR = 0xffd166;

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
  private readonly progressLabel: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private readonly killFeedSection: HTMLDivElement;
  private readonly killFeedHeader: HTMLDivElement;
  private readonly killFeedList: HTMLDivElement;
  private readonly expandBtn: HTMLButtonElement;

  private readonly activeKillFeed: ActiveKillFeedItem[] = [];
  private isLeaderboardVisible = false;
  private lastKillTemplateId: string | null = null;
  private readonly isMobile: boolean;
  private mobileCollapsed: boolean;
  private lastIsTeamMode: boolean | null = null;

  private readonly knownSessionIds = new Set<string>();
  private readonly recentJoins = new Map<string, number>(); // sessionId → joinedAtMs
  private readonly recentLeaves = new Map<string, number>(); // sessionId → leftAtMs
  private readonly lastKnownEntries = new Map<string, LeaderboardEntry>();
  private seenFirstLeaderboard = false;

  constructor() {
    this.isMobile = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    this.mobileCollapsed = this.isMobile;

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

    const collapseBtn = document.createElement("button");
    collapseBtn.textContent = "✕";
    collapseBtn.setAttribute("aria-label", "Hide leaderboard");
    Object.assign(collapseBtn.style, {
      display: this.isMobile ? "" : "none",
      marginLeft: "auto",
      paddingLeft: "10px",
      background: "none",
      border: "none",
      color: "#9fb3c8",
      fontSize: "0.9rem",
      lineHeight: "1",
      cursor: "pointer",
      pointerEvents: "auto",
      touchAction: "none",
    });
    collapseBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.mobileCollapsed = true;
      this.updateVisibility();
    });

    this.title.append(titleLabel, this.timerEl, collapseBtn);

    this.expandBtn = document.createElement("button");
    this.expandBtn.textContent = "Leaderboard";
    this.expandBtn.setAttribute("aria-label", "Show leaderboard");
    Object.assign(this.expandBtn.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: "16",
      minHeight: "36px",
      padding: "0 12px",
      border: "1px solid rgba(255, 255, 255, 0.22)",
      borderRadius: "8px",
      background: "rgba(8, 10, 20, 0.82)",
      color: "#9fb3c8",
      font: "600 0.72rem sans-serif",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      lineHeight: "1",
      cursor: "pointer",
      backdropFilter: "blur(10px)",
      pointerEvents: "auto",
      touchAction: "none",
      display: "none",
    });
    this.expandBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.mobileCollapsed = false;
      this.updateVisibility();
    });
    document.body.appendChild(this.expandBtn);

    this.list = document.createElement("div");
    Object.assign(this.list.style, {
      display: "grid",
      gap: "6px",
      marginBottom: "12px",
      marginTop: "10px",
    });

    this.progressLabel = document.createElement("div");
    this.progressLabel.textContent = "Slime Coverage";
    Object.assign(this.progressLabel.style, {
      fontSize: "0.7rem",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#6b7d8f",
      marginBottom: "6px",
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

    const goalsSection = this.buildInfoSection("Goals", [
      "Cover the planet in your slime",
      "Waste your enemies",
    ]);
    const tipsSection = this.buildInfoSection("Tips", [
      "You move faster on your own slime",
      "Carve (Space) to accelerate downhill",
      "(E) to toggle surf/walk mode",
      "Mash the arrow keys in the air to do tricks",
    ]);

    this.root.append(
      this.title,
      this.progressLabel,
      this.progressBar,
      this.list,
      this.killFeedSection,
      goalsSection,
      tipsSection,
    );
    document.body.appendChild(this.root);
  }

  update(
    message: LeaderboardMessage,
    localSessionId: string | null,
    matchTimerSeconds = 0,
    teamColors: readonly number[] = [],
    matchPhase: MatchPhase = MatchPhase.Active,
  ): void {
    this.timerEl.textContent =
      matchTimerSeconds > 0 ? LeaderboardOverlay.formatTimer(matchTimerSeconds) : "";
    const nowMs = performance.now();
    this.list.replaceChildren();
    this.progressBar.replaceChildren();

    const currentIds = new Set(message.entries.map((e) => e.sessionId));

    for (const entry of message.entries) {
      this.lastKnownEntries.set(entry.sessionId, entry);
      this.recentLeaves.delete(entry.sessionId);
      if (!this.knownSessionIds.has(entry.sessionId)) {
        this.knownSessionIds.add(entry.sessionId);
        if (this.seenFirstLeaderboard) {
          this.recentJoins.set(entry.sessionId, nowMs);
        }
      }
    }

    if (this.seenFirstLeaderboard) {
      const departed: string[] = [];
      for (const sid of this.knownSessionIds) {
        if (!currentIds.has(sid)) departed.push(sid);
      }
      for (const sid of departed) {
        this.recentLeaves.set(sid, nowMs);
        this.knownSessionIds.delete(sid);
      }
    }

    this.seenFirstLeaderboard = true;

    if (message.entries.length === 0) {
      this.isLeaderboardVisible = false;
      this.updateVisibility();
      return;
    }

    const isTeamMode = message.teamScores && message.teamScores.length > 0;
    if (this.isMobile && this.lastIsTeamMode !== isTeamMode) {
      this.mobileCollapsed = true;
    }
    this.lastIsTeamMode = isTeamMode;
    this.isLeaderboardVisible = true;
    const isCountdown = matchPhase === MatchPhase.Countdown;
    this.progressLabel.textContent = isCountdown
      ? "GET READY"
      : isTeamMode
        ? "Team Coverage"
        : "Slime Coverage";

    if (isTeamMode) {
      this.renderTeamSummary(message, localSessionId, teamColors);
    }

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
      this.renderTeamGroups(message, localSessionId, teamColors);
    } else {
      this.renderFFAEntries(message, localSessionId);
    }

    if (isCountdown) {
      this.renderCountdownProgressBar(matchTimerSeconds);
    } else if (isTeamMode) {
      this.renderTeamProgressBar(message, teamColors);
    } else {
      this.renderFFAProgressBar(message);
    }

    this.renderRecentLeaves(nowMs);
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
    this.knownSessionIds.clear();
    this.recentJoins.clear();
    this.recentLeaves.clear();
    this.lastKnownEntries.clear();
    this.seenFirstLeaderboard = false;
    this.isLeaderboardVisible = false;
    this.lastIsTeamMode = null;
    this.mobileCollapsed = this.isMobile;
    this.updateVisibility();
  }

  private renderTeamGroups(
    message: LeaderboardMessage,
    localSessionId: string | null,
    teamColors: readonly number[],
  ): void {
    const teams = new Map<number, LeaderboardEntry[]>();
    for (const entry of message.entries) {
      const list = teams.get(entry.teamId) || [];
      list.push(entry);
      teams.set(entry.teamId, list);
    }

    message.teamScores.forEach((teamScore, teamId) => {
      const teamColor = teamColors[teamId] ?? GAME_CONFIG.match.teamColors[teamId] ?? 0xffffff;
      const colorHex = `#${teamColor.toString(16).padStart(6, "0")}`;
      const teamLabel = getTeamLabel(teamId, teamColor);
      const isLocalTeam = message.entries.some(
        (entry) => entry.sessionId === localSessionId && entry.teamId === teamId,
      );

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
      const label = document.createElement("span");
      label.textContent = isLocalTeam ? `${teamLabel}  YOU` : teamLabel;
      const score = document.createElement("span");
      score.textContent = `${Math.round(teamScore)}`;
      teamHeader.append(label, score);
      this.list.appendChild(teamHeader);

      const teamEntries = teams.get(teamId) || [];
      teamEntries
        .slice(0, 5)
        .forEach((entry) => this.renderEntry(entry, localSessionId, teamColor, 0));
    });
  }

  private renderFFAEntries(message: LeaderboardMessage, localSessionId: string | null): void {
    const topEntries = message.entries.slice(0, MAX_DISPLAY_ENTRIES);
    topEntries.forEach((entry) => this.renderEntry(entry, localSessionId));
  }

  private renderTeamSummary(
    message: LeaderboardMessage,
    localSessionId: string | null,
    teamColors: readonly number[],
  ): void {
    const localTeamId = message.entries.find((entry) => entry.sessionId === localSessionId)?.teamId;
    const summary = document.createElement("div");
    Object.assign(summary.style, {
      display: "grid",
      gridTemplateColumns: `repeat(${Math.max(1, message.teamScores.length)}, minmax(0, 1fr))`,
      gap: "6px",
      marginBottom: "8px",
    });

    message.teamScores.forEach((teamScore, teamId) => {
      const teamColor = teamColors[teamId] ?? GAME_CONFIG.match.teamColors[teamId] ?? 0xffffff;
      const hex = `#${teamColor.toString(16).padStart(6, "0")}`;
      const r = (teamColor >> 16) & 0xff;
      const g = (teamColor >> 8) & 0xff;
      const b = teamColor & 0xff;

      const item = document.createElement("div");
      Object.assign(item.style, {
        minWidth: "0",
        padding: "7px 8px",
        borderRadius: "6px",
        background: `rgba(${r}, ${g}, ${b}, 0.12)`,
        border:
          localTeamId === teamId
            ? `1px solid rgba(${r}, ${g}, ${b}, 0.72)`
            : `1px solid rgba(${r}, ${g}, ${b}, 0.28)`,
      });

      const label = document.createElement("div");
      label.textContent =
        localTeamId === teamId
          ? `${getTeamLabel(teamId, teamColor)}  YOU`
          : getTeamLabel(teamId, teamColor);
      Object.assign(label.style, {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: hex,
        fontSize: "0.66rem",
        fontWeight: "bold",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      });

      const score = document.createElement("div");
      score.textContent = `${Math.round(teamScore)}`;
      Object.assign(score.style, {
        marginTop: "3px",
        color: "#f6f7fb",
        fontSize: "1rem",
        fontWeight: "bold",
        fontVariantNumeric: "tabular-nums",
      });

      item.append(label, score);
      summary.appendChild(item);
    });

    this.list.appendChild(summary);
  }

  private renderRecentLeaves(nowMs: number): void {
    for (const [sid, leftAtMs] of this.recentLeaves) {
      const elapsed = nowMs - leftAtMs;
      if (elapsed >= JOIN_PILL_LIFETIME_MS) {
        this.recentLeaves.delete(sid);
        continue;
      }
      const entry = this.lastKnownEntries.get(sid);
      if (entry) this.renderLeftEntry(entry);
    }
  }

  private renderLeftEntry(entry: LeaderboardEntry): void {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "20px 1fr 30px 30px 45px",
      gap: "4px",
      alignItems: "center",
      padding: "4px 8px",
      borderRadius: "6px",
      fontSize: "0.85rem",
      opacity: "0.45",
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

    const nameCell = document.createElement("span");
    nameCell.style.overflow = "hidden";
    nameCell.style.display = "flex";
    nameCell.style.alignItems = "center";
    nameCell.style.gap = "4px";

    const name = document.createElement("span");
    name.textContent = entry.name;
    name.style.color = `#${entry.slimeColor.toString(16).padStart(6, "0")}`;
    name.style.whiteSpace = "nowrap";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    nameCell.appendChild(name);

    const pill = document.createElement("span");
    pill.textContent = "left";
    Object.assign(pill.style, {
      fontSize: "0.65rem",
      padding: "1px 5px",
      borderRadius: "999px",
      background: "rgba(255, 120, 80, 0.15)",
      color: "#f0a090",
      border: "1px solid rgba(255, 120, 80, 0.25)",
      whiteSpace: "nowrap",
      flexShrink: "0",
    });
    nameCell.appendChild(pill);

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

    row.append(swatch, nameCell, k, d, score);
    this.list.appendChild(row);
  }

  private renderEntry(
    entry: LeaderboardEntry,
    localSessionId: string | null,
    visualColor = entry.slimeColor,
    visualPatternId = entry.patternId,
  ): void {
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
    const bg = swatchBackground({ color: visualColor, patternId: visualPatternId });
    Object.assign(swatch.style, {
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      backgroundImage: bg.backgroundImage,
      backgroundSize: bg.backgroundSize,
      flexShrink: "0",
    });

    const nameCell = document.createElement("span");
    nameCell.style.overflow = "hidden";
    nameCell.style.display = "flex";
    nameCell.style.alignItems = "center";
    nameCell.style.gap = "4px";

    const name = document.createElement("span");
    name.textContent = entry.sessionId === localSessionId ? `${entry.name}*` : entry.name;
    name.style.color = `#${visualColor.toString(16).padStart(6, "0")}`;
    name.style.whiteSpace = "nowrap";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    nameCell.appendChild(name);

    const joinedAtMs = this.recentJoins.get(entry.sessionId);
    if (joinedAtMs !== undefined) {
      const elapsed = performance.now() - joinedAtMs;
      if (elapsed < JOIN_PILL_LIFETIME_MS) {
        const pill = document.createElement("span");
        pill.textContent = "joined";
        Object.assign(pill.style, {
          fontSize: "0.65rem",
          padding: "1px 5px",
          borderRadius: "999px",
          background: "rgba(43, 211, 255, 0.15)",
          color: "#7dd8ee",
          border: "1px solid rgba(43, 211, 255, 0.25)",
          whiteSpace: "nowrap",
          flexShrink: "0",
        });
        nameCell.appendChild(pill);
      }
    }

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

    row.append(swatch, nameCell, k, d, score);
    this.list.appendChild(row);
  }

  private renderTeamProgressBar(message: LeaderboardMessage, teamColors: readonly number[]): void {
    const totalScore = message.teamScores.reduce((sum, score) => sum + Math.max(0, score), 0);
    message.teamScores.forEach((score, teamId) => {
      const width =
        totalScore > 0 ? (Math.max(0, score) / totalScore) * 100 : 100 / message.teamScores.length;
      const color = teamColors[teamId] ?? GAME_CONFIG.match.teamColors[teamId] ?? 0xffffff;
      const segment = this.createProgressSegment(color, 0, width);
      segment.title = `${getTeamLabel(teamId, color)} ${Math.round(score)}`;
      this.progressBar.appendChild(segment);
    });
  }

  private renderFFAProgressBar(message: LeaderboardMessage): void {
    const stableEntries = [...message.entries].sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId),
    );
    const totalScore = stableEntries.reduce((sum, entry) => sum + Math.max(0, entry.paintScore), 0);

    stableEntries.forEach((entry) => {
      const width =
        totalScore > 0
          ? (Math.max(0, entry.paintScore) / totalScore) * 100
          : 100 / stableEntries.length;
      const segment = this.createProgressSegment(entry.slimeColor, entry.patternId, width);
      segment.title = `${entry.name} ${Math.round(entry.paintScore)}`;
      this.progressBar.appendChild(segment);
    });
  }

  private renderCountdownProgressBar(matchTimerSeconds: number): void {
    const totalSeconds = GAME_CONFIG.match.countdownSeconds;
    const width =
      totalSeconds > 0
        ? (Math.max(0, Math.min(matchTimerSeconds, totalSeconds)) / totalSeconds) * 100
        : 100;
    const segment = this.createSolidProgressSegment(COUNTDOWN_PROGRESS_COLOR, width);
    segment.title =
      matchTimerSeconds > 0 ? `Match starts in ${Math.ceil(matchTimerSeconds)}` : "Match starting";
    this.progressBar.appendChild(segment);
  }

  private createSolidProgressSegment(color: number, width: number): HTMLDivElement {
    const segment = document.createElement("div");
    Object.assign(segment.style, {
      height: "100%",
      width: `${width}%`,
      background: `#${color.toString(16).padStart(6, "0")}`,
      transition: "width 300ms ease-out",
    });
    return segment;
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

  private buildInfoSection(title: string, items: string[]): HTMLDivElement {
    const section = document.createElement("div");
    Object.assign(section.style, {
      marginTop: "12px",
      paddingTop: "10px",
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    });

    const header = document.createElement("div");
    header.textContent = title;
    Object.assign(header.style, {
      fontSize: "0.72rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "#9fb3c8",
      marginBottom: "6px",
    });
    section.appendChild(header);

    for (const item of items) {
      const row = document.createElement("div");
      row.textContent = `• ${item}`;
      Object.assign(row.style, {
        fontSize: "0.75rem",
        color: "#6b7d8f",
        lineHeight: "1.5",
        paddingLeft: "4px",
      });
      section.appendChild(row);
    }

    return section;
  }

  private updateVisibility(): void {
    this.killFeedSection.style.display = this.activeKillFeed.length > 0 ? "block" : "none";
    const hasContent = this.isLeaderboardVisible || this.activeKillFeed.length > 0;
    const showPanel = hasContent && (!this.isMobile || !this.mobileCollapsed);
    this.root.style.display = showPanel ? "block" : "none";
    this.expandBtn.style.display =
      this.isMobile && this.mobileCollapsed && hasContent ? "" : "none";
  }
}

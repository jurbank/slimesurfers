import { FFA_MODE, TEAMS_MODE } from "@splat/content/modes/gameModes.ts";
import type { MatchModeId } from "@splat/protocol/network/clientMessages.ts";
import { isProfane } from "@splat/content/utils/profanity.ts";
import { generateGuestPlayerName } from "@splat/content/utils/guestPlayerNames.ts";
import {
  fetchGlobalLeaderboard,
  type GlobalLeaderboardEntry,
  type GlobalLeaderboardWindow,
} from "../network/supabaseClient.ts";
import { swatchBackground } from "./uiUtils.ts";

const SLOTS = FFA_MODE.slots;
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 768;
const GUEST_PLAYER_NAME_STORAGE_KEY = "splat.guestPlayerName";
const DESKTOP_HINT_SHOWN_KEY = "splat.desktopHintShown";
const GLOBAL_LEADERBOARD_WINDOW: GlobalLeaderboardWindow = "all_time";

export interface LobbyPlayerSummary {
  name: string;
  isBot: boolean;
  teamId: number;
  colorIndex: number;
  slimeColor: number;
  patternId: number;
}

export interface ModeLobbySummary {
  matchMode: MatchModeId;
  displayName: string;
  isTeamBased: boolean;
  teamColors: number[];
  takenColorIndices: number[];
  players: LobbyPlayerSummary[];
  teamCounts: number[];
  suggestedTeamId?: number;
}

export interface LobbySummary {
  modes: Record<MatchModeId, ModeLobbySummary>;
}

export interface JoinSelection {
  name: string;
  matchMode: MatchModeId;
  colorIndex: number;
  teamId?: number;
}

export class JoinOverlay {
  private readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly statusText: HTMLParagraphElement;
  private readonly progressContainer: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private readonly colorLabel: HTMLParagraphElement;
  private readonly swatchRow: HTMLDivElement;
  private readonly modeButtons = new Map<MatchModeId, HTMLButtonElement>();
  private readonly ffaPlayersList: HTMLDivElement;
  private readonly teamSelection: HTMLDivElement;
  private readonly leaderboardList: HTMLDivElement;
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly guestPlayerName: string;
  private readonly video: HTMLVideoElement;
  private readonly leaderboardCache = new Map<GlobalLeaderboardWindow, GlobalLeaderboardEntry[]>();
  private selectedIndex = 0;
  private selectedMode: MatchModeId = "ffa";
  private selectedTeamId = 0;
  private hasManualTeamSelection = false;
  private lobbySummary: LobbySummary | null = null;
  private isLoading = true;
  private isTeamMode = false;

  constructor() {
    this.guestPlayerName = JoinOverlay.getGuestPlayerName();
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      background: "#080818",
      zIndex: "20",
      fontFamily: "sans-serif",
      color: "#fff",
      overflowY: "auto",
      padding: "0px 0 20px",
      boxSizing: "border-box",
    });

    this.video = document.createElement("video");
    this.video.src = "/video/slime-surfers-gameplay-loop.mp4";
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.loop = true;
    this.video.setAttribute("playsinline", "");
    Object.assign(this.video.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: "0",
      transition: "opacity 0.8s ease",
      pointerEvents: "none",
    });
    this.video.addEventListener(
      "canplay",
      () => {
        this.video.style.opacity = "1";
      },
      { once: true },
    );

    const videoScrim = document.createElement("div");
    Object.assign(videoScrim.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(8, 8, 24, 0.62)",
      pointerEvents: "none",
    });

    const contentWrapper = document.createElement("div");
    Object.assign(contentWrapper.style, {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "auto",
      // minHeight: "0",
      width: "100%",
    });

    this.root.append(this.video, videoScrim, contentWrapper);

    const joinPanel = document.createElement("div");
    Object.assign(joinPanel.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "12px",
      minWidth: "0",
    });

    const logo = document.createElement("img");
    logo.src = "/images/slime-surfers-logo.png";
    logo.alt = "Slime Surfers";
    Object.assign(logo.style, {
      width: "380px",
      height: "auto",
      // marginBottom: "12px",
      filter: "drop-shadow(0 0 20px rgba(0, 229, 255, 0.2))",
    });

    const subtitle = document.createElement("p");
    subtitle.textContent =
      "Cover the planet in slime, splat your rivals, and pull off huge tricks.";
    Object.assign(subtitle.style, {
      margin: "0 0 16px",
      maxWidth: "360px",
      textAlign: "center",
      fontSize: "0.95rem",
      lineHeight: "1.4",
      color: "#9fb3c8",
    });

    this.progressContainer = document.createElement("div");
    Object.assign(this.progressContainer.style, {
      width: "220px",
      height: "4px",
      background: "#222",
      borderRadius: "2px",
      overflow: "hidden",
      marginBottom: "16px",
    });

    this.progressBar = document.createElement("div");
    Object.assign(this.progressBar.style, {
      width: "0%",
      height: "100%",
      background: "#00e5ff",
      transition: "width 0.2s ease-out",
    });
    this.progressContainer.appendChild(this.progressBar);

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = this.guestPlayerName;
    this.nameInput.maxLength = 20;
    Object.assign(this.nameInput.style, {
      padding: "10px 16px",
      fontSize: "1rem",
      borderRadius: "6px",
      border: "2px solid #444",
      background: "#111",
      color: "#fff",
      outline: "none",
      width: "220px",
      boxSizing: "border-box",
      marginBottom: "8px",
    });

    const modeSelector = document.createElement("div");
    Object.assign(modeSelector.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
      width: "300px",
      maxWidth: "calc(100vw - 32px)",
      marginBottom: "4px",
    });

    for (const mode of [FFA_MODE, TEAMS_MODE]) {
      const matchMode = mode.id as MatchModeId;
      const btn = document.createElement("button");
      btn.textContent = mode.displayName.toUpperCase();
      Object.assign(btn.style, {
        padding: "9px 10px",
        borderRadius: "6px",
        border: "1px solid rgba(255,255,255,0.24)",
        background: "rgba(8, 10, 20, 0.74)",
        color: "#cfe8f3",
        cursor: "pointer",
        fontSize: "0.78rem",
        fontWeight: "800",
        letterSpacing: "0.08em",
      });
      btn.addEventListener("click", () => this.selectMode(matchMode));
      this.modeButtons.set(matchMode, btn);
      modeSelector.appendChild(btn);
    }

    this.colorLabel = document.createElement("p");
    this.colorLabel.textContent = "Choose your player / slime color";
    Object.assign(this.colorLabel.style, {
      margin: "4px 0 8px",
      fontSize: "0.8rem",
      color: "#fff",
    });

    this.swatchRow = document.createElement("div");
    Object.assign(this.swatchRow.style, {
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      justifyContent: "center",
      maxWidth: "300px",
      marginBottom: "16px",
    });

    SLOTS.forEach((slot, i) => {
      const btn = document.createElement("button");
      const bg = swatchBackground(slot);
      Object.assign(btn.style, {
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        border: "3px solid transparent",
        backgroundImage: bg.backgroundImage,
        backgroundSize: bg.backgroundSize,
        cursor: "pointer",
        padding: "0",
        transition: "border-color 0.15s, opacity 0.15s",
        boxSizing: "border-box",
        flexShrink: "0",
      });
      btn.dataset.index = String(i);
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        this.selectSwatch(i);
      });
      this.swatches.push(btn);
      this.swatchRow.appendChild(btn);
    });

    this.ffaPlayersList = document.createElement("div");
    Object.assign(this.ffaPlayersList.style, {
      display: "grid",
      gap: "4px",
      width: "300px",
      maxWidth: "calc(100vw - 32px)",
      margin: "-4px 0 12px",
    });

    this.teamSelection = document.createElement("div");
    Object.assign(this.teamSelection.style, {
      display: "none",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
      width: "360px",
      maxWidth: "calc(100vw - 32px)",
      marginBottom: "16px",
    });

    this.joinBtn = document.createElement("button");
    this.joinBtn.textContent = "LOADING...";
    this.joinBtn.disabled = true;
    Object.assign(this.joinBtn.style, {
      padding: "10px 32px",
      fontSize: "1rem",
      fontWeight: "bold",
      borderRadius: "6px",
      border: "none",
      background: "#333",
      color: "#888",
      cursor: "not-allowed",
      letterSpacing: "0.1em",
      marginBottom: "8px",
    });

    this.statusText = document.createElement("p");
    this.statusText.style.fontSize = "0.85rem";
    this.statusText.style.color = "#888";
    this.statusText.textContent = "Loading assets...";

    this.leaderboardList = document.createElement("div");
    Object.assign(this.leaderboardList.style, {
      display: "grid",
      gap: "6px",
    });
    const leaderboardPanel = this.buildGlobalLeaderboardPanel();

    const twitterLink = document.createElement("a");
    twitterLink.href = "https://x.com/johnurbank";
    twitterLink.target = "_blank";
    twitterLink.textContent = "Follow me on X @johnurbank";
    Object.assign(twitterLink.style, {
      marginTop: "16px",
      fontSize: "0.8rem",
      color: "#fff",
      textDecoration: "none",
      transition: "color 0.2s",
    });
    twitterLink.addEventListener("mouseenter", () => (twitterLink.style.color = "#00e5ff"));
    twitterLink.addEventListener("mouseleave", () => (twitterLink.style.color = "#fff"));

    joinPanel.append(
      logo,
      subtitle,
      this.progressContainer,
      this.nameInput,
      modeSelector,
      this.colorLabel,
      this.swatchRow,
      this.ffaPlayersList,
      this.teamSelection,
      this.joinBtn,
      this.statusText,
      leaderboardPanel,
      twitterLink,
    );
    contentWrapper.append(joinPanel);
    document.body.appendChild(this.root);

    this.selectSwatch(0);
    this.selectMode("ffa");
    void this.loadGlobalLeaderboard();
    this.focusNameInput();
    JoinOverlay.maybeShowDesktopHint();
  }

  private buildGlobalLeaderboardPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "100%",
      marginTop: "8px",
      padding: "12px",
      borderRadius: "8px",
      background: "rgba(8, 10, 20, 0.78)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      backdropFilter: "blur(10px)",
      boxSizing: "border-box",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      marginBottom: "10px",
    });

    const title = document.createElement("div");
    title.textContent = "Top Surfers";
    Object.assign(title.style, {
      color: "#f6f7fb",
      fontSize: "0.8rem",
      fontWeight: "700",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    });

    header.appendChild(title);
    panel.append(header, this.leaderboardList);
    this.renderLeaderboardStatus("Loading leaderboard...");
    return panel;
  }

  private async loadGlobalLeaderboard(): Promise<void> {
    const cached = this.leaderboardCache.get(GLOBAL_LEADERBOARD_WINDOW);
    if (cached) {
      this.renderLeaderboard(cached);
      return;
    }

    this.renderLeaderboardStatus("Loading leaderboard...");
    try {
      const entries = await fetchGlobalLeaderboard(GLOBAL_LEADERBOARD_WINDOW, 10);
      this.leaderboardCache.set(GLOBAL_LEADERBOARD_WINDOW, entries);
      this.renderLeaderboard(entries);
    } catch (err) {
      console.warn("[supabase] Global leaderboard failed:", err);
      this.renderLeaderboardStatus("Leaderboard unavailable");
    }
  }

  private renderLeaderboard(entries: GlobalLeaderboardEntry[]): void {
    this.leaderboardList.replaceChildren();

    if (entries.length === 0) {
      this.renderLeaderboardStatus("No scores yet");
      return;
    }

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "grid",
      gridTemplateColumns: "30px 1fr 56px",
      gap: "8px",
      padding: "0 6px 4px",
      color: "#6b7d8f",
      fontSize: "0.68rem",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    });
    for (const text of ["#", "Player", "Pts"]) {
      const cell = document.createElement("span");
      cell.textContent = text;
      if (text === "Pts") cell.style.textAlign = "right";
      header.appendChild(cell);
    }
    this.leaderboardList.appendChild(header);

    entries.forEach((entry, index) => {
      this.leaderboardList.appendChild(this.renderLeaderboardEntry(entry, index + 1));
    });
  }

  private renderLeaderboardEntry(entry: GlobalLeaderboardEntry, placement: number): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "30px 1fr 56px",
      gap: "8px",
      alignItems: "center",
      minHeight: "28px",
      padding: "4px 6px",
      borderRadius: "6px",
      background: placement <= 3 ? "rgba(255, 255, 255, 0.07)" : "transparent",
      fontSize: "0.82rem",
    });

    const rank = document.createElement("span");
    rank.textContent = JoinOverlay.formatLeaderboardPlacement(placement);
    Object.assign(rank.style, {
      color: placement <= 3 ? "#ffd166" : "#6b7d8f",
      fontWeight: placement <= 3 ? "700" : "500",
      fontVariantNumeric: "tabular-nums",
    });

    const bg = swatchBackground({ color: entry.slimeColor, patternId: entry.patternId });
    const swatch = document.createElement("span");
    Object.assign(swatch.style, {
      width: "14px",
      height: "14px",
      borderRadius: "50%",
      backgroundImage: bg.backgroundImage,
      backgroundSize: bg.backgroundSize,
      flexShrink: "0",
    });

    const nameWrap = document.createElement("span");
    Object.assign(nameWrap.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      minWidth: "0",
      overflow: "hidden",
    });

    const name = document.createElement("span");
    name.textContent = entry.name;
    Object.assign(name.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "#f6f7fb",
    });
    nameWrap.append(swatch, name);

    const score = document.createElement("span");
    score.textContent = `${Math.round(entry.paintScore)}`;
    Object.assign(score.style, {
      color: "#f6f7fb",
      fontWeight: "700",
      fontVariantNumeric: "tabular-nums",
      textAlign: "right",
    });

    row.append(rank, nameWrap, score);
    return row;
  }

  private renderLeaderboardStatus(message: string): void {
    this.leaderboardList.replaceChildren();
    const row = document.createElement("div");
    row.textContent = message;
    Object.assign(row.style, {
      padding: "36px 8px",
      color: "#6b7d8f",
      fontSize: "0.82rem",
      textAlign: "center",
    });
    this.leaderboardList.appendChild(row);
  }

  setLobbySummary(summary: LobbySummary): void {
    this.lobbySummary = summary;
    const suggested = summary.modes.teams.suggestedTeamId;
    if (this.selectedMode === "teams" && !this.hasManualTeamSelection) {
      this.selectedTeamId = suggested ?? 0;
    }
    this.renderModePanels();
    this.setTakenColorIndices(summary.modes.ffa.takenColorIndices);
  }

  private selectMode(mode: MatchModeId): void {
    this.selectedMode = mode;
    const suggested = this.lobbySummary?.modes.teams.suggestedTeamId;
    if (mode === "teams" && !this.hasManualTeamSelection && suggested !== undefined) {
      this.selectedTeamId = suggested;
    }
    this.setTeamMode(mode === "teams");
    this.renderModeButtons();
    this.renderModePanels();
  }

  private renderModeButtons(): void {
    for (const [mode, btn] of this.modeButtons) {
      const selected = mode === this.selectedMode;
      btn.style.background = selected ? "#00e5ff" : "rgba(8, 10, 20, 0.74)";
      btn.style.color = selected ? "#001018" : "#cfe8f3";
      btn.style.borderColor = selected ? "#00e5ff" : "rgba(255,255,255,0.24)";
    }
  }

  private renderModePanels(): void {
    const summary = this.lobbySummary;
    if (!summary) {
      this.renderFfaPlayers([]);
      this.renderTeams(TEAMS_MODE.teamColors, [], 0, []);
      return;
    }
    this.renderFfaPlayers(summary.modes.ffa.players);
    this.renderTeams(
      summary.modes.teams.teamColors,
      summary.modes.teams.teamCounts,
      summary.modes.teams.suggestedTeamId ?? 0,
      summary.modes.teams.players,
    );
  }

  private renderFfaPlayers(players: LobbyPlayerSummary[]): void {
    this.ffaPlayersList.replaceChildren();
    if (this.selectedMode !== "ffa") return;

    const title = this.renderLobbySectionTitle(`Players (${players.length})`);
    this.ffaPlayersList.appendChild(title);

    if (players.length === 0) {
      this.ffaPlayersList.appendChild(this.renderEmptyLobbyLine("No players yet"));
      return;
    }

    for (const player of players) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "24px",
        padding: "3px 6px",
        borderRadius: "6px",
        background: "rgba(255,255,255,0.06)",
        color: "#f6f7fb",
        fontSize: "0.8rem",
      });
      const bg = swatchBackground({ color: player.slimeColor, patternId: player.patternId });
      const swatch = document.createElement("span");
      Object.assign(swatch.style, {
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        backgroundImage: bg.backgroundImage,
        backgroundSize: bg.backgroundSize,
        flexShrink: "0",
      });
      const name = document.createElement("span");
      name.textContent = player.isBot ? `${player.name} BOT` : player.name;
      Object.assign(name.style, {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      row.append(swatch, name);
      this.ffaPlayersList.appendChild(row);
    }
  }

  private renderTeams(
    teamColors: readonly number[],
    teamCounts: readonly number[],
    suggestedTeamId: number,
    players: readonly LobbyPlayerSummary[],
  ): void {
    this.teamSelection.replaceChildren();
    if (this.selectedMode !== "teams") return;

    const teamCount = Math.max(teamColors.length, teamCounts.length, TEAMS_MODE.teamCount);
    for (let teamId = 0; teamId < teamCount; teamId++) {
      const color = teamColors[teamId] ?? TEAMS_MODE.teamColors[teamId] ?? 0xffffff;
      const colorHex = `#${color.toString(16).padStart(6, "0")}`;
      const selected = this.selectedTeamId === teamId;
      const suggested = suggestedTeamId === teamId;
      const card = document.createElement("button");
      Object.assign(card.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "8px",
        minHeight: "132px",
        padding: "10px",
        borderRadius: "8px",
        border: selected ? `2px solid ${colorHex}` : "1px solid rgba(255,255,255,0.16)",
        background: selected ? "rgba(255,255,255,0.12)" : "rgba(8, 10, 20, 0.78)",
        color: "#f6f7fb",
        cursor: "pointer",
        textAlign: "left",
      });
      card.addEventListener("click", () => {
        this.selectedTeamId = teamId;
        this.hasManualTeamSelection = true;
        this.renderModePanels();
      });

      const header = document.createElement("div");
      Object.assign(header.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "6px",
      });
      const label = document.createElement("span");
      label.textContent = `Team ${teamId + 1}`;
      Object.assign(label.style, {
        color: colorHex,
        fontWeight: "800",
        fontSize: "0.82rem",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      });
      const count = document.createElement("span");
      count.textContent = `${teamCounts[teamId] ?? 0}`;
      Object.assign(count.style, {
        color: "#fff",
        fontWeight: "800",
        fontVariantNumeric: "tabular-nums",
      });
      header.append(label, count);

      const hint = document.createElement("div");
      hint.textContent = suggested ? "SUGGESTED" : selected ? "SELECTED" : "";
      Object.assign(hint.style, {
        minHeight: "13px",
        color: suggested ? "#ffd166" : "#9fb3c8",
        fontSize: "0.65rem",
        fontWeight: "800",
        letterSpacing: "0.08em",
      });

      const list = document.createElement("div");
      Object.assign(list.style, {
        display: "grid",
        gap: "4px",
        color: "#cfe8f3",
        fontSize: "0.76rem",
      });
      const teamPlayers = players.filter((player) => player.teamId === teamId);
      if (teamPlayers.length === 0) {
        list.appendChild(this.renderEmptyLobbyLine("Empty"));
      } else {
        for (const player of teamPlayers) {
          const item = document.createElement("div");
          item.textContent = player.isBot ? `${player.name} BOT` : player.name;
          Object.assign(item.style, {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          });
          list.appendChild(item);
        }
      }

      card.append(header, hint, list);
      this.teamSelection.appendChild(card);
    }
  }

  private renderLobbySectionTitle(text: string): HTMLDivElement {
    const title = document.createElement("div");
    title.textContent = text;
    Object.assign(title.style, {
      color: "#9fb3c8",
      fontSize: "0.68rem",
      fontWeight: "800",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      textAlign: "center",
    });
    return title;
  }

  private renderEmptyLobbyLine(text: string): HTMLDivElement {
    const line = document.createElement("div");
    line.textContent = text;
    Object.assign(line.style, {
      color: "#6b7d8f",
      fontSize: "0.76rem",
      fontStyle: "italic",
      textAlign: "center",
      padding: "4px",
    });
    return line;
  }

  setProgress(percent: number): void {
    this.progressBar.style.width = `${percent}%`;
    if (percent >= 100 && this.isLoading) {
      this.isLoading = false;
      this.joinBtn.disabled = false;
      this.joinBtn.textContent = "PLAY";
      this.joinBtn.style.background = "#cbed02";
      this.joinBtn.style.color = "#000";
      this.joinBtn.style.cursor = "pointer";
      this.statusText.textContent = "";
      this.progressContainer.style.opacity = "0";
      setTimeout(() => this.progressContainer.remove(), 500);
    }
  }

  private selectSwatch(index: number): void {
    this.swatches[this.selectedIndex]!.style.borderColor = "transparent";
    this.selectedIndex = index;
    this.swatches[index]!.style.borderColor = "#fff";
  }

  setTakenColorIndices(taken: number[]): void {
    const takenSet = new Set(taken);
    this.swatches.forEach((btn, i) => {
      const isTaken = takenSet.has(i);
      btn.disabled = isTaken;
      btn.style.opacity = isTaken ? "0.25" : "1";
      btn.style.cursor = isTaken ? "not-allowed" : "pointer";
      if (isTaken && this.selectedIndex === i) {
        const next = this.swatches.findIndex((_b, j) => !takenSet.has(j));
        if (next !== -1) this.selectSwatch(next);
      }
    });
  }

  setTeamMode(isTeamMode: boolean): void {
    if (this.isTeamMode === isTeamMode) return;
    this.isTeamMode = isTeamMode;
    if (isTeamMode) {
      this.colorLabel.textContent = "Team colors are assigned automatically";
      this.swatchRow.style.display = "none";
      this.ffaPlayersList.style.display = "none";
      this.teamSelection.style.display = "grid";
    } else {
      this.colorLabel.textContent = "Choose your player / slime color";
      this.swatchRow.style.display = "flex";
      this.ffaPlayersList.style.display = "grid";
      this.teamSelection.style.display = "none";
    }
  }

  onJoin(callback: (selection: JoinSelection) => void): void {
    const submit = (): void => {
      const rawName = this.nameInput.value.trim();
      if (rawName && isProfane(rawName)) {
        this.statusText.textContent = "Please choose a cleaner name!";
        this.statusText.style.color = "#ff4444";
        return;
      }
      const name = rawName || this.guestPlayerName;
      callback({
        name,
        matchMode: this.selectedMode,
        colorIndex: this.selectedMode === "ffa" ? this.selectedIndex : -1,
        teamId: this.selectedMode === "teams" ? this.selectedTeamId : undefined,
      });
    };
    this.joinBtn.addEventListener("click", submit);
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }

  setConnecting(): void {
    this.joinBtn.disabled = true;
    this.joinBtn.textContent = "Connecting…";
    this.statusText.textContent = "";
  }

  show(message = ""): void {
    this.root.style.display = "flex";
    this.statusText.textContent = message;
    this.joinBtn.disabled = false;
    this.joinBtn.textContent = "JOIN";
    void this.video.play().catch(() => { });
  }

  hide(): void {
    this.root.style.display = "none";
    this.video.pause();
    this.showClickHint();
  }

  private showClickHint(): void {
    const hint = document.createElement("div");
    hint.textContent = "Click anywhere in the game to capture mouse — Esc to release";
    Object.assign(hint.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.6)",
      color: "#aaa",
      fontSize: "0.8rem",
      padding: "6px 14px",
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "10",
      transition: "opacity 1s",
    });
    document.body.appendChild(hint);
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 1000);
    }, 4000);
  }

  private static getGuestPlayerName(): string {
    const existing = sessionStorage.getItem(GUEST_PLAYER_NAME_STORAGE_KEY);
    if (existing) return existing;

    const seed =
      crypto.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 10_000);
    const name = generateGuestPlayerName(seed);
    sessionStorage.setItem(GUEST_PLAYER_NAME_STORAGE_KEY, name);
    return name;
  }

  private static formatLeaderboardPlacement(placement: number): string {
    switch (placement) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `${placement}`;
    }
  }

  private focusNameInput(): void {
    if (window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH_PX) return;
    requestAnimationFrame(() => this.nameInput.focus());
  }

  private static maybeShowDesktopHint(): void {
    if (window.innerWidth > MOBILE_VIEWPORT_MAX_WIDTH_PX) return;
    if (localStorage.getItem(DESKTOP_HINT_SHOWN_KEY)) return;
    localStorage.setItem(DESKTOP_HINT_SHOWN_KEY, "1");

    const toast = document.createElement("div");
    toast.textContent = "Play on desktop for the best experience";
    Object.assign(toast.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.75)",
      color: "#fff",
      fontSize: "0.85rem",
      padding: "8px 16px",
      borderRadius: "6px",
      pointerEvents: "none",
      zIndex: "100",
      whiteSpace: "nowrap",
      transition: "opacity 0.6s",
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 600);
    }, 6000);
  }
}

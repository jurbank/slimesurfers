import { FFA_MODE } from "@splat/content/modes/gameModes.ts";
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

export class JoinOverlay {
  private readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly statusText: HTMLParagraphElement;
  private readonly progressContainer: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private readonly colorLabel: HTMLParagraphElement;
  private readonly swatchRow: HTMLDivElement;
  private readonly leaderboardList: HTMLDivElement;
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly guestPlayerName: string;
  private readonly video: HTMLVideoElement;
  private readonly leaderboardCache = new Map<GlobalLeaderboardWindow, GlobalLeaderboardEntry[]>();
  private selectedIndex = 0;
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
      this.colorLabel,
      this.swatchRow,
      this.joinBtn,
      this.statusText,
      leaderboardPanel,
      twitterLink,
    );
    contentWrapper.append(joinPanel);
    document.body.appendChild(this.root);

    this.selectSwatch(0);
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

  setProgress(percent: number): void {
    this.progressBar.style.width = `${percent}%`;
    if (percent >= 100 && this.isLoading) {
      this.isLoading = false;
      this.joinBtn.disabled = false;
      this.joinBtn.textContent = "JOIN";
      this.joinBtn.style.background = "#00e5ff";
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
    if (this.isTeamMode) return;
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
    } else {
      this.colorLabel.textContent = "Choose your player / slime color";
      this.swatchRow.style.display = "flex";
    }
  }

  onJoin(callback: (name: string, colorIndex: number) => void): void {
    const submit = (): void => {
      const rawName = this.nameInput.value.trim();
      if (rawName && isProfane(rawName)) {
        this.statusText.textContent = "Please choose a cleaner name!";
        this.statusText.style.color = "#ff4444";
        return;
      }
      const name = rawName || this.guestPlayerName;
      callback(name, this.isTeamMode ? -1 : this.selectedIndex);
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
    void this.video.play().catch(() => {});
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

import type {
  LeaderboardEntry,
  LeaderboardMessage,
} from "@splat/protocol/network/serverMessages.ts";
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
      justifyContent: "center",
      gap: "16px",
      background: "rgba(4, 6, 14, 0.94)",
      backdropFilter: "blur(8px)",
      zIndex: "25",
      fontFamily: "sans-serif",
      color: "#f6f7fb",
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

    this.root.append(title, this.subtitle, this.list, playAgain, changeSetup);
    document.body.appendChild(this.root);
  }

  show(message: LeaderboardMessage | null, localSessionId: string | null): void {
    this.list.replaceChildren();

    if (message && message.entries.length > 0) {
      const header = document.createElement("div");
      Object.assign(header.style, {
        display: "grid",
        gridTemplateColumns: "24px 1fr 30px 30px 50px",
        gap: "4px",
        fontSize: "0.7rem",
        color: "#6b7d8f",
        textTransform: "uppercase",
        padding: "0 8px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        marginBottom: "8px",
      });
      for (const text of ["#", "Player", "K", "D", "Pts"]) {
        const cell = document.createElement("span");
        cell.textContent = text;
        if (text !== "#" && text !== "Player") cell.style.textAlign = "center";
        if (text === "Pts") cell.style.textAlign = "right";
        header.appendChild(cell);
      }
      this.list.appendChild(header);

      for (const [index, entry] of message.entries.entries()) {
        this.list.appendChild(this.renderEntry(entry, index + 1, localSessionId));
      }

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

    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  private renderEntry(
    entry: LeaderboardEntry,
    placement: number,
    localSessionId: string | null,
  ): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "24px 1fr 30px 30px 50px",
      gap: "4px",
      alignItems: "center",
      padding: "5px 8px",
      borderRadius: "6px",
      fontSize: "0.85rem",
      background: entry.sessionId === localSessionId ? "rgba(255, 255, 255, 0.1)" : "transparent",
    });

    const place = document.createElement("span");
    place.textContent = `${placement}`;
    Object.assign(place.style, {
      color: placement === 1 ? "#ffd166" : "#6b7d8f",
      fontWeight: placement === 1 ? "bold" : "normal",
      fontSize: "0.75rem",
    });

    const bg = swatchBackground({ color: entry.slimeColor, patternId: entry.patternId });
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
      color: `#${entry.slimeColor.toString(16).padStart(6, "0")}`,
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
    score.textContent = `${Math.round(entry.paintScore)}`;
    Object.assign(score.style, {
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      fontWeight: "bold",
    });

    row.append(place, nameCell, k, d, score);
    return row;
  }
}

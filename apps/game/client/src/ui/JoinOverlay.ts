import { FFA_MODE } from "@splat/content/modes/gameModes.ts";
import { swatchBackground } from "./uiUtils.ts";

const SLOTS = FFA_MODE.slots;

export class JoinOverlay {
  private readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly statusText: HTMLParagraphElement;
  private readonly progressContainer: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private readonly swatches: HTMLButtonElement[] = [];
  private selectedIndex = 0;
  private isLoading = true;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#080818",
      zIndex: "20",
      fontFamily: "sans-serif",
      color: "#fff",
      flexDirection: "column",
      gap: "12px",
    });

    const title = document.createElement("h1");
    title.textContent = "Slime Surfers";
    Object.assign(title.style, { margin: "0 0 8px", fontSize: "2.5rem", letterSpacing: "0.15em" });

    this.progressContainer = document.createElement("div");
    Object.assign(this.progressContainer.style, {
      width: "220px",
      height: "4px",
      background: "#222",
      borderRadius: "2px",
      overflow: "hidden",
      marginBottom: "8px",
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
    this.nameInput.placeholder = "Enter your name";
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
    });

    const colorLabel = document.createElement("p");
    colorLabel.textContent = "Choose your color";
    Object.assign(colorLabel.style, { margin: "4px 0 0", fontSize: "0.8rem", color: "#888" });

    const swatchRow = document.createElement("div");
    Object.assign(swatchRow.style, {
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      justifyContent: "center",
      maxWidth: "300px",
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
      swatchRow.appendChild(btn);
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
    });

    this.statusText = document.createElement("p");
    this.statusText.style.fontSize = "0.85rem";
    this.statusText.style.color = "#888";
    this.statusText.textContent = "Loading assets...";

    this.root.append(
      title,
      this.progressContainer,
      this.nameInput,
      colorLabel,
      swatchRow,
      this.joinBtn,
      this.statusText,
    );
    document.body.appendChild(this.root);

    this.selectSwatch(0);
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

  onJoin(callback: (name: string, colorIndex: number) => void): void {
    const submit = (): void => {
      const name = this.nameInput.value.trim() || `Player${Math.floor(Math.random() * 1000)}`;
      callback(name, this.selectedIndex);
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
  }

  hide(): void {
    this.root.style.display = "none";
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
}

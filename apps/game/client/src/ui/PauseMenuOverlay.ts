type PauseMenuCallback = () => void;

const CONTROLS = [
  ["Move", "W A S D"],
  ["Aim", "Mouse"],
  ["Fire", "Left Mouse"],
  ["Carve / Boost", "Space / W+Space"],
  ["Ski Mode", "E on friendly slime"],
  ["Pause", "Esc"],
] as const;

export class PauseMenuOverlay {
  private readonly root: HTMLDivElement;
  private readonly resumeBtn: HTMLButtonElement;
  private visible = false;
  private onResumeCb: PauseMenuCallback | null = null;
  private onToggleCb: PauseMenuCallback | null = null;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(5, 8, 18, 0.72)",
      color: "#f6f7fb",
      fontFamily: "sans-serif",
      zIndex: "35",
      backdropFilter: "blur(8px)",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(520px, calc(100vw - 32px))",
      boxSizing: "border-box",
      padding: "24px",
      borderRadius: "8px",
      background: "rgba(12, 18, 32, 0.94)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      boxShadow: "0 18px 60px rgba(0, 0, 0, 0.42)",
    });

    const title = document.createElement("h2");
    title.textContent = "Paused";
    Object.assign(title.style, {
      margin: "0 0 8px",
      fontSize: "2rem",
      lineHeight: "1",
      letterSpacing: "0",
    });

    const summary = document.createElement("p");
    summary.textContent =
      "Cover the planet with your slime, collect stronger weapons, and splat opponents to swing territory in your favor before time runs out.";
    Object.assign(summary.style, {
      margin: "0 0 20px",
      color: "#b8c6d4",
      fontSize: "0.98rem",
      lineHeight: "1.45",
    });

    const controlsTitle = document.createElement("div");
    controlsTitle.textContent = "Controls";
    Object.assign(controlsTitle.style, {
      margin: "0 0 10px",
      color: "#97abc0",
      fontSize: "0.76rem",
      fontWeight: "bold",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    });

    const controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "10px 18px",
      marginBottom: "22px",
      alignItems: "center",
    });

    for (const [action, binding] of CONTROLS) {
      const actionEl = document.createElement("div");
      actionEl.textContent = action;
      Object.assign(actionEl.style, {
        color: "#e8eef8",
        fontSize: "0.96rem",
      });

      const bindingEl = document.createElement("div");
      bindingEl.textContent = binding;
      Object.assign(bindingEl.style, {
        color: "#0b1220",
        background: "#d8e8ff",
        borderRadius: "6px",
        padding: "5px 8px",
        fontSize: "0.82rem",
        fontWeight: "bold",
        whiteSpace: "nowrap",
      });

      controls.append(actionEl, bindingEl);
    }

    this.resumeBtn = document.createElement("button");
    this.resumeBtn.textContent = "Resume";
    Object.assign(this.resumeBtn.style, {
      width: "100%",
      minHeight: "42px",
      border: "none",
      borderRadius: "6px",
      background: "#27ffb3",
      color: "#07131a",
      cursor: "pointer",
      fontSize: "0.95rem",
      fontWeight: "bold",
      letterSpacing: "0.04em",
    });

    const note = document.createElement("p");
    note.textContent = "The online match keeps running while this menu is open.";
    Object.assign(note.style, {
      margin: "12px 0 0",
      color: "#7f91a4",
      fontSize: "0.78rem",
      lineHeight: "1.35",
      textAlign: "center",
    });

    panel.append(title, summary, controlsTitle, controls, this.resumeBtn, note);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    this.resumeBtn.addEventListener("click", () => this.onResumeCb?.());
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.code !== "Escape") return;
        event.preventDefault();
        this.onToggleCb?.();
      },
      { capture: true },
    );
  }

  onResume(callback: PauseMenuCallback): void {
    this.onResumeCb = callback;
  }

  onToggle(callback: PauseMenuCallback): void {
    this.onToggleCb = callback;
  }

  show(): void {
    this.visible = true;
    this.root.style.display = "flex";
    this.resumeBtn.focus();
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = "none";
  }

  isVisible(): boolean {
    return this.visible;
  }
}

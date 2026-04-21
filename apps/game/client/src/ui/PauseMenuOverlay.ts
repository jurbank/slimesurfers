import type { SoundSystem, SoundCategory } from "../systems/soundSystem.ts";

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

  constructor(sound: SoundSystem) {
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

    const audioTitle = document.createElement("div");
    audioTitle.textContent = "Audio";
    Object.assign(audioTitle.style, {
      margin: "0 0 10px",
      color: "#97abc0",
      fontSize: "0.76rem",
      fontWeight: "bold",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    });

    const audioControls = document.createElement("div");
    Object.assign(audioControls.style, {
      display: "grid",
      gap: "12px",
      marginBottom: "22px",
    });
    audioControls.append(
      this.createAudioControl(sound, "music", "Music"),
      this.createAudioControl(sound, "sfx", "Sound"),
    );

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

    panel.append(
      title,
      summary,
      controlsTitle,
      controls,
      audioTitle,
      audioControls,
      this.resumeBtn,
      note,
    );
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

  private createAudioControl(
    sound: SoundSystem,
    category: SoundCategory,
    label: string,
  ): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      gap: "12px",
      alignItems: "center",
    });

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = !sound.isMuted(category);
    enabled.ariaLabel = `${label} enabled`;
    Object.assign(enabled.style, {
      width: "18px",
      height: "18px",
      accentColor: "#27ffb3",
      cursor: "pointer",
    });

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    Object.assign(labelEl.style, {
      color: "#e8eef8",
      fontSize: "0.94rem",
    });

    const value = document.createElement("div");
    Object.assign(value.style, {
      minWidth: "42px",
      color: "#b8c6d4",
      fontSize: "0.82rem",
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
    });

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(Math.round(sound.getVolume(category) * 100));
    slider.ariaLabel = `${label} volume`;
    Object.assign(slider.style, {
      gridColumn: "2 / 4",
      width: "100%",
      accentColor: "#27ffb3",
      cursor: "pointer",
    });

    const sync = () => {
      sound.setMuted(category, !enabled.checked);
      sound.setVolume(category, Number(slider.value) / 100);
      value.textContent = `${slider.value}%`;
      slider.disabled = !enabled.checked;
      slider.style.opacity = enabled.checked ? "1" : "0.45";
    };

    enabled.addEventListener("change", sync);
    slider.addEventListener("input", sync);
    sync();

    row.append(enabled, labelEl, value, slider);
    return row;
  }
}

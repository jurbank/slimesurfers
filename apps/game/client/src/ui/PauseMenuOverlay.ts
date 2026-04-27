import { AIR_TRICK_DEFS, type AirTrickDefinition } from "@splat/content/tricks/airTrickDefs.ts";
import { InputKey } from "@splat/protocol/network/clientMessages.ts";
import type { SoundSystem, SoundCategory } from "../systems/soundSystem.ts";

type PauseMenuCallback = () => void;

const CONTROLS = [
  ["Move", "W A S D"],
  ["Surf", "E"],
  ["Fire", "Left Mouse"],
  ["Jump / Carve", "Space"],
  ["😊 Emotes", "Q"],
  ["Pause", "Esc"],
] as const;

const GAMEPLAY_NOTES = [
  "Recharge slime faster on your own paint.",
  "Recharge even faster while submerged in your own paint.",
  "Hide inside your own paint while ski mode is active and you stop moving.",
  "Enemy paint slows you down and only gives passive recharge.",
  "Paint more territory than the other team before time runs out.",
  "Land epic air tricks for big splats!",
] as const;

const KEY_LABELS = new Map<number, string>([
  [InputKey.Forward, "W"],
  [InputKey.Backward, "S"],
  [InputKey.Left, "A"],
  [InputKey.Right, "D"],
]);

function describeMoveInput(trick: AirTrickDefinition): string {
  if (trick.kind === "sequence") {
    return trick.sequence?.map((key) => KEY_LABELS.get(key) ?? "?").join(" -> ") ?? "";
  }
  const reps = Math.round(Math.abs(trick.degrees ?? 360) / 360);
  const suffix = reps > 1 ? ` ×${reps}` : "";
  if (trick.kind === "spin") return `A / D${suffix}`;
  if (trick.kind === "flip") return (trick.degrees ?? 0) > 0 ? `W${suffix}` : `S${suffix}`;
  return "";
}

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
      width: "min(880px, calc(100vw - 32px))",
      maxHeight: "calc(100vh - 32px)",
      boxSizing: "border-box",
      padding: "24px",
      borderRadius: "8px",
      background: "rgba(12, 18, 32, 0.94)",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      boxShadow: "0 18px 60px rgba(0, 0, 0, 0.42)",
      overflow: "hidden",
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

    const content = document.createElement("div");
    const syncContentLayout = () => {
      const narrow = window.innerWidth < 720;
      content.style.gridTemplateColumns = narrow
        ? "minmax(0, 1fr)"
        : "minmax(260px, 0.95fr) minmax(260px, 1.05fr)";
      content.style.overflowY = narrow ? "auto" : "visible";
      movesColumn.style.maxHeight = narrow ? "none" : "100%";
    };
    Object.assign(content.style, {
      display: "grid",
      gap: "22px",
      alignItems: "start",
      marginBottom: "22px",
      maxHeight: "min(560px, calc(100vh - 210px))",
    });

    const leftColumn = document.createElement("div");
    Object.assign(leftColumn.style, {
      minWidth: "0",
    });

    const movesColumn = document.createElement("div");
    Object.assign(movesColumn.style, {
      minWidth: "0",
      maxHeight: "100%",
      overflowY: "auto",
      paddingRight: "4px",
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

    const audioSection = document.createElement("div");
    Object.assign(audioSection.style, {
      marginBottom: "22px",
    });

    const audioToggle = document.createElement("button");
    audioToggle.textContent = "Sound Options";
    Object.assign(audioToggle.style, {
      border: "1px solid rgba(216, 232, 255, 0.22)",
      borderRadius: "999px",
      background: "rgba(216, 232, 255, 0.08)",
      color: "#d8e8ff",
      padding: "7px 12px",
      fontSize: "0.76rem",
      fontWeight: "bold",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      cursor: "pointer",
    });

    const audioControls = document.createElement("div");
    Object.assign(audioControls.style, {
      display: "none",
      gap: "12px",
      marginTop: "12px",
    });
    audioControls.append(
      this.createAudioControl(sound, "music", "Music"),
      this.createAudioControl(sound, "sfx", "Sound"),
    );
    audioToggle.setAttribute("aria-expanded", "false");
    audioToggle.addEventListener("click", () => {
      const expanded = audioControls.style.display !== "none";
      audioControls.style.display = expanded ? "none" : "grid";
      audioToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      audioToggle.textContent = expanded ? "Sound Options" : "Hide Sound Options";
    });
    audioSection.append(audioToggle, audioControls);

    const notesTitle = document.createElement("div");
    notesTitle.textContent = "How It Works";
    Object.assign(notesTitle.style, {
      margin: "0 0 10px",
      color: "#97abc0",
      fontSize: "0.76rem",
      fontWeight: "bold",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    });

    const notesList = document.createElement("div");
    Object.assign(notesList.style, {
      display: "grid",
      gap: "8px",
    });

    for (const noteText of GAMEPLAY_NOTES) {
      const noteRow = document.createElement("div");
      noteRow.textContent = `- ${noteText}`;
      Object.assign(noteRow.style, {
        color: "#b8c6d4",
        fontSize: "0.88rem",
        lineHeight: "1.4",
      });
      notesList.appendChild(noteRow);
    }

    const movesTitle = document.createElement("div");
    movesTitle.textContent = "Moves";
    Object.assign(movesTitle.style, {
      margin: "0 0 10px",
      color: "#97abc0",
      fontSize: "0.76rem",
      fontWeight: "bold",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    });

    const movesList = document.createElement("div");
    Object.assign(movesList.style, {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "9px 14px",
      alignItems: "center",
      padding: "14px",
      borderRadius: "10px",
      background: "rgba(125, 170, 230, 0.1)",
      border: "1px solid rgba(160, 205, 255, 0.12)",
    });

    for (const trick of AIR_TRICK_DEFS) {
      const nameEl = document.createElement("div");
      nameEl.textContent = trick.name;
      Object.assign(nameEl.style, {
        color: "#e8eef8",
        fontSize: "0.94rem",
        minWidth: "0",
        overflowWrap: "anywhere",
      });

      const inputEl = document.createElement("div");
      inputEl.textContent = describeMoveInput(trick);
      Object.assign(inputEl.style, {
        color: "#0b1220",
        background: "#d8e8ff",
        borderRadius: "6px",
        padding: "5px 8px",
        fontSize: "0.8rem",
        fontWeight: "bold",
        whiteSpace: "nowrap",
      });

      movesList.append(nameEl, inputEl);
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

    leftColumn.append(audioSection, controlsTitle, controls, notesTitle, notesList);
    movesColumn.append(movesTitle, movesList);
    content.append(leftColumn, movesColumn);
    syncContentLayout();
    window.addEventListener("resize", syncContentLayout);

    panel.append(title, summary, content, this.resumeBtn, note);
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

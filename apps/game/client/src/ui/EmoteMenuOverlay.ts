import { EMOTE_CONFIG, EMOTE_DEFS } from "@splat/content/emotes/emoteDefs.ts";

type EmotePostHandler = (emoteIds: string[]) => void;

const GRID_COLUMNS = 4;
const GRID_MAX_HEIGHT = "min(345px, calc(100vh - 260px))";

export class EmoteMenuOverlay {
  private readonly root = document.createElement("div");
  private readonly panel = document.createElement("div");
  private readonly hint = document.createElement("div");
  private readonly grid = document.createElement("div");
  private readonly selectedStrip = document.createElement("div");
  private readonly toggleButton = document.createElement("button");
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly selectedIds = new Set<string>();
  private postHandler: EmotePostHandler | null = null;
  private visible = false;
  private focusIndex = 0;
  private lastPostMs = -Infinity;
  private cooldownTimer: number | null = null;

  constructor() {
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "32",
      pointerEvents: "none",
      display: "none",
    });

    Object.assign(this.panel.style, {
      position: "absolute",
      right: "18px",
      bottom: "112px",
      width: "min(150px, calc(100vw - 36px))",
      padding: "8px",
      border: "1px solid rgba(255, 255, 255, 0.36)",
      borderRadius: "8px",
      background: "rgba(12, 18, 22, 0.88)",
      boxShadow: "0 14px 44px rgba(0, 0, 0, 0.36)",
      pointerEvents: "auto",
      touchAction: "none",
    });

    Object.assign(this.grid.style, {
      display: "grid",
      gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
      gap: "5px",
      maxHeight: GRID_MAX_HEIGHT,
      overflowY: "auto",
      overscrollBehavior: "contain",
    });

    this.hint.textContent = "Arrow keys to navigate. Enter to select. Q to close.";
    Object.assign(this.hint.style, {
      marginTop: "8px",
      color: "rgba(255, 255, 255, 0.72)",
      font: "700 11px system-ui, sans-serif",
      lineHeight: "1.35",
    });

    Object.assign(this.selectedStrip.style, {
      minHeight: "24px",
      marginTop: "9px",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      color: "#ffffff",
      font: "700 18px system-ui, sans-serif",
    });

    for (const [index, emote] of EMOTE_DEFS.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = emote.glyph;
      button.setAttribute("aria-label", emote.label);
      Object.assign(button.style, {
        width: "100%",
        aspectRatio: "1",
        border: "1px solid rgba(255, 255, 255, 0.28)",
        borderRadius: "6px",
        background: "rgba(255, 255, 255, 0.08)",
        color: "#ffffff",
        font: "20px system-ui, sans-serif",
        lineHeight: "1",
        padding: "0",
        cursor: "pointer",
        touchAction: "none",
        userSelect: "none",
      });
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.focusIndex = index;
        this.toggleSelected(emote.id);
      });
      this.buttons.push(button);
      this.grid.append(button);
    }

    this.panel.append(this.grid, this.selectedStrip, this.hint);
    this.root.append(this.panel);
    document.body.append(this.root);

    this.toggleButton.type = "button";
    this.toggleButton.textContent = "🙂";
    this.toggleButton.setAttribute("aria-label", "Emotes");
    Object.assign(this.toggleButton.style, {
      position: "fixed",
      right: "18px",
      bottom: "calc(112px + min(42vw, 184px))",
      zIndex: "33",
      width: "70px",
      height: "70px",
      border: "1px solid rgba(255, 255, 255, 0.55)",
      borderRadius: "8px",
      background: "rgba(16, 24, 28, 0.66)",
      color: "#fff",
      font: "28px system-ui, sans-serif",
      lineHeight: "1",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.25)",
      touchAction: "none",
      userSelect: "none",
      display:
        window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0
          ? ""
          : "none",
    });
    this.toggleButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
    });
    document.body.append(this.toggleButton);

    window.addEventListener("keydown", this.handleKeyDown, { capture: true });
    window.addEventListener("pointerdown", this.handlePointerDown, { capture: true });
    this.sync();
  }

  onPost(handler: EmotePostHandler): void {
    this.postHandler = handler;
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.root.style.display = "";
    this.sync();
  }

  close(postSelected: boolean): void {
    if (!this.visible) return;
    const emoteIds = [...this.selectedIds];
    const canPost = this.canPost();
    if (postSelected && emoteIds.length > 0 && !canPost) {
      this.scheduleCooldownSync();
      this.sync();
      return;
    }

    this.visible = false;
    this.root.style.display = "none";
    this.selectedIds.clear();
    this.sync();
    if (postSelected && emoteIds.length > 0) {
      this.lastPostMs = performance.now();
      this.postHandler?.(emoteIds);
      this.scheduleCooldownSync();
    }
  }

  toggle(): void {
    if (this.visible) this.close(true);
    else this.show();
  }

  clear(): void {
    this.selectedIds.clear();
    this.sync();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown, { capture: true });
    window.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
    if (this.cooldownTimer !== null) window.clearTimeout(this.cooldownTimer);
    this.root.remove();
    this.toggleButton.remove();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select")) return;

    if (event.code === "KeyQ" && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
      return;
    }

    if (!this.visible) return;

    if (event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close(false);
      return;
    }

    if (event.code === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const emote = EMOTE_DEFS[this.focusIndex];
      if (emote) this.toggleSelected(emote.id);
      return;
    }

    const previousFocus = this.focusIndex;
    if (event.code === "ArrowLeft") this.focusIndex -= 1;
    else if (event.code === "ArrowRight") this.focusIndex += 1;
    else if (event.code === "ArrowUp") this.focusIndex -= GRID_COLUMNS;
    else if (event.code === "ArrowDown") this.focusIndex += GRID_COLUMNS;
    else return;

    event.preventDefault();
    event.stopPropagation();
    this.focusIndex = Math.max(0, Math.min(EMOTE_DEFS.length - 1, this.focusIndex));
    if (this.focusIndex !== previousFocus) this.sync();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.visible || event.pointerType === "mouse") return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && (this.root.contains(target) || this.toggleButton.contains(target))) return;
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  };

  private toggleSelected(emoteId: string): void {
    if (this.selectedIds.has(emoteId)) {
      this.selectedIds.delete(emoteId);
      this.sync();
      return;
    }
    if (this.selectedIds.size >= EMOTE_CONFIG.maxSelected) return;
    this.selectedIds.add(emoteId);
    this.sync();
  }

  private scheduleCooldownSync(): void {
    if (this.cooldownTimer !== null) window.clearTimeout(this.cooldownTimer);
    const remainingMs = Math.max(
      0,
      EMOTE_CONFIG.postCooldownMs - (performance.now() - this.lastPostMs),
    );
    this.cooldownTimer = window.setTimeout(() => {
      this.cooldownTimer = null;
      this.sync();
    }, remainingMs);
  }

  private canPost(): boolean {
    return performance.now() - this.lastPostMs >= EMOTE_CONFIG.postCooldownMs;
  }

  private sync(): void {
    const canPost = this.canPost();
    for (const [index, button] of this.buttons.entries()) {
      const emote = EMOTE_DEFS[index];
      const selected = emote ? this.selectedIds.has(emote.id) : false;
      const focused = index === this.focusIndex;
      button.style.background = selected
        ? "rgba(102, 255, 184, 0.24)"
        : "rgba(255, 255, 255, 0.08)";
      button.style.borderColor = focused
        ? "rgba(255, 238, 112, 0.95)"
        : selected
          ? "rgba(102, 255, 184, 0.8)"
          : "rgba(255, 255, 255, 0.28)";
      button.style.boxShadow = focused ? "0 0 0 2px rgba(255, 238, 112, 0.32)" : "none";
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }

    this.selectedStrip.textContent = "";
    this.selectedStrip.style.opacity = canPost ? "1" : "0.55";
    for (const selectedId of this.selectedIds) {
      const emote = EMOTE_DEFS.find((item) => item.id === selectedId);
      if (!emote) continue;
      const item = document.createElement("span");
      item.textContent = emote.glyph;
      this.selectedStrip.append(item);
    }

    const remainingMs = Math.max(
      0,
      EMOTE_CONFIG.postCooldownMs - (performance.now() - this.lastPostMs),
    );
    this.hint.textContent = canPost
      ? "Arrow keys to navigate. Enter to select. Q to close."
      : `Emotes ready in ${(remainingMs / 1000).toFixed(1)}s.`;
  }
}

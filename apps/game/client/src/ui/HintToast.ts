const DISPLAY_MS = 6000;
const FADE_MS = 800;

export class HintToast {
  private readonly root: HTMLDivElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      bottom: "18%",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "10px 20px",
      borderRadius: "10px",
      background: "rgba(9, 12, 24, 0.82)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      color: "#f6f7fb",
      fontFamily: "sans-serif",
      fontSize: "0.95rem",
      letterSpacing: "0.06em",
      backdropFilter: "blur(10px)",
      zIndex: "20",
      pointerEvents: "none",
      opacity: "0",
      transition: `opacity ${FADE_MS}ms ease`,
      whiteSpace: "nowrap",
      display: "none",
    });
    document.body.appendChild(this.root);
  }

  show(message: string): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);

    this.root.textContent = message;
    this.root.style.display = "block";
    // Next tick so the display:block renders before transition fires
    requestAnimationFrame(() => {
      this.root.style.opacity = "1";
    });

    this.fadeTimer = setTimeout(() => {
      this.root.style.opacity = "0";
      this.hideTimer = setTimeout(() => {
        this.root.style.display = "none";
      }, FADE_MS);
    }, DISPLAY_MS);
  }
}

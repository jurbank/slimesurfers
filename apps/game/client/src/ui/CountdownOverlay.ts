export class CountdownOverlay {
  private readonly root: HTMLDivElement;
  private readonly labelEl: HTMLParagraphElement;
  private readonly numberEl: HTMLDivElement;
  private readonly noteEl: HTMLParagraphElement;
  private dangerThreshold = 3;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "20",
      fontFamily: "sans-serif",
      color: "#f6f7fb",
      pointerEvents: "none",
    });

    this.labelEl = document.createElement("p");
    this.labelEl.textContent = "MATCH STARTING IN";
    Object.assign(this.labelEl.style, {
      margin: "0 0 4px",
      fontSize: "0.8rem",
      letterSpacing: "0.15em",
      color: "#9fb3c8",
    });

    this.numberEl = document.createElement("div");
    Object.assign(this.numberEl.style, {
      fontSize: "6rem",
      fontWeight: "bold",
      lineHeight: "1",
      letterSpacing: "-0.02em",
    });

    this.noteEl = document.createElement("p");
    this.noteEl.textContent = "Weapons disabled until match begins";
    Object.assign(this.noteEl.style, {
      margin: "12px 0 0",
      fontSize: "0.75rem",
      letterSpacing: "0.08em",
      color: "#9fb3c8",
    });

    this.root.append(this.labelEl, this.numberEl, this.noteEl);
    document.body.appendChild(this.root);
  }

  show(
    seconds: number,
    options?: {
      label?: string;
      note?: string;
      dangerThreshold?: number;
    },
  ): void {
    this.labelEl.textContent = options?.label ?? "MATCH STARTING IN";
    this.noteEl.textContent = options?.note ?? "Weapons disabled until match begins";
    this.setDangerThreshold(options?.dangerThreshold ?? 3);
    this.setSeconds(seconds);
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  setSeconds(seconds: number): void {
    const ceiled = Math.ceil(seconds);
    this.numberEl.textContent = `${ceiled}`;
    this.numberEl.style.color = ceiled <= this.dangerThreshold ? "#ef4444" : "#f6f7fb";
  }

  setDangerThreshold(seconds: number): void {
    this.dangerThreshold = seconds;
  }
}

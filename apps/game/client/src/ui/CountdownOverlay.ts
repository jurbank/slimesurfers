export class CountdownOverlay {
  private readonly root: HTMLDivElement;
  private readonly numberEl: HTMLDivElement;

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

    const label = document.createElement("p");
    label.textContent = "MATCH STARTING IN";
    Object.assign(label.style, {
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

    const note = document.createElement("p");
    note.textContent = "Weapons disabled until match begins";
    Object.assign(note.style, {
      margin: "12px 0 0",
      fontSize: "0.75rem",
      letterSpacing: "0.08em",
      color: "#9fb3c8",
    });

    this.root.append(label, this.numberEl, note);
    document.body.appendChild(this.root);
  }

  show(seconds: number): void {
    this.setSeconds(seconds);
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  setSeconds(seconds: number): void {
    const ceiled = Math.ceil(seconds);
    this.numberEl.textContent = `${ceiled}`;
    this.numberEl.style.color = ceiled <= 3 ? "#ef4444" : "#f6f7fb";
  }
}

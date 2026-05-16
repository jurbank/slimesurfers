export class SurfDebugHud {
  private readonly root: HTMLDivElement;
  private readonly speedLabel: HTMLDivElement;
  private readonly slopeLabel: HTMLDivElement;
  private readonly maxSpeedLabel: HTMLDivElement;
  private readonly carvingLabel: HTMLDivElement;
  private visible = false;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      right: "16px",
      top: "60px",
      width: "200px",
      padding: "10px 12px",
      borderRadius: "10px",
      background: "rgba(9, 12, 24, 0.82)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      color: "#f6f7fb",
      fontFamily: "monospace",
      fontSize: "0.8rem",
      backdropFilter: "blur(10px)",
      zIndex: "20",
      pointerEvents: "none",
      display: "none",
      lineHeight: "1.6",
    });

    const title = document.createElement("div");
    title.textContent = "SURF DEBUG";
    Object.assign(title.style, {
      fontSize: "0.65rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "#97abc0",
      marginBottom: "6px",
    });

    this.speedLabel = document.createElement("div");
    this.slopeLabel = document.createElement("div");
    this.maxSpeedLabel = document.createElement("div");
    this.carvingLabel = document.createElement("div");

    this.root.append(
      title,
      this.speedLabel,
      this.slopeLabel,
      this.maxSpeedLabel,
      this.carvingLabel,
    );
    document.body.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? "block" : "none";
  }

  update(
    speed: number,
    slopeAccel: number,
    dynamicMaxSpeed: number,
    isCarving: boolean,
    isSurfing: boolean,
  ): void {
    if (!this.visible || !isSurfing) {
      if (this.visible) this.root.style.display = "none";
      return;
    }
    this.root.style.display = "block";
    this.speedLabel.textContent = `speed:    ${speed.toFixed(2)} m/s`;
    this.slopeLabel.textContent = `slope:    ${slopeAccel >= 0 ? "+" : ""}${slopeAccel.toFixed(2)}`;
    this.maxSpeedLabel.textContent = `max spd:  ${dynamicMaxSpeed.toFixed(2)} m/s`;
    this.carvingLabel.textContent = `carving:  ${isCarving ? "YES" : "no"}`;
  }

  dispose(): void {
    this.root.remove();
  }
}

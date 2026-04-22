export class CombatHud {
  private readonly root: HTMLDivElement;
  private readonly weaponLabel: HTMLDivElement;
  private readonly healthFill: HTMLDivElement;
  private readonly slimeFill: HTMLDivElement;
  private readonly healthLabel: HTMLDivElement;
  private readonly slimeLabel: HTMLDivElement;
  private readonly statusLabel: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      left: "16px",
      top: "16px",
      width: "260px",
      padding: "12px",
      borderRadius: "12px",
      background: "rgba(9, 12, 24, 0.82)",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      color: "#f6f7fb",
      fontFamily: "sans-serif",
      backdropFilter: "blur(10px)",
      zIndex: "15",
      pointerEvents: "none",
      display: "none",
    });

    const title = document.createElement("div");
    title.textContent = "Status";
    Object.assign(title.style, {
      fontSize: "0.75rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "#97abc0",
      marginBottom: "10px",
    });

    this.weaponLabel = document.createElement("div");
    Object.assign(this.weaponLabel.style, {
      fontSize: "0.9rem",
      fontWeight: "bold",
      marginBottom: "8px",
      color: "#d8e8ff",
    });

    const track = document.createElement("div");
    Object.assign(track.style, {
      height: "12px",
      borderRadius: "999px",
      background: "rgba(255, 255, 255, 0.08)",
      overflow: "hidden",
      marginBottom: "8px",
    });

    const slimeTrack = document.createElement("div");
    Object.assign(slimeTrack.style, {
      height: "12px",
      borderRadius: "999px",
      background: "rgba(255, 255, 255, 0.08)",
      overflow: "hidden",
      marginBottom: "8px",
    });

    this.healthFill = document.createElement("div");
    Object.assign(this.healthFill.style, {
      height: "100%",
      width: "100%",
      borderRadius: "999px",
      background: "linear-gradient(90deg, #ff6a3d, #ffd84d)",
      transition: "width 120ms linear",
    });
    track.appendChild(this.healthFill);

    this.slimeFill = document.createElement("div");
    Object.assign(this.slimeFill.style, {
      height: "100%",
      width: "100%",
      borderRadius: "999px",
      background: "linear-gradient(90deg, #2bd3ff, #27ffb3)",
      transition: "width 120ms linear",
    });
    slimeTrack.appendChild(this.slimeFill);

    this.healthLabel = document.createElement("div");
    Object.assign(this.healthLabel.style, {
      fontSize: "0.95rem",
      fontWeight: "bold",
      marginBottom: "4px",
    });

    this.slimeLabel = document.createElement("div");
    Object.assign(this.slimeLabel.style, {
      fontSize: "0.95rem",
      fontWeight: "bold",
      marginBottom: "4px",
    });

    this.statusLabel = document.createElement("div");
    Object.assign(this.statusLabel.style, {
      fontSize: "0.85rem",
      color: "#b8c6d4",
      minHeight: "1.2em",
    });

    this.root.append(
      title,
      this.weaponLabel,
      track,
      this.healthLabel,
      slimeTrack,
      this.slimeLabel,
      this.statusLabel,
    );
    document.body.appendChild(this.root);

    this.flash = document.createElement("div");
    Object.assign(this.flash.style, {
      position: "fixed",
      inset: "0",
      background:
        "radial-gradient(circle at center, rgba(255, 86, 66, 0.18), rgba(255, 30, 30, 0.0) 60%)",
      opacity: "0",
      pointerEvents: "none",
      transition: "opacity 120ms ease-out",
      zIndex: "14",
    });
    document.body.appendChild(this.flash);

    this.crosshair = document.createElement("div");
    Object.assign(this.crosshair.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      width: "20px",
      height: "20px",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
      zIndex: "20",
      display: "none",
    });

    // Create a simple crosshair (horizontal and vertical lines)
    const hLine = document.createElement("div");
    Object.assign(hLine.style, {
      position: "absolute",
      top: "50%",
      left: "0",
      width: "100%",
      height: "2px",
      background: "white",
      boxShadow: "0 0 2px black",
      transform: "translateY(-50%)",
    });
    const vLine = document.createElement("div");
    Object.assign(vLine.style, {
      position: "absolute",
      left: "50%",
      top: "0",
      width: "2px",
      height: "100%",
      background: "white",
      boxShadow: "0 0 2px black",
      transform: "translateX(-50%)",
    });

    this.crosshair.append(hLine, vLine);
    document.body.appendChild(this.crosshair);
  }

  update(
    weaponName: string,
    health: number,
    maxHealth: number,
    slimeLevel: number,
    maxSlimeLevel: number,
    respawnTimer: number,
  ): void {
    this.root.style.display = "block";
    this.crosshair.style.display = "block";
    this.weaponLabel.textContent = `Weapon ${weaponName}`;
    const healthRatio = maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, health / maxHealth));
    const slimeRatio =
      maxSlimeLevel <= 0 ? 0 : Math.max(0, Math.min(1, slimeLevel / maxSlimeLevel));
    this.healthFill.style.width = `${healthRatio * 100}%`;
    this.slimeFill.style.width = `${slimeRatio * 100}%`;
    this.healthLabel.textContent = `Health ${Math.round(health)} / ${maxHealth}`;
    this.slimeLabel.textContent = `Slime ${Math.round(slimeLevel)} / ${maxSlimeLevel}`;
    this.statusLabel.textContent =
      respawnTimer > 0
        ? `Respawning in ${respawnTimer.toFixed(1)}s`
        : slimeLevel < maxSlimeLevel * 0.2
          ? "Low slime"
          : "Combat ready";
  }

  flashDamage(): void {
    this.flash.style.opacity = "1";
    setTimeout(() => {
      this.flash.style.opacity = "0";
    }, 80);
  }

  clear(): void {
    this.root.style.display = "none";
    this.crosshair.style.display = "none";
    this.flash.style.opacity = "0";
  }
}

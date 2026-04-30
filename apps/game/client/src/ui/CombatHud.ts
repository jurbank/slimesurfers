import { getTeamLabel } from "./teamPresentation.ts";

const OUTER_MIN_HALF_PX = 20;
const OUTER_MAX_HALF_PX = 90;
const INNER_HALF_PX = 14;

export class CombatHud {
  private readonly root: HTMLDivElement;
  private readonly weaponLabel: HTMLDivElement;
  private readonly healthFill: HTMLDivElement;
  private readonly healthLabel: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly acquisitionRoot: HTMLDivElement;
  private readonly acquisitionOuterBox: HTMLDivElement;
  private readonly acquisitionInnerBox: HTMLDivElement;
  private readonly sniperScopeRoot: HTMLDivElement;
  private readonly sniperRing: HTMLDivElement;
  private readonly sniperDot: HTMLDivElement;
  private readonly teamPill: HTMLDivElement;

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
      flexDirection: "column",
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

    this.healthFill = document.createElement("div");
    Object.assign(this.healthFill.style, {
      height: "100%",
      width: "100%",
      borderRadius: "999px",
      background: "linear-gradient(90deg, #ff6a3d, #ffd84d)",
      transition: "width 120ms linear",
    });
    track.appendChild(this.healthFill);

    this.healthLabel = document.createElement("div");
    Object.assign(this.healthLabel.style, {
      fontSize: "0.95rem",
      fontWeight: "bold",
      marginBottom: "4px",
    });

    this.teamPill = document.createElement("div");
    Object.assign(this.teamPill.style, {
      display: "none",
      fontSize: "0.7rem",
      fontWeight: "bold",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      padding: "2px 8px",
      borderRadius: "999px",
      marginBottom: "8px",
      alignSelf: "flex-start",
    });

    this.root.append(this.teamPill, this.weaponLabel, track, this.healthLabel);
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

    this.acquisitionRoot = document.createElement("div");
    Object.assign(this.acquisitionRoot.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      display: "none",
      zIndex: "18",
    });

    this.acquisitionInnerBox = document.createElement("div");
    Object.assign(this.acquisitionInnerBox.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: `${INNER_HALF_PX * 2}px`,
      height: `${INNER_HALF_PX * 2}px`,
      transform: "translate(-50%, -50%)",
      border: "1px dashed rgba(255, 255, 255, 0.35)",
      boxSizing: "border-box",
    });

    this.acquisitionOuterBox = document.createElement("div");
    Object.assign(this.acquisitionOuterBox.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      border: "2px solid rgba(255, 255, 255, 0.9)",
      boxSizing: "border-box",
      transition: "border-color 80ms",
    });

    this.acquisitionRoot.append(this.acquisitionInnerBox, this.acquisitionOuterBox);
    document.body.appendChild(this.acquisitionRoot);

    this.sniperScopeRoot = document.createElement("div");
    Object.assign(this.sniperScopeRoot.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      display: "none",
      zIndex: "19",
      background:
        "radial-gradient(circle at center, transparent 28%, rgba(0,0,0,0.75) 65%, rgba(0,0,0,0.92) 100%)",
    });

    this.sniperRing = document.createElement("div");
    Object.assign(this.sniperRing.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "200px",
      height: "200px",
      borderRadius: "50%",
      border: "1px solid rgba(255, 255, 255, 0.55)",
      boxSizing: "border-box",
    });

    this.sniperDot = document.createElement("div");
    Object.assign(this.sniperDot.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      borderRadius: "50%",
      background: "rgba(255, 30, 30, 0.85)",
      transform: "translate(-50%, -50%)",
    });

    this.sniperScopeRoot.append(this.sniperRing, this.sniperDot);
    document.body.appendChild(this.sniperScopeRoot);
  }

  update(
    weaponLabel: string,
    health: number,
    maxHealth: number,
    teamColor?: number,
    teamId?: number,
  ): void {
    this.root.style.display = "flex";
    this.crosshair.style.display = "block";
    this.weaponLabel.textContent = weaponLabel;
    const healthRatio = maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, health / maxHealth));
    this.healthFill.style.width = `${healthRatio * 100}%`;
    this.healthLabel.textContent = `Health ${Math.round(health)} / ${maxHealth}`;

    if (teamColor !== undefined) {
      const hex = `#${teamColor.toString(16).padStart(6, "0")}`;
      const r = (teamColor >> 16) & 0xff;
      const g = (teamColor >> 8) & 0xff;
      const b = teamColor & 0xff;
      this.teamPill.style.display = "block";
      this.teamPill.style.color = hex;
      this.teamPill.style.background = `rgba(${r}, ${g}, ${b}, 0.18)`;
      this.teamPill.style.border = `1px solid rgba(${r}, ${g}, ${b}, 0.45)`;
      this.teamPill.textContent =
        teamId === undefined ? "Your Team" : getTeamLabel(teamId, teamColor).toUpperCase();
    } else {
      this.teamPill.style.display = "none";
    }
  }

  showAcquisitionOverlay(holdProgress: number, isLocked: boolean, isGuaranteed: boolean): void {
    this.acquisitionRoot.style.display = "block";
    const half = OUTER_MIN_HALF_PX + holdProgress * (OUTER_MAX_HALF_PX - OUTER_MIN_HALF_PX);
    const size = `${half * 2}px`;
    this.acquisitionOuterBox.style.width = size;
    this.acquisitionOuterBox.style.height = size;
    if (isGuaranteed) {
      this.acquisitionOuterBox.style.borderColor = "rgba(255, 140, 0, 0.95)";
      this.acquisitionInnerBox.style.borderColor = "rgba(255, 200, 0, 0.9)";
    } else if (isLocked) {
      this.acquisitionOuterBox.style.borderColor = "rgba(255, 60, 60, 0.95)";
      this.acquisitionInnerBox.style.borderColor = "rgba(255, 255, 255, 0.35)";
    } else {
      this.acquisitionOuterBox.style.borderColor = "rgba(255, 255, 255, 0.9)";
      this.acquisitionInnerBox.style.borderColor = "rgba(255, 255, 255, 0.35)";
    }
  }

  hideAcquisitionOverlay(): void {
    this.acquisitionRoot.style.display = "none";
  }

  showSniperScope(chargeProgress: number): void {
    this.sniperScopeRoot.style.display = "block";
    const size = 2 + chargeProgress * 18;
    const alpha = 0.7 + chargeProgress * 0.3;
    const glowSize = 2 + chargeProgress * 10;
    this.sniperDot.style.width = `${size}px`;
    this.sniperDot.style.height = `${size}px`;
    this.sniperDot.style.background = `rgba(255, ${Math.round(30 - chargeProgress * 30)}, ${Math.round(30 - chargeProgress * 30)}, ${alpha})`;
    this.sniperDot.style.boxShadow = `0 0 ${glowSize}px ${Math.round(glowSize * 0.5)}px rgba(255, 0, 0, ${chargeProgress * 0.7})`;
  }

  hideSniperScope(): void {
    this.sniperScopeRoot.style.display = "none";
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
    this.sniperScopeRoot.style.display = "none";
  }
}

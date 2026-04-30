import * as THREE from "three";

const CANVAS_WIDTH = 192;
const CANVAS_HEIGHT = 30;
const SPRITE_WIDTH = 3.0;
const SPRITE_HEIGHT = (SPRITE_WIDTH * CANVAS_HEIGHT) / CANVAS_WIDTH;
const FADE_SPEED = 6;
const PIP_RADIUS = 6;
const PIP_CX = 10 + PIP_RADIUS;
const PIP_CY = CANVAS_HEIGHT / 2;
const TEXT_X = PIP_CX + PIP_RADIUS + 6;

export type TeamRelation = "ally" | "enemy" | "ffa";

export class Nameplate {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;

  private name: string;
  private slimeColor: number;
  private relation: TeamRelation = "ffa";
  private teamColor: number | undefined;
  private visibleAmount = 0;

  constructor(name: string, slimeColor: number) {
    this.name = name;
    this.slimeColor = slimeColor;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Nameplate: failed to create canvas context");
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.position.set(0, 3.25, 0);
    this.sprite.scale.set(SPRITE_WIDTH, SPRITE_HEIGHT, 1);
    this.sprite.renderOrder = 1201;
    this.sprite.frustumCulled = false;
    this.sprite.visible = false;

    this.draw();
  }

  setName(name: string): void {
    if (this.name === name) return;
    this.name = name;
    this.draw();
  }

  setTeamRelation(relation: TeamRelation, teamColor?: number): void {
    if (this.relation === relation && this.teamColor === teamColor) return;
    this.relation = relation;
    this.teamColor = teamColor;
    this.draw();
  }

  update(isVisible: boolean, dt: number, camera?: THREE.Camera): void {
    const target = isVisible ? 1 : 0;
    this.visibleAmount += (target - this.visibleAmount) * Math.min(1, Math.max(0, dt) * FADE_SPEED);
    if (this.visibleAmount < 0.01) this.visibleAmount = 0;
    if (this.visibleAmount > 0.99) this.visibleAmount = 1;

    this.material.opacity = this.visibleAmount;
    this.sprite.visible = this.visibleAmount > 0;

    if (this.sprite.visible && camera) {
      // Scale based on distance to camera to keep text size consistent
      const dist = this.sprite.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position);
      // At dist=15 (camera default), we want scale=1.0.
      // We clamp distance so it doesn't get ridiculously large or small.
      const scale = Math.max(8, Math.min(dist, 80)) / 15;
      this.sprite.scale.set(SPRITE_WIDTH * scale, SPRITE_HEIGHT * scale, 1);
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background — solid dark pill
    const bgColor =
      this.relation === "ally"
        ? "rgba(20, 60, 40, 0.85)"
        : this.relation === "enemy"
          ? "rgba(60, 20, 20, 0.85)"
          : "rgba(10, 14, 26, 0.82)";
    const rad = CANVAS_HEIGHT / 2;
    ctx.beginPath();
    ctx.moveTo(rad, 0);
    ctx.lineTo(CANVAS_WIDTH - rad, 0);
    ctx.arcTo(CANVAS_WIDTH, 0, CANVAS_WIDTH, rad, rad);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - rad);
    ctx.arcTo(CANVAS_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH - rad, CANVAS_HEIGHT, rad);
    ctx.lineTo(rad, CANVAS_HEIGHT);
    ctx.arcTo(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - rad, rad);
    ctx.lineTo(0, rad);
    ctx.arcTo(0, 0, rad, 0, rad);
    ctx.closePath();
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Pip — team color in team mode, slime color in FFA
    const pipColor =
      this.relation !== "ffa" && this.teamColor !== undefined ? this.teamColor : this.slimeColor;
    const pr = (pipColor >> 16) & 0xff;
    const pg = (pipColor >> 8) & 0xff;
    const pb = pipColor & 0xff;
    ctx.beginPath();
    ctx.arc(PIP_CX, PIP_CY, PIP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Name — robust text drawing
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.font = "bold 14px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";

    // Ensure we have a string to draw
    const displayName = this.name || "Player";
    ctx.fillText(displayName, TEXT_X, CANVAS_HEIGHT / 2);

    // Optional subtle stroke for better legibility on bright backgrounds
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.5;
    ctx.strokeText(displayName, TEXT_X, CANVAS_HEIGHT / 2);

    this.texture.needsUpdate = true;
  }
}

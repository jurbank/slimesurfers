import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";

interface SlimeRechargeGaugeState {
  movementState: number;
  surfState: number;
  slimeLevel: number;
}

const CANVAS_WIDTH = 100;
const CANVAS_HEIGHT = 130;
const SPRITE_WIDTH = 1.15;
const SPRITE_HEIGHT = 1.75;
const FILL_EPSILON = 0.02;
const FADE_SPEED = 12;

export class SlimeRechargeGauge {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly fillColor = new THREE.Color();
  private readonly previousFillColor = new THREE.Color();
  private visualFill = 1;
  private previousSlimeLevel: number = GAME_CONFIG.slime.maxLevel;
  private visibleAmount = 0;
  private lastDrawnFill = -1;
  private lastDrawnAlpha = -1;
  private lastDrawnPulse = -1;

  constructor(slimeColor: number) {
    this.fillColor.setHex(slimeColor);
    this.previousFillColor.copy(this.fillColor);

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create slime recharge gauge canvas context");
    }
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
    this.sprite.position.set(1.28, 1.55, 0);
    this.sprite.scale.set(SPRITE_WIDTH, SPRITE_HEIGHT, 1);
    this.sprite.renderOrder = 1200;
    this.sprite.frustumCulled = false;
    this.sprite.visible = false;
    this.draw(1, 0, 0);
  }

  update(state: SlimeRechargeGaugeState, dt: number): void {
    const maxSlime = GAME_CONFIG.slime.maxLevel;
    const targetFill = maxSlime <= 0 ? 0 : THREE.MathUtils.clamp(state.slimeLevel / maxSlime, 0, 1);
    this.visualFill += (targetFill - this.visualFill) * Math.min(1, dt * 14);

    const alive = state.movementState !== PlayerMovementState.Dead;
    const surfing =
      state.surfState === PlayerSurfState.SurfmingMoving ||
      state.surfState === PlayerSurfState.SurfmingHidden;
    const filling = state.slimeLevel > this.previousSlimeLevel + FILL_EPSILON;
    this.previousSlimeLevel = state.slimeLevel;

    const targetVisible = alive && surfing && targetFill < 0.999 ? 1 : 0;
    this.visibleAmount +=
      (targetVisible - this.visibleAmount) * Math.min(1, Math.max(0, dt) * FADE_SPEED);
    if (this.visibleAmount < 0.01) this.visibleAmount = 0;
    if (this.visibleAmount > 0.99) this.visibleAmount = 1;

    this.material.opacity = this.visibleAmount;
    this.sprite.visible = this.visibleAmount > 0;
    if (!this.sprite.visible) return;

    const pulse = filling ? Math.sin(performance.now() * 0.018) * 0.5 + 0.5 : 0;
    if (
      Math.abs(this.visualFill - this.lastDrawnFill) > 0.004 ||
      Math.abs(this.visibleAmount - this.lastDrawnAlpha) > 0.02 ||
      Math.abs(pulse - this.lastDrawnPulse) > 0.08 ||
      !this.previousFillColor.equals(this.fillColor)
    ) {
      this.draw(this.visualFill, this.visibleAmount, pulse);
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }

  private draw(fill: number, alpha: number, pulse: number): void {
    this.lastDrawnFill = fill;
    this.lastDrawnAlpha = alpha;
    this.lastDrawnPulse = pulse;
    this.previousFillColor.copy(this.fillColor);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = alpha;

    const x = 34;
    const y = 15;
    const width = 28;
    const height = 98;
    const radius = width / 2;
    const clampedFill = THREE.MathUtils.clamp(fill, 0, 1);
    const fillHeight = clampedFill <= 0 ? 0 : Math.max(width, height * clampedFill);
    const color = `#${this.fillColor.getHexString()}`;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    this.roundRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = "rgba(5, 8, 14, 0.84)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    this.roundRect(ctx, x + 3, y + 3, width - 6, height - 6, radius - 3);
    ctx.clip();
    const gradient = ctx.createLinearGradient(x, y + height, x, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.6, color);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.95)");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = alpha * (0.78 + pulse * 0.22);
    if (fillHeight > 0) {
      ctx.fillRect(
        x + 3,
        y + height - 3 - Math.max(0, fillHeight - 6),
        width - 6,
        Math.max(0, fillHeight - 6),
      );
    }

    ctx.globalAlpha = alpha * (0.25 + pulse * 0.28);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    if (fillHeight > 18) {
      ctx.fillRect(x + 7, y + height - fillHeight + 7, 4, fillHeight - 18);
    }
    ctx.restore();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    this.roundRect(ctx, x, y, width, height, radius);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.36)";
    this.roundRect(ctx, x + 4, y + 4, width - 8, height - 8, radius - 4);
    ctx.stroke();

    if (clampedFill > 0) {
      const knobY = y + height - 3 - (height - 6) * clampedFill;
      ctx.globalAlpha = alpha * (0.7 + pulse * 0.3);
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.beginPath();
      ctx.arc(x + width / 2, knobY, 5 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

import * as THREE from "three";
import { PlayerMovementState } from "@splat/simulation/match/simState.ts";

interface HealthBarState {
  health: number;
  movementState: number;
}

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 20;
const SPRITE_WIDTH = 2.2;
const SPRITE_HEIGHT = 0.34;
const FADE_SPEED = 8;
const VISIBLE_DURATION = 3.5;

export class HealthBar {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private visibleAmount = 0;
  private visibleTimer = 0;
  private lastDrawnFill = -1;
  private lastDrawnAlpha = -1;
  private previousHealth: number;

  constructor(maxHealth: number) {
    this.previousHealth = maxHealth;

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create health bar canvas context");
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
    this.sprite.position.set(0, 2.6, 0);
    this.sprite.scale.set(SPRITE_WIDTH, SPRITE_HEIGHT, 1);
    this.sprite.renderOrder = 1200;
    this.sprite.frustumCulled = false;
    this.sprite.visible = false;
  }

  update(state: HealthBarState, dt: number, maxHealth: number): void {
    const alive = state.movementState !== PlayerMovementState.Dead;
    const fill = maxHealth > 0 ? THREE.MathUtils.clamp(state.health / maxHealth, 0, 1) : 0;

    if (alive && state.health < this.previousHealth) {
      this.visibleTimer = VISIBLE_DURATION;
    }
    this.previousHealth = state.health;

    if (alive && fill < 0.999) {
      this.visibleTimer = Math.max(0, this.visibleTimer - Math.max(0, dt));
    } else {
      this.visibleTimer = 0;
    }

    const targetVisible = alive && this.visibleTimer > 0 ? 1 : 0;
    this.visibleAmount +=
      (targetVisible - this.visibleAmount) * Math.min(1, Math.max(0, dt) * FADE_SPEED);
    if (this.visibleAmount < 0.01) this.visibleAmount = 0;
    if (this.visibleAmount > 0.99) this.visibleAmount = 1;

    this.material.opacity = this.visibleAmount;
    this.sprite.visible = this.visibleAmount > 0;
    if (!this.sprite.visible) return;

    if (
      Math.abs(fill - this.lastDrawnFill) > 0.005 ||
      Math.abs(this.visibleAmount - this.lastDrawnAlpha) > 0.02
    ) {
      this.draw(fill, this.visibleAmount);
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }

  private draw(fill: number, alpha: number): void {
    this.lastDrawnFill = fill;
    this.lastDrawnAlpha = alpha;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const x = 4;
    const y = 4;
    const w = CANVAS_WIDTH - 8;
    const h = CANVAS_HEIGHT - 8;
    const r = h / 2;

    // Background
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = "rgba(5, 8, 14, 0.84)";
    ctx.fill();
    ctx.restore();

    // Colored fill
    const fillW = Math.max(0, (w - 4) * fill);
    if (fillW > 0) {
      ctx.save();
      this.roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r - 2);
      ctx.clip();

      // Color: green → yellow → red
      const barColor = this.healthColor(fill);
      ctx.fillStyle = barColor;
      ctx.globalAlpha = alpha * 0.92;
      this.roundRect(ctx, x + 2, y + 2, fillW, h - 4, r - 2);
      ctx.fill();
      ctx.restore();
    }

    // Outer border
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    this.roundRect(ctx, x, y, w, h, r);
    ctx.stroke();

    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  private healthColor(fill: number): string {
    if (fill > 0.5) {
      const t = (fill - 0.5) / 0.5;
      const r = Math.round(255 * (1 - t));
      const g = 220;
      return `rgb(${r}, ${g}, 60)`;
    } else {
      const t = fill / 0.5;
      const g = Math.round(160 * t);
      return `rgb(230, ${g}, 40)`;
    }
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

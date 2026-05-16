import * as THREE from "three";
import { getWeaponDefinition, type WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";

interface SlimeRechargeGaugeState {
  movementState: number;
  surfState: number;
  slimeLevel: number;
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  isOnFriendlySlime: boolean;
}

const CANVAS_WIDTH = 136;
const CANVAS_HEIGHT = 130;
const SPRITE_WIDTH = 1.65;
const SPRITE_HEIGHT = 1.88;
const FILL_EPSILON = 0.02;
const FADE_SPEED = 12;
const COMPACT_AMMO_THRESHOLD = 12;
const DRY_FIRE_FLASH_DURATION = 0.34;
const ACTIVITY_VISIBLE_DURATION = 2;
const GOLD_COLOR = new THREE.Color(0xffd24d);

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
  private lastDrawnGoldPulse = -1;
  private lastDrawnDryFirePulse = -1;
  private lastDrawnShotsRemaining = -1;
  private lastDrawnShotsTotal = -1;
  private lastDryFirePulseSeq = 0;
  private lastActivityPulseSeq = 0;
  private dryFireFlashTimer = 0;
  private activityVisibleTimer = 0;

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
    this.draw(1, 0, 0, 0, 0);
  }

  update(
    state: SlimeRechargeGaugeState,
    dt: number,
    dryFirePulseSeq = 0,
    activityPulseSeq = 0,
  ): void {
    const maxSlime = GAME_CONFIG.slime.maxLevel;
    const targetFill = maxSlime <= 0 ? 0 : THREE.MathUtils.clamp(state.slimeLevel / maxSlime, 0, 1);
    this.visualFill += (targetFill - this.visualFill) * Math.min(1, dt * 14);

    const alive = state.movementState !== PlayerMovementState.Dead;
    const surfing =
      state.surfState === PlayerSurfState.SurfingMoving ||
      state.surfState === PlayerSurfState.SurfingHidden;
    const filling = state.slimeLevel > this.previousSlimeLevel + FILL_EPSILON;
    this.previousSlimeLevel = state.slimeLevel;
    const weapon = getWeaponDefinition(state.equippedWeaponId);
    const disposableShotsTotal = weapon.disposableShots ?? 0;

    if (dryFirePulseSeq !== this.lastDryFirePulseSeq) {
      this.lastDryFirePulseSeq = dryFirePulseSeq;
      this.dryFireFlashTimer = DRY_FIRE_FLASH_DURATION;
    } else {
      this.dryFireFlashTimer = Math.max(0, this.dryFireFlashTimer - Math.max(0, dt));
    }
    if (activityPulseSeq !== this.lastActivityPulseSeq) {
      this.lastActivityPulseSeq = activityPulseSeq;
      this.activityVisibleTimer = ACTIVITY_VISIBLE_DURATION;
    } else {
      this.activityVisibleTimer = Math.max(0, this.activityVisibleTimer - Math.max(0, dt));
    }

    const hasDisposableAmmo = disposableShotsTotal > 0;
    const dryFireFlashActive = this.dryFireFlashTimer > 0;
    const activityVisibleActive = this.activityVisibleTimer > 0;
    const isGoldRecharging = state.isOnFriendlySlime && targetFill < 0.999;

    const targetVisible =
      alive &&
      ((surfing && targetFill < 0.999) ||
        isGoldRecharging ||
        hasDisposableAmmo ||
        dryFireFlashActive ||
        activityVisibleActive)
        ? 1
        : 0;
    this.visibleAmount +=
      (targetVisible - this.visibleAmount) * Math.min(1, Math.max(0, dt) * FADE_SPEED);
    if (this.visibleAmount < 0.01) this.visibleAmount = 0;
    if (this.visibleAmount > 0.99) this.visibleAmount = 1;

    this.material.opacity = this.visibleAmount;
    this.sprite.visible = this.visibleAmount > 0;
    if (!this.sprite.visible) return;

    const time = performance.now();
    const pulse = filling ? Math.sin(time * 0.018) * 0.5 + 0.5 : 0;
    const goldPulse = isGoldRecharging ? Math.sin(time * 0.012) * 0.5 + 0.5 : 0;

    const dryFirePulse =
      this.dryFireFlashTimer > 0
        ? Math.sin((1 - this.dryFireFlashTimer / DRY_FIRE_FLASH_DURATION) * Math.PI)
        : 0;
    if (
      Math.abs(this.visualFill - this.lastDrawnFill) > 0.004 ||
      Math.abs(this.visibleAmount - this.lastDrawnAlpha) > 0.02 ||
      Math.abs(pulse - this.lastDrawnPulse) > 0.08 ||
      Math.abs(goldPulse - this.lastDrawnGoldPulse) > 0.06 ||
      Math.abs(dryFirePulse - this.lastDrawnDryFirePulse) > 0.06 ||
      state.disposableShotsRemaining !== this.lastDrawnShotsRemaining ||
      disposableShotsTotal !== this.lastDrawnShotsTotal ||
      !this.previousFillColor.equals(this.fillColor)
    ) {
      this.draw(
        this.visualFill,
        this.visibleAmount,
        pulse,
        goldPulse,
        dryFirePulse,
        state.disposableShotsRemaining,
        disposableShotsTotal,
      );
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }

  private draw(
    fill: number,
    alpha: number,
    pulse: number,
    goldPulse: number,
    dryFirePulse: number,
    disposableShotsRemaining = 0,
    disposableShotsTotal = 0,
  ): void {
    this.lastDrawnFill = fill;
    this.lastDrawnAlpha = alpha;
    this.lastDrawnPulse = pulse;
    this.lastDrawnGoldPulse = goldPulse;
    this.lastDrawnDryFirePulse = dryFirePulse;
    this.lastDrawnShotsRemaining = disposableShotsRemaining;
    this.lastDrawnShotsTotal = disposableShotsTotal;
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
    const fillHeight = height * clampedFill;

    const renderColor = new THREE.Color().copy(this.fillColor);
    if (goldPulse > 0) {
      renderColor.lerp(GOLD_COLOR, goldPulse * 0.85);
    }
    const color = `#${renderColor.getHexString()}`;

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
    gradient.addColorStop(1, goldPulse > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.95)");
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

    ctx.globalAlpha = alpha * (0.25 + pulse * 0.28 + goldPulse * 0.15);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    if (fillHeight > 18) {
      ctx.fillRect(x + 7, y + height - fillHeight + 7, 4, fillHeight - 18);
    }
    ctx.restore();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3;
    ctx.strokeStyle =
      goldPulse > 0 ? `rgba(255, 235, 120, ${0.7 + goldPulse * 0.3})` : "rgba(255, 255, 255, 0.9)";
    this.roundRect(ctx, x, y, width, height, radius);
    ctx.stroke();

    if (dryFirePulse > 0) {
      ctx.globalAlpha = alpha * dryFirePulse;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(255, 86, 64, 0.92)";
      this.roundRect(ctx, x - 5, y - 5, width + 10, height + 10, radius + 5);
      ctx.stroke();

      ctx.globalAlpha = alpha * dryFirePulse * 0.45;
      ctx.lineWidth = 10;
      ctx.strokeStyle = "rgba(255, 226, 124, 0.74)";
      this.roundRect(ctx, x - 9, y - 9, width + 18, height + 18, radius + 9);
      ctx.stroke();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.36)";
    this.roundRect(ctx, x + 4, y + 4, width - 8, height - 8, radius - 4);
    ctx.stroke();

    if (fillHeight > 6) {
      const knobY = y + height - 3 - (height - 6) * clampedFill;
      ctx.globalAlpha = alpha * (0.7 + pulse * 0.3 + goldPulse * 0.2);
      ctx.fillStyle = goldPulse > 0 ? "#ffffff" : "rgba(255, 255, 255, 0.94)";
      ctx.beginPath();
      ctx.arc(x + width / 2, knobY, 5 + pulse * 1.5 + goldPulse * 1.0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawAmmoPips(disposableShotsRemaining, disposableShotsTotal, alpha);

    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  private drawAmmoPips(remaining: number, total: number, alpha: number): void {
    if (total <= 0) return;
    if (total > COMPACT_AMMO_THRESHOLD) {
      this.drawCompactAmmoStack(remaining, total, alpha);
      return;
    }

    const ctx = this.ctx;
    const pipRadius = 6;
    const gap = 7;
    const x = 90;
    const blockHeight = total * pipRadius * 2 + (total - 1) * gap;
    const startY = (CANVAS_HEIGHT - blockHeight) / 2 + pipRadius;

    for (let i = 0; i < total; i++) {
      const filled = i >= total - remaining;
      const y = startY + i * (pipRadius * 2 + gap);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, pipRadius + 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(5, 8, 14, 0.78)";
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = filled ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.38)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, pipRadius, 0, Math.PI * 2);
      ctx.fillStyle = filled ? "#ffffff" : "rgba(255, 255, 255, 0.16)";
      ctx.fill();
    }
  }

  private drawCompactAmmoStack(remaining: number, total: number, alpha: number): void {
    const ctx = this.ctx;
    const x = 82;
    const y = 16;
    const width = 18;
    const height = 98;
    const gap = 1;
    const segmentHeight = Math.max(1, (height - gap * (total - 1)) / total);
    const clampedRemaining = Math.max(0, Math.min(total, remaining));

    ctx.globalAlpha = alpha;
    this.roundRect(ctx, x - 4, y - 4, width + 8, height + 8, 8);
    ctx.fillStyle = "rgba(5, 8, 14, 0.78)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.stroke();

    for (let i = 0; i < total; i++) {
      const filled = i >= total - clampedRemaining;
      const segmentY = y + i * (segmentHeight + gap);
      ctx.globalAlpha = alpha * (filled ? 0.96 : 0.18);
      ctx.fillStyle = filled ? "#ffffff" : "rgba(255, 255, 255, 0.8)";
      this.roundRect(ctx, x, segmentY, width, Math.max(1, segmentHeight), 2);
      ctx.fill();
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

import * as THREE from "three";
import { PlayerSurfState } from "@splat/simulation/match/simState.ts";
import {
  isPlayerEffectivelySubmerged,
  PlayerVisualRig,
  type PlayerVisualState,
} from "./playerVisualRig.ts";
import { SlimeRechargeGauge } from "./slimeRechargeGauge.ts";

const SKI_ROTATION_LERP_SPEED = 7;
const OPACITY_FADE_OUT_SPEED = 12; // ~0.2s to fully hide
const OPACITY_FADE_IN_SPEED = 6; // ~0.35s to fully reveal
const SUBMERSION_DELAY = 0.06; // seconds submerged before fade-out begins
const HELD_WEAPON_MODEL_SIZE = 0.95;

interface PlayerTransformState extends PlayerVisualState {
  disposableShotsRemaining: number;
  slimeLevel: number;
}

/** The local player's mesh — driven by server state, camera follows this. */
export class LocalPlayer {
  readonly mesh: THREE.Group;
  private readonly visual: PlayerVisualRig;
  private readonly slimeRechargeGauge: SlimeRechargeGauge;
  private readonly skiVisualRotation = new THREE.Quaternion();
  private readonly skiTargetRotation = new THREE.Quaternion();
  private skiLaunchTimer = 0;
  private currentOpacity = 1;
  private submersionTimer = 0;

  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0) {
    this.visual = new PlayerVisualRig(slimeColor, patternId, {
      weaponModelSize: HELD_WEAPON_MODEL_SIZE,
      trackOpacityMaterials: true,
      aimWeapon: true,
    });
    this.mesh = this.visual.group;
    this.slimeRechargeGauge = new SlimeRechargeGauge(slimeColor);
    this.mesh.add(this.slimeRechargeGauge.sprite);
    scene.add(this.mesh);
  }

  update(
    state: PlayerTransformState,
    dt: number,
    visualRotation?: THREE.Quaternion,
    aimDir?: THREE.Vector3,
    dryFirePulseSeq = 0,
    gaugeActivityPulseSeq = 0,
  ): void {
    this.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
    if (visualRotation) {
      this.skiVisualRotation.copy(visualRotation);
      this.mesh.quaternion.copy(visualRotation);
    } else if (state.surfState !== PlayerSurfState.None) {
      this.skiTargetRotation.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
      this.skiVisualRotation.slerp(
        this.skiTargetRotation,
        Math.min(1, dt * SKI_ROTATION_LERP_SPEED),
      );
      this.mesh.quaternion.copy(this.skiVisualRotation);
    } else {
      this.skiVisualRotation.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
      this.mesh.quaternion.copy(this.skiVisualRotation);
    }

    if (this.visual.updateDeath(state, dt)) {
      this.currentOpacity = 1;
      this.submersionTimer = 0;
      this.visual.setOpacity(1);
      this.slimeRechargeGauge.update(state, dt, dryFirePulseSeq, gaugeActivityPulseSeq);
      return;
    }

    this.visual.updateAlivePose(state, dt);
    this.visual.updateWeapon(state.equippedWeaponId, aimDir);

    if (!state.isCarving && this.skiLaunchTimer > 0) {
      this.skiLaunchTimer = Math.max(0, this.skiLaunchTimer - dt);
      const t = this.skiLaunchTimer / 0.4;
      const stretch = 1 + Math.sin(t * Math.PI) * 0.6;
      const squash = 1 / Math.sqrt(stretch);
      this.visual.liveMesh.scale.set(squash, stretch, squash);
    }

    const effectivelySubmerged = isPlayerEffectivelySubmerged(state);
    if (effectivelySubmerged) {
      this.submersionTimer += dt;
    } else {
      this.submersionTimer = 0;
    }
    const targetOpacity = this.submersionTimer >= SUBMERSION_DELAY ? 0 : 1;
    const fadeSpeed =
      targetOpacity < this.currentOpacity ? OPACITY_FADE_OUT_SPEED : OPACITY_FADE_IN_SPEED;
    this.currentOpacity += (targetOpacity - this.currentOpacity) * Math.min(1, fadeSpeed * dt);
    if (this.currentOpacity > 0.995) this.currentOpacity = 1;
    if (this.currentOpacity < 0.005) this.currentOpacity = 0;
    this.visual.setOpacity(this.currentOpacity);

    this.visual.outlineMesh.visible = effectivelySubmerged;
    this.mesh.scale.set(1, 1, 1);
    this.visual.updateDisturbance(state, false);
    this.slimeRechargeGauge.update(state, dt, dryFirePulseSeq, gaugeActivityPulseSeq);
  }

  triggerSkiLaunch(): void {
    this.skiLaunchTimer = 0.4;
  }

  triggerTrick(trickId: string, combo?: number): void {
    this.visual.triggerTrick(trickId, combo);
  }

  dispose(scene: THREE.Scene): void {
    this.visual.dispose();
    scene.remove(this.mesh);
    this.slimeRechargeGauge.dispose();
  }
}

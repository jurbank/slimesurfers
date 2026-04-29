import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";
import { createPlayerMesh } from "./playerMesh.ts";
import { PlayerTrickChargeEffect } from "./playerTrickChargeEffect.ts";
import { PlayerTrickAnimator } from "./playerTrickAnimator.ts";
import { SlimeRechargeGauge } from "./slimeRechargeGauge.ts";

const SKI_ROTATION_LERP_SPEED = 7;
const OPACITY_FADE_OUT_SPEED = 12; // ~0.2s to fully hide
const OPACITY_FADE_IN_SPEED = 6; // ~0.35s to fully reveal
const SUBMERSION_DELAY = 0.06; // seconds submerged before fade-out begins

interface PlayerTransformState {
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number; w: number };
  movementState: number;
  surfState: number;
  isCarving: boolean;
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  slimeLevel: number;
}

/** The local player's mesh — driven by server state, camera follows this. */
export class LocalPlayer {
  readonly mesh: THREE.Group;
  private readonly liveMesh: THREE.Group;
  private readonly deadMesh: THREE.Group;
  private readonly weaponMesh: THREE.Mesh;
  private readonly snowboardMesh: THREE.Group;
  private readonly outlineMesh: THREE.Group;
  private readonly jsrOutline: THREE.Group;
  private readonly disturbanceMesh: THREE.Mesh;
  private readonly trickChargeEffect: PlayerTrickChargeEffect;
  private readonly slimeRechargeGauge: SlimeRechargeGauge;
  private readonly materials: THREE.Material[] = [];
  private readonly inverseMeshQuat = new THREE.Quaternion();
  private readonly localAimDir = new THREE.Vector3();
  private readonly weaponForward = new THREE.Vector3(0, 0, 1);
  private readonly weaponBaseQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, Math.PI / 18, 0),
  );
  private readonly aimQuat = new THREE.Quaternion();
  private readonly skiVisualRotation = new THREE.Quaternion();
  private readonly skiTargetRotation = new THREE.Quaternion();
  private readonly trickAnimator = new PlayerTrickAnimator();
  private skiLaunchTimer = 0;
  private currentOpacity = 1;
  private submersionTimer = 0;

  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0) {
    const rig = createPlayerMesh(slimeColor, patternId);
    this.mesh = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.weaponMesh = rig.weaponMesh;
    this.snowboardMesh = rig.snowboardMesh;
    this.outlineMesh = rig.outlineMesh;
    this.jsrOutline = rig.jsrOutline;
    this.disturbanceMesh = rig.disturbanceMesh;
    this.trickChargeEffect = new PlayerTrickChargeEffect(
      rig.trickChargeAura,
      rig.slimeMaterials,
      slimeColor,
    );
    this.slimeRechargeGauge = new SlimeRechargeGauge(slimeColor);
    this.mesh.add(this.slimeRechargeGauge.sprite);
    this.liveMesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) this.materials.push(...child.material);
      else this.materials.push(child.material);
    });
    scene.add(this.mesh);
  }

  update(
    state: PlayerTransformState,
    dt: number,
    visualRotation?: THREE.Quaternion,
    aimDir?: THREE.Vector3,
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

    if (state.movementState === PlayerMovementState.Dead) {
      this.liveMesh.visible = false;
      this.deadMesh.visible = true;
      this.weaponMesh.visible = false;
      this.snowboardMesh.visible = false;
      this.outlineMesh.visible = false;
      this.jsrOutline.visible = false;
      this.disturbanceMesh.visible = false;
      this.mesh.scale.set(1, 1, 1);
      this.currentOpacity = 1;
      this.submersionTimer = 0;
      this.setOpacity(1);
      this.slimeRechargeGauge.update(state, dt);
      return;
    }

    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.jsrOutline.visible = true;
    this.snowboardMesh.visible = state.surfState !== PlayerSurfState.None;
    this.liveMesh.scale.set(1, 1, 1);
    this.trickAnimator.update(this.liveMesh, this.snowboardMesh, dt);
    this.trickChargeEffect.update(state, dt);
    this.updateWeapon(state.equippedWeaponId, aimDir);

    if (state.isCarving) {
      this.liveMesh.scale.set(1.12, 0.68, 1.08);
    } else if (this.skiLaunchTimer > 0) {
      this.skiLaunchTimer = Math.max(0, this.skiLaunchTimer - dt);
      const t = this.skiLaunchTimer / 0.4;
      const stretch = 1 + Math.sin(t * Math.PI) * 0.6;
      const squash = 1 / Math.sqrt(stretch);
      this.liveMesh.scale.set(squash, stretch, squash);
    }

    const isSubmerged =
      state.surfState === PlayerSurfState.SurfmingMoving ||
      state.surfState === PlayerSurfState.SurfmingHidden;
    const airborne = state.movementState === PlayerMovementState.Airborne;
    const effectivelySubmerged = isSubmerged && !airborne && !state.isShooting;

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
    this.setOpacity(this.currentOpacity);

    this.outlineMesh.visible = effectivelySubmerged;
    this.mesh.scale.set(1, 1, 1);

    if (effectivelySubmerged && state.surfState === PlayerSurfState.SurfmingMoving) {
      const t = performance.now() * 0.001;
      const pulse = Math.sin(t * 3) * 0.5 + 0.5;
      const mat = this.disturbanceMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + pulse * 0.4;
      this.disturbanceMesh.scale.setScalar(0.75 + pulse * 0.5);
      this.disturbanceMesh.visible = true;
    } else {
      this.disturbanceMesh.visible = false;
    }

    this.slimeRechargeGauge.update(state, dt);
  }

  triggerSkiLaunch(): void {
    this.skiLaunchTimer = 0.4;
  }

  triggerTrick(trickId: string, combo?: number): void {
    this.trickAnimator.trigger(trickId);
    this.trickChargeEffect.registerTrick(combo);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.slimeRechargeGauge.dispose();
  }

  private setOpacity(opacity: number): void {
    const transparent = opacity < 1;
    for (const material of this.materials) {
      if (material instanceof THREE.ShaderMaterial) {
        if ("opacity" in material.uniforms) material.uniforms.opacity.value = opacity;
      } else if ("opacity" in material) {
        (material as THREE.Material & { opacity: number }).opacity = opacity;
      } else {
        continue;
      }
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
    }
  }

  private updateWeapon(weaponId: WeaponId, aimDir?: THREE.Vector3): void {
    const visible = weaponId !== DEFAULT_WEAPON_ID;
    this.weaponMesh.visible = visible;
    const material = this.weaponMesh.material;
    if (!visible || !(material instanceof THREE.MeshLambertMaterial)) return;

    const weapon = getWeaponDefinition(weaponId);
    material.color.setHex(weapon.pickupColor);
    material.emissive.setHex(weapon.pickupColor);

    if (!aimDir || aimDir.lengthSq() < 1e-6) {
      this.weaponMesh.quaternion.copy(this.weaponBaseQuat);
      return;
    }

    this.inverseMeshQuat.copy(this.mesh.quaternion).invert();
    this.localAimDir.copy(aimDir).normalize().applyQuaternion(this.inverseMeshQuat).normalize();
    this.aimQuat.setFromUnitVectors(this.weaponForward, this.localAimDir);
    this.weaponMesh.quaternion.copy(this.aimQuat).multiply(this.weaponBaseQuat);
  }
}

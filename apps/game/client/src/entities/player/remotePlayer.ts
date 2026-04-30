import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";
import { cloneNormalizedWeaponModel, disposeWeaponModel } from "../../assets/weaponModels.ts";
import { createPlayerMesh, type PlayerPoseRig } from "./playerMesh.ts";
import {
  resetPlayerDeathParticles,
  updatePlayerDeathParticles,
  type PlayerDeathParticles,
} from "./playerDeath.ts";
import { PlayerTrickChargeEffect } from "./playerTrickChargeEffect.ts";
import { PlayerTrickAnimator } from "./playerTrickAnimator.ts";
import { HealthBar } from "./healthBar.ts";
import { Nameplate, type TeamRelation } from "./nameplate.ts";

const HELD_WEAPON_MODEL_SIZE = 1.95;
const HELD_WEAPON_MODEL_ROTATION_X = -Math.PI / 2;
const HELD_WEAPON_MODEL_ROTATION_Y = Math.PI;
const HEAVY_MACHINE_GUN_WEAPON_ID: WeaponId = "heavyMachineGun";

interface PlayerTransformState {
  pos: { x: number; y: number; z: number };
  vel?: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number; w: number };
  movementState: number;
  surfState: number;
  isCarving: boolean;
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  isOnFriendlyPaint: boolean;
  health: number;
}

/** A remote player's mesh — position updated from server snapshots. */
export class RemotePlayer {
  readonly mesh: THREE.Group;
  private readonly liveMesh: THREE.Group;
  private readonly deadMesh: THREE.Group;
  private readonly deathParticles: PlayerDeathParticles;
  private readonly poseRig: PlayerPoseRig;
  private readonly weaponMesh: THREE.Group;
  private readonly weaponFallbackMesh: THREE.Mesh;
  private readonly snowboardMesh: THREE.Group;
  private readonly jsrOutline: THREE.Group;
  private readonly disturbanceMesh: THREE.Mesh;
  private readonly trickChargeEffect: PlayerTrickChargeEffect;
  private readonly trickAnimator = new PlayerTrickAnimator();
  private readonly healthBar: HealthBar;
  private readonly nameplate: Nameplate;
  private wasDead = false;
  private deathAge = 0;
  private currentWeaponModelPath = "";
  private weaponModelRoot?: THREE.Object3D;
  private disposed = false;

  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0, name = "") {
    const rig = createPlayerMesh(slimeColor, patternId);
    this.mesh = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.deathParticles = rig.deathParticles;
    this.poseRig = rig.poseRig;
    this.weaponMesh = rig.weaponMesh;
    this.weaponFallbackMesh = rig.weaponFallbackMesh;
    this.snowboardMesh = rig.snowboardMesh;
    this.jsrOutline = rig.jsrOutline;
    this.disturbanceMesh = rig.disturbanceMesh;
    this.trickChargeEffect = new PlayerTrickChargeEffect(
      rig.trickChargeAura,
      rig.slimeMaterials,
      slimeColor,
    );
    this.healthBar = new HealthBar(GAME_CONFIG.player.maxHealth);
    this.nameplate = new Nameplate(name, slimeColor);
    this.mesh.add(this.healthBar.sprite);
    this.mesh.add(this.nameplate.sprite);
    // Detach disturbance from group so it stays visible when the player mesh is hidden.
    this.mesh.remove(this.disturbanceMesh);
    scene.add(this.disturbanceMesh);
    scene.add(this.mesh);
  }

  update(state: PlayerTransformState, dt: number, camera?: THREE.Camera): void {
    this.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);

    const isDead = state.movementState === PlayerMovementState.Dead;
    if (isDead) {
      if (!this.wasDead) {
        this.deathAge = 0;
        resetPlayerDeathParticles(this.deathParticles);
      } else {
        this.deathAge += dt;
      }
      updatePlayerDeathParticles(this.deathParticles, this.deathAge);
      this.mesh.visible = true;
      this.liveMesh.visible = false;
      this.deadMesh.visible = true;
      this.weaponMesh.visible = false;
      this.snowboardMesh.visible = false;
      this.jsrOutline.visible = false;
      this.disturbanceMesh.visible = false;
      this.healthBar.update(state, dt, GAME_CONFIG.player.maxHealth);
      this.nameplate.update(false, dt, camera);
      this.wasDead = true;
      return;
    }

    this.wasDead = false;
    this.deathAge = 0;
    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.jsrOutline.visible = true;
    this.snowboardMesh.visible = state.surfState !== PlayerSurfState.None;
    this.liveMesh.scale.set(1, 1, 1);
    this.trickAnimator.update(this.liveMesh, this.snowboardMesh, this.poseRig, state, dt);
    this.trickChargeEffect.update(state, dt);
    if (state.isCarving) {
      this.liveMesh.scale.set(1.12, 0.68, 1.08);
    }
    this.updateWeapon(state.equippedWeaponId);

    const airborne = state.movementState === PlayerMovementState.Airborne;
    const effectivelySubmerged =
      (state.isOnFriendlyPaint && !airborne && !state.isShooting) ||
      state.surfState === PlayerSurfState.SurfmingHidden;

    this.mesh.visible = !effectivelySubmerged;

    const isMoving =
      state.movementState === PlayerMovementState.Moving ||
      state.surfState === PlayerSurfState.SurfmingMoving;
    if (effectivelySubmerged && isMoving) {
      const t = performance.now() * 0.001;
      const pulse = Math.sin(t * 3) * 0.5 + 0.5;
      const mat = this.disturbanceMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + pulse * 0.4;
      this.disturbanceMesh.quaternion.copy(this.mesh.quaternion);
      this.disturbanceMesh.position.copy(this.mesh.position);
      this.disturbanceMesh.scale.setScalar(0.75 + pulse * 0.5);
      this.disturbanceMesh.visible = true;
    } else {
      this.disturbanceMesh.visible = false;
    }

    this.healthBar.update(state, dt, GAME_CONFIG.player.maxHealth);
    this.nameplate.update(!effectivelySubmerged, dt, camera);
  }

  setName(name: string): void {
    this.nameplate.setName(name);
  }

  setTeamRelation(relation: TeamRelation, teamColor?: number): void {
    this.nameplate.setTeamRelation(relation, teamColor);
  }

  dispose(scene: THREE.Scene): void {
    this.disposed = true;
    if (this.weaponModelRoot) {
      disposeWeaponModel(this.weaponModelRoot);
    }
    this.healthBar.dispose();
    this.nameplate.dispose();
    scene.remove(this.mesh);
    scene.remove(this.disturbanceMesh);
  }

  isAimTargetVisible(): boolean {
    return this.mesh.visible && this.liveMesh.visible;
  }

  setAcquired(acquired: boolean, guaranteed = false): void {
    this.jsrOutline.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material;
      if (!(mat instanceof THREE.ShaderMaterial)) return;
      const uniform = mat.uniforms["outlineColor"];
      if (!uniform) return;
      const v = uniform.value as THREE.Vector3;
      if (acquired) {
        if (guaranteed) {
          v.set(1.0, 0.55, 0.0);
        } else {
          v.set(1.0, 0.08, 0.08);
        }
      } else {
        const [r, g, b] = GAME_CONFIG.shaders.cel.outlineColor;
        v.set(r ?? 0, g ?? 0, b ?? 0);
      }
    });
  }

  triggerTrick(trickId: string, combo?: number): void {
    this.trickAnimator.trigger(trickId);
    this.trickChargeEffect.registerTrick(combo);
  }

  private updateWeapon(weaponId: WeaponId): void {
    const visible = weaponId !== DEFAULT_WEAPON_ID;
    this.weaponMesh.visible = visible;
    if (!visible) return;

    const weapon = getWeaponDefinition(weaponId);
    this.syncWeaponModel(weaponId, weapon.pickupModelPath);
    const material = this.weaponFallbackMesh.material;
    if (!(material instanceof THREE.MeshLambertMaterial)) return;
    material.color.setHex(weapon.pickupColor);
    material.emissive.setHex(weapon.pickupColor);
  }

  private syncWeaponModel(weaponId: WeaponId, modelPath: string): void {
    if (this.currentWeaponModelPath === modelPath) return;
    this.currentWeaponModelPath = modelPath;
    this.weaponFallbackMesh.visible = true;
    if (this.weaponModelRoot) {
      this.weaponMesh.remove(this.weaponModelRoot);
      disposeWeaponModel(this.weaponModelRoot);
      this.weaponModelRoot = undefined;
    }
    if (typeof window === "undefined") return;

    void cloneNormalizedWeaponModel(modelPath, HELD_WEAPON_MODEL_SIZE)
      .then((model) => {
        if (this.disposed) {
          disposeWeaponModel(model);
          return;
        }
        if (this.currentWeaponModelPath !== modelPath) {
          disposeWeaponModel(model);
          return;
        }
        this.weaponFallbackMesh.visible = false;
        model.rotation.x = HELD_WEAPON_MODEL_ROTATION_X;
        model.rotation.y =
          weaponId === HEAVY_MACHINE_GUN_WEAPON_ID ? 0 : HELD_WEAPON_MODEL_ROTATION_Y;
        this.weaponModelRoot = model;
        this.weaponMesh.add(model);
      })
      .catch(() => {
        if (this.disposed) return;
        if (this.currentWeaponModelPath === modelPath) this.weaponFallbackMesh.visible = true;
      });
  }
}

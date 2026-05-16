import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";
import { cloneNormalizedWeaponModel, disposeWeaponModel } from "../../assets/weaponModels.ts";
import {
  resetPlayerDeathParticles,
  updatePlayerDeathParticles,
  type PlayerDeathParticles,
} from "./playerDeath.ts";
import { createPlayerMesh, type PlayerFaceRig, type PlayerPoseRig } from "./playerMesh.ts";
import { PlayerTrickAnimator } from "./playerTrickAnimator.ts";
import { PlayerTrickChargeEffect } from "./playerTrickChargeEffect.ts";

const HELD_WEAPON_MODEL_ROTATION_X = -Math.PI / 2;
const HELD_WEAPON_MODEL_ROTATION_Y = Math.PI;
const HEAVY_MACHINE_GUN_WEAPON_ID: WeaponId = "heavyMachineGun";

export interface PlayerVisualState {
  pos: { x: number; y: number; z: number };
  vel?: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number; w: number };
  movementState: number;
  surfState: number;
  isCarving: boolean;
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  isOnFriendlySlime: boolean;
}

interface PlayerVisualRigOptions {
  weaponModelSize: number;
  trackOpacityMaterials?: boolean;
  aimWeapon?: boolean;
}

export class PlayerVisualRig {
  readonly group: THREE.Group;
  readonly liveMesh: THREE.Group;
  readonly deadMesh: THREE.Group;
  readonly outlineMesh: THREE.Group;
  readonly jsrOutline: THREE.Group;
  readonly disturbanceMesh: THREE.Mesh;

  private readonly deathParticles: PlayerDeathParticles;
  private readonly face: PlayerFaceRig;
  private readonly poseRig: PlayerPoseRig;
  private readonly weaponMesh: THREE.Group;
  private readonly weaponFallbackMesh: THREE.Mesh;
  private readonly snowboardMesh: THREE.Group;
  private readonly trickChargeEffect: PlayerTrickChargeEffect;
  private readonly trickAnimator = new PlayerTrickAnimator();
  private readonly materials: THREE.Material[] = [];
  private readonly weaponModelMaterials: THREE.Material[] = [];
  private readonly inverseMeshQuat = new THREE.Quaternion();
  private readonly localAimDir = new THREE.Vector3();
  private readonly weaponForward = new THREE.Vector3(0, 0, 1);
  private readonly weaponBaseQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, Math.PI / 18, 0),
  );
  private readonly aimQuat = new THREE.Quaternion();
  private wasDead = false;
  private deathAge = 0;
  private currentOpacity = 1;
  private currentWeaponModelPath = "";
  private weaponModelRoot?: THREE.Object3D;
  private disposed = false;

  constructor(
    slimeColor: number,
    patternId: number,
    private readonly options: PlayerVisualRigOptions,
  ) {
    const rig = createPlayerMesh(slimeColor, patternId);
    this.group = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.deathParticles = rig.deathParticles;
    this.face = rig.face;
    this.poseRig = rig.poseRig;
    this.weaponMesh = rig.weaponMesh;
    this.weaponFallbackMesh = rig.weaponFallbackMesh;
    this.snowboardMesh = rig.snowboardMesh;
    this.outlineMesh = rig.outlineMesh;
    this.jsrOutline = rig.jsrOutline;
    this.disturbanceMesh = rig.disturbanceMesh;
    this.trickChargeEffect = new PlayerTrickChargeEffect(
      rig.trickChargeAura,
      rig.slimeMaterials,
      slimeColor,
    );
    if (this.options.trackOpacityMaterials) this.registerMaterials(this.liveMesh);
  }

  setTransform(state: PlayerVisualState): void {
    this.group.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.group.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
  }

  updateDeath(state: PlayerVisualState, dt: number): boolean {
    const isDead = state.movementState === PlayerMovementState.Dead;
    if (!isDead) {
      this.wasDead = false;
      this.deathAge = 0;
      return false;
    }

    if (!this.wasDead) {
      this.deathAge = 0;
      resetPlayerDeathParticles(this.deathParticles);
    } else {
      this.deathAge += dt;
    }
    updatePlayerDeathParticles(this.deathParticles, this.deathAge);
    this.liveMesh.visible = false;
    this.deadMesh.visible = true;
    this.weaponMesh.visible = false;
    this.snowboardMesh.visible = false;
    this.outlineMesh.visible = false;
    this.jsrOutline.visible = false;
    this.disturbanceMesh.visible = false;
    this.group.scale.set(1, 1, 1);
    this.wasDead = true;
    return true;
  }

  updateAlivePose(state: PlayerVisualState, dt: number): void {
    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.jsrOutline.visible = true;
    this.snowboardMesh.visible = state.surfState !== PlayerSurfState.None;
    this.liveMesh.scale.set(1, 1, 1);
    this.trickAnimator.update(this.liveMesh, this.snowboardMesh, this.poseRig, state, dt);
    this.trickChargeEffect.update(state, dt);
    this.face.setExpression(state.isShooting ? "spewing" : "normal");
    if (state.isCarving) this.liveMesh.scale.set(1.12, 0.68, 1.08);
  }

  updateWeapon(weaponId: WeaponId, aimDir?: THREE.Vector3): void {
    const visible = weaponId !== DEFAULT_WEAPON_ID;
    this.weaponMesh.visible = visible;
    if (!visible) return;

    const weapon = getWeaponDefinition(weaponId);
    this.syncWeaponModel(weaponId, weapon.pickupModelPath);
    const material = this.weaponFallbackMesh.material;
    if (material instanceof THREE.MeshLambertMaterial) {
      material.color.setHex(weapon.pickupColor);
      material.emissive.setHex(weapon.pickupColor);
    }

    if (!this.options.aimWeapon) return;
    if (!aimDir || aimDir.lengthSq() < 1e-6) {
      this.weaponMesh.quaternion.copy(this.weaponBaseQuat);
      return;
    }

    this.inverseMeshQuat.copy(this.group.quaternion).invert();
    this.localAimDir.copy(aimDir).normalize().applyQuaternion(this.inverseMeshQuat).normalize();
    this.aimQuat.setFromUnitVectors(this.weaponForward, this.localAimDir);
    this.weaponMesh.quaternion.copy(this.aimQuat).multiply(this.weaponBaseQuat);
  }

  updateDisturbance(state: PlayerVisualState, detachedFromGroup: boolean): void {
    if (!isPlayerEffectivelySubmerged(state) || !isPlayerVisuallyMoving(state)) {
      this.disturbanceMesh.visible = false;
      return;
    }

    const t = performance.now() * 0.001;
    const pulse = Math.sin(t * 3) * 0.5 + 0.5;
    const mat = this.disturbanceMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + pulse * 0.4;
    if (detachedFromGroup) {
      this.disturbanceMesh.quaternion.copy(this.group.quaternion);
      this.disturbanceMesh.position.copy(this.group.position);
    }
    this.disturbanceMesh.scale.setScalar(0.75 + pulse * 0.5);
    this.disturbanceMesh.visible = true;
  }

  setOpacity(opacity: number): void {
    this.currentOpacity = opacity;
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

  triggerTrick(trickId: string, combo?: number): void {
    this.trickAnimator.trigger(trickId);
    this.trickChargeEffect.registerTrick(combo);
  }

  dispose(): void {
    this.disposed = true;
    if (!this.weaponModelRoot) return;
    this.weaponMesh.remove(this.weaponModelRoot);
    this.unregisterWeaponModelMaterials();
    disposeWeaponModel(this.weaponModelRoot);
    this.weaponModelRoot = undefined;
  }

  private syncWeaponModel(weaponId: WeaponId, modelPath: string): void {
    if (this.currentWeaponModelPath === modelPath) return;
    this.currentWeaponModelPath = modelPath;
    this.weaponFallbackMesh.visible = true;
    if (this.weaponModelRoot) {
      this.weaponMesh.remove(this.weaponModelRoot);
      this.unregisterWeaponModelMaterials();
      disposeWeaponModel(this.weaponModelRoot);
      this.weaponModelRoot = undefined;
    }
    if (typeof window === "undefined") return;

    void cloneNormalizedWeaponModel(modelPath, this.options.weaponModelSize)
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
        if (this.options.trackOpacityMaterials) {
          this.weaponModelMaterials.push(...this.registerMaterials(model));
          this.setOpacity(this.currentOpacity);
        }
      })
      .catch(() => {
        if (this.disposed) return;
        if (this.currentWeaponModelPath === modelPath) this.weaponFallbackMesh.visible = true;
      });
  }

  private registerMaterials(root: THREE.Object3D): THREE.Material[] {
    const registered: THREE.Material[] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        this.materials.push(...child.material);
        registered.push(...child.material);
      } else {
        this.materials.push(child.material);
        registered.push(child.material);
      }
    });
    return registered;
  }

  private unregisterWeaponModelMaterials(): void {
    for (const material of this.weaponModelMaterials) {
      const index = this.materials.indexOf(material);
      if (index >= 0) this.materials.splice(index, 1);
    }
    this.weaponModelMaterials.length = 0;
  }
}

export function isPlayerEffectivelySubmerged(state: PlayerVisualState): boolean {
  const airborne = state.movementState === PlayerMovementState.Airborne;
  return (
    (state.isOnFriendlySlime && !airborne && !state.isShooting) ||
    state.surfState === PlayerSurfState.SurfmingHidden
  );
}

function isPlayerVisuallyMoving(state: PlayerVisualState): boolean {
  return (
    state.movementState === PlayerMovementState.Moving ||
    state.surfState === PlayerSurfState.SurfmingMoving
  );
}

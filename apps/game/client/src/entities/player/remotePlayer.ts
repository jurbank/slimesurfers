import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { PlayerMovementState, PlayerSwimState } from "@splat/simulation/match/simState.ts";
import { createPlayerMesh } from "./playerMesh.ts";
import { PlayerTrickAnimator } from "./playerTrickAnimator.ts";

interface PlayerTransformState {
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number; w: number };
  movementState: number;
  swimState: number;
  isCarving: boolean;
  isShooting: boolean;
  equippedWeaponId: WeaponId;
}

/** A remote player's mesh — position updated from server snapshots. */
export class RemotePlayer {
  readonly mesh: THREE.Group;
  private readonly liveMesh: THREE.Group;
  private readonly deadMesh: THREE.Group;
  private readonly weaponMesh: THREE.Mesh;
  private readonly snowboardMesh: THREE.Group;
  private readonly disturbanceMesh: THREE.Mesh;
  private readonly trickAnimator = new PlayerTrickAnimator();
  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0) {
    const rig = createPlayerMesh(slimeColor, patternId);
    this.mesh = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.weaponMesh = rig.weaponMesh;
    this.snowboardMesh = rig.snowboardMesh;
    this.disturbanceMesh = rig.disturbanceMesh;
    // Detach disturbance from group so it stays visible when the player mesh is hidden.
    this.mesh.remove(this.disturbanceMesh);
    scene.add(this.disturbanceMesh);
    scene.add(this.mesh);
  }

  update(state: PlayerTransformState, dt: number): void {
    this.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);

    if (state.movementState === PlayerMovementState.Dead) {
      this.mesh.visible = true;
      this.liveMesh.visible = false;
      this.deadMesh.visible = true;
      this.weaponMesh.visible = false;
      this.snowboardMesh.visible = false;
      this.disturbanceMesh.visible = false;
      return;
    }

    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.snowboardMesh.visible = state.swimState !== PlayerSwimState.None;
    this.liveMesh.scale.set(1, 1, 1);
    this.trickAnimator.update(this.liveMesh, this.snowboardMesh, dt);
    if (state.isCarving) {
      this.liveMesh.scale.set(1.12, 0.68, 1.08);
    }
    this.updateWeapon(state.equippedWeaponId);

    if (state.movementState === PlayerMovementState.Airborne || state.isShooting) {
      this.mesh.visible = true;
      this.disturbanceMesh.visible = false;
      return;
    }

    if (state.swimState === PlayerSwimState.None) {
      this.mesh.visible = true;
      this.disturbanceMesh.visible = false;
      return;
    }

    this.mesh.visible =
      state.swimState === PlayerSwimState.SkiVisible ||
      state.swimState === PlayerSwimState.SkiWater;

    if (state.swimState === PlayerSwimState.SwimmingMoving) {
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
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.disturbanceMesh);
  }

  isAimTargetVisible(): boolean {
    return this.mesh.visible && this.liveMesh.visible;
  }

  triggerTrick(trickId: string): void {
    this.trickAnimator.trigger(trickId);
  }

  private updateWeapon(weaponId: WeaponId): void {
    const visible = weaponId !== DEFAULT_WEAPON_ID;
    this.weaponMesh.visible = visible;
    const material = this.weaponMesh.material;
    if (!visible || !(material instanceof THREE.MeshLambertMaterial)) return;

    const weapon = getWeaponDefinition(weaponId);
    material.color.setHex(weapon.pickupColor);
    material.emissive.setHex(weapon.pickupColor);
  }
}

import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { PlayerMovementState, PlayerSwimState } from "@splat/simulation/match/simState.ts";
import { createPlayerMesh } from "./playerMesh.ts";

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
  private readonly disturbance: THREE.Mesh;
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0) {
    const rig = createPlayerMesh(slimeColor, patternId);
    this.mesh = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.weaponMesh = rig.weaponMesh;
    this.snowboardMesh = rig.snowboardMesh;
    this.disturbance = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 12),
      new THREE.MeshBasicMaterial({
        color: slimeColor,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.disturbance.scale.set(1.4, 0.18, 1.4);
    this.disturbance.visible = false;
    scene.add(this.mesh);
    scene.add(this.disturbance);
  }

  update(state: PlayerTransformState): void {
    this.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
    this.up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion).normalize();

    if (state.movementState === PlayerMovementState.Dead) {
      this.mesh.visible = true;
      this.liveMesh.visible = false;
      this.deadMesh.visible = true;
      this.weaponMesh.visible = false;
      this.snowboardMesh.visible = false;
      this.disturbance.visible = false;
      return;
    }

    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.snowboardMesh.visible = state.swimState !== PlayerSwimState.None;
    this.liveMesh.scale.set(1, 1, 1);
    if (state.isCarving) {
      this.liveMesh.scale.set(1.12, 0.68, 1.08);
    }
    this.updateWeapon(state.equippedWeaponId);

    if (state.movementState === PlayerMovementState.Airborne || state.isShooting) {
      this.mesh.visible = true;
      this.disturbance.visible = false;
      return;
    }

    if (state.swimState === PlayerSwimState.None) {
      this.mesh.visible = true;
      this.disturbance.visible = false;
      return;
    }

    this.mesh.visible = state.swimState === PlayerSwimState.SkiVisible;
    this.disturbance.visible = state.swimState === PlayerSwimState.SwimmingMoving;
    if (!this.disturbance.visible) return;

    this.disturbance.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.disturbance.position.addScaledVector(this.up, -0.75);
    this.disturbance.quaternion.copy(this.mesh.quaternion);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.disturbance);
  }

  isAimTargetVisible(): boolean {
    return this.mesh.visible && this.liveMesh.visible;
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

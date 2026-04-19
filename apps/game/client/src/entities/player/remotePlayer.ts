import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { PlayerSwimState } from "@splat/simulation/match/simState.ts";
import { createPlayerMesh } from "./playerMesh.ts";

interface PlayerTransformState {
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number; w: number };
  swimState: number;
  equippedWeaponId: WeaponId;
}

/** A remote player's mesh — position updated from server snapshots. */
export class RemotePlayer {
  readonly mesh: THREE.Group;
  private readonly weaponMesh: THREE.Mesh;
  private readonly disturbance: THREE.Mesh;
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, slimeColor: number) {
    const rig = createPlayerMesh(slimeColor);
    this.mesh = rig.group;
    this.weaponMesh = rig.weaponMesh;
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
    this.updateWeapon(state.equippedWeaponId);
    this.up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion).normalize();

    if (state.swimState === PlayerSwimState.None) {
      this.mesh.visible = true;
      this.disturbance.visible = false;
      return;
    }

    this.mesh.visible = false;
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

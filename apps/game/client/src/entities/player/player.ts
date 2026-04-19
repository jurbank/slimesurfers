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
  equippedWeaponId: WeaponId;
}

/** The local player's mesh — driven by server state, camera follows this. */
export class LocalPlayer {
  readonly mesh: THREE.Group;
  private readonly liveMesh: THREE.Group;
  private readonly deadMesh: THREE.Group;
  private readonly weaponMesh: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly inverseMeshQuat = new THREE.Quaternion();
  private readonly localAimDir = new THREE.Vector3();
  private readonly weaponForward = new THREE.Vector3(0, 0, 1);
  private readonly weaponBaseQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, Math.PI / 18, 0),
  );
  private readonly aimQuat = new THREE.Quaternion();

  constructor(scene: THREE.Scene, slimeColor: number) {
    const rig = createPlayerMesh(slimeColor);
    this.mesh = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.weaponMesh = rig.weaponMesh;
    this.liveMesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) this.materials.push(...child.material);
      else this.materials.push(child.material);
    });
    scene.add(this.mesh);
  }

  update(
    state: PlayerTransformState,
    visualRotation?: THREE.Quaternion,
    aimDir?: THREE.Vector3,
  ): void {
    this.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
    if (visualRotation) {
      this.mesh.quaternion.copy(visualRotation);
    } else {
      this.mesh.quaternion.set(state.rot.x, state.rot.y, state.rot.z, state.rot.w);
    }

    if (state.movementState === PlayerMovementState.Dead) {
      this.liveMesh.visible = false;
      this.deadMesh.visible = true;
      this.weaponMesh.visible = false;
      this.mesh.scale.set(1, 1, 1);
      this.setOpacity(1);
      return;
    }

    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.updateWeapon(state.equippedWeaponId, aimDir);

    if (state.swimState === PlayerSwimState.None) {
      this.mesh.scale.set(1, 1, 1);
      this.setOpacity(1);
      return;
    }

    this.up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion).normalize();
    this.mesh.position.addScaledVector(this.up, -0.45);
    this.mesh.scale.set(1.1, 0.5, 1.1);
    this.setOpacity(0.45);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }

  private setOpacity(opacity: number): void {
    for (const material of this.materials) {
      if (!("opacity" in material) || !("transparent" in material)) continue;
      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.needsUpdate = true;
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

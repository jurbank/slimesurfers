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

/** The local player's mesh — driven by server state, camera follows this. */
export class LocalPlayer {
  readonly mesh: THREE.Group;
  private readonly liveMesh: THREE.Group;
  private readonly deadMesh: THREE.Group;
  private readonly weaponMesh: THREE.Mesh;
  private readonly snowboardMesh: THREE.Group;
  private readonly outlineMesh: THREE.Group;
  private readonly disturbanceMesh: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly inverseMeshQuat = new THREE.Quaternion();
  private readonly localAimDir = new THREE.Vector3();
  private readonly weaponForward = new THREE.Vector3(0, 0, 1);
  private readonly weaponBaseQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, Math.PI / 18, 0),
  );
  private readonly aimQuat = new THREE.Quaternion();

  constructor(scene: THREE.Scene, slimeColor: number, patternId = 0) {
    const rig = createPlayerMesh(slimeColor, patternId);
    this.mesh = rig.group;
    this.liveMesh = rig.liveMesh;
    this.deadMesh = rig.deadMesh;
    this.weaponMesh = rig.weaponMesh;
    this.snowboardMesh = rig.snowboardMesh;
    this.outlineMesh = rig.outlineMesh;
    this.disturbanceMesh = rig.disturbanceMesh;
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
      this.snowboardMesh.visible = false;
      this.outlineMesh.visible = false;
      this.disturbanceMesh.visible = false;
      this.mesh.scale.set(1, 1, 1);
      this.setOpacity(1);
      return;
    }

    this.liveMesh.visible = true;
    this.deadMesh.visible = false;
    this.snowboardMesh.visible = state.swimState !== PlayerSwimState.None;
    this.liveMesh.scale.set(1, 1, 1);
    this.updateWeapon(state.equippedWeaponId, aimDir);

    if (state.isCarving) {
      this.liveMesh.scale.set(1.12, 0.68, 1.08);
    }

    const isSubmerged =
      state.swimState === PlayerSwimState.SwimmingMoving ||
      state.swimState === PlayerSwimState.SwimmingHidden;

    this.outlineMesh.visible = isSubmerged;

    if (isSubmerged) {
      this.mesh.scale.set(1, 1, 1);
      this.setOpacity(0);
      if (state.swimState === PlayerSwimState.SwimmingMoving) {
        const t = performance.now() * 0.001;
        const pulse = Math.sin(t * 3) * 0.5 + 0.5;
        const mat = this.disturbanceMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.25 + pulse * 0.4;
        this.disturbanceMesh.scale.setScalar(0.75 + pulse * 0.5);
        this.disturbanceMesh.visible = true;
      } else {
        this.disturbanceMesh.visible = false;
      }
      return;
    }

    this.disturbanceMesh.visible = false;
    this.outlineMesh.visible = false;
    this.mesh.scale.set(1, 1, 1);
    this.setOpacity(1);
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

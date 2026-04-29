import * as THREE from "three";
import { getWeaponDefinition, type WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { cloneNormalizedWeaponModel, disposeWeaponModel } from "../assets/weaponModels.ts";

const PICKUP_MODEL_SIZE = 4.7;

interface PickupSnapshot {
  id: string;
  weaponId: WeaponId;
  pos: {
    x: number;
    y: number;
    z: number;
  };
}

interface PickupVisualState {
  root: THREE.Group;
  modelPivot: THREE.Group;
  fallbackMesh: THREE.Mesh;
  modelRoot?: THREE.Object3D;
  ring: THREE.Mesh;
  weaponId: WeaponId;
  modelPath: string;
  baseY: number;
  createdAtMs: number;
  disposed: boolean;
}

export interface RemovedPickup {
  position: THREE.Vector3;
}

export class PickupSystem {
  private readonly scene: THREE.Scene;
  private readonly pickups = new Map<string, PickupVisualState>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  syncPickup(snapshot: PickupSnapshot, nowMs: number): void {
    const weapon = getWeaponDefinition(snapshot.weaponId);
    let state = this.pickups.get(snapshot.id);
    if (!state) {
      const root = new THREE.Group();
      const modelPivot = new THREE.Group();

      const fallbackMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.25, 0),
        new THREE.MeshLambertMaterial({
          color: weapon.pickupColor,
          emissive: weapon.pickupColor,
          emissiveIntensity: 0.9,
        }),
      );

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.8, 0.14, 12, 32),
        new THREE.MeshLambertMaterial({
          color: weapon.pickupColor,
          emissive: weapon.pickupColor,
          emissiveIntensity: 0.65,
          transparent: true,
          opacity: 0.9,
        }),
      );
      ring.rotation.x = Math.PI / 2;

      modelPivot.add(fallbackMesh);
      root.add(modelPivot);
      root.add(ring);
      root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
      this.scene.add(root);
      state = {
        root,
        modelPivot,
        fallbackMesh,
        ring,
        weaponId: snapshot.weaponId,
        modelPath: weapon.pickupModelPath,
        baseY: snapshot.pos.y,
        createdAtMs: nowMs,
        disposed: false,
      };
      this.pickups.set(snapshot.id, state);
      this.applyPickupModel(state, weapon.pickupModelPath);
    } else {
      state.root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
      state.baseY = snapshot.pos.y;
      const meshMaterial = state.fallbackMesh.material;
      if (meshMaterial instanceof THREE.MeshLambertMaterial) {
        meshMaterial.color.setHex(weapon.pickupColor);
        meshMaterial.emissive.setHex(weapon.pickupColor);
      }
      const ringMaterial = state.ring.material;
      if (ringMaterial instanceof THREE.MeshLambertMaterial) {
        ringMaterial.color.setHex(weapon.pickupColor);
        ringMaterial.emissive.setHex(weapon.pickupColor);
      }
      if (state.weaponId !== snapshot.weaponId || state.modelPath !== weapon.pickupModelPath) {
        state.weaponId = snapshot.weaponId;
        state.modelPath = weapon.pickupModelPath;
        this.applyPickupModel(state, weapon.pickupModelPath);
      }
    }
  }

  update(nowMs: number): void {
    for (const state of this.pickups.values()) {
      const t = (nowMs - state.createdAtMs) / 1000;
      state.root.rotation.y = t * 2.6;
      state.modelPivot.rotation.x = t * 1.4;
      state.modelPivot.rotation.z = t * 0.9;
      state.ring.rotation.z = t * 1.7;
      state.root.position.y = state.baseY + Math.sin(t * 2.6) * 0.45;
    }
  }

  removeMissing(activeIds: Set<string>): RemovedPickup[] {
    const removed: RemovedPickup[] = [];
    for (const [id, state] of this.pickups) {
      if (activeIds.has(id)) continue;
      removed.push({ position: state.root.position.clone() });
      this.scene.remove(state.root);
      this.disposePickupState(state);
      this.pickups.delete(id);
    }
    return removed;
  }

  clear(): void {
    for (const state of this.pickups.values()) {
      this.scene.remove(state.root);
      this.disposePickupState(state);
    }
    this.pickups.clear();
  }

  private applyPickupModel(state: PickupVisualState, modelPath: string): void {
    if (typeof window === "undefined") return;

    void cloneNormalizedWeaponModel(modelPath, PICKUP_MODEL_SIZE)
      .then((model) => {
        if (state.disposed) return;
        if (state.modelPath !== modelPath) return;

        state.fallbackMesh.visible = false;
        if (state.modelRoot) {
          state.modelPivot.remove(state.modelRoot);
        }
        state.modelRoot = model;
        state.modelPivot.add(model);
      })
      .catch(() => {
        if (state.disposed) return;
        state.fallbackMesh.visible = true;
      });
  }

  private disposePickupState(state: PickupVisualState): void {
    state.disposed = true;
    state.fallbackMesh.geometry.dispose();
    state.ring.geometry.dispose();
    (state.fallbackMesh.material as THREE.Material).dispose();
    (state.ring.material as THREE.Material).dispose();
    if (state.modelRoot) {
      disposeWeaponModel(state.modelRoot);
    }
  }
}

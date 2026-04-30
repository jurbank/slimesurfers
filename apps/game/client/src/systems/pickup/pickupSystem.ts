import * as THREE from "three";
import { getWeaponDefinition, type WeaponId } from "@splat/content/combat/weaponDefs.ts";
import {
  createPickupVisual,
  loadPickupModel,
  updatePickupVisual,
  disposePickupVisual,
  type PickupVisualEntry,
  type PickupSpinRates,
} from "./pickupVisual.ts";

const PICKUP_MODEL_SIZE = 4.7;
const SPIN: PickupSpinRates = { rootY: 2.6, pivotX: 1.4, pivotZ: 0.9, ringZ: 1.7, bobFreq: 2.6 };

interface PickupSnapshot {
  id: string;
  weaponId: WeaponId;
  pos: { x: number; y: number; z: number };
}

interface WeaponPickupEntry extends PickupVisualEntry {
  weaponId: WeaponId;
}

export interface RemovedPickup {
  position: THREE.Vector3;
}

export class PickupSystem {
  private readonly scene: THREE.Scene;
  private readonly pickups = new Map<string, WeaponPickupEntry>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  syncPickup(snapshot: PickupSnapshot, nowMs: number): void {
    const weapon = getWeaponDefinition(snapshot.weaponId);
    let entry = this.pickups.get(snapshot.id);
    if (!entry) {
      const visual = createPickupVisual(
        this.scene,
        snapshot.pos,
        weapon.pickupColor,
        weapon.pickupModelPath,
        PICKUP_MODEL_SIZE,
        nowMs,
      );
      entry = Object.assign(visual, { weaponId: snapshot.weaponId });
      this.pickups.set(snapshot.id, entry);
    } else {
      entry.root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
      entry.baseY = snapshot.pos.y;
      if (entry.weaponId !== snapshot.weaponId) {
        entry.weaponId = snapshot.weaponId;
        (entry.fallbackMesh.material as THREE.MeshLambertMaterial).color.setHex(weapon.pickupColor);
        (entry.fallbackMesh.material as THREE.MeshLambertMaterial).emissive.setHex(
          weapon.pickupColor,
        );
        (entry.ring.material as THREE.MeshLambertMaterial).color.setHex(weapon.pickupColor);
        (entry.ring.material as THREE.MeshLambertMaterial).emissive.setHex(weapon.pickupColor);
        entry.outlineMaterial.color.setHex(weapon.pickupColor);
        entry.modelPath = weapon.pickupModelPath;
        loadPickupModel(entry, weapon.pickupModelPath, PICKUP_MODEL_SIZE);
      }
    }
  }

  update(nowMs: number): void {
    for (const entry of this.pickups.values()) {
      updatePickupVisual(entry, nowMs, SPIN);
    }
  }

  removeMissing(activeIds: Set<string>): RemovedPickup[] {
    const removed: RemovedPickup[] = [];
    for (const [id, entry] of this.pickups) {
      if (activeIds.has(id)) continue;
      removed.push({ position: entry.root.position.clone() });
      disposePickupVisual(this.scene, entry);
      this.pickups.delete(id);
    }
    return removed;
  }

  clear(): void {
    for (const entry of this.pickups.values()) disposePickupVisual(this.scene, entry);
    this.pickups.clear();
  }
}

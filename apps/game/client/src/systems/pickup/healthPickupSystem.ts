import * as THREE from "three";
import type { HealthPickupSnapshot } from "@splat/protocol/network/serverMessages.ts";
import {
  createPickupVisual,
  updatePickupVisual,
  disposePickupVisual,
  type PickupVisualEntry,
  type PickupSpinRates,
} from "./pickupVisual.ts";

const HEALTH_PICKUP_MODEL_PATH = "/models/medkit-model.glb";
const HEALTH_PICKUP_MODEL_SIZE = 3.5;
const HEALTH_PICKUP_COLOR = 0x44ff88;
const SPIN: PickupSpinRates = { rootY: 1.8, pivotX: 0.9, pivotZ: 0.6, ringZ: 1.4, bobFreq: 2.2 };

export interface RemovedHealthPickup {
  position: THREE.Vector3;
}

export class HealthPickupSystem {
  private readonly scene: THREE.Scene;
  private readonly pickups = new Map<string, PickupVisualEntry>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  syncPickup(snapshot: HealthPickupSnapshot, nowMs: number): void {
    let entry = this.pickups.get(snapshot.id);
    if (!entry) {
      entry = createPickupVisual(
        this.scene,
        snapshot.pos,
        HEALTH_PICKUP_COLOR,
        HEALTH_PICKUP_MODEL_PATH,
        HEALTH_PICKUP_MODEL_SIZE,
        nowMs,
      );
      this.pickups.set(snapshot.id, entry);
    } else {
      entry.root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
      entry.baseY = snapshot.pos.y;
    }
  }

  update(nowMs: number): void {
    for (const entry of this.pickups.values()) {
      updatePickupVisual(entry, nowMs, SPIN);
    }
  }

  removeMissing(activeIds: Set<string>): RemovedHealthPickup[] {
    const removed: RemovedHealthPickup[] = [];
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

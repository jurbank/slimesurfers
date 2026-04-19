import * as THREE from "three";
import { getWeaponDefinition, type WeaponId } from "@splat/content/combat/weaponDefs.ts";

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
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  baseY: number;
  createdAtMs: number;
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

      const mesh = new THREE.Mesh(
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

      root.add(mesh);
      root.add(ring);
      root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
      this.scene.add(root);
      state = { root, mesh, ring, baseY: snapshot.pos.y, createdAtMs: nowMs };
      this.pickups.set(snapshot.id, state);
    } else {
      state.root.position.set(snapshot.pos.x, snapshot.pos.y, snapshot.pos.z);
      state.baseY = snapshot.pos.y;
      const meshMaterial = state.mesh.material;
      if (meshMaterial instanceof THREE.MeshLambertMaterial) {
        meshMaterial.color.setHex(weapon.pickupColor);
        meshMaterial.emissive.setHex(weapon.pickupColor);
      }
      const ringMaterial = state.ring.material;
      if (ringMaterial instanceof THREE.MeshLambertMaterial) {
        ringMaterial.color.setHex(weapon.pickupColor);
        ringMaterial.emissive.setHex(weapon.pickupColor);
      }
    }
  }

  update(nowMs: number): void {
    for (const state of this.pickups.values()) {
      const t = (nowMs - state.createdAtMs) / 1000;
      state.root.rotation.y = t * 2.6;
      state.mesh.rotation.x = t * 1.4;
      state.mesh.rotation.z = t * 0.9;
      state.ring.rotation.z = t * 1.7;
      state.root.position.y = state.baseY + Math.sin(t * 2.6) * 0.45;
    }
  }

  removeMissing(activeIds: Set<string>): void {
    for (const [id, state] of this.pickups) {
      if (activeIds.has(id)) continue;
      this.scene.remove(state.root);
      state.mesh.geometry.dispose();
      state.ring.geometry.dispose();
      (state.mesh.material as THREE.Material).dispose();
      (state.ring.material as THREE.Material).dispose();
      this.pickups.delete(id);
    }
  }

  clear(): void {
    for (const state of this.pickups.values()) {
      this.scene.remove(state.root);
      state.mesh.geometry.dispose();
      state.ring.geometry.dispose();
      (state.mesh.material as THREE.Material).dispose();
      (state.ring.material as THREE.Material).dispose();
    }
    this.pickups.clear();
  }
}

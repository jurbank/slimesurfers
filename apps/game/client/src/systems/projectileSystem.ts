import * as THREE from "three";
import { getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import type { ProjectileSnapshot } from "@splat/protocol/network/serverMessages.ts";

// Cap how far we extrapolate past the last snapshot to avoid wild predictions
// if the server stops sending (e.g. the projectile was destroyed).
const MAX_EXTRAPOLATION_MS = 300;

interface ProjectileState {
  mesh: THREE.Mesh;
  // Last known authoritative position and velocity from the server snapshot.
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  receivedAtMs: number;
}

export class ProjectileSystem {
  private readonly scene: THREE.Scene;
  private readonly projectiles = new Map<string, ProjectileState>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  syncProjectile(id: string, projectile: ProjectileSnapshot, color: number, nowMs: number): void {
    let state = this.projectiles.get(id);
    const weapon = getWeaponDefinition(projectile.weaponId);
    if (!state) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(weapon.projectileCollisionRadius, 12, 12),
        new THREE.MeshLambertMaterial({
          color: weapon.projectileColor || color,
          emissive: weapon.projectileColor || color,
          emissiveIntensity: 0.35,
        }),
      );
      this.scene.add(mesh);
      state = {
        mesh,
        px: projectile.pos.x,
        py: projectile.pos.y,
        pz: projectile.pos.z,
        vx: projectile.vel.x,
        vy: projectile.vel.y,
        vz: projectile.vel.z,
        receivedAtMs: nowMs,
      };
      this.projectiles.set(id, state);
    } else {
      state.px = projectile.pos.x;
      state.py = projectile.pos.y;
      state.pz = projectile.pos.z;
      state.vx = projectile.vel.x;
      state.vy = projectile.vel.y;
      state.vz = projectile.vel.z;
      state.receivedAtMs = nowMs;

      const mat = state.mesh.material;
      if (mat instanceof THREE.MeshLambertMaterial) {
        mat.color.setHex(weapon.projectileColor || color);
        mat.emissive.setHex(weapon.projectileColor || color);
      }
    }
  }

  /** Call once per frame to extrapolate projectile positions. */
  update(nowMs: number): void {
    for (const state of this.projectiles.values()) {
      const dtSec = Math.min(nowMs - state.receivedAtMs, MAX_EXTRAPOLATION_MS) / 1000;
      state.mesh.position.set(
        state.px + state.vx * dtSec,
        state.py + state.vy * dtSec,
        state.pz + state.vz * dtSec,
      );
    }
  }

  removeMissing(activeIds: Set<string>): void {
    for (const [id, state] of this.projectiles) {
      if (activeIds.has(id)) continue;
      this.scene.remove(state.mesh);
      state.mesh.geometry.dispose();
      (state.mesh.material as THREE.Material).dispose();
      this.projectiles.delete(id);
    }
  }

  clear(): void {
    for (const state of this.projectiles.values()) {
      this.scene.remove(state.mesh);
      state.mesh.geometry.dispose();
      (state.mesh.material as THREE.Material).dispose();
    }
    this.projectiles.clear();
  }
}

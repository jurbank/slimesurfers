import * as THREE from "three";
import { getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import type { ProjectileSnapshot } from "@splat/protocol/network/serverMessages.ts";

// Cap how far we extrapolate past the last snapshot to avoid wild predictions
// if the server stops sending (e.g. the projectile was destroyed).
const MAX_EXTRAPOLATION_MS = 300;
const CORRECTION_RATE = 18;

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
  visualX: number;
  visualY: number;
  visualZ: number;
  lastUpdatedAtMs: number;
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
      const ageSec = Math.max(0, weapon.projectileLifetimeMs - projectile.lifeMs) / 1000;
      const visualX = projectile.pos.x - projectile.vel.x * ageSec;
      const visualY = projectile.pos.y - projectile.vel.y * ageSec;
      const visualZ = projectile.pos.z - projectile.vel.z * ageSec;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(weapon.projectileCollisionRadius, 12, 12),
        new THREE.MeshLambertMaterial({
          color: weapon.projectileColor || color,
          emissive: weapon.projectileColor || color,
          emissiveIntensity: 0.35,
        }),
      );
      mesh.position.set(visualX, visualY, visualZ);
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
        visualX,
        visualY,
        visualZ,
        lastUpdatedAtMs: nowMs,
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
      const frameDtSec = Math.max(
        0,
        Math.min(nowMs - state.lastUpdatedAtMs, MAX_EXTRAPOLATION_MS) / 1000,
      );
      const extrapolationDtSec =
        Math.max(0, Math.min(nowMs - state.receivedAtMs, MAX_EXTRAPOLATION_MS)) / 1000;
      const targetX = state.px + state.vx * extrapolationDtSec;
      const targetY = state.py + state.vy * extrapolationDtSec;
      const targetZ = state.pz + state.vz * extrapolationDtSec;
      const predictedX = state.visualX + state.vx * frameDtSec;
      const predictedY = state.visualY + state.vy * frameDtSec;
      const predictedZ = state.visualZ + state.vz * frameDtSec;
      const correction = 1 - Math.exp(-CORRECTION_RATE * frameDtSec);

      state.visualX = predictedX + (targetX - predictedX) * correction;
      state.visualY = predictedY + (targetY - predictedY) * correction;
      state.visualZ = predictedZ + (targetZ - predictedZ) * correction;
      state.lastUpdatedAtMs = nowMs;
      state.mesh.position.set(state.visualX, state.visualY, state.visualZ);
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

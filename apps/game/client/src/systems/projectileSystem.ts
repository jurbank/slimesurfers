import * as THREE from "three";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  type WeaponId,
} from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import type { RuntimeMapPlanet } from "@splat/content/map/runtimeMapData.ts";
import type { ProjectileSnapshot } from "@splat/protocol/network/serverMessages.ts";
import { createSlimeMaterial } from "../materials/slimeMaterial.ts";

// Cap how far we extrapolate past the last snapshot to avoid wild predictions
// if the server stops sending (e.g. the projectile was destroyed).
const MAX_EXTRAPOLATION_MS = 300;
const CORRECTION_RATE = 18;
const STREAM_TRAIL_COUNT = 5;
const STREAM_DROPLET_COUNT = 4;
const STREAM_INSTANCE_COUNT = STREAM_TRAIL_COUNT + STREAM_DROPLET_COUNT;
const STREAM_MOUTH_FORWARD_OFFSET = 0.45 * GAME_CONFIG.player.visualScale;
const STREAM_MOUTH_UP_OFFSET = -0.2 * GAME_CONFIG.player.visualScale;
const STREAM_BIRTH_MS = 90;
const SPHERE_SEGMENTS = 10;
const SPHERE_RINGS = 8;

interface ProjectileVisual {
  root: THREE.Group;
  mainMesh: THREE.Mesh;
  streamMesh?: THREE.InstancedMesh;
  materials: THREE.Material[];
}

interface ProjectileState {
  visual: ProjectileVisual;
  weaponId: WeaponId;
  wobbleSeed: number;
  projectileRadius: number;
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
  birthAgeMs: number;
  emissionOffsetX: number;
  emissionOffsetY: number;
  emissionOffsetZ: number;
}

export interface RemovedProjectile {
  weaponId: WeaponId;
  position: THREE.Vector3;
}

export class ProjectileSystem {
  private readonly scene: THREE.Scene;
  private mapPlanets: RuntimeMapPlanet[] = DEV_MAP.planets;
  private readonly projectiles = new Map<string, ProjectileState>();
  private readonly tempVelocity = new THREE.Vector3();
  private readonly tempForward = new THREE.Vector3();
  private readonly tempSide = new THREE.Vector3();
  private readonly tempUp = new THREE.Vector3();
  private readonly tempOffset = new THREE.Vector3();
  private readonly tempStart = new THREE.Vector3();
  private readonly tempEnd = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempColor = new THREE.Color();
  private readonly identityQuat = new THREE.Quaternion();
  private readonly sphereGeometries = new Map<string, THREE.SphereGeometry>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setMapPlanets(planets: RuntimeMapPlanet[]): void {
    this.mapPlanets = planets;
  }

  syncProjectile(
    id: string,
    projectile: ProjectileSnapshot,
    color: number,
    nowMs: number,
  ): boolean {
    let state = this.projectiles.get(id);
    const isNew = !state;
    const weapon = getWeaponDefinition(projectile.weaponId);
    if (!state) {
      const ageSec = Math.max(0, weapon.projectileLifetimeMs - projectile.lifeMs) / 1000;
      const visualX = projectile.pos.x - projectile.vel.x * ageSec;
      const visualY = projectile.pos.y - projectile.vel.y * ageSec;
      const visualZ = projectile.pos.z - projectile.vel.z * ageSec;

      const mat = createSlimeMaterial(color, projectile.patternId);
      if (mat.uniforms.emissive) {
        this.tempColor.setHex(color);
        mat.uniforms.emissive.value.set(this.tempColor.r, this.tempColor.g, this.tempColor.b);
        mat.uniforms.emissiveIntensity.value = 0.35;
      }

      const visual = this.createProjectileVisual(projectile, color, mat);
      visual.root.position.set(visualX, visualY, visualZ);
      const emissionOffset = this.computeStreamEmissionOffset(
        projectile,
        visualX,
        visualY,
        visualZ,
      );
      visual.mainMesh.position.copy(emissionOffset);
      this.scene.add(visual.root);
      state = {
        visual,
        weaponId: projectile.weaponId,
        wobbleSeed: hashString(id),
        projectileRadius: weapon.projectileCollisionRadius,
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
        birthAgeMs: 0,
        emissionOffsetX: emissionOffset.x,
        emissionOffsetY: emissionOffset.y,
        emissionOffsetZ: emissionOffset.z,
      };
      this.projectiles.set(id, state);
      if (state.weaponId === DEFAULT_WEAPON_ID) {
        this.updateStreamVisual(state, nowMs);
      }
    } else {
      state.weaponId = projectile.weaponId;
      state.projectileRadius = getWeaponDefinition(projectile.weaponId).projectileCollisionRadius;
      state.px = projectile.pos.x;
      state.py = projectile.pos.y;
      state.pz = projectile.pos.z;
      state.vx = projectile.vel.x;
      state.vy = projectile.vel.y;
      state.vz = projectile.vel.z;
      state.receivedAtMs = nowMs;

      this.setVisualColor(state.visual, color);
    }
    return isNew;
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
      state.visual.root.position.set(state.visualX, state.visualY, state.visualZ);
      if (state.weaponId === DEFAULT_WEAPON_ID) {
        state.birthAgeMs += frameDtSec * 1000;
        this.updateStreamVisual(state, nowMs);
      }
    }
  }

  removeMissing(activeIds: Set<string>): RemovedProjectile[] {
    const removed: RemovedProjectile[] = [];
    for (const [id, state] of this.projectiles) {
      if (activeIds.has(id)) continue;
      removed.push({
        weaponId: state.weaponId,
        position: state.visual.root.position.clone(),
      });
      this.scene.remove(state.visual.root);
      this.disposeVisual(state.visual);
      this.projectiles.delete(id);
    }
    return removed;
  }

  clear(): void {
    for (const state of this.projectiles.values()) {
      this.scene.remove(state.visual.root);
      this.disposeVisual(state.visual);
    }
    this.projectiles.clear();
    this.disposeSharedGeometries();
  }

  private createProjectileVisual(
    projectile: ProjectileSnapshot,
    color: number,
    mainMaterial: THREE.ShaderMaterial,
  ): ProjectileVisual {
    const weapon = getWeaponDefinition(projectile.weaponId);
    const root = new THREE.Group();
    const materials: THREE.Material[] = [mainMaterial];
    const mainGeometry = this.getSphereGeometry(
      weapon.projectileCollisionRadius,
      SPHERE_SEGMENTS,
      SPHERE_RINGS,
    );
    const mainMesh = new THREE.Mesh(mainGeometry, mainMaterial);
    root.add(mainMesh);

    if (projectile.weaponId !== DEFAULT_WEAPON_ID) {
      return { root, mainMesh, materials };
    }

    const trailMaterial = new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    materials.push(trailMaterial);

    const streamMesh = new THREE.InstancedMesh(
      this.getSphereGeometry(weapon.projectileCollisionRadius, 8, 6),
      trailMaterial,
      STREAM_INSTANCE_COUNT,
    );
    streamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    streamMesh.renderOrder = 3;
    root.add(streamMesh);

    return { root, mainMesh, streamMesh, materials };
  }

  private updateStreamVisual(state: ProjectileState, nowMs: number): void {
    const visual = state.visual;
    const radius = state.projectileRadius;
    const birthT = Math.min(1, state.birthAgeMs / STREAM_BIRTH_MS);
    const birthBlend = 1 - birthT;
    this.tempStart.set(
      state.emissionOffsetX * birthBlend,
      state.emissionOffsetY * birthBlend,
      state.emissionOffsetZ * birthBlend,
    );
    this.tempEnd.set(state.emissionOffsetX, state.emissionOffsetY, state.emissionOffsetZ);
    visual.mainMesh.position.copy(this.tempStart);
    const streamMesh = visual.streamMesh;
    if (!streamMesh) return;
    this.tempVelocity.set(state.vx, state.vy, state.vz);
    if (this.tempVelocity.lengthSq() < 1e-8) {
      this.tempForward.set(0, 0, -1);
    } else {
      this.tempForward.copy(this.tempVelocity).normalize().multiplyScalar(-1);
    }

    this.tempUp.set(0, 1, 0);
    this.tempSide.crossVectors(this.tempForward, this.tempUp);
    if (this.tempSide.lengthSq() < 1e-8) {
      this.tempUp.set(1, 0, 0);
      this.tempSide.crossVectors(this.tempForward, this.tempUp);
    }
    this.tempSide.normalize();
    this.tempUp.crossVectors(this.tempSide, this.tempForward).normalize();

    const time = nowMs * 0.006 + state.wobbleSeed;
    for (let i = 0; i < STREAM_TRAIL_COUNT; i++) {
      const wobble = Math.sin(time + i * 1.7) * radius * 0.18;
      const lift = Math.cos(time * 0.7 + i * 1.1) * radius * 0.12;
      if (birthT < 1) {
        const t = (i + 1) / (STREAM_TRAIL_COUNT + 1);
        this.tempOffset.copy(this.tempStart).lerp(this.tempEnd, t);
      } else {
        const back = radius * (1.1 + i * 0.85);
        this.tempOffset.copy(this.tempForward).multiplyScalar(back);
      }
      this.tempOffset.addScaledVector(this.tempSide, wobble).addScaledVector(this.tempUp, lift);
      const scale = 0.82 - i * 0.105;
      this.tempScale.set(scale, scale, scale);
      this.tempMatrix.compose(this.tempOffset, this.identityQuat, this.tempScale);
      streamMesh.setMatrixAt(i, this.tempMatrix);
    }

    for (let i = 0; i < STREAM_DROPLET_COUNT; i++) {
      const phase = time * 0.75 + i * 2.3;
      const back = radius * (1.4 + i * 0.95);
      const side = Math.sin(phase) * radius * (0.5 + i * 0.08);
      const lift = Math.cos(phase * 1.27) * radius * 0.42;
      this.tempOffset
        .copy(this.tempForward)
        .multiplyScalar(back)
        .addScaledVector(this.tempSide, side)
        .addScaledVector(this.tempUp, lift);
      const pulse = 0.85 + Math.sin(phase) * 0.15;
      const scale = (0.34 + i * 0.035) * pulse;
      this.tempScale.set(scale, scale, scale);
      this.tempMatrix.compose(this.tempOffset, this.identityQuat, this.tempScale);
      streamMesh.setMatrixAt(STREAM_TRAIL_COUNT + i, this.tempMatrix);
    }
    streamMesh.instanceMatrix.needsUpdate = true;
  }

  private setVisualColor(visual: ProjectileVisual, color: number): void {
    this.tempColor.setHex(color);
    for (const mat of visual.materials) {
      if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uColor) {
        mat.uniforms.uColor.value.set(this.tempColor.r, this.tempColor.g, this.tempColor.b);
        if (mat.uniforms.emissive) {
          mat.uniforms.emissive.value.set(this.tempColor.r, this.tempColor.g, this.tempColor.b);
        }
      } else if (mat instanceof THREE.MeshLambertMaterial) {
        mat.color.setHex(color);
        mat.emissive.setHex(color);
      }
    }
  }

  private disposeVisual(visual: ProjectileVisual): void {
    for (const material of visual.materials) {
      material.dispose();
    }
  }

  private getSphereGeometry(
    radius: number,
    widthSegments: number,
    heightSegments: number,
  ): THREE.SphereGeometry {
    const key = `${radius}:${widthSegments}:${heightSegments}`;
    let geometry = this.sphereGeometries.get(key);
    if (!geometry) {
      geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
      this.sphereGeometries.set(key, geometry);
    }
    return geometry;
  }

  private disposeSharedGeometries(): void {
    for (const geometry of this.sphereGeometries.values()) {
      geometry.dispose();
    }
    this.sphereGeometries.clear();
  }

  private computeStreamEmissionOffset(
    projectile: ProjectileSnapshot,
    spawnX: number,
    spawnY: number,
    spawnZ: number,
  ): THREE.Vector3 {
    if (projectile.weaponId !== DEFAULT_WEAPON_ID) return new THREE.Vector3();
    const planet =
      this.mapPlanets.find((entry) => entry.id === projectile.planetId) ?? this.mapPlanets[0];
    if (!planet) return new THREE.Vector3();

    const spawn = new THREE.Vector3(spawnX, spawnY, spawnZ);
    const up = new THREE.Vector3(
      spawnX - planet.center.x,
      spawnY - planet.center.y,
      spawnZ - planet.center.z,
    );
    if (up.lengthSq() < 1e-8) return new THREE.Vector3();
    up.normalize();

    const forward = new THREE.Vector3(projectile.vel.x, projectile.vel.y, projectile.vel.z);
    forward.addScaledVector(up, -forward.dot(up));
    if (forward.lengthSq() < 1e-8) return new THREE.Vector3();
    forward.normalize();

    const mouth = spawn
      .clone()
      .addScaledVector(up, STREAM_MOUTH_UP_OFFSET - GAME_CONFIG.player.projectileMuzzleHeight)
      .addScaledVector(forward, STREAM_MOUTH_FORWARD_OFFSET);
    return mouth.sub(spawn);
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

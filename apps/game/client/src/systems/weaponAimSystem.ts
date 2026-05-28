import * as THREE from "three";
import { getWeaponDefinition, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG, getPlayerTargetRadius } from "@splat/content/config/gameConfig.ts";
import { InputKey } from "@splat/protocol/network/clientMessages.ts";
import {
  createTerrainConfig,
  getTerrainRadius,
  type TerrainConfig,
} from "@splat/simulation/terrain/planetTerrain.ts";
import type { MapDataMessage } from "@splat/protocol/network/serverMessages.ts";
import type { RemotePlayer } from "../entities/player/remotePlayer.ts";
import type { CameraSystem } from "./cameraSystem.ts";
import type { CombatHud } from "../ui/CombatHud.ts";
import type { SoundSystem } from "./sound/soundSystem.ts";

const CROSSHAIR_AIM_DISTANCE = 500;

const BAZOOKA_HOLD_THRESHOLD_MS = 500;
const ACQUISITION_RAMP_MS = 2000;
const ACQUISITION_OUTER_MIN_HALF = 20;
const ACQUISITION_OUTER_MAX_HALF = 90;
const ACQUISITION_INNER_HALF = 14;
const ACQUISITION_FOV_SCALE = 0.72;

const SNIPER_HOLD_THRESHOLD_MS = 200;
const SNIPER_CHARGE_MS = 1500;
const SNIPER_FOV_SCALE = 0.4;

function getLocalFireSoundKey(weaponId: WeaponId): string {
  if (weaponId === WeaponId.Bazooka) return "bazookaPow";
  if (weaponId === WeaponId.Sniper) return "riflePow";
  return "pow";
}

export interface WeaponFireOutput {
  keyBits: number;
  aimDir: { x: number; y: number; z: number };
  aimPoint: { x: number; y: number; z: number };
  lockedTargetId?: string;
  guaranteedHoming?: boolean;
  chargeProgress?: number;
  gaugeActivityPulseSeq: number;
  dryFireGaugePulseSeq: number;
}

export class WeaponAimSystem {
  private planetEntries: { id: string; center: THREE.Vector3; terrainCfg: TerrainConfig }[] = [
    { id: "planet-0", center: new THREE.Vector3(), terrainCfg: GAME_CONFIG },
  ];
  private lastAimDir: { x: number; y: number; z: number } = { x: 0, y: 0, z: 1 };
  private fireHoldStartMs: number | null = null;
  private prevFireDown = false;
  private gaugeActivityPulseSeq = 0;
  private dryFireGaugePulseSeq = 0;
  private nextGaugeActivityPulseMs = 0;
  private acquisitionLockedTargetId: string | null = null;
  private acquisitionIsGuaranteed = false;

  private readonly crosshairRayDir = new THREE.Vector3();
  private readonly aimPointVec = new THREE.Vector3();
  private readonly aimToPlayer = new THREE.Vector3();
  private readonly acquisitionTestVec = new THREE.Vector3();
  private readonly losDir = new THREE.Vector3();
  private readonly terrainSample = new THREE.Vector3();
  private readonly resolvedAimDir = new THREE.Vector3();

  setMapData(msg: MapDataMessage): void {
    this.planetEntries = msg.planets.map((p) => ({
      id: p.id,
      center: new THREE.Vector3(p.center.x, p.center.y, p.center.z),
      terrainCfg: createTerrainConfig(p),
    }));
  }

  planetCenter(planetId: string | undefined): THREE.Vector3 | null {
    if (!planetId) return null;
    return this.planetEntries.find((entry) => entry.id === planetId)?.center ?? null;
  }

  nearestPlanetCenter(pos: THREE.Vector3): THREE.Vector3 {
    return this.findNearestPlanetEntry(pos).center;
  }

  private findNearestPlanetEntry(pos: THREE.Vector3): {
    id: string;
    center: THREE.Vector3;
    terrainCfg: TerrainConfig;
  } {
    let nearest = this.planetEntries[0]!;
    let minDist = Infinity;
    for (const entry of this.planetEntries) {
      const d = pos.distanceTo(entry.center);
      if (d < minDist) {
        minDist = d;
        nearest = entry;
      }
    }
    return nearest;
  }

  constructor(
    private readonly camera: CameraSystem,
    private readonly combatHud: CombatHud,
    private readonly sound: SoundSystem,
  ) {}

  setLastAimDir(dir: { x: number; y: number; z: number }): void {
    this.lastAimDir = dir;
  }

  private getAimPoint(
    localSessionId: string,
    weaponId: WeaponId,
    remotePlayers: Map<string, RemotePlayer>,
  ): THREE.Vector3 {
    this.camera.camera.getWorldDirection(this.crosshairRayDir).normalize();
    this.aimPointVec
      .copy(this.camera.camera.position)
      .addScaledVector(this.crosshairRayDir, CROSSHAIR_AIM_DISTANCE);

    let closestHitDistance = this.getTerrainHitDistance(CROSSHAIR_AIM_DISTANCE);
    if (closestHitDistance !== null) {
      this.aimPointVec
        .copy(this.camera.camera.position)
        .addScaledVector(this.crosshairRayDir, closestHitDistance);
    } else {
      closestHitDistance = CROSSHAIR_AIM_DISTANCE;
    }

    const weapon = getWeaponDefinition(weaponId);
    const playerHitRadius = Math.max(
      GAME_CONFIG.movement.collisionRadius + weapon.projectileCollisionRadius,
      getPlayerTargetRadius(GAME_CONFIG),
    );
    const playerHitRadiusSq = playerHitRadius * playerHitRadius;

    for (const [sessionId, remotePlayer] of remotePlayers) {
      if (sessionId === localSessionId) continue;
      if (!remotePlayer.isAimTargetVisible()) continue;

      this.aimToPlayer.copy(remotePlayer.mesh.position).sub(this.camera.camera.position);
      const centerDistance = this.aimToPlayer.dot(this.crosshairRayDir);
      if (centerDistance <= 0 || centerDistance >= closestHitDistance) continue;

      const missDistanceSq = this.aimToPlayer.lengthSq() - centerDistance * centerDistance;
      if (missDistanceSq > playerHitRadiusSq) continue;

      const entryDistance = centerDistance - Math.sqrt(playerHitRadiusSq - missDistanceSq);
      if (entryDistance <= 0 || entryDistance >= closestHitDistance) continue;

      closestHitDistance = entryDistance;
      this.aimPointVec
        .copy(this.camera.camera.position)
        .addScaledVector(this.crosshairRayDir, entryDistance);
    }

    return this.aimPointVec;
  }

  private getTerrainHitDistance(maxDistance: number): number | null {
    const stepDistance = Math.max(0.5, GAME_CONFIG.movement.collisionRadius);
    for (let d = stepDistance; d < maxDistance; d += stepDistance) {
      this.terrainSample.copy(this.camera.camera.position).addScaledVector(this.crosshairRayDir, d);
      const { center, terrainCfg } = this.findNearestPlanetEntry(this.terrainSample);
      const dx = this.terrainSample.x - center.x;
      const dy = this.terrainSample.y - center.y;
      const dz = this.terrainSample.z - center.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-6) return d;
      const surfaceRadius = getTerrainRadius(dx / dist, dy / dist, dz / dist, terrainCfg);
      if (dist <= surfaceRadius) return d;
    }
    return null;
  }

  private isTargetOccludedByTerrain(targetWorldPos: THREE.Vector3): boolean {
    const cameraPos = this.camera.camera.position;
    const totalDist = cameraPos.distanceTo(targetWorldPos);
    if (totalDist < 1e-4) return false;
    this.losDir.subVectors(targetWorldPos, cameraPos).normalize();
    const stepDistance = Math.max(0.5, GAME_CONFIG.movement.collisionRadius);
    for (let d = stepDistance; d < totalDist - stepDistance; d += stepDistance) {
      this.terrainSample.copy(cameraPos).addScaledVector(this.losDir, d);
      const { center, terrainCfg } = this.findNearestPlanetEntry(this.terrainSample);
      const dx = this.terrainSample.x - center.x;
      const dy = this.terrainSample.y - center.y;
      const dz = this.terrainSample.z - center.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-6) return true;
      const surfaceRadius = getTerrainRadius(dx / dist, dy / dist, dz / dist, terrainCfg);
      if (dist <= surfaceRadius) return true;
    }
    return false;
  }

  update(
    now: number,
    localSessionId: string,
    equippedWeaponId: WeaponId,
    slimeLevel: number,
    remotePlayers: Map<string, RemotePlayer>,
    playerPos: THREE.Vector3,
    rawFire: boolean,
    initialKeyBits: number,
  ): WeaponFireOutput {
    const aimPoint = this.getAimPoint(localSessionId, equippedWeaponId, remotePlayers);

    this.resolvedAimDir.copy(aimPoint).sub(playerPos);
    let aimDir = this.lastAimDir;
    if (this.resolvedAimDir.lengthSq() > 1e-6) {
      this.resolvedAimDir.normalize();
      aimDir = {
        x: this.resolvedAimDir.x,
        y: this.resolvedAimDir.y,
        z: this.resolvedAimDir.z,
      };
    }

    const equippedDef = getWeaponDefinition(equippedWeaponId);
    const isHomingCapable = equippedDef.homingCapable === true;
    const fireJustReleased = this.prevFireDown && !rawFire;
    this.prevFireDown = rawFire;

    let keyBits = initialKeyBits;
    let lockedTargetId: string | undefined;
    let guaranteedHoming: boolean | undefined;
    let chargeProgress: number | undefined;

    if (isHomingCapable) {
      if (rawFire && this.fireHoldStartMs === null) {
        this.fireHoldStartMs = now;
      }

      if (fireJustReleased && this.fireHoldStartMs !== null) {
        const holdMs = now - this.fireHoldStartMs;
        keyBits |= InputKey.Fire;
        if (holdMs >= BAZOOKA_HOLD_THRESHOLD_MS && this.acquisitionLockedTargetId !== null) {
          lockedTargetId = this.acquisitionLockedTargetId;
          guaranteedHoming = this.acquisitionIsGuaranteed || undefined;
        }
        this.fireHoldStartMs = null;
        this.acquisitionLockedTargetId = null;
        this.acquisitionIsGuaranteed = false;
        this.camera.setFovScale(1.0);
        this.combatHud.hideAcquisitionOverlay();
        for (const remote of remotePlayers.values()) remote.setAcquired(false);
      } else if (rawFire && this.fireHoldStartMs !== null) {
        keyBits &= ~InputKey.Fire;
        const holdMs = now - this.fireHoldStartMs;
        if (holdMs >= BAZOOKA_HOLD_THRESHOLD_MS) {
          this.camera.setFovScale(ACQUISITION_FOV_SCALE);
          const acquisitionMs = holdMs - BAZOOKA_HOLD_THRESHOLD_MS;
          const holdProgress = Math.min(1, acquisitionMs / ACQUISITION_RAMP_MS);
          const outerHalf =
            ACQUISITION_OUTER_MIN_HALF +
            holdProgress * (ACQUISITION_OUTER_MAX_HALF - ACQUISITION_OUTER_MIN_HALF);
          const cx = window.innerWidth * 0.5;
          const cy = window.innerHeight * 0.5;
          let newLockedId: string | null = null;
          let newGuaranteed = false;
          for (const [sid, remote] of remotePlayers) {
            if (!remote.isAimTargetVisible()) continue;
            this.acquisitionTestVec.copy(remote.mesh.position).project(this.camera.camera);
            if (this.acquisitionTestVec.z > 1) continue;
            const sx = (this.acquisitionTestVec.x * 0.5 + 0.5) * window.innerWidth;
            const sy = (-this.acquisitionTestVec.y * 0.5 + 0.5) * window.innerHeight;
            const dx = Math.abs(sx - cx);
            const dy = Math.abs(sy - cy);
            if (
              dx <= outerHalf &&
              dy <= outerHalf &&
              !this.isTargetOccludedByTerrain(remote.mesh.position)
            ) {
              newLockedId = sid;
              newGuaranteed = dx <= ACQUISITION_INNER_HALF && dy <= ACQUISITION_INNER_HALF;
              break;
            }
          }
          if (newLockedId !== this.acquisitionLockedTargetId) {
            if (this.acquisitionLockedTargetId !== null) {
              remotePlayers.get(this.acquisitionLockedTargetId)?.setAcquired(false);
            }
            this.acquisitionLockedTargetId = newLockedId;
          }
          if (newLockedId !== null) {
            this.acquisitionIsGuaranteed = newGuaranteed;
            remotePlayers.get(newLockedId)?.setAcquired(true, newGuaranteed);
          }
          this.combatHud.showAcquisitionOverlay(
            holdProgress,
            this.acquisitionLockedTargetId !== null,
            this.acquisitionIsGuaranteed,
          );
        }
      } else if (!rawFire && this.fireHoldStartMs === null) {
        this.camera.setFovScale(1.0);
        this.combatHud.hideAcquisitionOverlay();
      }
    } else if (equippedDef.behavior === "chargedHitscan") {
      if (rawFire && this.fireHoldStartMs === null) {
        this.fireHoldStartMs = now;
      }

      if (fireJustReleased && this.fireHoldStartMs !== null) {
        keyBits |= InputKey.Fire;
        const sniperHoldMs = now - this.fireHoldStartMs;
        chargeProgress =
          sniperHoldMs >= SNIPER_HOLD_THRESHOLD_MS
            ? Math.min(1, (sniperHoldMs - SNIPER_HOLD_THRESHOLD_MS) / SNIPER_CHARGE_MS)
            : 0;
        this.fireHoldStartMs = null;
        this.camera.setFovScale(1.0);
        this.combatHud.hideSniperScope();
      } else if (rawFire && this.fireHoldStartMs !== null) {
        keyBits &= ~InputKey.Fire;
        const holdMs = now - this.fireHoldStartMs;
        if (holdMs >= SNIPER_HOLD_THRESHOLD_MS) {
          this.camera.setFovScale(SNIPER_FOV_SCALE);
          const chargeProgress = Math.min(
            1,
            (holdMs - SNIPER_HOLD_THRESHOLD_MS) / SNIPER_CHARGE_MS,
          );
          this.combatHud.showSniperScope(chargeProgress);
        }
      } else if (!rawFire && this.fireHoldStartMs === null) {
        this.camera.setFovScale(1.0);
        this.combatHud.hideSniperScope();
      }
    } else if (this.fireHoldStartMs !== null) {
      this.fireHoldStartMs = null;
      this.acquisitionLockedTargetId = null;
      this.acquisitionIsGuaranteed = false;
      this.camera.setFovScale(1.0);
      this.combatHud.hideAcquisitionOverlay();
      this.combatHud.hideSniperScope();
      for (const remote of remotePlayers.values()) remote.setAcquired(false);
    }

    if (keyBits & InputKey.Fire) {
      const { fireCooldownMs, slimeCost } = getWeaponDefinition(equippedWeaponId);
      const isDry = slimeCost > 0 && slimeLevel < slimeCost;
      if (now >= this.nextGaugeActivityPulseMs) {
        this.gaugeActivityPulseSeq++;
        if (isDry) this.dryFireGaugePulseSeq++;
        this.nextGaugeActivityPulseMs = now + fireCooldownMs;
      }
      this.sound.playSfx(isDry ? "gunDry" : getLocalFireSoundKey(equippedWeaponId), {
        cooldownMs: fireCooldownMs,
      });
    }

    return {
      keyBits,
      aimDir,
      aimPoint: { x: aimPoint.x, y: aimPoint.y, z: aimPoint.z },
      lockedTargetId,
      guaranteedHoming,
      chargeProgress,
      gaugeActivityPulseSeq: this.gaugeActivityPulseSeq,
      dryFireGaugePulseSeq: this.dryFireGaugePulseSeq,
    };
  }
}

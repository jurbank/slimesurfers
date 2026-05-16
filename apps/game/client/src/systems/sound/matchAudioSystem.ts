import * as THREE from "three";
import { getAirTrickDefinition } from "@splat/content/tricks/airTrickDefs.ts";
import { WeaponId } from "@splat/content/combat/weaponDefs.ts";
import type {
  KillEventMessage,
  SlimeStampMessage,
  PlayerSnapshot,
  ProjectileSnapshot,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { PlayerMovementState } from "@splat/simulation/match/simState.ts";
import type { RemovedProjectile } from "../projectileSystem.ts";
import { SoundSystem } from "./soundSystem.ts";

const PROJECTILE_IMPACT_COOLDOWN_MS = 60;
const HMG_IMPACT_COOLDOWN_MS = 60;
const HMG_IMPACT_WINDOW_MS = 200;
const TRICK_LAND_SOUND_WINDOW_MS = 4000;
const TRICK_LAND_SOUND_COOLDOWN_MS = 120;
const PLAYER_KILL_SOUND_COOLDOWN_MS = 120;
const PROJECTILE_IMPACT_SOUND_KEYS = ["splat1", "splat2", "splat3"] as const;

function getProjectileFireSoundKey(weaponId: WeaponId): string {
  return weaponId === WeaponId.Bazooka ? "bazookaPow" : "pow";
}

function isTrickMovementState(movementState: number): boolean {
  return (
    movementState === PlayerMovementState.Airborne || movementState === PlayerMovementState.Grinding
  );
}

export class MatchAudioSystem {
  private heavyImpactEligibleUntilMs = 0;
  private projectileImpactSoundIndex = 0;
  private readonly recentTrickSoundEligibleUntilMs = new Map<string, number>();
  private readonly lastSnapshotMovementStates = new Map<string, number>();
  private readonly lastSnapshotShootingStates = new Map<string, boolean>();

  constructor(
    private readonly sound: SoundSystem,
    private readonly getPlayerMesh: (sessionId: string) => THREE.Object3D | null,
    private readonly getLocalSessionId: () => string | null,
  ) {}

  handleProjectileSync(projectile: ProjectileSnapshot, isNew: boolean): void {
    if (!isNew || projectile.ownerId === this.getLocalSessionId()) return;
    this.sound.playSfxAt(
      getProjectileFireSoundKey(projectile.weaponId),
      new THREE.Vector3(projectile.pos.x, projectile.pos.y, projectile.pos.z),
    );
  }

  handleRemovedProjectiles(removedProjectiles: RemovedProjectile[]): void {
    for (const removed of removedProjectiles) {
      const impactKey =
        removed.weaponId === WeaponId.Bazooka
          ? "bigSplat"
          : PROJECTILE_IMPACT_SOUND_KEYS[
              this.projectileImpactSoundIndex++ % PROJECTILE_IMPACT_SOUND_KEYS.length
            ];
      this.sound.playSfxAt(impactKey, removed.position, {
        volume: removed.weaponId === WeaponId.Bazooka ? 0.95 : 0.75,
        refDistance: removed.weaponId === WeaponId.Bazooka ? 18 : 12,
        cooldownMs: PROJECTILE_IMPACT_COOLDOWN_MS,
      });
    }
  }

  handleSlimeStamps(stamps: SlimeStampMessage[]): void {
    if (stamps.length > 0 && performance.now() <= this.heavyImpactEligibleUntilMs) {
      this.sound.playSfx("splat1", {
        volume: 0.7,
        cooldownMs: HMG_IMPACT_COOLDOWN_MS,
      });
    }
  }

  handleTrickEvents(events: TrickEventMessage[]): void {
    for (const event of events) {
      const trick = getAirTrickDefinition(event.trickId);
      this.recentTrickSoundEligibleUntilMs.set(
        event.playerId,
        performance.now() + TRICK_LAND_SOUND_WINDOW_MS,
      );

      const mesh = this.getPlayerMesh(event.playerId);
      if (mesh) {
        this.sound.playSfxAt(trick.soundKey, mesh.position, {
          volume: event.combo >= 3 ? 0.9 : 0.65,
          refDistance: 18,
        });
      } else {
        this.sound.playSfx(trick.soundKey, { volume: 0.65 });
      }
    }
  }

  handleKillEvents(events: KillEventMessage[]): void {
    for (const event of events) {
      const mesh = this.getPlayerMesh(event.victimSessionId);
      if (mesh) {
        this.sound.playSfxAt("playerKillSplat", mesh.position, {
          volume: 0.8,
          refDistance: 18,
          cooldownMs: PLAYER_KILL_SOUND_COOLDOWN_MS,
        });
      } else {
        this.sound.playSfx("playerKillSplat", {
          volume: 0.8,
          cooldownMs: PLAYER_KILL_SOUND_COOLDOWN_MS,
        });
      }
    }
  }

  handleSnapshotPlayers(players: PlayerSnapshot[]): void {
    const nowMs = performance.now();
    const hasHeavyMachineGunFire = players.some(
      (player) => player.isShooting && player.equippedWeaponId === WeaponId.HeavyMachineGun,
    );
    if (hasHeavyMachineGunFire) {
      this.heavyImpactEligibleUntilMs = nowMs + HMG_IMPACT_WINDOW_MS;
    }

    for (const player of players) {
      const prevMovementState = this.lastSnapshotMovementStates.get(player.sessionId);
      const prevShooting = this.lastSnapshotShootingStates.get(player.sessionId) ?? false;
      const eligibleUntil = this.recentTrickSoundEligibleUntilMs.get(player.sessionId) ?? 0;
      if (
        player.sessionId !== this.getLocalSessionId() &&
        !prevShooting &&
        player.isShooting &&
        player.equippedWeaponId === WeaponId.Sniper
      ) {
        const mesh = this.getPlayerMesh(player.sessionId);
        this.sound.playSfxAt(
          "riflePow",
          mesh?.position ?? new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z),
        );
      }
      if (
        prevMovementState !== undefined &&
        isTrickMovementState(prevMovementState) &&
        !isTrickMovementState(player.movementState) &&
        player.movementState !== PlayerMovementState.Dead &&
        nowMs <= eligibleUntil
      ) {
        this.sound.playSfxAt(
          "bigSplat",
          new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z),
          {
            volume: 0.8,
            refDistance: 18,
            cooldownMs: TRICK_LAND_SOUND_COOLDOWN_MS,
          },
        );
        this.recentTrickSoundEligibleUntilMs.delete(player.sessionId);
      }
      this.lastSnapshotMovementStates.set(player.sessionId, player.movementState);
      this.lastSnapshotShootingStates.set(player.sessionId, player.isShooting);
    }
  }

  removePlayer(sessionId: string): void {
    this.recentTrickSoundEligibleUntilMs.delete(sessionId);
    this.lastSnapshotMovementStates.delete(sessionId);
    this.lastSnapshotShootingStates.delete(sessionId);
  }

  clear(): void {
    this.heavyImpactEligibleUntilMs = 0;
    this.projectileImpactSoundIndex = 0;
    this.recentTrickSoundEligibleUntilMs.clear();
    this.lastSnapshotMovementStates.clear();
    this.lastSnapshotShootingStates.clear();
  }
}

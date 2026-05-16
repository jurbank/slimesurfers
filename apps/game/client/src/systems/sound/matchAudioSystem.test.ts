import { expect, it } from "vite-plus/test";
import * as THREE from "three";
import { type WeaponId as WeaponIdValue, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import type { PlayerSnapshot } from "@splat/protocol/network/serverMessages.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";
import { MatchAudioSystem } from "./matchAudioSystem.ts";
import type { RemovedProjectile } from "../projectileSystem.ts";
import type { SoundSystem } from "./soundSystem.ts";

function createRemovedProjectile(weaponId: WeaponIdValue = WeaponId.MachineGun): RemovedProjectile {
  return {
    weaponId,
    position: new THREE.Vector3(1, 2, 3),
  };
}

function createPlayerSnapshot(movementState: PlayerMovementState): PlayerSnapshot {
  return {
    sessionId: "player-1",
    pos: { x: 1, y: 2, z: 3 },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: "planet-0",
    slimeGroupId: 0,
    movementState,
    surfState: PlayerSurfState.None,
    isCarving: false,
    skiJumpCharge: 0,
    grindRailId: -1,
    grindT: 0,
    lastGrindT: 0,
    grindSpeed: 0,
    grindCooldownMs: 0,
    isShooting: false,
    equippedWeaponId: WeaponId.MachineGun,
    disposableShotsRemaining: 0,
    health: 100,
    slimeLevel: 0,
    respawnTimer: 0,
    isOnFriendlySlime: false,
    slimeColor: 0x00ff00,
    patternId: 0,
    inputSeq: 0,
  };
}

it("alternates projectile impact splat sounds", () => {
  const playedKeys: string[] = [];
  const sound = {
    playSfx: () => {},
    playSfxAt: (key: string) => {
      playedKeys.push(key);
    },
  } as unknown as SoundSystem;
  const system = new MatchAudioSystem(
    sound,
    () => null,
    () => null,
  );

  system.handleRemovedProjectiles([
    createRemovedProjectile(),
    createRemovedProjectile(WeaponId.Bazooka),
    createRemovedProjectile(),
    createRemovedProjectile(),
  ]);

  expect(playedKeys).toEqual(["splat1", "bigSplat", "splat2", "splat3"]);
});

it("resets projectile impact splat alternation when cleared", () => {
  const playedKeys: string[] = [];
  const sound = {
    playSfxAt: (key: string) => {
      playedKeys.push(key);
    },
  } as unknown as SoundSystem;
  const system = new MatchAudioSystem(
    sound,
    () => null,
    () => null,
  );

  system.handleRemovedProjectiles([createRemovedProjectile(), createRemovedProjectile()]);
  system.clear();
  system.handleRemovedProjectiles([createRemovedProjectile()]);

  expect(playedKeys).toEqual(["splat1", "splat2", "splat1"]);
});

it("plays the big splat sound when a trick lands", () => {
  const playedKeys: string[] = [];
  const sound = {
    playSfx: () => {},
    playSfxAt: (key: string) => {
      playedKeys.push(key);
    },
  } as unknown as SoundSystem;
  const system = new MatchAudioSystem(
    sound,
    () => null,
    () => null,
  );

  system.handleSnapshotPlayers([createPlayerSnapshot(PlayerMovementState.Airborne)]);
  system.handleTrickEvents([{ playerId: "player-1", trickId: "kickflip", combo: 1, seq: 1 }]);
  system.handleSnapshotPlayers([createPlayerSnapshot(PlayerMovementState.Moving)]);

  expect(playedKeys).toEqual(["bigSplat"]);
});

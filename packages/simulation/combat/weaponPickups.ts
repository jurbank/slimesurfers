import {
  getWeaponPickupSpawns,
  getWeaponDefinition,
  type WeaponPickupLayout,
  type WeaponPickupSpawnDefinition,
} from "@splat/content/combat/weaponDefs.ts";
import { PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import {
  PlayerMovementState,
  type SimMatchState,
  type SimPlayerState,
  type SimWeaponPickupState,
} from "../match/simState.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

interface PickupConfig {
  planet: {
    radius: number;
  };
  pickups: {
    collectRadius: number;
    hoverHeight: number;
  };
  movement: {
    collisionRadius: number;
  };
  slime: {
    maxLevel: number;
  };
  terrain: {
    seed: number;
    baseAmplitude: number;
    frequency: number;
    octaves: number;
    lacunarity: number;
    persistence: number;
    waterLevel: number;
    snowLevel: number;
    sandBand: number;
    rockLevel: number;
  };
}

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

function distanceSquared(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function createWeaponPickupState(
  spawn: WeaponPickupSpawnDefinition,
  cfg: PickupConfig,
): SimWeaponPickupState {
  const planet =
    PLANET_POSITIONS.find((entry) => entry.id === spawn.planetId) ?? PLANET_POSITIONS[0];
  const normal = normalize(spawn.normal.x, spawn.normal.y, spawn.normal.z);
  const terrainRadius = getTerrainRadius(normal.x, normal.y, normal.z, cfg);

  return {
    id: spawn.id,
    weaponId: spawn.weaponId,
    planetId: spawn.planetId,
    normal,
    pos: {
      x: planet.x + normal.x * (terrainRadius + cfg.pickups.hoverHeight),
      y: planet.y + normal.y * (terrainRadius + cfg.pickups.hoverHeight),
      z: planet.z + normal.z * (terrainRadius + cfg.pickups.hoverHeight),
    },
    respawnTimer: 0,
    respawnDurationSeconds: spawn.respawnSeconds,
    active: true,
  };
}

export function createWeaponPickups(
  cfg: PickupConfig,
  layout: WeaponPickupLayout = "map",
): Map<string, SimWeaponPickupState> {
  return new Map(
    getWeaponPickupSpawns(layout).map((spawn) => [spawn.id, createWeaponPickupState(spawn, cfg)]),
  );
}

export function tickWeaponPickups(simState: SimMatchState, dtSeconds: number): void {
  simState.pickups.forEach((pickup) => {
    if (pickup.active || pickup.respawnTimer <= 0) return;
    pickup.respawnTimer = Math.max(0, pickup.respawnTimer - dtSeconds);
    if (pickup.respawnTimer === 0) {
      pickup.active = true;
    }
  });
}

export function collectWeaponPickup(
  simState: SimMatchState,
  player: SimPlayerState,
  cfg: PickupConfig,
): void {
  if (player.movementState === PlayerMovementState.Dead) return;

  const collectDistance = cfg.pickups.collectRadius + cfg.movement.collisionRadius;
  const collectDistanceSq = collectDistance * collectDistance;

  simState.pickups.forEach((pickup) => {
    if (!pickup.active) return;
    if (pickup.planetId !== player.planetId) return;
    if (pickup.weaponId === player.equippedWeaponId) return;
    const pickupBasePos = {
      x: pickup.pos.x - pickup.normal.x * cfg.pickups.hoverHeight,
      y: pickup.pos.y - pickup.normal.y * cfg.pickups.hoverHeight,
      z: pickup.pos.z - pickup.normal.z * cfg.pickups.hoverHeight,
    };
    if (distanceSquared(player.pos, pickupBasePos) > collectDistanceSq) return;

    player.equippedWeaponId = pickup.weaponId;
    player.disposableShotsRemaining = getWeaponDefinition(pickup.weaponId).disposableShots ?? 0;
    player.weaponTriggerHeldSinceMs = -1;
    player.slimeLevel = cfg.slime.maxLevel;
    pickup.active = false;
    pickup.respawnTimer = pickup.respawnDurationSeconds;
  });
}

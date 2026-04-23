import {
  WeaponId as WeaponIds,
  type WeaponId as WeaponIdValue,
} from "@splat/protocol/network/weaponIds.ts";

export type WeaponId = WeaponIdValue;

export type WeaponBehavior = "projectile" | "chargedHitscan";

export interface WeaponDefinition {
  id: WeaponId;
  displayName: string;
  behavior: WeaponBehavior;
  projectileSpeed: number;
  projectileLifetimeMs: number;
  projectileCollisionRadius: number;
  fireCooldownMs: number;
  slimeCost: number;
  directDamage: number;
  splashDamage: number;
  splashRadius: number;
  blastImpulse: number;
  paintRadiusMultiplier: number;
  pickupColor: number;
  /** If set, this weapon is disposable: the player gets this many shots then reverts to the default weapon. */
  disposableShots?: number;
  /** If true, holding fire enables target acquisition and launches a homing projectile on release. */
  homingCapable?: boolean;
}

export interface WeaponPickupSpawnDefinition {
  id: string;
  weaponId: WeaponId;
  planetId: string;
  normal: {
    x: number;
    y: number;
    z: number;
  };
  respawnSeconds: number;
}

export const WeaponId = WeaponIds;

export const DEFAULT_WEAPON_ID = WeaponId.MachineGun;

export const WEAPON_DEFS: Record<WeaponId, WeaponDefinition> = {
  [WeaponId.MachineGun]: {
    id: WeaponId.MachineGun,
    displayName: "Machine Gun",
    behavior: "projectile",
    projectileSpeed: 55,
    projectileLifetimeMs: 6000,
    projectileCollisionRadius: 0.2,
    fireCooldownMs: 100,
    slimeCost: 0,
    directDamage: 34,
    splashDamage: 0,
    splashRadius: 0,
    blastImpulse: 0,
    paintRadiusMultiplier: 1,
    pickupColor: 0x3fe7ff,
  },
  [WeaponId.Bazooka]: {
    id: WeaponId.Bazooka,
    displayName: "Bazooka",
    behavior: "projectile",
    projectileSpeed: 85,
    projectileLifetimeMs: 2400,
    projectileCollisionRadius: 0.5,
    fireCooldownMs: 850,
    slimeCost: 0,
    directDamage: 100,
    splashDamage: 45,
    splashRadius: 3.4,
    blastImpulse: 40,
    paintRadiusMultiplier: 2.4,
    pickupColor: 0xff9b3d,
    disposableShots: 3,
    homingCapable: true,
  },
  [WeaponId.Sniper]: {
    id: WeaponId.Sniper,
    displayName: "Sniper",
    behavior: "chargedHitscan",
    projectileSpeed: 0,
    projectileLifetimeMs: 0,
    projectileCollisionRadius: 0,
    fireCooldownMs: 1200,
    slimeCost: 0,
    directDamage: 100,
    splashDamage: 0,
    splashRadius: 0,
    blastImpulse: 0,
    paintRadiusMultiplier: 0.8,
    pickupColor: 0xb63542,
    disposableShots: 2,
  },
};

export const WEAPON_PICKUP_SPAWNS: WeaponPickupSpawnDefinition[] = [
  {
    id: "bazooka-east",
    weaponId: WeaponId.Bazooka,
    planetId: "planet-0",
    normal: { x: 0.09, y: 0.996, z: 0.01 },
    respawnSeconds: 10,
  },
  {
    id: "bazooka-west",
    weaponId: WeaponId.Bazooka,
    planetId: "planet-0",
    normal: { x: -0.84, y: 0.5, z: -0.2 },
    respawnSeconds: 10,
  },
];

export function getWeaponDefinition(weaponId: WeaponId): WeaponDefinition {
  return WEAPON_DEFS[weaponId] ?? WEAPON_DEFS[DEFAULT_WEAPON_ID];
}

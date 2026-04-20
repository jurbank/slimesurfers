import type { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";

// Plain simulation types — no framework imports.

export interface SimVec3 {
  x: number;
  y: number;
  z: number;
}

export interface SimQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface SimPaintStamp {
  paintGroupId: number;
  color: number;
  nx: number;
  ny: number;
  nz: number;
  radius: number;
  seq: number;
}

export interface SimTerritoryCell {
  ownerPaintGroupId: number;
  color: number;
}

export interface SimPlanetPaintState {
  planetId: string;
  territoryRows: number;
  territoryCols: number;
  cells: SimTerritoryCell[];
  stamps: SimPaintStamp[];
  stampBuckets: SimPaintStamp[][];
}

export interface SimProjectileState {
  id: string;
  ownerId: string;
  weaponId: WeaponId;
  paintGroupId: number;
  pos: SimVec3;
  vel: SimVec3;
  planetId: string;
  lifeMs: number;
  spawnTimeMs?: number;
}

export interface SimWeaponPickupState {
  id: string;
  weaponId: WeaponId;
  planetId: string;
  normal: SimVec3;
  pos: SimVec3;
  respawnTimer: number;
  respawnDurationSeconds: number;
  active: boolean;
}

// -- Enums and constants (moved from packages/protocol/schemas/playerState.ts) --

export const PlayerMovementState = {
  Idle: 0,
  Moving: 1,
  Airborne: 2,
  Dead: 3,
} as const;
export type PlayerMovementState = (typeof PlayerMovementState)[keyof typeof PlayerMovementState];

export const PlayerSwimState = {
  None: 0,
  SwimmingMoving: 1,
  SwimmingHidden: 2,
  SkiVisible: 3,
} as const;
export type PlayerSwimState = (typeof PlayerSwimState)[keyof typeof PlayerSwimState];

export const NO_TEAM_ID = 255;

// -- Player state ------------------------------------------------------------

export interface SimPlayerState {
  // Identity
  sessionId: string;
  name: string;
  teamId: number;
  paintGroupId: number;
  paletteIndex: number;
  slimeColor: number;
  // Physics
  pos: SimVec3;
  vel: SimVec3;
  rot: SimQuat;
  planetId: string;
  spawnPlanetId: string;
  /** Use PlayerMovementState values. Named movementState to avoid the confusing playerState.state pattern. */
  movementState: number;
  swimState: number;
  isCarving: boolean;
  inputSeq: number;
  // Gameplay
  equippedWeaponId: WeaponId;
  health: number;
  slimeLevel: number;
  paintScore: number;
  killCount: number;
  deathCount: number;
  respawnTimer: number;
  lastFireTimeMs: number;
}

// -- Match state -------------------------------------------------------------

export interface SimMatchState {
  players: Map<string, SimPlayerState>;
  planets: Map<string, SimPlanetPaintState>;
  projectiles: Map<string, SimProjectileState>;
  pickups: Map<string, SimWeaponPickupState>;
  matchPhase: MatchPhase;
  matchTimer: number;
  paintSeq: number;
  scores: Map<string, number>;
  elapsedMs: number;
  nextProjectileId: number;
}

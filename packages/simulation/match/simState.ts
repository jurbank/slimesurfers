import type { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import type { BotBehaviorProfile } from "@splat/content/config/gameConfig.ts";
import type { BotEmoteTemperament } from "@splat/content/emotes/emoteDefs.ts";

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
  patternId: number;
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

export interface SimRailPaintState {
  railId: number;
  nodes: number[]; // Array of 0xRRGGBB colors
}

export interface SimProjectileState {
  id: string;
  ownerId: string;
  weaponId: WeaponId;
  paintGroupId: number;
  slimeColor: number;
  patternId: number;
  pos: SimVec3;
  vel: SimVec3;
  planetId: string;
  lifeMs: number;
  spawnTimeMs?: number;
  homingTargetId?: string;
  guaranteedHoming?: boolean;
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

export interface SimHealthPickupState {
  id: string;
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
  Grinding: 4,
} as const;
export type PlayerMovementState = (typeof PlayerMovementState)[keyof typeof PlayerMovementState];

export const PlayerSurfState = {
  None: 0,
  SurfmingMoving: 1,
  SurfmingHidden: 2,
  SkiVisible: 3,
  SkiWater: 4,
} as const;
export type PlayerSurfState = (typeof PlayerSurfState)[keyof typeof PlayerSurfState];

export const NO_TEAM_ID = 255;
export type BotOrigin = "named" | "generated";

// -- Player state ------------------------------------------------------------

export interface SimPlayerState {
  // Identity
  sessionId: string;
  isBot: boolean;
  name: string;
  botProfile?: BotBehaviorProfile;
  botEmoteTemperament?: BotEmoteTemperament;
  botEmoteFrequency?: number;
  botOrigin?: BotOrigin;
  botConfigIndex?: number;
  teamId: number;
  paintGroupId: number;
  paletteIndex: number;
  patternId: number;
  slimeColor: number;
  // Physics
  pos: SimVec3;
  vel: SimVec3;
  rot: SimQuat;
  planetId: string;
  spawnPlanetId: string;
  spawnNormal: SimVec3;
  /** Use PlayerMovementState values. Named movementState to avoid the confusing playerState.state pattern. */
  movementState: number;
  surfState: number;
  isCarving: boolean;
  skiJumpCharge: number;
  grindRailId: number; // -1 = not grinding
  grindT: number; // arc-length parameter along rail (wu from start)
  lastGrindT: number; // arc-length parameter from the previous tick
  grindSpeed: number; // signed wu/s along rail tangent
  grindCooldownMs: number; // ms remaining before tryEnterGrind is eligible again
  isOnFriendlyPaint: boolean;
  inputSeq: number;
  airTrickCombo: number;
  airTrickAirTimeMs: number;
  airTrickInputSequence: number[];
  airTrickInputAgeMs: number;
  lastAirTrickTimeMs: number;
  airTrickSpinDegrees: number;
  airTrickSpinMilestoneIndex: number;
  airTrickSpinBlocked: boolean;
  airTrickFlipDegrees: number;
  airTrickFrontFlipMilestoneIndex: number;
  airTrickBackFlipMilestoneIndex: number;
  airTrickFlipBlocked: boolean;
  airTrickPaintMultiplier: number;
  // Gameplay
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  health: number;
  slimeLevel: number;
  paintScore: number;
  killCount: number;
  deathCount: number;
  respawnTimer: number;
  lastFireTimeMs: number;
  weaponTriggerHeldSinceMs: number;
}

// -- Match state -------------------------------------------------------------

export interface SimMatchState {
  players: Map<string, SimPlayerState>;
  planets: Map<string, SimPlanetPaintState>;
  railStates: Map<number, SimRailPaintState>;
  projectiles: Map<string, SimProjectileState>;
  pickups: Map<string, SimWeaponPickupState>;
  healthPickups: Map<string, SimHealthPickupState>;
  matchPhase: MatchPhase;
  matchTimer: number;
  paintSeq: number;
  trickSeq: number;
  scores: Map<string, number>;
  elapsedMs: number;
  nextProjectileId: number;
}

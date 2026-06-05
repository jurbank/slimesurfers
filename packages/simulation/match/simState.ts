import type { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import type { BotBehaviorProfile } from "@splat/content/config/gameConfig.ts";
import type { BotEmoteTemperament } from "@splat/content/emotes/emoteDefs.ts";
import type { TerrainConfig } from "../terrain/planetTerrain.ts";
import type { RuntimeMapPlanet } from "@splat/content/map/runtimeMapData.ts";

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

export interface SimSlimeStamp {
  slimeGroupId: number;
  color: number;
  patternId: number;
  nx: number;
  ny: number;
  nz: number;
  radius: number;
  seq: number;
}

export interface SimTerritoryCell {
  ownerSlimeGroupId: number;
  color: number;
}

export interface SimPlanetSlimeState {
  planetId: string;
  territoryRows: number;
  territoryCols: number;
  cells: SimTerritoryCell[];
  stamps: SimSlimeStamp[];
  stampBuckets: SimSlimeStamp[][];
}

/**
 * Per-blast-pad runtime ownership and charge state. Paint stamps landing inside the
 * pad footprint accumulate coverage in the stamping player's color (friendly paint
 * adds, enemy paint subtracts). A pad only fires when fully charged (coverage >= 1)
 * and the trigger consumes the charge — pad returns to neutral until repainted.
 */
export interface SimBlastPadState {
  ownerSlimeGroupId: number;
  ownerColor: number;
  /** Charge level in [0, 1]. The pad triggers only when this reaches 1. */
  coverageProgress: number;
}

export interface SimRailSlimeState {
  railId: number;
  nodes: number[]; // Array of 0xRRGGBB colors
}

export interface SimProjectileState {
  id: string;
  ownerId: string;
  ownerTeamId?: number;
  weaponId: WeaponId;
  slimeGroupId: number;
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
  /** Phase C of DIRECTIONAL_TRAVERSAL_PLAN — ballistic, single-planet gravity,
   *  continuous steering, Forward/Backward thrust/brake. Entered when the
   *  player launches off a loaded blast pad. */
  FreeFlight: 8,
  /** Phase E of DIRECTIONAL_TRAVERSAL_PLAN — player is locked to a charged
   *  blast pad, aiming freely. Hold Anchor to charge launch speed; release to
   *  fire into FreeFlight. Move keys step off without launching. */
  PadLoaded: 9,
} as const;
export type PlayerMovementState = (typeof PlayerMovementState)[keyof typeof PlayerMovementState];

/** Ballistic space traversal — not surfaced. Currently just FreeFlight (Airborne
 *  stays its own bucket since it's always bound to a single nearest planet). */
export function isFreeFlightMovementState(movementState: number): boolean {
  return movementState === PlayerMovementState.FreeFlight;
}

export const PlayerSurfState = {
  None: 0,
  SurfingMoving: 1,
  SurfingHidden: 2,
  SurfingVisible: 3,
  SurfingWater: 4,
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
  slimeGroupId: number;
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
  splatCooldownMs: number;
  isOnFriendlySlime: boolean;
  /** Hysteresis hint for the gravity picker — see PlayerPhysics.gravityAnchorPlanetId. */
  gravityAnchorPlanetId: string;
  /** ID of the blast pad the player is currently loaded onto. "" when not loaded. */
  loadedPadId: string;
  /** 0..1 ramp during the pad's load-in wind-up. Launch input is ignored until 1. */
  padLoadProgress: number;
  /** 0..1 ramp while Anchor is held during PadLoaded. Maps to launch speed at release. */
  padChargeProgress: number;
  /** False until the player has released all movement keys after loading. Cancel
   *  requires this true — prevents walking onto a pad with W held from instantly
   *  stepping off again. */
  padCancelArmed: boolean;
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
  airTrickSlimeMultiplier: number;
  // Gameplay
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  health: number;
  slimeLevel: number;
  slimeScore: number;
  killCount: number;
  deathCount: number;
  respawnTimer: number;
  lastFireTimeMs: number;
  weaponTriggerHeldSinceMs: number;
}

// -- Match state -------------------------------------------------------------

export interface SimMatchState {
  players: Map<string, SimPlayerState>;
  planetDefs: RuntimeMapPlanet[];
  mapTerrain: TerrainConfig["terrain"];
  planets: Map<string, SimPlanetSlimeState>;
  railStates: Map<number, SimRailSlimeState>;
  blastPadStates: Map<string, SimBlastPadState>;
  projectiles: Map<string, SimProjectileState>;
  pickups: Map<string, SimWeaponPickupState>;
  healthPickups: Map<string, SimHealthPickupState>;
  matchPhase: MatchPhase;
  matchTimer: number;
  slimeSeq: number;
  trickSeq: number;
  scores: Map<string, number>;
  elapsedMs: number;
  nextProjectileId: number;
}

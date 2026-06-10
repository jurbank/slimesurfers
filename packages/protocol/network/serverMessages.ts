/**
 * Shapes of messages sent from the server to individual clients (or broadcast).
 * Serialised as plain JSON via this.broadcast() / client.send().
 */
import type { Vec3Data, QuatData } from "./clientMessages.ts";
import type { MatchPhase } from "./matchPhase.ts";
import type { WeaponId } from "./weaponIds.ts";

// -- Snapshot ----------------------------------------------------------------

/**
 * Authoritative physics state for one player, included in SnapshotMessage.
 * The client reconciles this against its prediction ring buffer by matching
 * inputSeq: discard all buffered inputs with seq ≤ inputSeq, then re-simulate
 * the remaining inputs on top of this authoritative state.
 */
export interface PlayerSnapshot {
  sessionId: string;
  pos: Vec3Data;
  vel: Vec3Data;
  rot: QuatData;
  planetId: string;
  slimeGroupId: number;
  movementState: number;
  surfState: number;
  isCarving: boolean;
  skiJumpCharge: number;
  grindRailId: number;
  grindT: number;
  lastGrindT: number;
  grindSpeed: number;
  grindCooldownMs: number;
  /** Hysteresis hint for the gravity picker (see simulatedMovement.ts). Optional
   *  for backwards compatibility with older snapshots — clients tolerate absence. */
  gravityAnchorPlanetId?: string;
  /** Phase E loaded-pad state. Optional for back-compat. */
  loadedPadId?: string;
  padLoadProgress?: number;
  padChargeProgress?: number;
  padCancelArmed?: boolean;
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  health: number;
  slimeLevel: number;
  respawnTimer: number;
  /** True if the player is currently standing on or submerged in their own team's slime */
  isOnFriendlySlime: boolean;
  /** Visual identity */
  slimeColor: number;
  patternId: number;
  /** The last InputMessage.seq the server processed for this player */
  inputSeq: number;
}

/**
 * Sent at NETWORK_CONFIG.simulation.snapshotRateHz (10 Hz by default).
 * Contains the full authoritative state for every player so that any client
 * can reconcile regardless of packet loss on previous snapshots.
 */
export interface SnapshotMessage {
  /** Server simulation tick this snapshot was captured at */
  tick: number;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  pickups: PickupSnapshot[];
  healthPickups: HealthPickupSnapshot[];
  blastPadStates?: BlastPadStateSnapshot[];
}

export interface BlastPadStateSnapshot {
  id: string;
  ownerSlimeGroupId: number;
  ownerColor: number;
  coverageProgress: number;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  weaponId: WeaponId;
  slimeGroupId: number;
  slimeColor: number;
  patternId: number;
  pos: Vec3Data;
  vel: Vec3Data;
  planetId: string;
  lifeMs: number;
  homingTargetId?: string;
  guaranteedHoming?: boolean;
}

export interface PickupSnapshot {
  id: string;
  weaponId: WeaponId;
  planetId: string;
  pos: Vec3Data;
}

export interface HealthPickupSnapshot {
  id: string;
  pos: Vec3Data;
}

// -- Slime stamps ------------------------------------------------------------

/**
 * Transient visual slime stamp event for client-side rendering.
 * Territory ownership remains authoritative in schema state.
 */
export interface SlimeStampMessage {
  planetId: string;
  slimeGroupId: number;
  color: number;
  patternId: number;
  nx: number;
  ny: number;
  nz: number;
  radius: number;
  seq: number;
}

export interface SlimeStampBatchMessage {
  stamps: SlimeStampMessage[];
}

// -- Tricks ------------------------------------------------------------------

export interface TrickEventMessage {
  playerId: string;
  trickId: string;
  combo: number;
  seq: number;
}

export interface TrickEventBatchMessage {
  events: TrickEventMessage[];
}

// -- Emotes -----------------------------------------------------------------

export interface EmoteEventMessage {
  playerId: string;
  emoteIds: string[];
  seq: number;
}

export interface EmoteEventBatchMessage {
  events: EmoteEventMessage[];
}

// -- Kill feed ---------------------------------------------------------------

export interface KillEventMessage {
  seq: number;
  killerSessionId?: string;
  killerName?: string;
  killerSlimeColor?: number;
  killerPatternId?: number;
  victimSessionId: string;
  victimName: string;
  victimSlimeColor: number;
  victimPatternId: number;
  weaponId?: WeaponId;
  isSelfKill: boolean;
}

export interface KillEventBatchMessage {
  events: KillEventMessage[];
}

// -- Leaderboard -------------------------------------------------------------

export interface LeaderboardEntry {
  sessionId: string;
  name: string;
  teamId: number;
  slimeGroupId: number;
  slimeColor: number;
  patternId: number;
  /** Cumulative slime score for this match */
  slimeScore: number;
  /** Total confirmed eliminations this match */
  killCount: number;
  /** Total times this player has been eliminated this match */
  deathCount: number;
}

/**
 * Sent at NETWORK_CONFIG.simulation.leaderboardRateHz (2 Hz by default).
 * Entries are pre-sorted descending by slimeScore.
 */
export interface LeaderboardMessage {
  entries: LeaderboardEntry[];
  /** Team aggregate scores, indexed parallel to GAME_CONFIG.match.teamColors. Empty for non-team modes. */
  teamScores: number[];
}

// -- Match phase -------------------------------------------------------------

/**
 * Broadcast whenever the match transitions between phases
 * (lobby → countdown → active → ended).
 */
export interface MatchPhaseMessage {
  phase: MatchPhase;
  /** Seconds remaining in this phase (countdown timer or match timer) */
  timer: number;
  /** Index into GameState.teamColors of the winning team. Only set when phase === Ended and isTeamBased. */
  winningTeamId?: number;
}

// -- Map data ----------------------------------------------------------------

/** Sent once to each joining client so the client can render the correct map. */
export interface MapDataMessage {
  mapId: string;
  name: string;
  cel: {
    bands: number;
    softness: number;
    hatchStrength: number;
    hatchScale: number;
  };
  planets: Array<{
    id: string;
    center: { x: number; y: number; z: number };
    radius: number;
    gravityRadius?: number;
    captureRadius?: number;
    terrain: {
      seed: number;
      baseAmplitude: number;
      frequency: number;
      octaves: number;
      lacunarity: number;
      persistence: number;
      heightSmoothingStrength: number;
      heightSmoothingSampleAngle: number;
      waterLevel: number;
      snowLevel: number;
      sandBand: number;
      rockLevel: number;
      icosahedronDetail: number;
    };
    colors: { sand: number; grass: number; rock: number; snow: number; waterDeep: number };
    atmosphere: {
      enabled: boolean;
      height: number;
      color: number;
      intensity: number;
      opacity: number;
      fresnelPower: number;
      falloffPower: number;
    };
    lighting: {
      sunAzimuth: number;
      sunElevation: number;
      sunIntensity: number;
      ambientIntensity: number;
      rimColor: number;
      rimStrength: number;
      rimPower: number;
    };
    props: { treeDensity: number; cactusDensity: number; seed: number; rocketEnabled: boolean };
    hasWater: boolean;
    terrainFeatures: Array<
      | {
          id: string;
          kind: "slope";
          enabled: boolean;
          width: number;
          bank: number;
          edgeFalloff: number;
          smoothing: number;
          transitionLength: number;
          points: Array<{
            nx: number;
            ny: number;
            nz: number;
            heightOffset: number;
            width?: number;
            bank?: number;
            edgeFalloff?: number;
            smoothing?: number;
          }>;
        }
      | {
          id: string;
          kind: "jump";
          enabled: boolean;
          nx: number;
          ny: number;
          nz: number;
          tx: number;
          ty: number;
          tz: number;
          width: number;
          length: number;
          height: number;
          edgeFalloff: number;
          smoothing: number;
        }
    >;
  }>;
  rails: Array<{
    id: number;
    planetId: string;
    controlPoints: Array<{ nx: number; ny: number; nz: number; heightOffset: number }>;
    slimeCorridorRadius: number;
  }>;
  blastPads?: Array<{
    id: string;
    planetId: string;
    normal: { x: number; y: number; z: number };
    tangent: { x: number; y: number; z: number };
    radius: number;
    cooldownMs?: number;
    launchSpeed: number;
    upwardBias: number;
  }>;
}

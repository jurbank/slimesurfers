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
  paintGroupId: number;
  movementState: number;
  surfState: number;
  isCarving: boolean;
  skiJumpCharge: number;
  isShooting: boolean;
  equippedWeaponId: WeaponId;
  disposableShotsRemaining: number;
  health: number;
  slimeLevel: number;
  respawnTimer: number;
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
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  weaponId: WeaponId;
  paintGroupId: number;
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

// -- Paint -------------------------------------------------------------------

/**
 * Transient visual paint event for client-side rendering.
 * Territory ownership remains authoritative in schema state.
 */
export interface PaintStampMessage {
  planetId: string;
  paintGroupId: number;
  color: number;
  patternId: number;
  nx: number;
  ny: number;
  nz: number;
  radius: number;
  seq: number;
}

export interface PaintStampBatchMessage {
  stamps: PaintStampMessage[];
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
  paintGroupId: number;
  slimeColor: number;
  patternId: number;
  /** Cumulative paint score for this match */
  paintScore: number;
  /** Total confirmed eliminations this match */
  killCount: number;
  /** Total times this player has been eliminated this match */
  deathCount: number;
}

/**
 * Sent at NETWORK_CONFIG.simulation.leaderboardRateHz (2 Hz by default).
 * Entries are pre-sorted descending by paintScore.
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
}

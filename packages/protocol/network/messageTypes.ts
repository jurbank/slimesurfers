/**
 * All message type identifiers used with room.send() / room.onMessage().
 * Colyseus schema delta-patches handle state sync automatically; these
 * message types are for out-of-band communication that doesn't belong in
 * the schema (input, snapshots, leaderboard, phase changes).
 */
export const MessageType = {
  // Client -> Server
  /** Player input for the current tick */
  Input: "input",
  /** Player wants to change their display name */
  Rename: "rename",

  // Server -> Client
  /**
   * Authoritative position snapshot sent every snapshot tick.
   * Clients use this to reconcile their prediction buffer.
   */
  Snapshot: "snapshot",
  /** Periodic leaderboard update (sent at NETWORK_CONFIG.simulation.leaderboardRateHz) */
  Leaderboard: "leaderboard",
  /** Batched transient visual paint impacts; not authoritative scoring state */
  PaintStamps: "paintStamps",
  /** Batched transient air-trick events for client animation and feedback */
  TrickEvents: "trickEvents",
  /** Match phase transition (lobby -> countdown -> active -> ended) */
  MatchPhase: "matchPhase",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
export type {
  LeaderboardEntry,
  LeaderboardMessage,
  MatchPhaseMessage,
  PaintStampBatchMessage,
  PaintStampMessage,
  PlayerSnapshot,
  ProjectileSnapshot,
  SnapshotMessage,
  TrickEventBatchMessage,
  TrickEventMessage,
} from "./serverMessages.ts";

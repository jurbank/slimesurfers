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
  /** Player wants to show selected emotes above their character */
  EmotePost: "emotePost",

  // Server -> Client
  /**
   * Authoritative position snapshot sent every snapshot tick.
   * Clients use this to reconcile their prediction buffer.
   */
  Snapshot: "snapshot",
  /** Periodic leaderboard update (sent at NETWORK_CONFIG.simulation.leaderboardRateHz) */
  Leaderboard: "leaderboard",
  /** Batched transient visual slime stamp impacts; not authoritative scoring state */
  SlimeStamps: "slimeStamps",
  /** Batched transient air-trick events for client animation and feedback */
  TrickEvents: "trickEvents",
  /** Batched transient emote bubbles for client UI */
  EmoteEvents: "emoteEvents",
  /** Batched transient kill-feed events for client UI */
  KillEvents: "killEvents",
  /** Match phase transition (lobby -> countdown -> active -> ended) */
  MatchPhase: "matchPhase",
  /** Sent once to each client on join; carries the terrain and map configuration */
  MapData: "mapData",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
export type {
  KillEventBatchMessage,
  KillEventMessage,
  LeaderboardEntry,
  LeaderboardMessage,
  MapDataMessage,
  MatchPhaseMessage,
  EmoteEventBatchMessage,
  EmoteEventMessage,
  SlimeStampBatchMessage,
  SlimeStampMessage,
  PlayerSnapshot,
  ProjectileSnapshot,
  SnapshotMessage,
  TrickEventBatchMessage,
  TrickEventMessage,
} from "./serverMessages.ts";

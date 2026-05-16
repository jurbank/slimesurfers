import { Schema, defineTypes, type MapSchema } from "@colyseus/schema";

// -- Primitive vector types (shared by several schemas) ----------------------

export class Vec3 extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}
defineTypes(Vec3, { x: "float32", y: "float32", z: "float32" });

export class Quat extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;
  declare w: number;
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
  }
}
defineTypes(Quat, { x: "float32", y: "float32", z: "float32", w: "float32" });

// -- PlayerState -------------------------------------------------------------
// Schema/snapshot boundary — read this before adding fields.
//
// SCHEMA (Colyseus incremental replication, sent to ALL clients on every change):
//   Identity fields stable for the lifetime of a player slot.
//   Gameplay counters that drive HUD and scoreboard UI.
//   Keep this set small. Every field added here costs bandwidth on each mutation.
//
// SNAPSHOT (broadcast at snapshotRateHz for client-side prediction/reconciliation):
//   Physics: pos, vel, rot, movementState, grind state, etc.
//   Per-tick derived values: isOnFriendlySlime, isShooting.
//   Anything needed for client prediction must go in SnapshotMessage → PlayerSnapshot,
//   not here. See packages/protocol/network/serverMessages.ts.
//
// Intentional denormalization (fields in both):
//   health, slimeLevel, respawnTimer — schema keeps HUD current between snapshots;
//   snapshot carries the authoritative value for mid-prediction accuracy.

export class PlayerState extends Schema {
  // Identity
  declare sessionId: string;
  declare isBot: boolean;
  declare name: string;
  /** Team assignment for team-based modes. NO_TEAM_ID means unteamed (FFA). */
  declare teamId: number;
  /** Slime/scoring ownership group. Shared by teammates, unique per player in FFA. */
  declare slimeGroupId: number;
  /** Visual palette slot used to derive slimeColor for the current mode. */
  declare paletteIndex: number;
  /** Pattern overlay applied to the slime mesh (see PATTERN_COUNT in gameModes.ts). */
  declare patternId: number;
  /** 0xRRGGBB packed integer — the player's slime colour */
  declare slimeColor: number;

  // Gameplay
  declare health: number;
  declare slimeLevel: number;
  /** Cumulative surface units covered in slime by this player this match */
  declare slimeScore: number;
  declare killCount: number;
  declare deathCount: number;
  /** Seconds remaining until respawn (0 when alive) */
  declare respawnTimer: number;
}
defineTypes(PlayerState, {
  sessionId: "string",
  isBot: "boolean",
  name: "string",
  teamId: "uint8",
  slimeGroupId: "uint16",
  paletteIndex: "uint8",
  patternId: "uint8",
  slimeColor: "uint32",
  health: "uint8",
  slimeLevel: "float32",
  slimeScore: "uint32",
  killCount: "uint16",
  deathCount: "uint16",
  respawnTimer: "float32",
});

// Keep MapSchema in scope so downstream importers can re-export if needed
// without triggering the verbatimModuleSyntax type-import warning.
export type { MapSchema };

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
// Identity and gameplay counters only — physics is NOT replicated here.
// Physics travels exclusively via SnapshotMessage for client reconciliation.

export class PlayerState extends Schema {
  // Identity
  declare sessionId: string;
  declare name: string;
  /** Team assignment for team-based modes. NO_TEAM_ID means unteamed (FFA). */
  declare teamId: number;
  /** Paint/scoring ownership group. Shared by teammates, unique per player in FFA. */
  declare paintGroupId: number;
  /** Visual palette slot used to derive slimeColor for the current mode. */
  declare paletteIndex: number;
  /** 0xRRGGBB packed integer — the player's slime colour */
  declare slimeColor: number;

  // Gameplay
  declare health: number;
  declare slimeLevel: number;
  /** Cumulative surface units painted by this player this match */
  declare paintScore: number;
  declare killCount: number;
  declare deathCount: number;
  /** Seconds remaining until respawn (0 when alive) */
  declare respawnTimer: number;
}
defineTypes(PlayerState, {
  sessionId: "string",
  name: "string",
  teamId: "uint8",
  paintGroupId: "uint16",
  paletteIndex: "uint8",
  slimeColor: "uint32",
  health: "uint8",
  slimeLevel: "float32",
  paintScore: "uint32",
  killCount: "uint16",
  deathCount: "uint16",
  respawnTimer: "float32",
});

// Keep MapSchema in scope so downstream importers can re-export if needed
// without triggering the verbatimModuleSyntax type-import warning.
export type { MapSchema };

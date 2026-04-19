/**
 * Shapes of messages sent from the client to the server.
 * Serialised as plain JSON via room.send(MessageType.X, payload).
 */

// -- Shared plain-object vector types ----------------------------------------
// These are NOT Colyseus schemas — they travel as JSON inside messages.
// The Colyseus Vec3/Quat schema classes mirror this shape for the state tree.

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuatData {
  x: number;
  y: number;
  z: number;
  w: number;
}

// -- Input key bitmask -------------------------------------------------------

/**
 * Bitmask flags for the keys field of InputMessage.
 * Combine with bitwise OR: `keys = InputKey.Forward | InputKey.Fire`
 * Test with bitwise AND: `if (keys & InputKey.Jump) { ... }`
 */
export const InputKey = {
  Forward: 1 << 0, // W
  Backward: 1 << 1, // S
  Left: 1 << 2, // A
  Right: 1 << 3, // D
  Jump: 1 << 4,
  Fire: 1 << 5,
  Submerge: 1 << 6, // E action toggle
} as const;

export type InputKeys = number; // bitmask — see InputKey flags above

// -- Message payloads --------------------------------------------------------

/**
 * Sent every input tick (NETWORK_CONFIG.input.sendRateHz).
 * The server processes these in order and advances the simulation.
 * The client keeps a ring buffer keyed by seq for reconciliation.
 */
export interface InputMessage {
  /** Monotonically increasing per-client counter — never reused or skipped */
  seq: number;
  /** Packed bitmask of keys held this tick */
  keys: InputKeys;
  /**
   * Normalised aim direction in world space.
   * Fallback used by the server when spawning a projectile on Fire.
   */
  aimDir: Vec3Data;
  /**
   * Optional world-space point selected by the camera crosshair.
   * The authoritative server fires from its own muzzle position toward this point.
   */
  aimPoint?: Vec3Data;
  /**
   * Delta-time for this tick in seconds.
   * Lets the server run the same integrator step the client predicted.
   * Clamped server-side to [0, 1/tickRateHz * 2] to prevent abuse.
   */
  dt: number;
}

/** Sent when the player wants to change their display name */
export interface RenameMessage {
  name: string;
}

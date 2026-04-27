import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { PlayerMovementState, PlayerSurfState } from "../match/simState.ts";
import { type ComputedRail, findClosestRailPoint, sampleRailAt } from "./railSpline.ts";
import type { PlayerPhysics, StepConfig } from "./simulatedMovement.ts";

// -- Vec3 helpers ------------------------------------------------------------

function add(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: { x: number; y: number; z: number }, s: number) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function vlen(a: { x: number; y: number; z: number }) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function normalize(a: { x: number; y: number; z: number }) {
  const l = vlen(a);
  return l < 1e-8 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / l);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function assign(t: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }) {
  t.x = s.x;
  t.y = s.y;
  t.z = s.z;
}
function assignQuat(
  t: { x: number; y: number; z: number; w: number },
  s: { x: number; y: number; z: number; w: number },
) {
  t.x = s.x;
  t.y = s.y;
  t.z = s.z;
  t.w = s.w;
}

function quatFromAxes(
  right: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
): { x: number; y: number; z: number; w: number } {
  const { x: m00, y: m10, z: m20 } = right;
  const { x: m01, y: m11, z: m21 } = up;
  const { x: m02, y: m12, z: m22 } = forward;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
}

// -- Internal helpers --------------------------------------------------------

interface GrindSnap {
  railIndex: number;
  arcLength: number;
  speed: number; // signed: positive = forward along rail, negative = reverse
}

function applyGrindSnap(
  state: PlayerPhysics,
  snap: GrindSnap,
  rails: ComputedRail[],
  cfg: StepConfig,
): void {
  const rail = rails[snap.railIndex]!;
  const { pos, tangent } = sampleRailAt(rail, snap.arcLength);

  const up = normalize(sub(pos, rail.planetCenter));
  const offset = cfg.rail.visualRadius + cfg.movement.standingHeight;
  assign(state.pos, add(pos, scale(up, offset)));

  assign(state.vel, scale(tangent, snap.speed));
  state.grindRailId = snap.railIndex;
  state.grindT = snap.arcLength;
  state.lastGrindT = snap.arcLength;
  state.grindSpeed = snap.speed;
  state.movementState = PlayerMovementState.Grinding;
  state.planetId = "";
  state.surfState = PlayerSurfState.SkiVisible;
}

function exitGrind(
  state: PlayerPhysics,
  exitVel: { x: number; y: number; z: number },
  cooldownMs = 0,
): void {
  state.grindRailId = -1;
  state.grindT = 0;
  state.grindSpeed = 0;
  state.grindCooldownMs = cooldownMs;
  state.skiJumpCharge = 0;
  state.isCarving = false;
  state.movementState = PlayerMovementState.Airborne;
  state.planetId = "";
  assign(state.vel, exitVel);
}

// -- Public API --------------------------------------------------------------

/**
 * Check whether an airborne player is close enough and fast enough to snap
 * onto a rail. Returns snap data if a candidate is found, null otherwise.
 * Only call while the player is Airborne.
 */
export function tryEnterGrind(
  state: PlayerPhysics,
  rails: ComputedRail[],
  cfg: StepConfig,
): boolean {
  const speed = vlen(state.vel);
  if (speed < cfg.rail.minEntrySpeed) return false;

  let bestDist = cfg.rail.snapDistance;
  let bestSnap: GrindSnap | null = null;

  for (let i = 0; i < rails.length; i++) {
    const { arcLength, dist } = findClosestRailPoint(rails[i]!, state.pos);
    if (dist < bestDist) {
      const { tangent } = sampleRailAt(rails[i]!, arcLength);
      const projected = dot(state.vel, tangent);

      // Don't snap if we are at the very start/end of the rail and moving away from it.
      // This prevents getting "stuck" in a snap-loop when naturally exiting a rail.
      if (arcLength <= 0.1 && projected < 0) continue;
      if (arcLength >= rails[i]!.totalLength - 0.1 && projected > 0) continue;

      bestDist = dist;
      // Use projected speed; fall back to full speed if approaching nearly perpendicularly.
      const grindSpeed = Math.abs(projected) > 1 ? projected : speed;
      bestSnap = { railIndex: i, arcLength, speed: grindSpeed };
    }
  }

  if (bestSnap === null) return false;
  applyGrindSnap(state, bestSnap, rails, cfg);
  return true;
}

/**
 * Advance one tick of grinding physics. Mutates state in place.
 * Returns true if the player is still grinding after this tick.
 */
export function stepGrinding(
  state: PlayerPhysics,
  input: InputMessage,
  rails: ComputedRail[],
  dt: number,
  cfg: StepConfig,
): void {
  const rail = rails[state.grindRailId];
  if (!rail) {
    exitGrind(state, state.vel);
    return;
  }

  state.lastGrindT = state.grindT;

  const { pos, tangent } = sampleRailAt(rail, state.grindT);

  // Carve-charge: hold Anchor to build jump charge, release to launch.
  const anchorHeld = (input.keys & InputKey.Anchor) !== 0;
  if (anchorHeld) {
    state.skiJumpCharge = Math.min(1, state.skiJumpCharge + dt * 1.25);
    state.isCarving = true;
  } else if (state.skiJumpCharge > 0) {
    const baseSpeed = cfg.movement.moveSpeed * cfg.movement.waterSkiSpeedMultiplier;
    const speedRatio = Math.min(Math.abs(state.grindSpeed) / baseSpeed, 2.0);
    const impulse = cfg.movement.jumpImpulse * Math.max(speedRatio, 0.5);
    const up = normalize(sub(pos, rail.planetCenter));
    exitGrind(state, add(scale(tangent, state.grindSpeed), scale(up, impulse)), 600);
    return;
  } else {
    state.isCarving = false;
  }

  // Advance along rail. No uphill deceleration — rail is frictionless.
  state.grindT += state.grindSpeed * dt;

  // End of rail: exit and carry tangent velocity.
  if (state.grindT >= rail.totalLength || state.grindT < 0) {
    const clampedT = clamp(state.grindT, 0, rail.totalLength);
    const { pos: exitPos, tangent: exitTangent } = sampleRailAt(rail, clampedT);
    assign(state.pos, exitPos);
    exitGrind(state, scale(exitTangent, state.grindSpeed), 400);
    return;
  }

  // Snap player to rail position with offset.
  const { pos: newPos, tangent: newTangent } = sampleRailAt(rail, state.grindT);
  const up = normalize(sub(newPos, rail.planetCenter));
  const offset = cfg.rail.visualRadius + cfg.movement.standingHeight;
  assign(state.pos, add(newPos, scale(up, offset)));
  assign(state.vel, scale(newTangent, state.grindSpeed));

  // Rotation: forward along travel direction, up away from planet center.
  const forward = state.grindSpeed >= 0 ? newTangent : scale(newTangent, -1);
  const right = normalize(cross(forward, up));
  const trueUp = normalize(cross(right, forward));
  assignQuat(state.rot, quatFromAxes(right, trueUp, forward));

  state.movementState = PlayerMovementState.Grinding;
}

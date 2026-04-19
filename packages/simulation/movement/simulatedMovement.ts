import {
  InputKey,
  type Vec3Data,
  type QuatData,
  type InputMessage,
} from "@splat/protocol/network/clientMessages.ts";
import {
  PlayerMovementState,
  PlayerSwimState,
  type SimPlanetPaintState,
} from "../match/simState.ts";
import { getPaintAtPoint } from "../paint/paintDetection.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

// -- Public interfaces -------------------------------------------------------

export interface PlanetData {
  id: string;
  center: Vec3Data;
  radius: number;
}

/** Subset of SimPlayerState that the movement step reads and mutates. */
export interface PlayerPhysics {
  pos: Vec3Data;
  vel: Vec3Data;
  rot: QuatData;
  planetId: string;
  paintGroupId: number;
  movementState: number;
  swimState: number;
}

/**
 * Config slice accepted by stepPlayer.
 * GAME_CONFIG structurally satisfies this, as does any custom test config.
 */
export interface StepConfig {
  planet: {
    radius: number;
    gravityAcceleration: number;
    surfaceSnapDistance: number;
    arenaReturnDistance: number;
    arenaReturnAcceleration: number;
  };
  player: {
    moveSpeed: number;
    jumpImpulse: number;
    collisionRadius: number;
    standingHeight: number;
  };
  paint: {
    friendlySpeedMultiplier: number;
    enemySpeedMultiplier: number;
    swimSpeedMultiplier: number;
    swimDisturbanceMinSpeed: number;
  };
  terrain: {
    seed: number;
    baseAmplitude: number;
    frequency: number;
    octaves: number;
    lacunarity: number;
    persistence: number;
    waterLevel: number;
    snowLevel: number;
    sandBand: number;
    rockLevel: number;
  };
}

// -- Vec3 helpers (return new objects, never mutate inputs) ------------------

function add(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: Vec3Data, s: number): Vec3Data {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a: Vec3Data, b: Vec3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3Data, b: Vec3Data): Vec3Data {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function vlen(a: Vec3Data): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function normalize(a: Vec3Data): Vec3Data {
  const l = vlen(a);
  return l < 1e-8 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / l);
}

// Mutate target in place — required so Colyseus tracks field-level changes
// when PlayerPhysics is backed by a schema object on the server.
function assign(t: Vec3Data, s: Vec3Data): void {
  t.x = s.x;
  t.y = s.y;
  t.z = s.z;
}
function assignQuat(t: QuatData, s: QuatData): void {
  t.x = s.x;
  t.y = s.y;
  t.z = s.z;
  t.w = s.w;
}

// -- Quaternion from orthonormal frame (right, up, forward) ------------------

function quatFromAxes(right: Vec3Data, up: Vec3Data, forward: Vec3Data): QuatData {
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

// -- Quaternion helpers (return new objects, never mutate inputs) ------------

function applyQuat(v: Vec3Data, q: QuatData): Vec3Data {
  const { x, y, z } = v;
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function quatMultiply(a: QuatData, b: QuatData): QuatData {
  return {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatFromUnitVectors(from: Vec3Data, to: Vec3Data): QuatData {
  const r = dot(from, to) + 1;
  if (r < 1e-6) {
    if (Math.abs(from.x) > Math.abs(from.z)) {
      return normalizeQuat({ x: -from.y, y: from.x, z: 0, w: 0 });
    }
    return normalizeQuat({ x: 0, y: -from.z, z: from.y, w: 0 });
  }
  const c = cross(from, to);
  return normalizeQuat({ x: c.x, y: c.y, z: c.z, w: r });
}

function normalizeQuat(q: QuatData): QuatData {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (l < 1e-8) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

function updateFacingFromAim(state: PlayerPhysics, up: Vec3Data, aimDir: Vec3Data): void {
  const aimTangent = sub(aimDir, scale(up, dot(aimDir, up)));
  const aimLen = vlen(aimTangent);
  if (aimLen <= 1e-4) return;

  const forward = scale(aimTangent, 1 / aimLen);
  const right = normalize(cross(up, forward));
  assignQuat(state.rot, quatFromAxes(right, up, forward));
}

// -- Surface movement --------------------------------------------------------

function stepOnSurface(
  state: PlayerPhysics,
  input: InputMessage,
  dt: number,
  planets: PlanetData[],
  cfg: StepConfig,
  planetPaint: Map<string, SimPlanetPaintState>,
): void {
  const planet = planets.find((p) => p.id === state.planetId);
  if (!planet) {
    state.planetId = "";
    state.movementState = PlayerMovementState.Airborne;
    return;
  }

  const oldNormal = normalize(sub(state.pos, planet.center));
  const paint = getPaintAtPoint(state.pos, state.planetId, planetPaint);
  const onFriendlyPaint = paint?.paintGroupId === state.paintGroupId;
  const onEnemyPaint = paint !== null && !onFriendlyPaint;
  const toggleSubmerge = (input.keys & InputKey.Submerge) !== 0;
  const firePressed = (input.keys & InputKey.Fire) !== 0;
  let swimActive = state.swimState !== PlayerSwimState.None;

  if (!onFriendlyPaint || onEnemyPaint || firePressed) {
    swimActive = false;
  } else if (toggleSubmerge) {
    swimActive = !swimActive;
  }

  const aimTangent = sub(input.aimDir, scale(oldNormal, dot(input.aimDir, oldNormal)));
  const aimLen = vlen(aimTangent);
  const forward =
    aimLen > 1e-4 ? scale(aimTangent, 1 / aimLen) : applyQuat({ x: 0, y: 0, z: 1 }, state.rot);
  const right = normalize(cross(forward, oldNormal));

  const moveX = (input.keys & InputKey.Right ? 1 : 0) + (input.keys & InputKey.Left ? -1 : 0);
  const moveZ = (input.keys & InputKey.Forward ? 1 : 0) + (input.keys & InputKey.Backward ? -1 : 0);

  if (moveX !== 0 || moveZ !== 0) {
    const moveDir = normalize(add(scale(right, moveX), scale(forward, moveZ)));
    let speedMultiplier = 1.0;
    if (onEnemyPaint) {
      speedMultiplier = cfg.paint.enemySpeedMultiplier;
    } else if (swimActive) {
      speedMultiplier = cfg.paint.swimSpeedMultiplier;
    } else if (onFriendlyPaint) {
      speedMultiplier = cfg.paint.friendlySpeedMultiplier;
    }
    assign(state.vel, scale(moveDir, cfg.player.moveSpeed * speedMultiplier));
    state.movementState = PlayerMovementState.Moving;
  } else {
    assign(state.vel, scale(state.vel, Math.max(0, 1 - dt * 10)));
    state.movementState = PlayerMovementState.Idle;
  }

  const speed = vlen(state.vel);
  if (swimActive) {
    state.swimState =
      speed >= cfg.paint.swimDisturbanceMinSpeed
        ? PlayerSwimState.SwimmingMoving
        : PlayerSwimState.SwimmingHidden;
  } else {
    state.swimState = PlayerSwimState.None;
  }

  const nextPos = add(state.pos, scale(state.vel, dt));
  const newNormal = normalize(sub(nextPos, planet.center));
  const transportQuat = quatFromUnitVectors(oldNormal, newNormal);
  assign(state.vel, applyQuat(state.vel, transportQuat));
  assignQuat(state.rot, normalizeQuat(quatMultiply(transportQuat, state.rot)));

  const surfaceRadius = getTerrainRadius(newNormal.x, newNormal.y, newNormal.z, cfg);
  assign(
    state.pos,
    add(planet.center, scale(newNormal, surfaceRadius + cfg.player.standingHeight)),
  );

  if (aimLen > 1e-4) {
    const targetForward = scale(aimTangent, 1 / aimLen);
    const targetRight = normalize(cross(newNormal, targetForward));
    assignQuat(state.rot, quatFromAxes(targetRight, newNormal, targetForward));
  }

  if ((input.keys & InputKey.Jump) !== 0) {
    state.swimState = PlayerSwimState.None;
    const surfaceNormal = normalize(sub(state.pos, planet.center));
    assign(state.vel, add(state.vel, scale(surfaceNormal, cfg.player.jumpImpulse)));
    state.planetId = "";
    state.movementState = PlayerMovementState.Airborne;
  }
}

// -- Airborne movement -------------------------------------------------------

function stepAirborne(
  state: PlayerPhysics,
  input: InputMessage,
  dt: number,
  planets: PlanetData[],
  cfg: StepConfig,
): void {
  state.swimState = PlayerSwimState.None;
  let nearest: PlanetData | null = null;
  let nearestDist = Infinity;
  for (const planet of planets) {
    const d = vlen(sub(state.pos, planet.center));
    if (d < nearestDist) {
      nearestDist = d;
      nearest = planet;
    }
  }

  if (nearest !== null) {
    const toPlanet = sub(nearest.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist > 0.01) {
      const gravDir = scale(toPlanet, 1 / dist);
      assign(state.vel, add(state.vel, scale(gravDir, cfg.planet.gravityAcceleration * dt)));
      if (dist > cfg.planet.arenaReturnDistance) {
        assign(state.vel, add(state.vel, scale(gravDir, cfg.planet.arenaReturnAcceleration * dt)));
      }
    }
  }

  // Integrate first, then test for landing at the new position.
  assign(state.pos, add(state.pos, scale(state.vel, dt)));

  if (nearest !== null) {
    const up = normalize(sub(state.pos, nearest.center));
    updateFacingFromAim(state, up, input.aimDir);
  }

  if (nearest !== null) {
    const toPlanet = sub(nearest.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist < 0.01) return; // degenerate: inside planet centre
    const gravDir = scale(toPlanet, 1 / dist);
    const upDir = scale(gravDir, -1);
    const landingRadius = getTerrainRadius(upDir.x, upDir.y, upDir.z, cfg);
    if (dist <= landingRadius + cfg.player.standingHeight + cfg.planet.surfaceSnapDistance) {
      // Only land when moving toward the planet — prevents re-landing immediately after a jump.
      const velToward = dot(state.vel, gravDir);
      if (velToward > 0) {
        assign(
          state.pos,
          add(nearest.center, scale(upDir, landingRadius + cfg.player.standingHeight)),
        );
        assign(state.vel, sub(state.vel, scale(gravDir, velToward)));
        state.planetId = nearest.id;
        state.movementState = PlayerMovementState.Idle;
      }
    }
  }
}

// -- Public entry point ------------------------------------------------------

/**
 * Advance one player's physics by dt seconds.
 * Mutates state in place.
 * Call with the same cfg on both server and client for deterministic prediction.
 */
export function stepPlayer(
  state: PlayerPhysics,
  input: InputMessage,
  dt: number,
  planets: PlanetData[],
  cfg: StepConfig,
  planetPaint: Map<string, SimPlanetPaintState>,
): void {
  if (state.movementState === PlayerMovementState.Dead) {
    state.swimState = PlayerSwimState.None;
    return;
  }
  if (state.planetId !== "") {
    stepOnSurface(state, input, dt, planets, cfg, planetPaint);
  } else {
    stepAirborne(state, input, dt, planets, cfg);
  }
}

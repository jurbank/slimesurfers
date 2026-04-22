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
import { getTerrainHeight, getTerrainRadius } from "../terrain/planetTerrain.ts";

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
  isCarving: boolean;
}

/**
 * Config slice accepted by stepPlayer.
 * GAME_CONFIG structurally satisfies this, as does any custom test config.
 */
export interface StepConfig {
  planet: {
    radius: number;
  };
  movement: {
    gravityAcceleration: number;
    surfaceSnapDistance: number;
    arenaReturnDistance: number;
    arenaReturnAcceleration: number;
    moveSpeed: number;
    jumpImpulse: number;
    boostAcceleration: number;
    airBoostAcceleration: number;
    anchorGravityMultiplier: number;
    collisionRadius: number;
    standingHeight: number;
    enemySpeedMultiplier: number;
    swimSpeedMultiplier: number;
    swimDisturbanceMinSpeed: number;
    waterSkiSpeedMultiplier: number;
    waterSkiFriction: number;
    waterSkiLateralDrag: number;
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
function projectOntoPlane(a: Vec3Data, normal: Vec3Data): Vec3Data {
  return sub(a, scale(normal, dot(a, normal)));
}
function clampLength(a: Vec3Data, maxLength: number): Vec3Data {
  const l = vlen(a);
  return l > maxLength && l > 1e-8 ? scale(a, maxLength / l) : a;
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

interface TerrainContact {
  radialNormal: Vec3Data;
  surfaceNormal: Vec3Data;
  centerPos: Vec3Data;
  centerRadius: number;
}

function getSurfaceCenter(planet: PlanetData, radialNormal: Vec3Data, cfg: StepConfig): Vec3Data {
  const radius =
    getTerrainRadius(radialNormal.x, radialNormal.y, radialNormal.z, cfg) +
    cfg.movement.standingHeight;
  return add(planet.center, scale(radialNormal, radius));
}

function getTerrainContact(
  planet: PlanetData,
  radialNormal: Vec3Data,
  cfg: StepConfig,
): TerrainContact {
  const n = normalize(radialNormal);
  const tangentSeed = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentA = normalize(cross(tangentSeed, n));
  const tangentB = normalize(cross(n, tangentA));
  const sampleAngle = 0.006;
  const centerRadius = getTerrainRadius(n.x, n.y, n.z, cfg) + cfg.movement.standingHeight;
  const centerPos = add(planet.center, scale(n, centerRadius));
  const sampleA = normalize(add(n, scale(tangentA, sampleAngle)));
  const sampleB = normalize(add(n, scale(tangentB, sampleAngle)));
  const posA = getSurfaceCenter(planet, sampleA, cfg);
  const posB = getSurfaceCenter(planet, sampleB, cfg);
  let surfaceNormal = normalize(cross(sub(posA, centerPos), sub(posB, centerPos)));
  if (dot(surfaceNormal, n) < 0) {
    surfaceNormal = scale(surfaceNormal, -1);
  }
  return { radialNormal: n, surfaceNormal, centerPos, centerRadius };
}

function getWaterContact(
  planet: PlanetData,
  radialNormal: Vec3Data,
  cfg: StepConfig,
): TerrainContact {
  const n = normalize(radialNormal);
  const waterRadius = cfg.planet.radius + cfg.terrain.waterLevel + cfg.movement.standingHeight;
  const centerPos = add(planet.center, scale(n, waterRadius));
  return { radialNormal: n, surfaceNormal: n, centerPos, centerRadius: waterRadius };
}

function getNearestPlanet(pos: Vec3Data, planets: PlanetData[]): PlanetData | null {
  let nearest: PlanetData | null = null;
  let nearestDist = Infinity;
  for (const planet of planets) {
    const d = vlen(sub(pos, planet.center));
    if (d < nearestDist) {
      nearestDist = d;
      nearest = planet;
    }
  }
  return nearest;
}

function getTangentBasis(
  state: PlayerPhysics,
  up: Vec3Data,
  aimDir: Vec3Data,
): { forward: Vec3Data; right: Vec3Data; aimTangent: Vec3Data; aimLen: number } {
  const aimTangent = projectOntoPlane(aimDir, up);
  const aimLen = vlen(aimTangent);
  const fallbackForward = projectOntoPlane(applyQuat({ x: 0, y: 0, z: 1 }, state.rot), up);
  const forward =
    aimLen > 1e-4
      ? scale(aimTangent, 1 / aimLen)
      : vlen(fallbackForward) > 1e-4
        ? normalize(fallbackForward)
        : { x: 0, y: 0, z: 1 };
  return {
    forward,
    right: normalize(cross(forward, up)),
    aimTangent,
    aimLen,
  };
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
  const onNeutralSurface = paint === null;
  const terrainHeight = getTerrainHeight(oldNormal.x, oldNormal.y, oldNormal.z, cfg);
  const terrainBelowWater = terrainHeight < cfg.terrain.waterLevel;
  // Player is above water if their position hasn't yet dropped below the water sphere.
  const waterSurfaceRadius =
    cfg.planet.radius + cfg.terrain.waterLevel + cfg.movement.standingHeight;
  const playerAboveWater =
    vlen(sub(state.pos, planet.center)) >= waterSurfaceRadius - cfg.movement.surfaceSnapDistance;
  // Terrain below water triggers water skiing when the player is still at the surface,
  // or when they're already water skiing (to prevent submerged paint pulling them down).
  const onWater =
    terrainBelowWater && (playerAboveWater || state.swimState === PlayerSwimState.SkiWater);
  const toggleSubmerge = (input.keys & InputKey.Submerge) !== 0;
  const anchorPressed = (input.keys & InputKey.Anchor) !== 0;
  const wasSkiActive = state.swimState !== PlayerSwimState.None;
  let skiActive = wasSkiActive;

  if (onWater) {
    // Don't water ski if the player is already submerged and on paint — they intentionally went under.
    const wasSubmerged =
      !playerAboveWater &&
      (state.swimState === PlayerSwimState.SwimmingMoving ||
        state.swimState === PlayerSwimState.SwimmingHidden);
    skiActive = wasSkiActive && !wasSubmerged && !toggleSubmerge;
  } else if (toggleSubmerge) {
    skiActive = !skiActive;
  }

  const oldContact =
    onWater && skiActive
      ? getWaterContact(planet, oldNormal, cfg)
      : getTerrainContact(planet, oldNormal, cfg);

  const { forward, right, aimTangent, aimLen } = getTangentBasis(
    state,
    oldContact.surfaceNormal,
    input.aimDir,
  );

  const moveX = (input.keys & InputKey.Right ? 1 : 0) + (input.keys & InputKey.Left ? -1 : 0);
  const moveZ = (input.keys & InputKey.Forward ? 1 : 0) + (input.keys & InputKey.Backward ? -1 : 0);

  const hasMoveInput = moveX !== 0 || moveZ !== 0;
  const boostPressed = skiActive && anchorPressed && moveZ > 0;
  const tangentVel = projectOntoPlane(state.vel, oldContact.surfaceNormal);
  let speedMultiplier = 1.0;
  if (onWater && skiActive) {
    speedMultiplier = cfg.movement.waterSkiSpeedMultiplier;
  } else if (skiActive) {
    speedMultiplier = cfg.movement.swimSpeedMultiplier;
  } else if (onEnemyPaint) {
    speedMultiplier = cfg.movement.enemySpeedMultiplier;
  }
  if (!skiActive && anchorPressed) {
    const moveDir = hasMoveInput
      ? normalize(add(scale(right, moveX), scale(forward, moveZ)))
      : { x: 0, y: 0, z: 0 };
    const jumpTangentVel = hasMoveInput
      ? scale(moveDir, cfg.movement.moveSpeed * speedMultiplier)
      : { x: 0, y: 0, z: 0 };
    assign(
      state.vel,
      add(jumpTangentVel, scale(oldContact.surfaceNormal, cfg.movement.jumpImpulse)),
    );
    state.planetId = "";
    state.swimState = PlayerSwimState.None;
    state.isCarving = false;
    state.movementState = PlayerMovementState.Airborne;
    assign(
      state.pos,
      add(state.pos, scale(oldContact.surfaceNormal, cfg.movement.surfaceSnapDistance)),
    );
    return;
  }
  let groundedDirectVel: Vec3Data | null = null;
  if (!skiActive) {
    const moveDir = hasMoveInput
      ? normalize(add(scale(right, moveX), scale(forward, moveZ)))
      : { x: 0, y: 0, z: 0 };
    groundedDirectVel = hasMoveInput
      ? scale(moveDir, cfg.movement.moveSpeed * speedMultiplier)
      : { x: 0, y: 0, z: 0 };
    assign(state.vel, groundedDirectVel);
    state.movementState =
      hasMoveInput && vlen(groundedDirectVel) > 1e-4
        ? PlayerMovementState.Moving
        : PlayerMovementState.Idle;
  } else if (onWater && skiActive) {
    // Lateral drag: preserve forward momentum, damp sideways drift for carving feel
    const fwdVel = dot(tangentVel, forward);
    const rtVel = dot(tangentVel, right);
    const lateralDecay = Math.max(0, 1 - cfg.movement.waterSkiLateralDrag * dt);
    const draggedTangentVel = add(scale(forward, fwdVel), scale(right, rtVel * lateralDecay));

    if (hasMoveInput || boostPressed) {
      const moveDir = hasMoveInput
        ? normalize(add(scale(right, moveX), scale(forward, moveZ)))
        : forward;
      const baseSpeed = cfg.movement.moveSpeed * speedMultiplier;
      const baseAcceleration = baseSpeed * 8;
      const currentSpeed = Math.max(0, dot(state.vel, moveDir));
      const accelerationStep = clampLength(
        sub(scale(moveDir, baseSpeed), draggedTangentVel),
        baseAcceleration * dt,
      );
      let nextTangentVel =
        currentSpeed >= baseSpeed ? draggedTangentVel : add(draggedTangentVel, accelerationStep);
      if (boostPressed) {
        nextTangentVel = add(
          nextTangentVel,
          scale(moveDir, cfg.movement.boostAcceleration * speedMultiplier * dt),
        );
      }
      assign(state.vel, add(sub(state.vel, tangentVel), nextTangentVel));
      state.movementState =
        vlen(nextTangentVel) > 1e-4 ? PlayerMovementState.Moving : PlayerMovementState.Idle;
    } else {
      // Glide: apply low friction and lateral drag
      const glidedTangentVel = sub(
        draggedTangentVel,
        scale(draggedTangentVel, Math.min(1, dt * cfg.movement.waterSkiFriction)),
      );
      assign(state.vel, add(sub(state.vel, tangentVel), glidedTangentVel));
      state.movementState =
        vlen(glidedTangentVel) > 1e-4 ? PlayerMovementState.Moving : PlayerMovementState.Idle;
    }
  } else if (onNeutralSurface && !onWater) {
    assign(state.vel, sub(state.vel, tangentVel));
    state.movementState = PlayerMovementState.Idle;
  } else if (hasMoveInput || boostPressed) {
    const moveDir = hasMoveInput
      ? normalize(add(scale(right, moveX), scale(forward, moveZ)))
      : forward;
    const baseSpeed = cfg.movement.moveSpeed * speedMultiplier;
    const baseAcceleration = baseSpeed * 10;
    const currentSpeed = Math.max(0, dot(state.vel, moveDir));
    const desiredTangentVel = hasMoveInput ? scale(moveDir, baseSpeed) : tangentVel;
    const accelerationStep = clampLength(sub(desiredTangentVel, tangentVel), baseAcceleration * dt);
    let nextTangentVel = hasMoveInput
      ? currentSpeed >= baseSpeed
        ? tangentVel
        : add(tangentVel, accelerationStep)
      : tangentVel;
    if (boostPressed) {
      nextTangentVel = add(
        nextTangentVel,
        scale(moveDir, cfg.movement.boostAcceleration * speedMultiplier * dt),
      );
    }
    assign(state.vel, add(sub(state.vel, tangentVel), nextTangentVel));
    const targetSpeed = vlen(nextTangentVel);
    state.movementState =
      targetSpeed > 1e-4 ? PlayerMovementState.Moving : PlayerMovementState.Idle;
  } else {
    const friction = onNeutralSurface ? 2.4 : 1.2;
    assign(state.vel, sub(state.vel, scale(tangentVel, Math.min(1, dt * friction))));
    state.movementState = PlayerMovementState.Idle;
  }

  if (skiActive) {
    state.isCarving = anchorPressed;
    if (onWater) {
      state.swimState = PlayerSwimState.SkiWater;
    } else if (onFriendlyPaint) {
      state.swimState = hasMoveInput
        ? PlayerSwimState.SwimmingMoving
        : PlayerSwimState.SwimmingHidden;
    } else {
      state.swimState = PlayerSwimState.SkiVisible;
    }
  } else {
    state.isCarving = false;
    state.swimState = PlayerSwimState.None;
  }

  const gravityDir = normalize(sub(planet.center, state.pos));
  const gravityMultiplier = anchorPressed ? cfg.movement.anchorGravityMultiplier : 1;
  assign(
    state.vel,
    add(state.vel, scale(gravityDir, cfg.movement.gravityAcceleration * gravityMultiplier * dt)),
  );

  const integrationVel = groundedDirectVel ?? state.vel;
  const nextPos = add(state.pos, scale(integrationVel, dt));
  const newRadialNormal = normalize(sub(nextPos, planet.center));
  const newContact =
    onWater && skiActive
      ? getWaterContact(planet, newRadialNormal, cfg)
      : getTerrainContact(planet, newRadialNormal, cfg);
  const penetration = dot(sub(newContact.centerPos, nextPos), newContact.surfaceNormal);
  const movingAwayFromSurface = dot(state.vel, newContact.surfaceNormal) > 0;

  if (!anchorPressed && penetration < -cfg.movement.surfaceSnapDistance && movingAwayFromSurface) {
    assign(state.pos, nextPos);
    state.planetId = "";
    state.movementState = PlayerMovementState.Airborne;
    const currentUp = applyQuat({ x: 0, y: 1, z: 0 }, state.rot);
    assignQuat(
      state.rot,
      normalizeQuat(quatMultiply(quatFromUnitVectors(currentUp, newRadialNormal), state.rot)),
    );
    return;
  }

  if (anchorPressed && penetration < 0) {
    assign(state.pos, newContact.centerPos);
  } else if (penetration > 0) {
    assign(state.pos, add(nextPos, scale(newContact.surfaceNormal, penetration)));
  } else {
    assign(state.pos, nextPos);
  }

  const intoGround = dot(state.vel, newContact.surfaceNormal);
  if (intoGround < 0) {
    assign(state.vel, sub(state.vel, scale(newContact.surfaceNormal, intoGround)));
  }
  if (groundedDirectVel !== null) {
    assign(state.vel, projectOntoPlane(groundedDirectVel, newContact.surfaceNormal));
  }

  const currentUp = applyQuat({ x: 0, y: 1, z: 0 }, state.rot);
  assignQuat(
    state.rot,
    normalizeQuat(
      quatMultiply(quatFromUnitVectors(currentUp, newContact.surfaceNormal), state.rot),
    ),
  );

  if (aimLen > 1e-4) {
    const targetForward = scale(aimTangent, 1 / aimLen);
    const targetRight = normalize(cross(newContact.surfaceNormal, targetForward));
    assignQuat(state.rot, quatFromAxes(targetRight, newContact.surfaceNormal, targetForward));
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
  const anchorPressed = (input.keys & InputKey.Anchor) !== 0;
  const toggleSubmerge = (input.keys & InputKey.Submerge) !== 0;
  if (toggleSubmerge && state.swimState === PlayerSwimState.None) {
    state.swimState = PlayerSwimState.SkiVisible;
  } else if (toggleSubmerge && state.swimState !== PlayerSwimState.None) {
    state.swimState = PlayerSwimState.None;
  }
  state.isCarving = state.swimState !== PlayerSwimState.None && anchorPressed;
  const nearest = getNearestPlanet(state.pos, planets);

  if (nearest !== null) {
    const toPlanet = sub(nearest.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist > 0.01) {
      const gravDir = scale(toPlanet, 1 / dist);
      const moveZ =
        (input.keys & InputKey.Forward ? 1 : 0) + (input.keys & InputKey.Backward ? -1 : 0);
      const gravityMultiplier = anchorPressed ? cfg.movement.anchorGravityMultiplier : 1;
      assign(
        state.vel,
        add(state.vel, scale(gravDir, cfg.movement.gravityAcceleration * gravityMultiplier * dt)),
      );
      if (anchorPressed && moveZ > 0) {
        const up = scale(gravDir, -1);
        const { forward } = getTangentBasis(state, up, input.aimDir);
        assign(state.vel, add(state.vel, scale(forward, cfg.movement.airBoostAcceleration * dt)));
      }
      if (dist > cfg.movement.arenaReturnDistance) {
        assign(
          state.vel,
          add(state.vel, scale(gravDir, cfg.movement.arenaReturnAcceleration * dt)),
        );
      }
    }
  }

  // Integrate first, then test for landing at the new position.
  assign(state.pos, add(state.pos, scale(state.vel, dt)));

  if (nearest !== null) {
    const up = normalize(sub(state.pos, nearest.center));
    const currentUp = applyQuat({ x: 0, y: 1, z: 0 }, state.rot);
    assignQuat(
      state.rot,
      normalizeQuat(quatMultiply(quatFromUnitVectors(currentUp, up), state.rot)),
    );
  }

  if (nearest !== null) {
    const toPlanet = sub(nearest.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist < 0.01) return; // degenerate: inside planet centre
    const gravDir = scale(toPlanet, 1 / dist);
    const upDir = scale(gravDir, -1);
    const rawLandingRadius = getTerrainRadius(upDir.x, upDir.y, upDir.z, cfg);
    const waterRadius = cfg.planet.radius + cfg.terrain.waterLevel;
    // Skiers land at the water surface, not the ocean floor — preserves ski state through the arc.
    const landingRadius =
      state.swimState !== PlayerSwimState.None && rawLandingRadius < waterRadius
        ? waterRadius
        : rawLandingRadius;
    if (dist <= landingRadius + cfg.movement.standingHeight + cfg.movement.surfaceSnapDistance) {
      // Only land when moving toward the planet — prevents re-landing immediately after a jump.
      const velToward = dot(state.vel, gravDir);
      if (velToward > 0) {
        assign(
          state.pos,
          add(nearest.center, scale(upDir, landingRadius + cfg.movement.standingHeight)),
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
    state.isCarving = false;
    return;
  }
  if (state.planetId !== "") {
    stepOnSurface(state, input, dt, planets, cfg, planetPaint);
  } else {
    stepAirborne(state, input, dt, planets, cfg);
  }
}

import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import type { RuntimeBlastPad } from "@splat/content/map/runtimeMapData.ts";
import {
  type Vec3Data,
  type QuatData,
  add,
  sub,
  scale,
  dot,
  cross,
  vlen,
  normalize,
  projectOntoPlane,
  clampLength,
  assign,
  assignQuat,
  quatFromAxes,
  applyQuat,
  quatMultiply,
  quatFromUnitVectors,
  normalizeQuat,
} from "../math/vec3.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimBlastPadState,
  type SimPlanetSlimeState,
} from "../match/simState.ts";
import { NO_SLIME_GROUP_ID } from "@splat/protocol/schemas/slimedState.ts";
import { getSlimeAtPoint } from "../slime/slimeDetection.ts";
import {
  getTerrainHeight,
  getTerrainRadius,
  type TerrainConfig,
  type TerrainSurfaceProvider,
} from "../terrain/planetTerrain.ts";
import { type ComputedRail } from "./railSpline.ts";
import { tryEnterGrind, stepGrinding } from "./simulatedRailGrinding.ts";

// -- Public interfaces -------------------------------------------------------

export interface PlanetData {
  id: string;
  center: Vec3Data;
  radius: number;
  gravityRadius?: number;
  captureRadius?: number;
}

/** Subset of SimPlayerState that the movement step reads and mutates. */
export interface PlayerPhysics {
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
  splatCooldownMs?: number;
  isOnFriendlySlime: boolean;
  /** Hysteresis hint for the gravity picker — see getDominantGravityPlanet.
   *  Tracks the planet whose gravity well the player is currently inside, so
   *  that overlapping gravity zones don't yank the player to whichever planet's
   *  zone they happen to be nominally closer to. Cleared by going out of every
   *  planet's capture radius (recomputed each airborne tick). */
  gravityAnchorPlanetId?: string;
  /** Phase E: blast-pad load state. Set to the pad's id while loaded, "" otherwise. */
  loadedPadId?: string;
  /** Phase E: 0..1 wind-up progress while loaded; launch input ignored until 1. */
  padLoadProgress?: number;
  /** Phase E: 0..1 charge ramp while Anchor is held during PadLoaded. */
  padChargeProgress?: number;
  /** Phase E: release-gate for the movement-key cancel. False until movement
   *  keys are released after loading; true once armed. See stepPadLoaded. */
  padCancelArmed?: boolean;
}

/**
 * Config slice accepted by stepPlayer.
 * GAME_CONFIG structurally satisfies this, as does any custom test config.
 */
export interface StepConfig extends TerrainConfig {
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
    friendlySlimeSpeedMultiplier: number;
    enemySpeedMultiplier: number;
    groundedDeceleration: number;
    surfSpeedMultiplier: number;
    surfAccelerationMultiplier: number;
    surfDisturbanceMinSpeed: number;
    waterSkiSpeedMultiplier: number;
    waterSkiAccelerationMultiplier: number;
    waterSkiFriction: number;
    waterSkiLateralDrag: number;
    freeFlightSteerAcceleration?: number;
    freeFlightThrustAcceleration?: number;
    freeFlightBrakeAcceleration?: number;
    freeFlightMaxSpeed?: number;
    freeFlightMinSpeed?: number;
    freeFlightLandingCaptureDistance?: number;
    freeFlightLoadDurationSeconds?: number;
    freeFlightChargeDurationSeconds?: number;
    freeFlightLaunchSpeedMin?: number;
  };
  rail: {
    snapDistance: number;
    minEntrySpeed: number;
    slimeCorridorRadius: number;
    slimeStampSpacing: number;
    maxGrindSpeed: number;
    carveAccelerationPerSecond: number;
    visualRadius: number;
  };
}

interface TerrainContact {
  radialNormal: Vec3Data;
  surfaceNormal: Vec3Data;
  centerPos: Vec3Data;
  centerRadius: number;
}

function getSurfaceCenter(
  planet: PlanetData,
  radialNormal: Vec3Data,
  cfg: StepConfig,
  terrainProvider?: TerrainSurfaceProvider,
): Vec3Data {
  const radius =
    (terrainProvider?.getRadius(radialNormal.x, radialNormal.y, radialNormal.z, cfg, planet.id) ??
      getTerrainRadius(radialNormal.x, radialNormal.y, radialNormal.z, cfg)) +
    cfg.movement.standingHeight;
  return add(planet.center, scale(radialNormal, radius));
}

function getTerrainContact(
  planet: PlanetData,
  radialNormal: Vec3Data,
  cfg: StepConfig,
  terrainProvider?: TerrainSurfaceProvider,
): TerrainContact {
  const n = normalize(radialNormal);
  const tangentSeed = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentA = normalize(cross(tangentSeed, n));
  const tangentB = normalize(cross(n, tangentA));
  const sampleAngle = 0.006;
  const centerRadius =
    (terrainProvider?.getRadius(n.x, n.y, n.z, cfg, planet.id) ??
      getTerrainRadius(n.x, n.y, n.z, cfg)) + cfg.movement.standingHeight;
  const centerPos = add(planet.center, scale(n, centerRadius));
  const sampleA = normalize(add(n, scale(tangentA, sampleAngle)));
  const sampleB = normalize(add(n, scale(tangentB, sampleAngle)));
  const posA = getSurfaceCenter(planet, sampleA, cfg, terrainProvider);
  const posB = getSurfaceCenter(planet, sampleB, cfg, terrainProvider);
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

function findPlanet(planets: PlanetData[], planetId: string): PlanetData | undefined {
  return planets.find((planet) => planet.id === planetId);
}

function getGravityRadius(planet: PlanetData): number {
  return planet.gravityRadius ?? planet.radius * 1.8;
}

function getCaptureRadius(planet: PlanetData): number {
  return planet.captureRadius ?? planet.radius * 2.4;
}

// Phase E: tries to load the player onto a charged blast pad whose footprint
// they're currently overlapping. Does NOT consume the pad's charge — that
// happens at launch time in stepPadLoaded. Returns true if the player was
// loaded this tick (caller should not run any other on-surface logic after).
//
// Also implements the "stickiness" rule that prevents re-loading after a
// cancel: state.loadedPadId is the pad you're currently sticking to (loaded
// OR cancelled-but-still-on-it). When the player walks off the footprint we
// clear it; the next fresh entry triggers a new load.
function tryEnterLoadedPad(
  state: PlayerPhysics,
  planets: PlanetData[],
  cfg: StepConfig,
  blastPads: readonly RuntimeBlastPad[],
  padStates: Map<string, SimBlastPadState>,
  terrainProvider?: TerrainSurfaceProvider,
): boolean {
  if (state.planetId === "") return false;
  if (
    state.movementState === PlayerMovementState.Dead ||
    state.movementState === PlayerMovementState.Grinding ||
    state.movementState === PlayerMovementState.PadLoaded
  ) {
    return false;
  }
  const sourcePlanet = findPlanet(planets, state.planetId);
  if (!sourcePlanet) return false;

  let footprintPadId = "";
  for (const pad of blastPads) {
    if (pad.planetId !== state.planetId) continue;

    const normal = normalize(pad.normal);
    const playerNormal = normalize(sub(state.pos, sourcePlanet.center));
    const footprintDot = Math.max(-1, Math.min(1, dot(playerNormal, normal)));
    const footprintDistance = Math.acos(footprintDot) * sourcePlanet.radius;
    if (footprintDistance > pad.radius + cfg.movement.collisionRadius) continue;

    footprintPadId = pad.id;

    // Pad must be charged AND owned by this player's slime group.
    const padState = padStates.get(pad.id);
    if (!padState) continue;
    if (
      padState.coverageProgress < 1 ||
      padState.ownerSlimeGroupId === NO_SLIME_GROUP_ID ||
      padState.ownerSlimeGroupId !== state.slimeGroupId
    ) {
      continue;
    }
    // Stickiness: if loadedPadId already names this pad, the player has been
    // here without leaving since the last cancel — don't re-load.
    if ((state.loadedPadId ?? "") === pad.id) continue;

    const padSurfaceRadius =
      (terrainProvider?.getRadius(normal.x, normal.y, normal.z, cfg, sourcePlanet.id) ??
        getTerrainRadius(normal.x, normal.y, normal.z, cfg)) + cfg.movement.standingHeight;
    const padCenter = add(sourcePlanet.center, scale(normal, padSurfaceRadius));

    assign(state.pos, padCenter);
    assign(state.vel, { x: 0, y: 0, z: 0 });
    state.loadedPadId = pad.id;
    state.padLoadProgress = 0;
    state.padChargeProgress = 0;
    // Cancel disarmed at entry — if the player walked onto the pad with W
    // (or any movement key) held, that hold must be released before it counts
    // as a cancel input.
    state.padCancelArmed = false;
    state.movementState = PlayerMovementState.PadLoaded;
    state.surfState =
      state.surfState === PlayerSurfState.None ? PlayerSurfState.SurfingVisible : state.surfState;
    state.isCarving = false;
    state.grindRailId = -1;
    return true;
  }

  // Walked off the pad: release the sticky id so the next entry can re-load.
  if (footprintPadId === "" && (state.loadedPadId ?? "") !== "") {
    state.loadedPadId = "";
  }
  return false;
}

// Prefer the planet whose gravity zone the player is inside (closest by normalized
// distance). With hysteresis: if the player is already anchored to a planet, stay
// anchored until they cross out of its (larger) capture radius. Without this, two
// gravity zones that overlap will keep swapping authority as the player drifts —
// the player gets yanked toward whichever neighbour is fractionally closer right
// now, and you can never blast clean off the surface.
function getDominantGravityPlanet(
  pos: Vec3Data,
  planets: PlanetData[],
  anchorPlanetId: string,
): PlanetData | null {
  if (anchorPlanetId !== "") {
    const anchor = planets.find((planet) => planet.id === anchorPlanetId);
    if (anchor) {
      const dist = vlen(sub(pos, anchor.center));
      if (dist <= getCaptureRadius(anchor)) return anchor;
    }
  }
  let best: PlanetData | null = null;
  let bestNormalizedDistance = Infinity;
  for (const planet of planets) {
    const dist = vlen(sub(pos, planet.center));
    const gravityRadius = getGravityRadius(planet);
    if (dist > gravityRadius) continue;
    const normalizedDistance = dist / gravityRadius;
    if (normalizedDistance < bestNormalizedDistance) {
      bestNormalizedDistance = normalizedDistance;
      best = planet;
    }
  }
  return best;
}

// Absolute nearest planet, always defined when any planet exists. Generic airborne
// movement (jumps, rail launches) is always bound to a planet so the player never
// drifts off into the force-free void — that void is reserved for FreeFlight,
// which runs through stepFreeFlight and never reaches stepAirborne.
function getNearestPlanet(pos: Vec3Data, planets: PlanetData[]): PlanetData | null {
  let nearest: PlanetData | null = null;
  let nearestDist = Infinity;
  for (const planet of planets) {
    const dist = vlen(sub(pos, planet.center));
    if (dist < nearestDist) {
      nearestDist = dist;
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
  planetSlime: Map<string, SimPlanetSlimeState>,
  terrainProvider?: TerrainSurfaceProvider,
): void {
  const planet = planets.find((p) => p.id === state.planetId);
  if (!planet) {
    state.planetId = "";
    state.movementState = PlayerMovementState.Airborne;
    return;
  }
  // Sticking to the surface implies the picker's anchor is this planet.
  state.gravityAnchorPlanetId = planet.id;

  const oldNormal = normalize(sub(state.pos, planet.center));
  const slime = getSlimeAtPoint(state.pos, state.planetId, planetSlime, planets);
  const onFriendlySlime = slime?.slimeGroupId === state.slimeGroupId;
  state.isOnFriendlySlime = onFriendlySlime;
  const onEnemySlime = slime !== null && !onFriendlySlime;
  const onNeutralSurface = slime === null;
  const terrainHeight =
    terrainProvider?.getHeight(oldNormal.x, oldNormal.y, oldNormal.z, cfg, state.planetId) ??
    getTerrainHeight(oldNormal.x, oldNormal.y, oldNormal.z, cfg);
  const terrainBelowWater = terrainHeight < cfg.terrain.waterLevel;
  // Keep all players on the water surface whenever terrain falls below sea level.
  // This preserves a clean separation between land concealment and any future
  // underwater traversal mode we may reintroduce later.
  const onWater = terrainBelowWater;
  const toggleSubmerge = (input.keys & InputKey.Submerge) !== 0;
  const anchorPressed = (input.keys & InputKey.Anchor) !== 0;
  const wasSkiActive = state.surfState !== PlayerSurfState.None;
  let skiActive = wasSkiActive;

  if (toggleSubmerge) {
    skiActive = !skiActive;
  }

  const oldContact =
    onWater && skiActive
      ? getWaterContact(planet, oldNormal, cfg)
      : getTerrainContact(planet, oldNormal, cfg, terrainProvider);

  const { forward, right, aimTangent, aimLen } = getTangentBasis(
    state,
    oldContact.surfaceNormal,
    input.aimDir,
  );

  const moveX = (input.keys & InputKey.Right ? 1 : 0) + (input.keys & InputKey.Left ? -1 : 0);
  const moveZ = (input.keys & InputKey.Forward ? 1 : 0) + (input.keys & InputKey.Backward ? -1 : 0);

  const hasMoveInput = moveX !== 0 || moveZ !== 0;
  const boostPressed = false;
  const wantsSkiJump = skiActive && !anchorPressed && state.skiJumpCharge > 0;
  const tangentVel = projectOntoPlane(state.vel, oldContact.surfaceNormal);
  let speedMultiplier = 1.0;
  if (onWater && skiActive) {
    speedMultiplier = cfg.movement.waterSkiSpeedMultiplier;
  } else if (skiActive && onFriendlySlime) {
    speedMultiplier = cfg.movement.surfSpeedMultiplier * cfg.movement.friendlySlimeSpeedMultiplier;
  } else if (skiActive) {
    speedMultiplier = cfg.movement.surfSpeedMultiplier;
  } else if (onEnemySlime) {
    speedMultiplier = cfg.movement.enemySpeedMultiplier;
  } else if (onFriendlySlime) {
    speedMultiplier = cfg.movement.friendlySlimeSpeedMultiplier;
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
      add(jumpTangentVel, scale(oldContact.radialNormal, cfg.movement.jumpImpulse)),
    );
    state.planetId = "";
    state.surfState = PlayerSurfState.None;
    state.isCarving = false;
    state.movementState = PlayerMovementState.Airborne;
    assign(
      state.pos,
      add(state.pos, scale(oldContact.surfaceNormal, cfg.movement.surfaceSnapDistance)),
    );
    return;
  }
  if (wantsSkiJump) {
    const speed = vlen(tangentVel);
    const baseSpeed = cfg.movement.moveSpeed * speedMultiplier;
    const speedRatio = Math.min(speed / baseSpeed, 2.0);
    const travelDir = speed > 1e-4 ? normalize(tangentVel) : forward;
    const slopeBonus = Math.max(0, -dot(oldContact.surfaceNormal, travelDir));
    const impulse = cfg.movement.jumpImpulse * (speedRatio + slopeBonus);
    assign(state.vel, add(tangentVel, scale(oldContact.radialNormal, impulse)));
    state.skiJumpCharge = 0;
    state.isCarving = false;
    state.planetId = "";
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
      // Slope factor: positive = downhill (adds speed), negative = uphill (subtracts)
      const gravDir = normalize(sub(planet.center, state.pos));
      const slopeAccel = -dot(gravDir, moveDir) * cfg.movement.gravityAcceleration;
      const carvingBoost = anchorPressed ? 1.25 : 1.0;
      const dynamicMaxSpeed = Math.max(
        baseSpeed * 0.5,
        baseSpeed * carvingBoost + Math.max(0, slopeAccel) * 0.6,
      );
      const baseAcceleration = baseSpeed * cfg.movement.waterSkiAccelerationMultiplier;
      const currentSpeed = Math.max(0, dot(state.vel, moveDir));
      const accelerationStep = clampLength(
        sub(scale(moveDir, dynamicMaxSpeed), draggedTangentVel),
        baseAcceleration * dt,
      );
      let nextTangentVel =
        currentSpeed >= dynamicMaxSpeed
          ? draggedTangentVel
          : add(draggedTangentVel, accelerationStep);
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
    const decayed = scale(tangentVel, Math.max(0, 1 - cfg.movement.groundedDeceleration * dt));
    assign(state.vel, add(sub(state.vel, tangentVel), decayed));
    state.movementState =
      vlen(decayed) > 1e-4 ? PlayerMovementState.Moving : PlayerMovementState.Idle;
  } else if (hasMoveInput || boostPressed) {
    const moveDir = hasMoveInput
      ? normalize(add(scale(right, moveX), scale(forward, moveZ)))
      : forward;
    const baseSpeed = cfg.movement.moveSpeed * speedMultiplier;
    // Slope factor: positive = downhill (adds speed), negative = uphill (subtracts)
    const gravDir = normalize(sub(planet.center, state.pos));
    const slopeAccel = -dot(gravDir, moveDir) * cfg.movement.gravityAcceleration;
    const carvingBoost = anchorPressed ? 1.25 : 1.0;
    const dynamicMaxSpeed = Math.max(
      baseSpeed * 0.5,
      baseSpeed * carvingBoost + Math.max(0, slopeAccel) * 0.6,
    );
    const baseAcceleration = baseSpeed * cfg.movement.surfAccelerationMultiplier;
    const currentSpeed = Math.max(0, dot(state.vel, moveDir));
    const desiredTangentVel = hasMoveInput ? scale(moveDir, dynamicMaxSpeed) : tangentVel;
    const accelerationStep = clampLength(sub(desiredTangentVel, tangentVel), baseAcceleration * dt);
    let nextTangentVel = hasMoveInput
      ? currentSpeed >= dynamicMaxSpeed
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
    if (anchorPressed) {
      state.skiJumpCharge = Math.min(1, state.skiJumpCharge + dt * 1.25);
      state.isCarving = true;
    } else {
      state.skiJumpCharge = 0;
      state.isCarving = false;
    }
    if (onWater) {
      state.surfState = PlayerSurfState.SurfingWater;
    } else if (onFriendlySlime) {
      state.surfState = hasMoveInput
        ? PlayerSurfState.SurfingMoving
        : PlayerSurfState.SurfingHidden;
    } else {
      state.surfState = PlayerSurfState.SurfingVisible;
    }
  } else {
    state.isCarving = false;
    state.surfState = PlayerSurfState.None;
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
      : getTerrainContact(planet, newRadialNormal, cfg, terrainProvider);
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
  terrainProvider?: TerrainSurfaceProvider,
  cfgForPlanet?: (planetId: string) => StepConfig | undefined,
): void {
  state.isOnFriendlySlime = false;
  state.grindCooldownMs = Math.max(0, state.grindCooldownMs - dt * 1000);
  const anchorPressed = (input.keys & InputKey.Anchor) !== 0;
  const toggleSubmerge = (input.keys & InputKey.Submerge) !== 0;
  state.skiJumpCharge = 0;
  if (toggleSubmerge && state.surfState === PlayerSurfState.None) {
    state.surfState = PlayerSurfState.SurfingVisible;
  } else if (toggleSubmerge && state.surfState !== PlayerSurfState.None) {
    state.surfState = PlayerSurfState.None;
  }
  state.isCarving = state.surfState !== PlayerSurfState.None && anchorPressed;
  const nearest =
    getDominantGravityPlanet(state.pos, planets, state.gravityAnchorPlanetId ?? "") ??
    getNearestPlanet(state.pos, planets);
  // Refresh the hysteresis anchor each tick so the picker stays sticky as the
  // dominant planet changes. While airborne the anchor follows the picker; when
  // surfaced it follows state.planetId (set by stepOnSurface / landing).
  state.gravityAnchorPlanetId = nearest?.id ?? "";

  if (nearest !== null) {
    const toPlanet = sub(nearest.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist > 0.01) {
      const gravDir = scale(toPlanet, 1 / dist);
      const gravityMultiplier = anchorPressed ? cfg.movement.anchorGravityMultiplier : 1;
      assign(
        state.vel,
        add(state.vel, scale(gravDir, cfg.movement.gravityAcceleration * gravityMultiplier * dt)),
      );
      if (anchorPressed) {
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
    const nearestCfg = cfgForPlanet?.(nearest.id) ?? cfg;
    const rawLandingRadius =
      terrainProvider?.getRadius(upDir.x, upDir.y, upDir.z, nearestCfg, nearest.id) ??
      getTerrainRadius(upDir.x, upDir.y, upDir.z, nearestCfg);
    const waterRadius = nearestCfg.planet.radius + nearestCfg.terrain.waterLevel;
    const landingRadius = Math.max(rawLandingRadius, waterRadius);
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
        state.gravityAnchorPlanetId = nearest.id;
        state.movementState = PlayerMovementState.Idle;
      }
    }
  }
}

// -- Free flight movement ----------------------------------------------------

function getFreeFlightSteerAcceleration(cfg: StepConfig): number {
  return cfg.movement.freeFlightSteerAcceleration ?? 30;
}
function getFreeFlightThrust(cfg: StepConfig): number {
  return cfg.movement.freeFlightThrustAcceleration ?? 28;
}
function getFreeFlightBrake(cfg: StepConfig): number {
  return cfg.movement.freeFlightBrakeAcceleration ?? 22;
}
function getFreeFlightMaxSpeed(cfg: StepConfig): number {
  return cfg.movement.freeFlightMaxSpeed ?? 110;
}
function getFreeFlightMinSpeed(cfg: StepConfig): number {
  return cfg.movement.freeFlightMinSpeed ?? 14;
}
function getFreeFlightLandingCaptureDistance(cfg: StepConfig): number {
  return cfg.movement.freeFlightLandingCaptureDistance ?? 6;
}
function getFreeFlightLoadDuration(cfg: StepConfig): number {
  return Math.max(1e-3, cfg.movement.freeFlightLoadDurationSeconds ?? 0.3);
}
function getFreeFlightChargeDuration(cfg: StepConfig): number {
  return Math.max(1e-3, cfg.movement.freeFlightChargeDurationSeconds ?? 0.6);
}
function getFreeFlightLaunchSpeedMin(cfg: StepConfig): number {
  return cfg.movement.freeFlightLaunchSpeedMin ?? 28;
}

/**
 * Ballistic, steerable space flight. Single dominant planet's gravity pulls,
 * the player's aim continuously biases the path (transverse force, not a
 * SLERP-to-aim), and Forward/Backward thrust modifies speed along the current
 * velocity. Landing fires when the player touches any planet's surface
 * envelope.
 *
 * Single-planet — multi-body gravity sums were dropped (see
 * DIRECTIONAL_TRAVERSAL_PLAN.md): once aim controls the launch direction, the
 * player has already committed their trajectory; world-bending fights intent
 * rather than serving it.
 */
function stepFreeFlight(
  state: PlayerPhysics,
  input: InputMessage,
  dt: number,
  planets: PlanetData[],
  cfg: StepConfig,
  terrainProvider?: TerrainSurfaceProvider,
  cfgForPlanet?: (planetId: string) => StepConfig | undefined,
): void {
  state.isOnFriendlySlime = false;
  state.isCarving = false;
  state.skiJumpCharge = 0;
  state.grindCooldownMs = Math.max(0, state.grindCooldownMs - dt * 1000);

  // 1. Single-planet gravity via the Phase B hysteresis picker.
  const dominant =
    getDominantGravityPlanet(state.pos, planets, state.gravityAnchorPlanetId ?? "") ??
    getNearestPlanet(state.pos, planets);
  state.gravityAnchorPlanetId = dominant?.id ?? "";
  if (dominant !== null) {
    const toPlanet = sub(dominant.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist > 0.01) {
      const gravDir = scale(toPlanet, 1 / dist);
      assign(state.vel, add(state.vel, scale(gravDir, cfg.movement.gravityAcceleration * dt)));
    }
  }

  // 2. Continuous steering — transverse acceleration toward aim. With aim
  //    aligned to velocity the lateral component is zero and steering does
  //    nothing; the more aim drifts off, the stronger the corrective push.
  const aimLen = vlen(input.aimDir);
  const speed = vlen(state.vel);
  if (aimLen > 1e-4 && speed > 1e-4) {
    const aimDir = scale(input.aimDir, 1 / aimLen);
    const currentDir = scale(state.vel, 1 / speed);
    const lateral = sub(aimDir, scale(currentDir, dot(aimDir, currentDir)));
    assign(state.vel, add(state.vel, scale(lateral, getFreeFlightSteerAcceleration(cfg) * dt)));
  }

  // 3. Thrust / brake.
  const forwardPressed = (input.keys & InputKey.Forward) !== 0;
  const backwardPressed = (input.keys & InputKey.Backward) !== 0;
  if (forwardPressed || backwardPressed) {
    const dir = speed > 1e-4 ? scale(state.vel, 1 / speed) : { x: 0, y: 0, z: 1 };
    const dv = forwardPressed ? getFreeFlightThrust(cfg) * dt : -getFreeFlightBrake(cfg) * dt;
    assign(state.vel, add(state.vel, scale(dir, dv)));
  }

  // Clamp to [min, max] so the player can't stall out to a dead drift or
  // chain a runaway speed.
  const newSpeed = vlen(state.vel);
  const minSpeed = getFreeFlightMinSpeed(cfg);
  const maxSpeed = getFreeFlightMaxSpeed(cfg);
  if (newSpeed > maxSpeed) {
    assign(state.vel, scale(state.vel, maxSpeed / newSpeed));
  } else if (newSpeed > 0 && newSpeed < minSpeed) {
    assign(state.vel, scale(state.vel, minSpeed / newSpeed));
  }

  // Integrate.
  assign(state.pos, add(state.pos, scale(state.vel, dt)));

  // Orient body "up" toward the dominant planet so visual rotation tracks
  // the world's local up. Same pattern as stepAirborne.
  if (dominant) {
    const up = normalize(sub(state.pos, dominant.center));
    const currentUp = applyQuat({ x: 0, y: 1, z: 0 }, state.rot);
    assignQuat(
      state.rot,
      normalizeQuat(quatMultiply(quatFromUnitVectors(currentUp, up), state.rot)),
    );
  }

  // Landing. Touch any planet's surface envelope to commit.
  for (const planet of planets) {
    const toPlanet = sub(planet.center, state.pos);
    const dist = vlen(toPlanet);
    if (dist < 0.01) continue;
    const gravDir = scale(toPlanet, 1 / dist);
    const upDir = scale(gravDir, -1);
    const planetCfg = cfgForPlanet?.(planet.id) ?? cfg;
    const rawLandingRadius =
      terrainProvider?.getRadius(upDir.x, upDir.y, upDir.z, planetCfg, planet.id) ??
      getTerrainRadius(upDir.x, upDir.y, upDir.z, planetCfg);
    const waterRadius = planetCfg.planet.radius + planetCfg.terrain.waterLevel;
    const landingRadius = Math.max(rawLandingRadius, waterRadius);
    const surfaceGap = dist - (landingRadius + cfg.movement.standingHeight);
    if (surfaceGap > getFreeFlightLandingCaptureDistance(cfg)) continue;
    const velToward = dot(state.vel, gravDir);
    if (velToward <= 0) continue;
    assign(
      state.pos,
      add(planet.center, scale(upDir, landingRadius + cfg.movement.standingHeight)),
    );
    assign(state.vel, sub(state.vel, scale(gravDir, velToward)));
    state.planetId = planet.id;
    state.gravityAnchorPlanetId = planet.id;
    state.movementState = PlayerMovementState.Idle;
    return;
  }
}

// -- Pad-loaded (Phase E) ----------------------------------------------------

/**
 * Player is locked onto a charged blast pad, aiming freely. Three sub-phases
 * per tick:
 *   1. Cancel check — any movement key steps the player off the pad. Charge
 *      stays on the pad (the pad's coverage isn't touched here).
 *   2. Wind-up — `padLoadProgress` ramps 0 → 1 over `freeFlightLoadDurationSeconds`.
 *      Launch input is ignored during this window so an accidental Anchor tap
 *      on contact doesn't immediately fire.
 *   3. Charge / launch — once wound up, `padChargeProgress` ramps 0 → 1 while
 *      Anchor is held. Release with any charge fires the player in the aim
 *      direction at lerp(launchSpeedMin, pad.launchSpeed, padChargeProgress).
 *
 * On launch the player transitions to FreeFlight, the pad's coverage is
 * consumed, and the position is nudged a small distance along aim so the
 * launcher doesn't immediately re-trigger.
 */
function stepPadLoaded(
  state: PlayerPhysics,
  input: InputMessage,
  dt: number,
  planets: PlanetData[],
  cfg: StepConfig,
  blastPads: readonly RuntimeBlastPad[],
  padStates: Map<string, SimBlastPadState>,
  terrainProvider?: TerrainSurfaceProvider,
): void {
  state.isOnFriendlySlime = false;
  state.isCarving = false;
  state.skiJumpCharge = 0;
  state.grindCooldownMs = Math.max(0, state.grindCooldownMs - dt * 1000);

  const pad = blastPads.find((p) => p.id === state.loadedPadId);
  const sourcePlanet = pad ? findPlanet(planets, pad.planetId) : undefined;
  if (!pad || !sourcePlanet) {
    // Pad disappeared from the map or planet missing — bail to a sane state.
    state.movementState = PlayerMovementState.Idle;
    state.loadedPadId = "";
    state.padLoadProgress = 0;
    state.padChargeProgress = 0;
    return;
  }

  // Pad surface center — the player is pinned here for the whole loaded window.
  const normal = normalize(pad.normal);
  const padSurfaceRadius =
    (terrainProvider?.getRadius(normal.x, normal.y, normal.z, cfg, sourcePlanet.id) ??
      getTerrainRadius(normal.x, normal.y, normal.z, cfg)) + cfg.movement.standingHeight;
  const padCenter = add(sourcePlanet.center, scale(normal, padSurfaceRadius));

  // 1. Cancel via movement. The cancel is gated by `padCancelArmed`:
  //     - On entry the flag is false (we may have loaded with W still held).
  //     - It flips to true as soon as a tick passes with no movement keys.
  //     - After that, any movement-key press cancels.
  //    This prevents "walk onto pad with W held → instantly cancel" while
  //    still letting an intentional W tap after loading step the player off.
  const movementMask = InputKey.Forward | InputKey.Backward | InputKey.Left | InputKey.Right;
  const movementPressed = (input.keys & movementMask) !== 0;
  if (!movementPressed) {
    state.padCancelArmed = true;
  } else if (state.padCancelArmed) {
    // Step off — preserve loadedPadId so we don't re-load while still in the
    // footprint (Phase E "stickiness" rule). Player goes back to surface
    // movement; the next on-surface tick + tryEnterLoadedPad will clear
    // loadedPadId once the footprint check no longer hits this pad.
    state.movementState = PlayerMovementState.Idle;
    state.padLoadProgress = 0;
    state.padChargeProgress = 0;
    state.padCancelArmed = false;
    return;
  }

  // Lock to pad center, zero velocity.
  assign(state.pos, padCenter);
  state.vel.x = 0;
  state.vel.y = 0;
  state.vel.z = 0;

  // Orient body up along the pad normal so the player visibly stands on it.
  const currentUp = applyQuat({ x: 0, y: 1, z: 0 }, state.rot);
  assignQuat(
    state.rot,
    normalizeQuat(quatMultiply(quatFromUnitVectors(currentUp, normal), state.rot)),
  );

  // 2. Wind-up.
  state.padLoadProgress = Math.min(
    1,
    (state.padLoadProgress ?? 0) + dt / getFreeFlightLoadDuration(cfg),
  );
  if ((state.padLoadProgress ?? 0) < 1) {
    return;
  }

  // 3. Charge / launch.
  const anchorHeld = (input.keys & InputKey.Anchor) !== 0;
  if (anchorHeld) {
    state.padChargeProgress = Math.min(
      1,
      (state.padChargeProgress ?? 0) + dt / getFreeFlightChargeDuration(cfg),
    );
    return;
  }

  // Anchor released. If no charge was built, just wait — the player can still
  // press Anchor to charge, or step off to cancel.
  if ((state.padChargeProgress ?? 0) <= 0) {
    return;
  }

  // LAUNCH.
  const padState = padStates.get(pad.id);
  if (padState) {
    padState.ownerSlimeGroupId = NO_SLIME_GROUP_ID;
    padState.ownerColor = 0;
    padState.coverageProgress = 0;
  }

  const aimLen = vlen(input.aimDir);
  const aimDir = aimLen > 1e-4 ? scale(input.aimDir, 1 / aimLen) : normal;
  const minSpeed = getFreeFlightLaunchSpeedMin(cfg);
  const speed = minSpeed + (pad.launchSpeed - minSpeed) * (state.padChargeProgress ?? 0);

  // Nudge launch start a touch along aim so the surface-snap envelope of the
  // source planet doesn't immediately register as a landing.
  const launchOffset = cfg.movement.surfaceSnapDistance + cfg.movement.collisionRadius + 0.75;
  assign(state.pos, add(padCenter, scale(aimDir, launchOffset)));
  assign(state.vel, scale(aimDir, speed));
  state.planetId = "";
  state.gravityAnchorPlanetId = sourcePlanet.id;
  state.movementState = PlayerMovementState.FreeFlight;
  state.loadedPadId = "";
  state.padLoadProgress = 0;
  state.padChargeProgress = 0;
  state.surfState =
    state.surfState === PlayerSurfState.None ? PlayerSurfState.SurfingVisible : state.surfState;
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
  planetSlime: Map<string, SimPlanetSlimeState>,
  rails: ComputedRail[] = [],
  blastPads: readonly RuntimeBlastPad[] = [],
  padStates: Map<string, SimBlastPadState> = new Map(),
  terrainProvider?: TerrainSurfaceProvider,
  cfgForPlanet?: (planetId: string) => StepConfig | undefined,
): void {
  if (state.movementState === PlayerMovementState.Dead) {
    state.surfState = PlayerSurfState.None;
    state.isCarving = false;
    state.isOnFriendlySlime = false;
    return;
  }
  state.splatCooldownMs = Math.max(0, (state.splatCooldownMs ?? 0) - dt * 1000);
  if (state.movementState === PlayerMovementState.Grinding) {
    stepGrinding(state, input, rails, dt, cfg);
    return;
  }
  if (state.movementState === PlayerMovementState.FreeFlight) {
    stepFreeFlight(state, input, dt, planets, cfg, terrainProvider, cfgForPlanet);
    return;
  }
  if (state.movementState === PlayerMovementState.PadLoaded) {
    stepPadLoaded(state, input, dt, planets, cfg, blastPads, padStates, terrainProvider);
    return;
  }
  // Splat freeze: after a blast-pad landing the player is pinned at impact (zero vel,
  // no input movement, no pad re-trigger) for the splat cooldown. The squash visual
  // eases over the same window so the player visibly compresses then pops back up.
  if ((state.splatCooldownMs ?? 0) > 0 && state.planetId !== "") {
    state.vel.x = 0;
    state.vel.y = 0;
    state.vel.z = 0;
    state.movementState = PlayerMovementState.Idle;
    state.skiJumpCharge = 0;
    state.isCarving = false;
    state.surfState = PlayerSurfState.None;
    return;
  }
  // Entering a charged pad transitions to PadLoaded; next tick dispatches to
  // stepPadLoaded for the wind-up/charge/launch cycle.
  if (tryEnterLoadedPad(state, planets, cfg, blastPads, padStates, terrainProvider)) {
    return;
  }
  if (state.planetId !== "") {
    stepOnSurface(state, input, dt, planets, cfg, planetSlime, terrainProvider);
    tryEnterLoadedPad(state, planets, cfg, blastPads, padStates, terrainProvider);
  } else {
    stepAirborne(state, input, dt, planets, cfg, terrainProvider, cfgForPlanet);
    // After airborne integration, check if the player is close enough to a rail to snap.
    if (
      state.movementState === PlayerMovementState.Airborne &&
      rails.length > 0 &&
      state.grindCooldownMs <= 0
    ) {
      tryEnterGrind(state, rails, cfg);
    }
  }
}

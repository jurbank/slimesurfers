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
  planetHopSourcePlanetId?: string;
  planetHopTargetPlanetId?: string;
  planetHopLandingNormal?: Vec3Data;
  planetHopElapsedMs?: number;
  splatCooldownMs?: number;
  isOnFriendlySlime: boolean;
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
    planetHopLaunchDurationSeconds?: number;
    planetHopSteeringDegrees?: number;
    planetHopAssistAcceleration?: number;
    planetHopMaxDurationSeconds?: number;
    planetHopLandingCaptureDistance?: number;
    planetHopLandingSpeedRetention?: number;
    planetHopLandingSplatCooldownMs?: number;
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

function getPlanetHopLaunchDuration(cfg: StepConfig): number {
  return cfg.movement.planetHopLaunchDurationSeconds ?? 0.35;
}

function getPlanetHopAssistAcceleration(cfg: StepConfig): number {
  return cfg.movement.planetHopAssistAcceleration ?? 34;
}

function getPlanetHopMaxDuration(cfg: StepConfig): number {
  return cfg.movement.planetHopMaxDurationSeconds ?? 6;
}

function getPlanetHopLandingCaptureDistance(cfg: StepConfig): number {
  return cfg.movement.planetHopLandingCaptureDistance ?? 42;
}

function getPlanetHopLandingSplatCooldownMs(cfg: StepConfig): number {
  return cfg.movement.planetHopLandingSplatCooldownMs ?? 500;
}

function getPlanetHopLandingSteerRate(target: PlanetData): number {
  return 45 / Math.max(target.radius, 1);
}

function getPlanetHopCruiseAssist(state: PlayerPhysics): number {
  return state.movementState === PlayerMovementState.LandingApproach ? 1.0 : 0.45;
}

function tryTriggerBlastPad(
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
    state.movementState === PlayerMovementState.Grinding
  ) {
    return false;
  }
  const sourcePlanet = findPlanet(planets, state.planetId);
  if (!sourcePlanet) return false;

  for (const pad of blastPads) {
    if (pad.planetId !== state.planetId) continue;
    // Pad is charged only when its coverage is full AND the dominant owner is this
    // player's slime group. Each stamp drips coverage in the painter's color; enemies
    // drain it by painting over. Triggering consumes the charge fully — coverage and
    // ownership reset, so the pad must be re-painted to charge again.
    const padState = padStates.get(pad.id);
    if (!padState) continue;
    if (
      padState.coverageProgress < 1 ||
      padState.ownerSlimeGroupId === NO_SLIME_GROUP_ID ||
      padState.ownerSlimeGroupId !== state.slimeGroupId
    ) {
      continue;
    }
    const targetPlanet = findPlanet(planets, pad.targetPlanetId);
    if (!targetPlanet) continue;

    const normal = normalize(pad.normal);
    const tangent = normalize(projectOntoPlane(pad.tangent, normal));
    const padSurfaceRadius =
      (terrainProvider?.getRadius(normal.x, normal.y, normal.z, cfg, sourcePlanet.id) ??
        getTerrainRadius(normal.x, normal.y, normal.z, cfg)) + cfg.movement.standingHeight;
    const padCenter = add(sourcePlanet.center, scale(normal, padSurfaceRadius));
    const playerNormal = normalize(sub(state.pos, sourcePlanet.center));
    const footprintDot = Math.max(-1, Math.min(1, dot(playerNormal, normal)));
    const footprintDistance = Math.acos(footprintDot) * sourcePlanet.radius;
    if (footprintDistance > pad.radius + cfg.movement.collisionRadius) continue;

    const targetNormal = normalize(pad.targetNormal);
    const targetSurfaceRadius =
      (terrainProvider?.getRadius(
        targetNormal.x,
        targetNormal.y,
        targetNormal.z,
        cfg,
        targetPlanet.id,
      ) ?? getTerrainRadius(targetNormal.x, targetNormal.y, targetNormal.z, cfg)) +
      cfg.movement.standingHeight;
    const targetPoint = add(targetPlanet.center, scale(targetNormal, targetSurfaceRadius));
    const toTarget = normalize(sub(targetPoint, state.pos));
    const launchDir = normalize(
      add(add(scale(normal, pad.upwardBias), scale(tangent, 0.65)), scale(toTarget, 1.35)),
    );

    assign(state.pos, add(padCenter, scale(normal, cfg.movement.surfaceSnapDistance + 0.75)));
    assign(state.vel, scale(launchDir, pad.launchSpeed));
    state.planetId = "";
    state.movementState = PlayerMovementState.BlastLaunch;
    state.surfState =
      state.surfState === PlayerSurfState.None ? PlayerSurfState.SurfingVisible : state.surfState;
    state.isCarving = false;
    state.grindRailId = -1;
    state.planetHopSourcePlanetId = pad.planetId;
    state.planetHopTargetPlanetId = pad.targetPlanetId;
    state.planetHopLandingNormal = targetNormal;
    state.planetHopElapsedMs = 0;
    // Consume the charge: coverage drops to 0 and ownership clears, so the pad must
    // be repainted from scratch before it can fire again.
    padState.ownerSlimeGroupId = NO_SLIME_GROUP_ID;
    padState.ownerColor = 0;
    padState.coverageProgress = 0;
    return true;
  }

  return false;
}

// Prefer the planet whose gravity zone the player is inside (closest by normalized
// distance). Used to pick which planet's gravity dominates when zones are defined.
function getDominantGravityPlanet(pos: Vec3Data, planets: PlanetData[]): PlanetData | null {
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
// drifts off into the force-free void — that void is reserved for guided planet hops,
// which run through stepPlanetHop and never reach stepAirborne.
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
    getDominantGravityPlanet(state.pos, planets) ?? getNearestPlanet(state.pos, planets);

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
    const rawLandingRadius =
      terrainProvider?.getRadius(upDir.x, upDir.y, upDir.z, cfg, nearest.id) ??
      getTerrainRadius(upDir.x, upDir.y, upDir.z, cfg);
    const waterRadius = cfg.planet.radius + cfg.terrain.waterLevel;
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
        state.movementState = PlayerMovementState.Idle;
      }
    }
  }
}

function stepPlanetHop(
  state: PlayerPhysics,
  input: InputMessage,
  dt: number,
  planets: PlanetData[],
  cfg: StepConfig,
  terrainProvider?: TerrainSurfaceProvider,
): void {
  state.isOnFriendlySlime = false;
  state.isCarving = false;
  state.skiJumpCharge = 0;
  state.grindCooldownMs = Math.max(0, state.grindCooldownMs - dt * 1000);
  state.planetHopElapsedMs = (state.planetHopElapsedMs ?? 0) + dt * 1000;

  const target = findPlanet(planets, state.planetHopTargetPlanetId ?? "");
  if (!target) {
    state.movementState = PlayerMovementState.Airborne;
    stepAirborne(state, input, dt, planets, cfg, terrainProvider);
    return;
  }

  if (
    state.movementState === PlayerMovementState.BlastLaunch &&
    (state.planetHopElapsedMs ?? 0) >= getPlanetHopLaunchDuration(cfg) * 1000
  ) {
    state.movementState = PlayerMovementState.PlanetHopFlight;
  }

  let landingNormal = normalize(
    state.planetHopLandingNormal ?? normalize(sub(state.pos, target.center)),
  );
  const aimLen = vlen(input.aimDir);
  const aimDir = aimLen > 1e-4 ? scale(input.aimDir, 1 / aimLen) : normalize(state.vel);
  if (aimLen > 1e-4 && state.movementState !== PlayerMovementState.BlastLaunch) {
    const landingSteer = projectOntoPlane(aimDir, landingNormal);
    const landingSteerLen = vlen(landingSteer);
    if (landingSteerLen > 1e-4) {
      landingNormal = normalize(
        add(
          landingNormal,
          scale(landingSteer, (getPlanetHopLandingSteerRate(target) * dt) / landingSteerLen),
        ),
      );
      state.planetHopLandingNormal = landingNormal;
    }
  }

  const targetSurfaceRadius =
    (terrainProvider?.getRadius(
      landingNormal.x,
      landingNormal.y,
      landingNormal.z,
      cfg,
      target.id,
    ) ?? getTerrainRadius(landingNormal.x, landingNormal.y, landingNormal.z, cfg)) +
    cfg.movement.standingHeight;
  const targetPoint = add(target.center, scale(landingNormal, targetSurfaceRadius));
  const targetDir = normalize(sub(targetPoint, state.pos));

  const speed = Math.max(vlen(state.vel), 1);
  if (aimLen > 1e-4 && state.movementState !== PlayerMovementState.BlastLaunch) {
    const currentDir = scale(state.vel, 1 / speed);
    const steeringDegrees = cfg.movement.planetHopSteeringDegrees ?? 45;
    const steerStrength = Math.min(1, dt * (steeringDegrees / 12));
    const freeFlightDir = normalize(add(scale(aimDir, 0.75), scale(targetDir, 0.25)));
    const steeredDir = normalize(
      add(scale(currentDir, 1 - steerStrength), scale(freeFlightDir, steerStrength)),
    );
    assign(state.vel, scale(steeredDir, speed));
  }

  const forwardPressed = (input.keys & InputKey.Forward) !== 0;
  const backwardPressed = (input.keys & InputKey.Backward) !== 0;
  if (forwardPressed || backwardPressed) {
    const speedDelta = cfg.movement.airBoostAcceleration * dt * (forwardPressed ? 1 : -0.65);
    const nextSpeed = Math.max(cfg.movement.moveSpeed * 2, speed + speedDelta);
    assign(state.vel, scale(normalize(state.vel), nextSpeed));
  }

  const elapsedSeconds = (state.planetHopElapsedMs ?? 0) / 1000;
  const assistScale = elapsedSeconds > getPlanetHopMaxDuration(cfg) ? 1.6 : 1;
  assign(
    state.vel,
    add(
      state.vel,
      scale(
        targetDir,
        getPlanetHopAssistAcceleration(cfg) * getPlanetHopCruiseAssist(state) * assistScale * dt,
      ),
    ),
  );

  assign(state.pos, add(state.pos, scale(state.vel, dt)));

  const up = normalize(sub(state.pos, target.center));
  const currentUp = applyQuat({ x: 0, y: 1, z: 0 }, state.rot);
  assignQuat(state.rot, normalizeQuat(quatMultiply(quatFromUnitVectors(currentUp, up), state.rot)));

  const toTargetCenter = sub(target.center, state.pos);
  const distToCenter = vlen(toTargetCenter);
  if (distToCenter < 0.01) return;
  const gravDir = scale(toTargetCenter, 1 / distToCenter);
  const upDir = scale(gravDir, -1);
  const toLanding = sub(targetPoint, state.pos);
  const landingPointDistance = vlen(toLanding);
  const rawLandingRadius =
    terrainProvider?.getRadius(upDir.x, upDir.y, upDir.z, cfg, target.id) ??
    getTerrainRadius(upDir.x, upDir.y, upDir.z, cfg);
  const waterRadius = target.radius + cfg.terrain.waterLevel;
  const landingRadius = Math.max(rawLandingRadius, waterRadius);
  const landingDistance = distToCenter - (landingRadius + cfg.movement.standingHeight);

  const targetCaptureDistance = Math.max(0, getCaptureRadius(target) - landingRadius);
  if (
    landingPointDistance <= Math.min(getPlanetHopLandingCaptureDistance(cfg), targetCaptureDistance)
  ) {
    state.movementState = PlayerMovementState.LandingApproach;
    const landingPull =
      landingPointDistance > 1e-4 ? scale(toLanding, 1 / landingPointDistance) : gravDir;
    const velToward = dot(state.vel, landingPull);
    if (velToward > 0 || landingPointDistance > cfg.movement.surfaceSnapDistance) {
      assign(state.vel, add(state.vel, scale(landingPull, cfg.movement.gravityAcceleration * dt)));
    }
  }

  if (landingDistance <= cfg.movement.surfaceSnapDistance) {
    const velToward = dot(state.vel, gravDir);
    if (velToward > 0) {
      // Hard-stop on splat impact: velocity goes to zero and the player is pinned at
      // the landing point for the splat cooldown (see stepPlayer). The squash visual
      // plays during this window, then the player pops back up under normal control.
      assign(
        state.pos,
        add(target.center, scale(upDir, landingRadius + cfg.movement.standingHeight)),
      );
      assign(state.vel, { x: 0, y: 0, z: 0 });
      state.planetId = target.id;
      state.planetHopSourcePlanetId = "";
      state.planetHopTargetPlanetId = "";
      state.planetHopLandingNormal = upDir;
      state.planetHopElapsedMs = 0;
      state.splatCooldownMs = getPlanetHopLandingSplatCooldownMs(cfg);
      state.movementState = PlayerMovementState.Idle;
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
  planetSlime: Map<string, SimPlanetSlimeState>,
  rails: ComputedRail[] = [],
  blastPads: readonly RuntimeBlastPad[] = [],
  padStates: Map<string, SimBlastPadState> = new Map(),
  terrainProvider?: TerrainSurfaceProvider,
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
  if (
    state.movementState === PlayerMovementState.BlastLaunch ||
    state.movementState === PlayerMovementState.PlanetHopFlight ||
    state.movementState === PlayerMovementState.LandingApproach
  ) {
    stepPlanetHop(state, input, dt, planets, cfg, terrainProvider);
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
  if (tryTriggerBlastPad(state, planets, cfg, blastPads, padStates, terrainProvider)) {
    stepPlanetHop(state, input, dt, planets, cfg, terrainProvider);
    return;
  }
  if (state.planetId !== "") {
    stepOnSurface(state, input, dt, planets, cfg, planetSlime, terrainProvider);
    if (tryTriggerBlastPad(state, planets, cfg, blastPads, padStates, terrainProvider)) {
      stepPlanetHop(state, input, dt, planets, cfg, terrainProvider);
    }
  } else {
    stepAirborne(state, input, dt, planets, cfg, terrainProvider);
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

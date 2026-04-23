import { DEFAULT_WEAPON_ID, getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";

const HOMING_TURN_RATE_STANDARD = 5; // rad/s
const HOMING_TURN_RATE_GUARANTEED = 15; // rad/s
const GUARANTEED_SPEED_MULTIPLIER = 1.8;
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import {
  InputKey,
  type InputMessage,
  type Vec3Data,
} from "@splat/protocol/network/clientMessages.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import type { PaintStampMessage } from "@splat/protocol/network/serverMessages.ts";
import type { PlanetData } from "../movement/simulatedMovement.ts";
import { getPaintAtPoint } from "../paint/paintDetection.ts";
import { applyPaintImpact } from "../paint/stampPaint.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";
import {
  PlayerMovementState,
  PlayerSwimState,
  type SimMatchState,
  type SimPlayerState,
  type SimProjectileState,
  type SimVec3,
} from "../match/simState.ts";

export interface CombatConfig {
  player: {
    projectileMuzzleHeight: number;
    maxHealth: number;
  };
  movement: {
    collisionRadius: number;
  };
  slime: {
    maxLevel: number;
    passiveRechargePerSecond: number;
    friendlyPaintRechargePerSecond: number;
    submergedRechargePerSecond: number;
    rechargeDelayMs: number;
  };
  paint: {
    impactStampRadius: number;
    deathBurstStampCount: number;
    deathBurstSpreadRadius: number;
    deathBurstRadiusMultiplier: number;
  };
  respawn: {
    durationSeconds: number;
    dropInHeight: number;
  };
  planet: {
    radius: number;
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

function add(a: Vec3Data, b: Vec3Data): SimVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3Data, b: Vec3Data): SimVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: Vec3Data, s: number): SimVec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function length(a: Vec3Data): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

function normalize(a: Vec3Data): SimVec3 {
  const len = length(a);
  return len < 1e-8 ? { x: 0, y: 0, z: 1 } : scale(a, 1 / len);
}

function distance(a: Vec3Data, b: Vec3Data): number {
  return length(sub(a, b));
}

function assign(target: Vec3Data, source: Vec3Data): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function dot(a: Vec3Data, b: Vec3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3Data, b: Vec3Data): SimVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rotateToward(from: Vec3Data, toward: Vec3Data, maxAngleRad: number): SimVec3 {
  const cosAngle = clamp(dot(from, toward), -1, 1);
  const angle = Math.acos(cosAngle);
  if (angle < 1e-6) return { x: toward.x, y: toward.y, z: toward.z };
  const ax = cross(from, toward);
  const axLen = length(ax);
  if (axLen < 1e-8) return { x: from.x, y: from.y, z: from.z };
  const axis = scale(ax, 1 / axLen);
  const rotAngle = Math.min(angle, maxAngleRad);
  const cosR = Math.cos(rotAngle);
  const sinR = Math.sin(rotAngle);
  const axDotV = dot(axis, from);
  return add(
    add(scale(from, cosR), scale(cross(axis, from), sinR)),
    scale(axis, axDotV * (1 - cosR)),
  );
}

function closestPointOnSegment(point: Vec3Data, start: Vec3Data, end: Vec3Data): SimVec3 {
  const segment = sub(end, start);
  const segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq < 1e-8) return { x: start.x, y: start.y, z: start.z };

  const t = clamp(dot(sub(point, start), segment) / segmentLengthSq, 0, 1);
  return add(start, scale(segment, t));
}

function closestPointOnPlayerCapsule(
  point: Vec3Data,
  player: SimPlayerState,
  planets: PlanetData[],
  cfg: CombatConfig,
): SimVec3 {
  const planet = getPlayerPlanet(player, planets);
  if (!planet) return player.pos;

  const up = normalize(sub(player.pos, planet.center));
  const capsuleTop = add(player.pos, scale(up, cfg.player.projectileMuzzleHeight));
  return closestPointOnSegment(point, player.pos, capsuleTop);
}

function terrainClearance(
  point: Vec3Data,
  planet: PlanetData,
  projectileRadius: number,
  cfg: CombatConfig,
): number {
  const fromCenter = sub(point, planet.center);
  const dist = length(fromCenter);
  if (dist < 1e-8) return -Infinity;

  const normal = scale(fromCenter, 1 / dist);
  return dist - getTerrainRadius(normal.x, normal.y, normal.z, cfg) - projectileRadius;
}

function pointOnSegment(start: Vec3Data, end: Vec3Data, t: number): SimVec3 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function findTerrainImpactOnSegment(
  start: Vec3Data,
  end: Vec3Data,
  planet: PlanetData,
  projectileRadius: number,
  cfg: CombatConfig,
): SimVec3 | null {
  const segmentLength = distance(start, end);
  if (segmentLength < 1e-8) return null;

  let previousT = 0;
  let previousClearance = terrainClearance(start, planet, projectileRadius, cfg);
  if (previousClearance <= 0) {
    const endClearance = terrainClearance(end, planet, projectileRadius, cfg);
    return endClearance < previousClearance ? { x: start.x, y: start.y, z: start.z } : null;
  }

  const stepDistance = Math.max(0.15, projectileRadius * 0.5);
  const steps = Math.max(1, Math.ceil(segmentLength / stepDistance));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sample = pointOnSegment(start, end, t);
    const sampleClearance = terrainClearance(sample, planet, projectileRadius, cfg);
    if (sampleClearance <= 0) {
      let lo = previousT;
      let hi = t;
      for (let j = 0; j < 8; j++) {
        const mid = (lo + hi) * 0.5;
        const midPoint = pointOnSegment(start, end, mid);
        if (terrainClearance(midPoint, planet, projectileRadius, cfg) <= 0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return pointOnSegment(start, end, hi);
    }

    previousT = t;
  }

  return null;
}

function isFiniteVec3(point: Vec3Data | undefined): point is Vec3Data {
  return (
    point !== undefined &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

function getProjectileMuzzlePosition(
  player: SimPlayerState,
  planets: PlanetData[],
  cfg: CombatConfig,
): SimVec3 {
  let planet = planets.find((candidate) => candidate.id === player.planetId);
  if (!planet) {
    let nearestDistance = Infinity;
    for (const candidate of planets) {
      const candidateDistance = distance(player.pos, candidate.center);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        planet = candidate;
      }
    }
  }
  if (!planet) return { x: player.pos.x, y: player.pos.y, z: player.pos.z };

  const up = normalize(sub(player.pos, planet.center));
  return add(player.pos, scale(up, cfg.player.projectileMuzzleHeight));
}

function getSlimeRechargeRate(
  simState: SimMatchState,
  player: SimPlayerState,
  cfg: CombatConfig,
): number {
  if (player.planetId === "") {
    return cfg.slime.passiveRechargePerSecond;
  }

  const paint = getPaintAtPoint(player.pos, player.planetId, simState.planets);
  const onFriendlyPaint = paint?.paintGroupId === player.paintGroupId;
  if (!onFriendlyPaint) {
    return cfg.slime.passiveRechargePerSecond;
  }

  return player.swimState !== PlayerSwimState.None
    ? cfg.slime.submergedRechargePerSecond
    : cfg.slime.friendlyPaintRechargePerSecond;
}

function getEquippedWeaponId(player: SimPlayerState): WeaponId {
  return player.equippedWeaponId ?? DEFAULT_WEAPON_ID;
}

function getProjectileWeapon(projectile: SimProjectileState) {
  return getWeaponDefinition(projectile.weaponId);
}

function getNearestPlanet(point: Vec3Data, planets: PlanetData[]): PlanetData | undefined {
  let nearestPlanet: PlanetData | undefined;
  let nearestDist = Infinity;
  for (const planet of planets) {
    const d = distance(point, planet.center);
    if (d < nearestDist) {
      nearestDist = d;
      nearestPlanet = planet;
    }
  }
  return nearestPlanet;
}

function getPlayerPlanet(player: SimPlayerState, planets: PlanetData[]): PlanetData | undefined {
  return (
    planets.find((planet) => planet.id === player.planetId) ?? getNearestPlanet(player.pos, planets)
  );
}

function addDeathBurstPaint(
  simState: SimMatchState,
  paintStamps: PaintStampMessage[],
  defeated: SimPlayerState,
  owner: SimPlayerState | undefined,
  planets: PlanetData[],
  cfg: CombatConfig,
): void {
  if (!owner || cfg.paint.deathBurstStampCount <= 0) return;

  const planet = getPlayerPlanet(defeated, planets);
  if (!planet) return;

  const planetState = simState.planets.get(planet.id);
  if (!planetState) return;

  const fromCenter = sub(defeated.pos, planet.center);
  const normal = normalize(fromCenter);
  const tangentSeed = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentA = normalize(cross(tangentSeed, normal));
  const tangentB = normalize(cross(normal, tangentA));
  const count = Math.floor(cfg.paint.deathBurstStampCount);

  for (let i = 0; i < count; i++) {
    const isCenter = i === 0;
    const angle = (i / Math.max(1, count - 1)) * Math.PI * 2;
    const spread = isCenter ? 0 : cfg.paint.deathBurstSpreadRadius;
    const surfaceDir = normalize(
      add(
        normal,
        scale(
          add(scale(tangentA, Math.cos(angle)), scale(tangentB, Math.sin(angle))),
          spread / cfg.planet.radius,
        ),
      ),
    );
    const surfaceRadius = getTerrainRadius(surfaceDir.x, surfaceDir.y, surfaceDir.z, cfg);
    const stamp = applyPaintImpact(simState, planetState, {
      planetId: planet.id,
      pos: add(planet.center, scale(surfaceDir, surfaceRadius)),
      paintGroupId: owner.paintGroupId,
      slimeColor: owner.slimeColor,
      patternId: owner.patternId,
      radiusMultiplier: cfg.paint.deathBurstRadiusMultiplier,
    });
    if (stamp) paintStamps.push(stamp);
  }
}

function applyDamage(
  player: SimPlayerState,
  owner: SimPlayerState | undefined,
  damage: number,
  cfg: CombatConfig,
): boolean {
  if (damage <= 0 || player.movementState === PlayerMovementState.Dead) return false;

  player.swimState = PlayerSwimState.None;
  player.isCarving = false;
  player.health = Math.max(0, player.health - damage);
  if (player.health > 0) return false;

  player.movementState = PlayerMovementState.Dead;
  player.respawnTimer = cfg.respawn.durationSeconds;
  player.deathCount++;
  if (owner) {
    owner.killCount++;
  }
  return true;
}

function applySplashDamage(
  simState: SimMatchState,
  paintStamps: PaintStampMessage[],
  owner: SimPlayerState | undefined,
  ownerId: string,
  impactPos: Vec3Data,
  splashRadius: number,
  splashDamage: number,
  planets: PlanetData[],
  cfg: CombatConfig,
  excludedPlayerIds: Set<string>,
): void {
  if (splashRadius <= 0 || splashDamage <= 0) return;

  simState.players.forEach((player) => {
    if (player.sessionId === ownerId) return;
    if (player.movementState === PlayerMovementState.Dead) return;
    if (excludedPlayerIds.has(player.sessionId)) return;

    const hitDistance = splashRadius + cfg.movement.collisionRadius;
    const playerDistance = distance(player.pos, impactPos);
    if (playerDistance > hitDistance) return;

    const damageScale = 1 - playerDistance / hitDistance;
    const killed = applyDamage(
      player,
      owner,
      Math.max(1, Math.round(splashDamage * damageScale)),
      cfg,
    );
    if (killed) addDeathBurstPaint(simState, paintStamps, player, owner, planets, cfg);
  });
}

function getBlastFallbackDirection(player: SimPlayerState, planets: PlanetData[]): SimVec3 {
  let nearestPlanet: PlanetData | undefined;
  let nearestDistance = Infinity;
  for (const planet of planets) {
    const playerDistance = distance(player.pos, planet.center);
    if (playerDistance < nearestDistance) {
      nearestDistance = playerDistance;
      nearestPlanet = planet;
    }
  }

  if (!nearestPlanet) return { x: 0, y: 1, z: 0 };
  return normalize(sub(player.pos, nearestPlanet.center));
}

function applyBlastImpulse(
  simState: SimMatchState,
  impactPos: Vec3Data,
  blastRadius: number,
  blastImpulse: number,
  planets: PlanetData[],
  cfg: CombatConfig,
): void {
  if (blastRadius <= 0 || blastImpulse <= 0) return;

  simState.players.forEach((player) => {
    if (player.movementState === PlayerMovementState.Dead) return;

    const hitDistance = blastRadius + cfg.movement.collisionRadius;
    const playerDistance = distance(player.pos, impactPos);
    if (playerDistance > hitDistance) return;

    const falloff = 1 - playerDistance / hitDistance;
    const blastDir =
      playerDistance > 1e-4
        ? normalize(sub(player.pos, impactPos))
        : getBlastFallbackDirection(player, planets);
    assign(player.vel, add(player.vel, scale(blastDir, blastImpulse * falloff)));
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.swimState = PlayerSwimState.None;
    player.isCarving = false;
  });
}

function respawnPlayer(player: SimPlayerState, planets: PlanetData[], cfg: CombatConfig): void {
  const planet = planets.find((candidate) => candidate.id === player.spawnPlanetId) ?? planets[0];
  if (!planet) return;

  // Spawn above the terrain at the top of the planet (+Y direction)
  const spawnRadius = getTerrainRadius(0, 1, 0, cfg);
  player.pos = {
    x: planet.center.x,
    y: planet.center.y + spawnRadius + cfg.respawn.dropInHeight + cfg.movement.collisionRadius,
    z: planet.center.z,
  };
  player.vel = { x: 0, y: 0, z: 0 };
  player.rot = { x: 0, y: 0, z: 0, w: 1 };
  player.planetId = planet.id;
  player.health = cfg.player.maxHealth;
  player.slimeLevel = cfg.slime.maxLevel;
  player.respawnTimer = 0;
  player.movementState = PlayerMovementState.Idle;
  player.swimState = PlayerSwimState.None;
  player.isCarving = false;
  player.equippedWeaponId = DEFAULT_WEAPON_ID;
  player.disposableShotsRemaining = 0;
  player.lastFireTimeMs = -getWeaponDefinition(DEFAULT_WEAPON_ID).fireCooldownMs;
}

export function rechargePlayerSlime(
  simState: SimMatchState,
  player: SimPlayerState,
  dtSeconds: number,
  nowMs: number,
  cfg: CombatConfig,
): void {
  if (dtSeconds <= 0 || player.movementState === PlayerMovementState.Dead) return;
  if (player.slimeLevel >= cfg.slime.maxLevel) {
    player.slimeLevel = cfg.slime.maxLevel;
    return;
  }
  if (nowMs - player.lastFireTimeMs < cfg.slime.rechargeDelayMs) return;

  const rechargeRate = getSlimeRechargeRate(simState, player, cfg);
  player.slimeLevel = clamp(player.slimeLevel + rechargeRate * dtSeconds, 0, cfg.slime.maxLevel);
}

export function tryFireProjectile(
  simState: SimMatchState,
  player: SimPlayerState,
  input: InputMessage,
  nowMs: number,
  planets: PlanetData[],
  cfg: CombatConfig,
): void {
  if ((input.keys & InputKey.Fire) === 0) return;
  if (player.movementState === PlayerMovementState.Dead) return;
  const weapon = getWeaponDefinition(getEquippedWeaponId(player));
  if (weapon.behavior !== "projectile") return;
  if (nowMs - player.lastFireTimeMs < weapon.fireCooldownMs) return;
  if (simState.projectiles.size >= NETWORK_CONFIG.limits.maxProjectilesPerRoom) return;
  if (player.slimeLevel < weapon.slimeCost) return;

  const muzzlePos = getProjectileMuzzlePosition(player, planets, cfg);
  const aim = isFiniteVec3(input.aimPoint)
    ? normalize(sub(input.aimPoint, muzzlePos))
    : normalize(input.aimDir);
  const isGuaranteed = input.guaranteedHoming === true;
  const speed =
    weapon.projectileSpeed *
    (input.lockedTargetId && isGuaranteed ? GUARANTEED_SPEED_MULTIPLIER : 1);
  const projectile: SimProjectileState = {
    id: `projectile-${simState.nextProjectileId++}`,
    ownerId: player.sessionId,
    weaponId: weapon.id,
    paintGroupId: player.paintGroupId,
    slimeColor: player.slimeColor,
    patternId: player.patternId,
    pos: muzzlePos,
    vel: scale(aim, speed),
    planetId: player.planetId,
    lifeMs: weapon.projectileLifetimeMs,
    spawnTimeMs: nowMs,
    homingTargetId: input.lockedTargetId,
    guaranteedHoming: input.guaranteedHoming,
  };
  simState.projectiles.set(projectile.id, projectile);
  player.slimeLevel = clamp(player.slimeLevel - weapon.slimeCost, 0, cfg.slime.maxLevel);
  player.lastFireTimeMs = nowMs;
  if (weapon.disposableShots !== undefined) {
    player.disposableShotsRemaining = Math.max(0, player.disposableShotsRemaining - 1);
    if (player.disposableShotsRemaining === 0) {
      player.equippedWeaponId = DEFAULT_WEAPON_ID;
    }
  }
}

export function tickProjectiles(
  simState: SimMatchState,
  dtMs: number,
  planets: PlanetData[],
  cfg: CombatConfig,
): PaintStampMessage[] {
  const paintStamps: PaintStampMessage[] = [];
  simState.players.forEach((player) => {
    if (player.movementState !== PlayerMovementState.Dead) return;
    player.respawnTimer = Math.max(0, player.respawnTimer - dtMs / 1000);
    if (player.respawnTimer === 0) {
      respawnPlayer(player, planets, cfg);
    }
  });

  const removedIds: string[] = [];
  simState.projectiles.forEach((projectile, projectileId) => {
    const owner = simState.players.get(projectile.ownerId);
    const weapon = getProjectileWeapon(projectile);
    const projectileDtMs =
      projectile.spawnTimeMs === undefined
        ? dtMs
        : clamp(simState.elapsedMs - projectile.spawnTimeMs, 0, dtMs);
    const startPos = { x: projectile.pos.x, y: projectile.pos.y, z: projectile.pos.z };
    projectile.lifeMs = Math.max(0, projectile.lifeMs - projectileDtMs);

    if (projectile.homingTargetId) {
      const target = simState.players.get(projectile.homingTargetId);
      if (target && target.movementState !== PlayerMovementState.Dead) {
        const currentSpeed = length(projectile.vel);
        if (currentSpeed > 1e-8) {
          const currentDir = scale(projectile.vel, 1 / currentSpeed);
          const toTarget = sub(target.pos, projectile.pos);
          const toTargetLen = length(toTarget);
          if (toTargetLen > 1e-8) {
            const targetDir = scale(toTarget, 1 / toTargetLen);
            const turnRate = projectile.guaranteedHoming
              ? HOMING_TURN_RATE_GUARANTEED
              : HOMING_TURN_RATE_STANDARD;
            const newDir = rotateToward(currentDir, targetDir, turnRate * (projectileDtMs / 1000));
            assign(projectile.vel, scale(newDir, currentSpeed));
          }
        }
      }
    }

    projectile.pos = add(projectile.pos, scale(projectile.vel, projectileDtMs / 1000));
    if (projectile.lifeMs === 0) {
      removedIds.push(projectileId);
      return;
    }

    // Find nearest planet to the projectile for impact attribution.
    let nearestPlanet: PlanetData | undefined;
    let nearestDist = Infinity;
    for (const planet of planets) {
      const d = distance(projectile.pos, planet.center);
      if (d < nearestDist) {
        nearestDist = d;
        nearestPlanet = planet;
      }
    }

    let hit = false;
    simState.players.forEach((player) => {
      if (hit) return;
      if (player.sessionId === projectile.ownerId) return;
      if (player.movementState === PlayerMovementState.Dead) return;
      const hitDistance = cfg.movement.collisionRadius + weapon.projectileCollisionRadius;
      const impactPos = closestPointOnSegment(player.pos, startPos, projectile.pos);
      const playerHitPoint = closestPointOnPlayerCapsule(impactPos, player, planets, cfg);
      if (distance(impactPos, playerHitPoint) > hitDistance) return;

      const killed = applyDamage(player, owner, weapon.directDamage, cfg);
      if (killed) addDeathBurstPaint(simState, paintStamps, player, owner, planets, cfg);
      const splashExclusions = new Set<string>([player.sessionId]);
      applySplashDamage(
        simState,
        paintStamps,
        owner,
        projectile.ownerId,
        impactPos,
        weapon.splashRadius,
        weapon.splashDamage,
        planets,
        cfg,
        splashExclusions,
      );
      applyBlastImpulse(
        simState,
        impactPos,
        weapon.splashRadius,
        weapon.blastImpulse,
        planets,
        cfg,
      );

      // Use nearest planet so impact paint always lands on the right surface
      // regardless of which planet the shooter fired from.
      if (nearestPlanet) {
        const planetState = simState.planets.get(nearestPlanet.id);
        if (planetState) {
          const stamp = applyPaintImpact(simState, planetState, {
            planetId: nearestPlanet.id,
            pos: impactPos,
            paintGroupId: projectile.paintGroupId,
            slimeColor: projectile.slimeColor,
            patternId: projectile.patternId,
            radiusMultiplier: weapon.paintRadiusMultiplier,
          });
          if (stamp) paintStamps.push(stamp);
        }
      }
      removedIds.push(projectileId);
      hit = true;
    });

    if (!hit) {
      for (const planet of planets) {
        const impactPos = findTerrainImpactOnSegment(
          startPos,
          projectile.pos,
          planet,
          weapon.projectileCollisionRadius,
          cfg,
        );
        if (impactPos) {
          const planetState = simState.planets.get(planet.id);
          if (planetState) {
            const stamp = applyPaintImpact(simState, planetState, {
              planetId: planet.id,
              pos: impactPos,
              paintGroupId: projectile.paintGroupId,
              slimeColor: projectile.slimeColor,
              patternId: projectile.patternId,
              radiusMultiplier: weapon.paintRadiusMultiplier,
            });
            if (stamp) paintStamps.push(stamp);
          }
          applySplashDamage(
            simState,
            paintStamps,
            owner,
            projectile.ownerId,
            impactPos,
            weapon.splashRadius,
            weapon.splashDamage,
            planets,
            cfg,
            new Set<string>(),
          );
          applyBlastImpulse(
            simState,
            impactPos,
            weapon.splashRadius,
            weapon.blastImpulse,
            planets,
            cfg,
          );
          removedIds.push(projectileId);
          hit = true;
          break;
        }
      }
    }
  });

  for (const projectileId of removedIds) {
    simState.projectiles.delete(projectileId);
  }

  return paintStamps;
}

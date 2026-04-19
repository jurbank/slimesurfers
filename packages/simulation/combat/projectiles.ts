import { DEFAULT_WEAPON_ID, getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
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
    collisionRadius: number;
    projectileMuzzleHeight: number;
    maxHealth: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function closestPointOnSegment(point: Vec3Data, start: Vec3Data, end: Vec3Data): SimVec3 {
  const segment = sub(end, start);
  const segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq < 1e-8) return { x: start.x, y: start.y, z: start.z };

  const t = clamp(dot(sub(point, start), segment) / segmentLengthSq, 0, 1);
  return add(start, scale(segment, t));
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

function applyDamage(
  player: SimPlayerState,
  owner: SimPlayerState | undefined,
  damage: number,
  cfg: CombatConfig,
): void {
  if (damage <= 0 || player.movementState === PlayerMovementState.Dead) return;

  player.swimState = PlayerSwimState.None;
  player.health = Math.max(0, player.health - damage);
  if (player.health > 0) return;

  player.movementState = PlayerMovementState.Dead;
  player.respawnTimer = cfg.respawn.durationSeconds;
  player.deathCount++;
  if (owner) {
    owner.killCount++;
  }
}

function applySplashDamage(
  simState: SimMatchState,
  owner: SimPlayerState | undefined,
  ownerId: string,
  impactPos: Vec3Data,
  splashRadius: number,
  splashDamage: number,
  cfg: CombatConfig,
  excludedPlayerIds: Set<string>,
): void {
  if (splashRadius <= 0 || splashDamage <= 0) return;

  simState.players.forEach((player) => {
    if (player.sessionId === ownerId) return;
    if (player.movementState === PlayerMovementState.Dead) return;
    if (excludedPlayerIds.has(player.sessionId)) return;

    const hitDistance = splashRadius + cfg.player.collisionRadius;
    const playerDistance = distance(player.pos, impactPos);
    if (playerDistance > hitDistance) return;

    const damageScale = 1 - playerDistance / hitDistance;
    applyDamage(player, owner, Math.max(1, Math.round(splashDamage * damageScale)), cfg);
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

    const hitDistance = blastRadius + cfg.player.collisionRadius;
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
  });
}

function respawnPlayer(player: SimPlayerState, planets: PlanetData[], cfg: CombatConfig): void {
  const planet = planets.find((candidate) => candidate.id === player.spawnPlanetId) ?? planets[0];
  if (!planet) return;

  // Spawn above the terrain at the top of the planet (+Y direction)
  const spawnRadius = getTerrainRadius(0, 1, 0, cfg);
  player.pos = {
    x: planet.center.x,
    y: planet.center.y + spawnRadius + cfg.respawn.dropInHeight + cfg.player.collisionRadius,
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
  player.lastFireTimeMs = -getWeaponDefinition(getEquippedWeaponId(player)).fireCooldownMs;
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
  if (player.swimState !== PlayerSwimState.None) {
    player.swimState = PlayerSwimState.None;
  }
  if (nowMs - player.lastFireTimeMs < weapon.fireCooldownMs) return;
  if (simState.projectiles.size >= NETWORK_CONFIG.limits.maxProjectilesPerRoom) return;
  if (player.slimeLevel < weapon.slimeCost) return;

  const muzzlePos = getProjectileMuzzlePosition(player, planets, cfg);
  const aim = isFiniteVec3(input.aimPoint)
    ? normalize(sub(input.aimPoint, muzzlePos))
    : normalize(input.aimDir);
  const projectile: SimProjectileState = {
    id: `projectile-${simState.nextProjectileId++}`,
    ownerId: player.sessionId,
    weaponId: weapon.id,
    paintGroupId: player.paintGroupId,
    pos: muzzlePos,
    vel: scale(aim, weapon.projectileSpeed),
    planetId: player.planetId,
    lifeMs: weapon.projectileLifetimeMs,
    spawnTimeMs: nowMs,
  };
  simState.projectiles.set(projectile.id, projectile);
  player.slimeLevel = clamp(player.slimeLevel - weapon.slimeCost, 0, cfg.slime.maxLevel);
  player.lastFireTimeMs = nowMs;
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
      const hitDistance = cfg.player.collisionRadius + weapon.projectileCollisionRadius;
      const impactPos = closestPointOnSegment(player.pos, startPos, projectile.pos);
      if (distance(impactPos, player.pos) > hitDistance) return;

      applyDamage(player, owner, weapon.directDamage, cfg);
      const splashExclusions = new Set<string>([player.sessionId]);
      applySplashDamage(
        simState,
        owner,
        projectile.ownerId,
        impactPos,
        weapon.splashRadius,
        weapon.splashDamage,
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
            slimeColor: owner?.slimeColor ?? 0xffffff,
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
              slimeColor: owner?.slimeColor ?? 0xffffff,
              radiusMultiplier: weapon.paintRadiusMultiplier,
            });
            if (stamp) paintStamps.push(stamp);
          }
          applySplashDamage(
            simState,
            owner,
            projectile.ownerId,
            impactPos,
            weapon.splashRadius,
            weapon.splashDamage,
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

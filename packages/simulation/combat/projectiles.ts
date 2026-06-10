import { DEFAULT_WEAPON_ID, getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import { getPlayerTargetRadius } from "@splat/content/config/gameConfig.ts";

const HOMING_TURN_RATE_STANDARD = 5; // rad/s
const HOMING_TURN_RATE_GUARANTEED = 15; // rad/s
const GUARANTEED_SPEED_MULTIPLIER = 1.8;
const HITSCAN_TRAIL_STEP = 2.0; // world units between trail stamps
const HITSCAN_TRAIL_RADIUS_MULT = 0.3; // narrow trail width
import type { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import {
  InputKey,
  type InputMessage,
  type Vec3Data,
} from "@splat/protocol/network/clientMessages.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import type {
  KillEventMessage,
  SlimeStampMessage,
} from "@splat/protocol/network/serverMessages.ts";
import type { PlanetData } from "../movement/simulatedMovement.ts";
import { getSlimeAtPoint } from "../slime/slimeDetection.ts";
import { applySlimeImpact } from "../slime/stampSlime.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";
import {
  NO_TEAM_ID,
  PlayerMovementState,
  PlayerSurfState,
  type SimMatchState,
  type SimPlayerState,
  type SimProjectileState,
  type SimVec3,
} from "../match/simState.ts";
import type { SpawnSelection } from "../match/spawnSelection.ts";
import type { TerrainConfig } from "../terrain/planetTerrain.ts";

export interface CombatConfig extends TerrainConfig {
  player: {
    targetRadiusMultiplier: number;
    projectileMuzzleHeight: number;
    maxHealth: number;
  };
  movement: {
    collisionRadius: number;
    standingHeight: number;
  };
  slime: {
    maxLevel: number;
    passiveRechargePerSecond: number;
    friendlySlimeRechargePerSecond: number;
    submergedRechargePerSecond: number;
    rechargeDelayMs: number;
    smashSlimeCost: number;
  };
  slimeStamp: {
    impactStampSurfaceRadius: number;
    deathBurstStampCount: number;
    deathBurstSpreadRadius: number;
    deathBurstRadiusMultiplier: number;
    smashStampCount: number;
    smashSpreadRadius: number;
    smashMinSplatMultiplier: number;
    smashMaxSplatMultiplier: number;
    smashSpeedForFullSplat: number;
  };
  respawn: {
    durationSeconds: number;
    dropInHeight: number;
  };
}

type PendingKillEvent = Omit<KillEventMessage, "seq">;
type RecordKillEvent = (event: PendingKillEvent) => void;
type SelectRespawnPoint = (player: SimPlayerState) => SpawnSelection;

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

function fract(value: number): number {
  return value - Math.floor(value);
}

function seededUnit(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453123);
}

function areFriendly(teamA: number, teamB: number): boolean {
  return teamA !== NO_TEAM_ID && teamA === teamB;
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

function closestPointsBetweenSegments(
  startA: Vec3Data,
  endA: Vec3Data,
  startB: Vec3Data,
  endB: Vec3Data,
): { pointA: SimVec3; pointB: SimVec3 } {
  const segmentA = sub(endA, startA);
  const segmentB = sub(endB, startB);
  const betweenStarts = sub(startA, startB);
  const a = dot(segmentA, segmentA);
  const e = dot(segmentB, segmentB);
  const f = dot(segmentB, betweenStarts);

  let s = 0;
  let t = 0;

  if (a <= 1e-8 && e <= 1e-8) {
    return {
      pointA: { x: startA.x, y: startA.y, z: startA.z },
      pointB: { x: startB.x, y: startB.y, z: startB.z },
    };
  }

  if (a <= 1e-8) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(segmentA, betweenStarts);
    if (e <= 1e-8) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(segmentA, segmentB);
      const denom = a * e - b * b;
      if (Math.abs(denom) > 1e-8) {
        s = clamp((b * f - c * e) / denom, 0, 1);
      }

      const tNumerator = b * s + f;
      if (tNumerator <= 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (tNumerator >= e) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      } else {
        t = tNumerator / e;
      }
    }
  }

  return {
    pointA: add(startA, scale(segmentA, s)),
    pointB: add(startB, scale(segmentB, t)),
  };
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

function getPlayerCapsuleSegment(
  player: SimPlayerState,
  planets: PlanetData[],
  cfg: CombatConfig,
): { bottom: SimVec3; top: SimVec3 } {
  const planet = getPlayerPlanet(player, planets);
  if (!planet) {
    return {
      bottom: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      top: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    };
  }

  const up = normalize(sub(player.pos, planet.center));
  return {
    bottom: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
    top: add(player.pos, scale(up, cfg.player.projectileMuzzleHeight)),
  };
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

function makePerpendicularBasis(direction: Vec3Data): { tangentA: SimVec3; tangentB: SimVec3 } {
  const reference = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentA = normalize(cross(reference, direction));
  const tangentB = normalize(cross(direction, tangentA));
  return { tangentA, tangentB };
}

function resetWeaponTrigger(player: SimPlayerState): void {
  player.weaponTriggerHeldSinceMs = -1;
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

function applyImpactSlime(
  simState: SimMatchState,
  slimeStamps: SlimeStampMessage[],
  planetId: string | undefined,
  impactPos: Vec3Data,
  player: SimPlayerState,
  radiusMultiplier: number,
): void {
  if (!planetId) return;
  const planetState = simState.planets.get(planetId);
  if (!planetState) return;
  const stamp = applySlimeImpact(simState, planetState, {
    planetId,
    pos: impactPos,
    slimeGroupId: player.slimeGroupId,
    slimeColor: player.slimeColor,
    patternId: player.patternId,
    radiusMultiplier,
  });
  if (stamp) slimeStamps.push(stamp);
}

function getSlimeRechargeRate(
  simState: SimMatchState,
  player: SimPlayerState,
  cfg: CombatConfig,
): number {
  if (player.planetId === "") {
    return cfg.slime.passiveRechargePerSecond;
  }

  const slime = getSlimeAtPoint(player.pos, player.planetId, simState.planets, simState.planetDefs);
  const onFriendlySlime = slime?.slimeGroupId === player.slimeGroupId;
  if (!onFriendlySlime) {
    return cfg.slime.passiveRechargePerSecond;
  }

  return player.surfState !== PlayerSurfState.None
    ? cfg.slime.submergedRechargePerSecond
    : cfg.slime.friendlySlimeRechargePerSecond;
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

function applyProjectileGravity(
  projectile: SimProjectileState,
  gravity: number | undefined,
  dtSeconds: number,
  planets: PlanetData[],
): void {
  if (!gravity || gravity <= 0 || dtSeconds <= 0) return;
  const planet = getNearestPlanet(projectile.pos, planets);
  if (!planet) return;
  const gravityDir = normalize(sub(planet.center, projectile.pos));
  assign(projectile.vel, add(projectile.vel, scale(gravityDir, gravity * dtSeconds)));
}

function getPlayerPlanet(player: SimPlayerState, planets: PlanetData[]): PlanetData | undefined {
  return (
    planets.find((planet) => planet.id === player.planetId) ?? getNearestPlanet(player.pos, planets)
  );
}

function addDeathBurstSlime(
  simState: SimMatchState,
  slimeStamps: SlimeStampMessage[],
  defeated: SimPlayerState,
  owner: SimPlayerState | undefined,
  planets: PlanetData[],
  cfg: CombatConfig,
): void {
  if (!owner || cfg.slimeStamp.deathBurstStampCount <= 0) return;

  const planet = getPlayerPlanet(defeated, planets);
  if (!planet) return;

  const planetState = simState.planets.get(planet.id);
  if (!planetState) return;

  const fromCenter = sub(defeated.pos, planet.center);
  const normal = normalize(fromCenter);
  const tangentSeed = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangentA = normalize(cross(tangentSeed, normal));
  const tangentB = normalize(cross(normal, tangentA));
  const count = Math.floor(cfg.slimeStamp.deathBurstStampCount);

  for (let i = 0; i < count; i++) {
    const isCenter = i === 0;
    const angle = (i / Math.max(1, count - 1)) * Math.PI * 2;
    const spread = isCenter ? 0 : cfg.slimeStamp.deathBurstSpreadRadius;
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
    const stamp = applySlimeImpact(simState, planetState, {
      planetId: planet.id,
      pos: add(planet.center, scale(surfaceDir, surfaceRadius)),
      slimeGroupId: owner.slimeGroupId,
      slimeColor: owner.slimeColor,
      patternId: owner.patternId,
      radiusMultiplier: cfg.slimeStamp.deathBurstRadiusMultiplier,
    });
    if (stamp) slimeStamps.push(stamp);
  }
}

function applyDamage(
  player: SimPlayerState,
  owner: SimPlayerState | undefined,
  damage: number,
  cfg: CombatConfig,
  weaponId: WeaponId | undefined,
  recordKillEvent?: RecordKillEvent,
): boolean {
  if (damage <= 0 || player.movementState === PlayerMovementState.Dead) return false;

  player.health = Math.max(0, player.health - damage);
  if (player.health > 0) return false;

  clearSurfMode(player);
  player.movementState = PlayerMovementState.Dead;
  player.respawnTimer = cfg.respawn.durationSeconds;
  player.deathCount++;
  if (owner) {
    owner.killCount++;
  }
  recordKillEvent?.({
    killerSessionId: owner?.sessionId,
    killerName: owner?.name,
    killerSlimeColor: owner?.slimeColor,
    killerPatternId: owner?.patternId,
    victimSessionId: player.sessionId,
    victimName: player.name,
    victimSlimeColor: player.slimeColor,
    victimPatternId: player.patternId,
    weaponId,
    isSelfKill: owner?.sessionId === player.sessionId,
  });
  return true;
}

function clearSurfMode(player: SimPlayerState): void {
  player.surfState = PlayerSurfState.None;
  player.isCarving = false;
  player.skiJumpCharge = 0;
}

function applySplashDamage(
  simState: SimMatchState,
  slimeStamps: SlimeStampMessage[],
  owner: SimPlayerState | undefined,
  ownerId: string,
  ownerTeamId: number,
  impactPos: Vec3Data,
  splashRadius: number,
  splashDamage: number,
  planets: PlanetData[],
  cfg: CombatConfig,
  excludedPlayerIds: Set<string>,
  weaponId: WeaponId | undefined,
  recordKillEvent?: RecordKillEvent,
): void {
  if (splashRadius <= 0 || splashDamage <= 0) return;

  simState.players.forEach((player) => {
    if (player.sessionId === ownerId) return;
    if (player.movementState === PlayerMovementState.Dead) return;
    if (excludedPlayerIds.has(player.sessionId)) return;
    if (areFriendly(ownerTeamId, player.teamId)) return;

    const hitDistance = splashRadius + cfg.movement.collisionRadius;
    const playerDistance = distance(player.pos, impactPos);
    if (playerDistance > hitDistance) return;

    const damageScale = 1 - playerDistance / hitDistance;
    const killed = applyDamage(
      player,
      owner,
      Math.max(1, Math.round(splashDamage * damageScale)),
      cfg,
      weaponId,
      recordKillEvent,
    );
    if (killed) addDeathBurstSlime(simState, slimeStamps, player, owner, planets, cfg);
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
  });
}

function respawnPlayer(
  player: SimPlayerState,
  planets: PlanetData[],
  cfg: CombatConfig,
  selectRespawnPoint?: SelectRespawnPoint,
): void {
  const selectedSpawn = selectRespawnPoint?.(player);
  const planetId = selectedSpawn?.planetId ?? player.spawnPlanetId;
  const planet = planets.find((candidate) => candidate.id === planetId) ?? planets[0];
  if (!planet) return;

  const spawnNormal = selectedSpawn?.normal ?? player.spawnNormal ?? { x: 0, y: 1, z: 0 };
  const surfaceRadius = selectedSpawn
    ? distance(selectedSpawn.surfacePos, planet.center)
    : getTerrainRadius(spawnNormal.x, spawnNormal.y, spawnNormal.z, cfg) +
      cfg.movement.standingHeight;
  const dropInRadius = surfaceRadius + cfg.respawn.dropInHeight + cfg.movement.collisionRadius;
  player.pos = {
    x: planet.center.x + spawnNormal.x * dropInRadius,
    y: planet.center.y + spawnNormal.y * dropInRadius,
    z: planet.center.z + spawnNormal.z * dropInRadius,
  };
  player.vel = { x: 0, y: 0, z: 0 };
  player.rot = { x: 0, y: 0, z: 0, w: 1 };
  player.planetId = planet.id;
  player.gravityAnchorPlanetId = planet.id;
  player.loadedPadId = "";
  player.padLoadProgress = 0;
  player.padChargeProgress = 0;
  player.padCancelArmed = false;
  player.spawnPlanetId = planet.id;
  player.spawnNormal = { ...spawnNormal };
  player.health = cfg.player.maxHealth;
  player.slimeLevel = cfg.slime.maxLevel;
  player.respawnTimer = 0;
  player.movementState = PlayerMovementState.Idle;
  player.surfState = PlayerSurfState.SurfingVisible;
  player.isCarving = false;
  player.equippedWeaponId = DEFAULT_WEAPON_ID;
  player.disposableShotsRemaining = 0;
  player.lastFireTimeMs = -getWeaponDefinition(DEFAULT_WEAPON_ID).fireCooldownMs;
  player.weaponTriggerHeldSinceMs = -1;
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
  recordKillEvent?: RecordKillEvent,
  cfgForPlanet?: (planetId: string) => CombatConfig | undefined,
): SlimeStampMessage[] {
  const slimeStamps: SlimeStampMessage[] = [];
  if ((input.keys & InputKey.Fire) === 0) {
    resetWeaponTrigger(player);
    return slimeStamps;
  }
  if (player.movementState === PlayerMovementState.Dead) {
    resetWeaponTrigger(player);
    return slimeStamps;
  }
  const weapon = getWeaponDefinition(getEquippedWeaponId(player));
  if (weapon.behavior === "sprayHitscan") {
    if (player.weaponTriggerHeldSinceMs < 0) {
      player.weaponTriggerHeldSinceMs = nowMs;
    }
    if (nowMs - player.weaponTriggerHeldSinceMs < (weapon.spinUpMs ?? 0)) return slimeStamps;
    if (nowMs - player.lastFireTimeMs < weapon.fireCooldownMs) return slimeStamps;

    const muzzlePos = getProjectileMuzzlePosition(player, planets, cfg);
    const aimDir = isFiniteVec3(input.aimPoint)
      ? normalize(sub(input.aimPoint, muzzlePos))
      : normalize(input.aimDir);
    const { tangentA, tangentB } = makePerpendicularBasis(aimDir);
    const spreadScale = Math.tan(((weapon.sprayConeHalfAngleDeg ?? 0) * Math.PI) / 180);
    const spreadSeed = input.seq * 73856093 + player.slimeGroupId * 19349663 + nowMs * 83492791;
    const radius = Math.sqrt(seededUnit(spreadSeed + 1)) * spreadScale;
    const angle = seededUnit(spreadSeed + 2) * Math.PI * 2;
    const spreadDir = normalize(
      add(
        aimDir,
        add(scale(tangentA, Math.cos(angle) * radius), scale(tangentB, Math.sin(angle) * radius)),
      ),
    );
    const sprayEnd = add(muzzlePos, scale(spreadDir, weapon.sprayRange ?? 0));
    const owner = simState.players.get(player.sessionId);

    let bestPlayer:
      | { impactPos: SimVec3; player: SimPlayerState; distance: number; planetId?: string }
      | undefined;
    simState.players.forEach((target) => {
      if (target.sessionId === player.sessionId) return;
      if (target.movementState === PlayerMovementState.Dead) return;
      if (areFriendly(player.teamId, target.teamId)) return;
      const capsule = getPlayerCapsuleSegment(target, planets, cfg);
      const { pointA: impactPos, pointB: playerHitPoint } = closestPointsBetweenSegments(
        muzzlePos,
        sprayEnd,
        capsule.bottom,
        capsule.top,
      );
      if (distance(impactPos, playerHitPoint) > getPlayerTargetRadius(cfg)) return;
      const hitDistance = distance(muzzlePos, impactPos);
      if (bestPlayer && hitDistance >= bestPlayer.distance) return;
      bestPlayer = {
        impactPos,
        player: target,
        distance: hitDistance,
        planetId: getNearestPlanet(playerHitPoint, planets)?.id,
      };
    });

    let bestTerrain: { impactPos: SimVec3; distance: number; planetId: string } | undefined;
    for (const planet of planets) {
      const planetCfg = cfgForPlanet?.(planet.id) ?? cfg;
      const impactPos = findTerrainImpactOnSegment(muzzlePos, sprayEnd, planet, 0, planetCfg);
      if (!impactPos) continue;
      const hitDistance = distance(muzzlePos, impactPos);
      if (bestTerrain && hitDistance >= bestTerrain.distance) continue;
      bestTerrain = { impactPos, distance: hitDistance, planetId: planet.id };
    }

    if (bestPlayer && (!bestTerrain || bestPlayer.distance <= bestTerrain.distance)) {
      const killed = applyDamage(
        bestPlayer.player,
        owner,
        weapon.directDamage,
        cfg,
        weapon.id,
        recordKillEvent,
      );
      if (killed) addDeathBurstSlime(simState, slimeStamps, bestPlayer.player, owner, planets, cfg);
      applyImpactSlime(
        simState,
        slimeStamps,
        bestPlayer.planetId,
        bestPlayer.impactPos,
        player,
        weapon.slimeRadiusMultiplier,
      );
    } else if (bestTerrain) {
      applyImpactSlime(
        simState,
        slimeStamps,
        bestTerrain.planetId,
        bestTerrain.impactPos,
        player,
        weapon.slimeRadiusMultiplier,
      );
    }

    player.lastFireTimeMs = nowMs;
    if (weapon.disposableShots !== undefined) {
      player.disposableShotsRemaining = Math.max(0, player.disposableShotsRemaining - 1);
      if (player.disposableShotsRemaining === 0) {
        player.equippedWeaponId = DEFAULT_WEAPON_ID;
        resetWeaponTrigger(player);
      }
    }
    return slimeStamps;
  }

  resetWeaponTrigger(player);
  if (weapon.behavior !== "projectile") return slimeStamps;
  if (nowMs - player.lastFireTimeMs < weapon.fireCooldownMs) return slimeStamps;
  if (simState.projectiles.size >= NETWORK_CONFIG.limits.maxProjectilesPerRoom) return slimeStamps;
  if (player.slimeLevel < weapon.slimeCost) return slimeStamps;

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
    ownerTeamId: player.teamId,
    weaponId: weapon.id,
    slimeGroupId: player.slimeGroupId,
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
      resetWeaponTrigger(player);
    }
  }
  return slimeStamps;
}

export function tickProjectiles(
  simState: SimMatchState,
  dtMs: number,
  planets: PlanetData[],
  cfg: CombatConfig,
  selectRespawnPoint?: SelectRespawnPoint,
  recordKillEvent?: RecordKillEvent,
  cfgForPlanet?: (planetId: string) => CombatConfig | undefined,
): SlimeStampMessage[] {
  const slimeStamps: SlimeStampMessage[] = [];
  simState.players.forEach((player) => {
    if (player.movementState !== PlayerMovementState.Dead) return;
    player.respawnTimer = Math.max(0, player.respawnTimer - dtMs / 1000);
    if (player.respawnTimer === 0) {
      respawnPlayer(player, planets, cfg, selectRespawnPoint);
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

    applyProjectileGravity(projectile, weapon.projectileGravity, projectileDtMs / 1000, planets);
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
      if (areFriendly(projectile.ownerTeamId ?? NO_TEAM_ID, player.teamId)) return;
      const hitDistance = cfg.movement.collisionRadius + weapon.projectileCollisionRadius;
      const impactPos = closestPointOnSegment(player.pos, startPos, projectile.pos);
      const playerHitPoint = closestPointOnPlayerCapsule(impactPos, player, planets, cfg);
      if (distance(impactPos, playerHitPoint) > hitDistance) return;

      const killed = applyDamage(
        player,
        owner,
        weapon.directDamage,
        cfg,
        weapon.id,
        recordKillEvent,
      );
      if (killed) addDeathBurstSlime(simState, slimeStamps, player, owner, planets, cfg);
      const splashExclusions = new Set<string>([player.sessionId]);
      applySplashDamage(
        simState,
        slimeStamps,
        owner,
        projectile.ownerId,
        projectile.ownerTeamId ?? NO_TEAM_ID,
        impactPos,
        weapon.splashRadius,
        weapon.splashDamage,
        planets,
        cfg,
        splashExclusions,
        weapon.id,
        recordKillEvent,
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
          const stamp = applySlimeImpact(simState, planetState, {
            planetId: nearestPlanet.id,
            pos: impactPos,
            slimeGroupId: projectile.slimeGroupId,
            slimeColor: projectile.slimeColor,
            patternId: projectile.patternId,
            radiusMultiplier: weapon.slimeRadiusMultiplier,
          });
          if (stamp) slimeStamps.push(stamp);
        }
      }
      removedIds.push(projectileId);
      hit = true;
    });

    if (!hit) {
      for (const planet of planets) {
        const planetCfg = cfgForPlanet?.(planet.id) ?? cfg;
        const impactPos = findTerrainImpactOnSegment(
          startPos,
          projectile.pos,
          planet,
          weapon.projectileCollisionRadius,
          planetCfg,
        );
        if (impactPos) {
          const planetState = simState.planets.get(planet.id);
          if (planetState) {
            const stamp = applySlimeImpact(simState, planetState, {
              planetId: planet.id,
              pos: impactPos,
              slimeGroupId: projectile.slimeGroupId,
              slimeColor: projectile.slimeColor,
              patternId: projectile.patternId,
              radiusMultiplier: weapon.slimeRadiusMultiplier,
            });
            if (stamp) slimeStamps.push(stamp);
          }
          applySplashDamage(
            simState,
            slimeStamps,
            owner,
            projectile.ownerId,
            projectile.ownerTeamId ?? NO_TEAM_ID,
            impactPos,
            weapon.splashRadius,
            weapon.splashDamage,
            planets,
            cfg,
            new Set<string>(),
            weapon.id,
            recordKillEvent,
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

  return slimeStamps;
}

export function tryFireHitscan(
  simState: SimMatchState,
  player: SimPlayerState,
  input: InputMessage,
  nowMs: number,
  planets: PlanetData[],
  cfg: CombatConfig,
  recordKillEvent?: RecordKillEvent,
  cfgForPlanet?: (planetId: string) => CombatConfig | undefined,
): SlimeStampMessage[] {
  const slimeStamps: SlimeStampMessage[] = [];
  if ((input.keys & InputKey.Fire) === 0) return slimeStamps;
  if (player.movementState === PlayerMovementState.Dead) return slimeStamps;
  const weapon = getWeaponDefinition(getEquippedWeaponId(player));
  if (weapon.behavior !== "chargedHitscan") return slimeStamps;
  if (weapon.hitscanConeHalfAngleDeg === undefined) return slimeStamps;
  if (nowMs - player.lastFireTimeMs < weapon.fireCooldownMs) return slimeStamps;

  const muzzlePos = getProjectileMuzzlePosition(player, planets, cfg);
  const aimDir = isFiniteVec3(input.aimPoint)
    ? normalize(sub(input.aimPoint, muzzlePos))
    : normalize(input.aimDir);

  const cosHalfAngle = Math.cos((weapon.hitscanConeHalfAngleDeg * Math.PI) / 180);
  const owner = simState.players.get(player.sessionId);

  simState.players.forEach((target) => {
    if (target.sessionId === player.sessionId) return;
    if (target.movementState === PlayerMovementState.Dead) return;
    if (areFriendly(player.teamId, target.teamId)) return;

    const toTarget = sub(target.pos, muzzlePos);
    const dist = length(toTarget);
    if (dist < 1e-8) return;
    if (dot(scale(toTarget, 1 / dist), aimDir) < cosHalfAngle) return;

    const nearestPlanet = getNearestPlanet(muzzlePos, planets);
    if (
      nearestPlanet &&
      findTerrainImpactOnSegment(
        muzzlePos,
        target.pos,
        nearestPlanet,
        0,
        cfgForPlanet?.(nearestPlanet.id) ?? cfg,
      )
    )
      return;

    const killed = applyDamage(target, owner, weapon.directDamage, cfg, weapon.id, recordKillEvent);
    if (killed) addDeathBurstSlime(simState, slimeStamps, target, owner, planets, cfg);

    const planet = getNearestPlanet(target.pos, planets);
    if (planet) {
      const planetState = simState.planets.get(planet.id);
      if (planetState) {
        const stamp = applySlimeImpact(simState, planetState, {
          planetId: planet.id,
          pos: target.pos,
          slimeGroupId: player.slimeGroupId,
          slimeColor: player.slimeColor,
          patternId: player.patternId,
          radiusMultiplier: weapon.slimeRadiusMultiplier,
        });
        if (stamp) slimeStamps.push(stamp);
      }
    }
  });

  // Trail: march from muzzle along the aim ray, projecting each sample radially onto the
  // terrain surface. Works whether or not the beam hits terrain — the surface projection
  // paints the "shadow" of the beam path on the ground.
  const chargeP = Math.max(0, Math.min(1, input.chargeProgress ?? 1));
  const trailMinDist = weapon.hitscanTrailMinDist ?? 20;
  const trailMaxDist = weapon.hitscanTrailMaxDist ?? 80;
  const trailDist = trailMinDist + chargeP * (trailMaxDist - trailMinDist);
  const trailRayEnd = add(muzzlePos, scale(aimDir, trailDist));
  let trailEnd = trailRayEnd;
  let trailPlanet: PlanetData | undefined;
  for (const planet of planets) {
    const planetCfg = cfgForPlanet?.(planet.id) ?? cfg;
    const impactPos = findTerrainImpactOnSegment(muzzlePos, trailRayEnd, planet, 0, planetCfg);
    if (impactPos) {
      trailEnd = impactPos;
      trailPlanet = planet;
      break;
    }
  }
  if (!trailPlanet) trailPlanet = getNearestPlanet(muzzlePos, planets);

  if (trailPlanet) {
    const trailVec = sub(trailEnd, muzzlePos);
    const trailLen = length(trailVec);
    const planetState = simState.planets.get(trailPlanet.id);
    if (trailLen >= 1e-8 && planetState) {
      const trailDir = scale(trailVec, 1 / trailLen);
      const steps = Math.ceil(trailLen / HITSCAN_TRAIL_STEP);
      for (let i = 0; i <= steps; i++) {
        const d = Math.min(i * HITSCAN_TRAIL_STEP, trailLen);
        const samplePos = add(muzzlePos, scale(trailDir, d));
        const fromCenter = sub(samplePos, trailPlanet.center);
        const fromCenterLen = length(fromCenter);
        if (fromCenterLen < 1e-8) continue;
        const normal = scale(fromCenter, 1 / fromCenterLen);
        const surfacePos = add(
          trailPlanet.center,
          scale(normal, getTerrainRadius(normal.x, normal.y, normal.z, cfg)),
        );
        const stamp = applySlimeImpact(simState, planetState, {
          planetId: trailPlanet.id,
          pos: surfacePos,
          slimeGroupId: player.slimeGroupId,
          slimeColor: player.slimeColor,
          patternId: player.patternId,
          radiusMultiplier: HITSCAN_TRAIL_RADIUS_MULT,
        });
        if (stamp) slimeStamps.push(stamp);
      }
    }
  }

  player.lastFireTimeMs = nowMs;
  if (weapon.disposableShots !== undefined) {
    player.disposableShotsRemaining = Math.max(0, player.disposableShotsRemaining - 1);
    if (player.disposableShotsRemaining === 0) {
      player.equippedWeaponId = DEFAULT_WEAPON_ID;
      resetWeaponTrigger(player);
    }
  }

  return slimeStamps;
}

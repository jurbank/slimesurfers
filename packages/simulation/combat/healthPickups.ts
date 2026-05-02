import type { RuntimeMapPlanet } from "@splat/content/map/runtimeMapData.ts";
import {
  PlayerMovementState,
  type SimMatchState,
  type SimPlayerState,
  type SimHealthPickupState,
} from "../match/simState.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

interface HealthPickupConfig {
  planet: { radius: number };
  pickups: { collectRadius: number; hoverHeight: number };
  movement: { collisionRadius: number };
  player: { maxHealth: number };
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

const HEALTH_PICKUP_RESPAWN_SECONDS = 20;

const HEALTH_PICKUP_SPAWNS = [
  { id: "health-east", planetId: "planet-0", normal: { x: 0.71, y: 0.0, z: -0.71 } },
  { id: "health-west", planetId: "planet-0", normal: { x: -0.71, y: 0.0, z: 0.71 } },
] as const;

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

function distanceSquared(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function createHealthPickups(
  cfg: HealthPickupConfig,
  planetDefs: RuntimeMapPlanet[],
): Map<string, SimHealthPickupState> {
  return new Map(
    HEALTH_PICKUP_SPAWNS.map((spawn) => {
      const planet = planetDefs.find((entry) => entry.id === spawn.planetId) ?? planetDefs[0]!;
      const normal = normalize(spawn.normal.x, spawn.normal.y, spawn.normal.z);
      const terrainRadius = getTerrainRadius(normal.x, normal.y, normal.z, cfg);
      return [
        spawn.id,
        {
          id: spawn.id,
          planetId: spawn.planetId,
          normal,
          pos: {
            x: planet.center.x + normal.x * (terrainRadius + cfg.pickups.hoverHeight),
            y: planet.center.y + normal.y * (terrainRadius + cfg.pickups.hoverHeight),
            z: planet.center.z + normal.z * (terrainRadius + cfg.pickups.hoverHeight),
          },
          respawnTimer: 0,
          respawnDurationSeconds: HEALTH_PICKUP_RESPAWN_SECONDS,
          active: true,
        } satisfies SimHealthPickupState,
      ];
    }),
  );
}

export function tickHealthPickups(simState: SimMatchState, dtSeconds: number): void {
  simState.healthPickups.forEach((pickup) => {
    if (pickup.active || pickup.respawnTimer <= 0) return;
    pickup.respawnTimer = Math.max(0, pickup.respawnTimer - dtSeconds);
    if (pickup.respawnTimer === 0) {
      pickup.active = true;
    }
  });
}

export function collectHealthPickup(
  simState: SimMatchState,
  player: SimPlayerState,
  cfg: HealthPickupConfig,
): void {
  if (player.movementState === PlayerMovementState.Dead) return;
  if (player.health >= cfg.player.maxHealth) return;

  const collectDistance = cfg.pickups.collectRadius + cfg.movement.collisionRadius;
  const collectDistanceSq = collectDistance * collectDistance;

  simState.healthPickups.forEach((pickup) => {
    if (!pickup.active) return;
    if (pickup.planetId !== player.planetId) return;
    if (distanceSquared(player.pos, pickup.pos) > collectDistanceSq) return;

    player.health = cfg.player.maxHealth;
    pickup.active = false;
    pickup.respawnTimer = pickup.respawnDurationSeconds;
  });
}

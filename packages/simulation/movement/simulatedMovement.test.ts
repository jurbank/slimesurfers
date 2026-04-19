import { PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { describe, expect, it } from "vite-plus/test";
import { stepPlayer, type PlanetData, type PlayerPhysics } from "./simulatedMovement.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import {
  PlayerMovementState,
  PlayerSwimState,
  type SimPlanetPaintState,
} from "@splat/simulation/match/simState.ts";
import { createStampBuckets } from "@splat/simulation/paint/paintDetection.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

const TEST_PLANETS: PlanetData[] = [
  {
    id: "planet-0",
    center: { x: PLANET_POSITIONS[0]!.x, y: PLANET_POSITIONS[0]!.y, z: PLANET_POSITIONS[0]!.z },
    radius: 50,
  },
];
const EMPTY_PAINT = new Map<string, SimPlanetPaintState>();

const TEST_CONFIG = {
  planet: {
    radius: 50,
    gravityAcceleration: 20,
    surfaceSnapDistance: 0.6,
    arenaReturnDistance: 90,
    arenaReturnAcceleration: 15,
  },
  player: {
    moveSpeed: 8,
    jumpImpulse: 18,
    collisionRadius: 0.5,
    standingHeight: 1.0,
  },
  paint: {
    friendlySpeedMultiplier: 1.8,
    enemySpeedMultiplier: 0.3,
    swimSpeedMultiplier: 2.4,
    swimDisturbanceMinSpeed: 1.5,
  },
  terrain: {
    seed: 42,
    baseAmplitude: 6.0,
    frequency: 0.8,
    octaves: 4,
    lacunarity: 2.0,
    persistence: 0.5,
    waterLevel: -1.5,
    snowLevel: 4.0,
    sandBand: 0.5,
    rockLevel: 3.0,
  },
} as const;

function createInput(keys = 0): InputMessage {
  return {
    seq: 1,
    keys,
    aimDir: { x: 0, y: 0, z: 1 },
    dt: 0.05,
  };
}

function createPlayer(): PlayerPhysics {
  const surfaceRadius = getTerrainRadius(0, 1, 0, TEST_CONFIG);
  return {
    pos: {
      x: TEST_PLANETS[0]!.center.x,
      y: TEST_PLANETS[0]!.center.y + surfaceRadius + TEST_CONFIG.player.standingHeight,
      z: TEST_PLANETS[0]!.center.z,
    },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: "planet-0",
    paintGroupId: 1,
    movementState: PlayerMovementState.Idle,
    swimState: PlayerSwimState.None,
  };
}

function createPaintMap(paintGroupId: number): Map<string, SimPlanetPaintState> {
  const paint = new Map<string, SimPlanetPaintState>([
    [
      "planet-0",
      {
        planetId: "planet-0",
        territoryRows: 1,
        territoryCols: 1,
        cells: [],
        stamps: [
          {
            paintGroupId,
            color: 0xffffff,
            nx: 0,
            ny: 1,
            nz: 0,
            radius: 0.04,
            seq: 1,
          },
        ],
        stampBuckets: createStampBuckets(1, 1),
      },
    ],
  ]);
  paint.get("planet-0")!.stampBuckets[0] = [...paint.get("planet-0")!.stamps];
  return paint;
}

function forwardFromRot(rot: PlayerPhysics["rot"]): { x: number; y: number; z: number } {
  const { x: qx, y: qy, z: qz, w: qw } = rot;
  const x = 0;
  const y = 0;
  const z = 1;
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

describe("stepPlayer", () => {
  it("moves a grounded player along the planet surface", () => {
    const player = createPlayer();

    stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    const dx = player.pos.x - TEST_PLANETS[0]!.center.x;
    const dy = player.pos.y - TEST_PLANETS[0]!.center.y;
    const dz = player.pos.z - TEST_PLANETS[0]!.center.z;
    const dist = Math.hypot(dx, dy, dz);
    const norm = { x: dx / dist, y: dy / dist, z: dz / dist };
    const expectedRadius =
      getTerrainRadius(norm.x, norm.y, norm.z, TEST_CONFIG) + TEST_CONFIG.player.standingHeight;

    expect(player.movementState).toBe(PlayerMovementState.Moving);
    expect(dist).toBeCloseTo(expectedRadius, 4);
    expect(player.pos.z).toBeGreaterThan(0);
  });

  it("launches a grounded player into airborne state on jump", () => {
    const player = createPlayer();

    stepPlayer(player, createInput(InputKey.Jump), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.y).toBeGreaterThan(0);
  });

  it("updates airborne facing from aim input before landing", () => {
    const player = createPlayer();

    stepPlayer(player, createInput(InputKey.Jump), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);
    stepPlayer(
      player,
      {
        seq: 2,
        keys: 0,
        aimDir: { x: 1, y: 0, z: 0 },
        dt: 0.05,
      },
      0.05,
      TEST_PLANETS,
      TEST_CONFIG,
      EMPTY_PAINT,
    );

    const forward = forwardFromRot(player.rot);

    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(forward.x).toBeGreaterThan(0.9);
    expect(Math.abs(forward.z)).toBeLessThan(0.2);
  });

  it("applies the friendly paint speed multiplier from config", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeCloseTo(
      TEST_CONFIG.player.moveSpeed * TEST_CONFIG.paint.friendlySpeedMultiplier,
      5,
    );
  });

  it("enters swim-moving state on friendly paint when submerge is toggled", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );

    expect(player.swimState).toBe(PlayerSwimState.SwimmingMoving);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeCloseTo(
      TEST_CONFIG.player.moveSpeed * TEST_CONFIG.paint.swimSpeedMultiplier,
      5,
    );
  });

  it("becomes fully hidden when submerged and stationary", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.SwimmingHidden);
    expect(player.movementState).toBe(PlayerMovementState.Idle);
  });

  it("stays submerged after the toggle input is released", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.SwimmingHidden);
  });

  it("exits swim when submerge is toggled again", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.None);
  });

  it("does not allow swimming on enemy paint", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId + 1);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );

    expect(player.swimState).toBe(PlayerSwimState.None);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeCloseTo(
      TEST_CONFIG.player.moveSpeed * TEST_CONFIG.paint.enemySpeedMultiplier,
      5,
    );
  });

  it("jumping while submerged pops out and launches airborne", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Jump | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );
    stepPlayer(player, createInput(InputKey.Jump), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("");
    expect(player.swimState).toBe(PlayerSwimState.None);
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.y).toBeGreaterThan(0);
  });
});

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
  },
  movement: {
    gravityAcceleration: 20,
    surfaceSnapDistance: 0.6,
    arenaReturnDistance: 90,
    arenaReturnAcceleration: 15,
    moveSpeed: 8,
    jumpImpulse: 18,
    boostAcceleration: 24,
    airBoostAcceleration: 10,
    anchorGravityMultiplier: 2.6,
    collisionRadius: 0.5,
    standingHeight: 1.0,
    enemySpeedMultiplier: 0.7,
    swimSpeedMultiplier: 2.4,
    swimDisturbanceMinSpeed: 1.5,
    waterSkiSpeedMultiplier: 2.8,
    waterSkiFriction: 0.6,
    waterSkiLateralDrag: 4.0,
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
      y: TEST_PLANETS[0]!.center.y + surfaceRadius + TEST_CONFIG.movement.standingHeight,
      z: TEST_PLANETS[0]!.center.z,
    },
    vel: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: "planet-0",
    paintGroupId: 1,
    movementState: PlayerMovementState.Idle,
    swimState: PlayerSwimState.None,
    isCarving: false,
    skiJumpCharge: 0,
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
            radius: 1,
            seq: 1,
            patternId: 0,
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
      getTerrainRadius(norm.x, norm.y, norm.z, TEST_CONFIG) + TEST_CONFIG.movement.standingHeight;

    expect(player.movementState).toBe(PlayerMovementState.Moving);
    expect(dist).toBeCloseTo(expectedRadius, 3);
    expect(player.pos.z).toBeGreaterThan(0);
  });

  it("jumps with space outside ski mode", () => {
    const player = createPlayer();

    stepPlayer(player, createInput(InputKey.Anchor), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.y).toBeGreaterThan(TEST_CONFIG.movement.jumpImpulse * 0.8);
    expect(player.swimState).toBe(PlayerSwimState.None);
  });

  it("carries normal movement input into a jump", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Anchor),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.z).toBeGreaterThan(0);
  });

  it("accelerates forward faster in ski mode when holding forward and anchor together", () => {
    const normalPlayer = createPlayer();
    const boostedPlayer = createPlayer();
    const paint = createPaintMap(boostedPlayer.paintGroupId);

    stepPlayer(normalPlayer, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    // Enter ski mode then ramp up with carving — needs several steps to surpass normal speed
    stepPlayer(boostedPlayer, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    for (let i = 0; i < 10; i++) {
      stepPlayer(
        boostedPlayer,
        createInput(InputKey.Forward | InputKey.Anchor),
        0.1,
        TEST_PLANETS,
        TEST_CONFIG,
        paint,
      );
    }

    expect(boostedPlayer.planetId).toBe("planet-0");
    expect(boostedPlayer.swimState).toBe(PlayerSwimState.SwimmingMoving);
    expect(
      Math.hypot(boostedPlayer.vel.x, boostedPlayer.vel.y, boostedPlayer.vel.z),
    ).toBeGreaterThan(Math.hypot(normalPlayer.vel.x, normalPlayer.vel.y, normalPlayer.vel.z));
  });

  it("jumps instead of applying anchor boost on neutral ground", () => {
    const player = createPlayer();

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Anchor),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      EMPTY_PAINT,
    );

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.z).toBeGreaterThan(0);
  });

  it("keeps normal grounded movement from launching off stored upward velocity", () => {
    const player = createPlayer();
    player.vel.y = 20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("planet-0");
    expect(player.movementState).toBe(PlayerMovementState.Idle);
    expect(player.swimState).toBe(PlayerSwimState.None);
  });

  it("lets ski traversal leave the surface when the free path rises beyond snap distance", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    player.vel.y = 20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.swimState).toBe(PlayerSwimState.SwimmingHidden);
  });

  it("keeps ski mode when landing back on slime after becoming airborne", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.swimState = PlayerSwimState.SwimmingMoving;
    player.pos.y += 1;
    player.vel.y = -20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("planet-0");
    expect(player.swimState).not.toBe(PlayerSwimState.None);
  });

  it("clears ski mode after landing on neutral ground", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.swimState = PlayerSwimState.SwimmingMoving;
    player.pos.y += 1;
    player.vel.y = -20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("planet-0");
    expect(player.swimState).toBe(PlayerSwimState.None);
  });

  it("keeps upward stored velocity grounded in normal mode without jump input", () => {
    const player = createPlayer();
    player.vel.y = 20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("planet-0");
    expect(player.movementState).not.toBe(PlayerMovementState.Airborne);
    expect(player.swimState).toBe(PlayerSwimState.None);
  });

  it("stops tangent velocity in normal mode without movement input", () => {
    const player = createPlayer();
    player.vel.z = 12;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("planet-0");
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeLessThan(0.1);
  });

  it("does not accumulate slope slide in normal mode without movement input", () => {
    const player = createPlayer();
    const startPos = { ...player.pos };

    for (let i = 0; i < 10; i += 1) {
      stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);
    }

    expect(player.planetId).toBe("planet-0");
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeLessThan(0.1);
    expect(Math.hypot(player.pos.x - startPos.x, player.pos.z - startPos.z)).toBeLessThan(0.01);
  });

  it("uses direct movement in normal combat mode", () => {
    const player = createPlayer();
    player.vel.z = 4;

    stepPlayer(player, createInput(InputKey.Backward), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.planetId).toBe("planet-0");
    expect(player.vel.z).toBeLessThan(0);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeCloseTo(
      TEST_CONFIG.movement.moveSpeed,
      0,
    );
  });

  it("updates airborne facing from aim input before landing", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.pos.y += 3;
    player.vel.y = 8;

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
    expect(forward.z).toBeGreaterThan(0.9);
    expect(Math.abs(forward.x)).toBeLessThan(0.2);
  });

  it("dives faster while airborne with anchor held and no movement input", () => {
    const freePlayer = createPlayer();
    const anchoredPlayer = createPlayer();
    freePlayer.planetId = "";
    anchoredPlayer.planetId = "";
    freePlayer.movementState = PlayerMovementState.Airborne;
    anchoredPlayer.movementState = PlayerMovementState.Airborne;
    freePlayer.pos.y += 5;
    anchoredPlayer.pos.y += 5;

    stepPlayer(freePlayer, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);
    stepPlayer(
      anchoredPlayer,
      createInput(InputKey.Anchor),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      EMPTY_PAINT,
    );

    expect(anchoredPlayer.vel.y).toBeLessThan(freePlayer.vel.y);
  });

  it("adds forward flight acceleration while airborne with forward and anchor held", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.pos.y += 5;

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Anchor),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      EMPTY_PAINT,
    );

    expect(player.vel.z).toBeGreaterThan(TEST_CONFIG.movement.airBoostAcceleration * 0.1 - 0.1);
    expect(player.vel.z).toBeLessThan(TEST_CONFIG.movement.boostAcceleration * 0.1);
  });

  it("applies the friendly paint speed multiplier from config", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    for (let i = 0; i < 10; i++) {
      stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    }

    const speed = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThanOrEqual(
      TEST_CONFIG.movement.moveSpeed * TEST_CONFIG.movement.swimSpeedMultiplier * 1.05,
    );
  });

  it("shows a subtle moving indicator while skiing on friendly paint with movement input", () => {
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
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeGreaterThan(0);
  });

  it("becomes hidden in ski mode when stationary", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.SwimmingHidden);
    expect(player.movementState).toBe(PlayerMovementState.Idle);
  });

  it("stays in ski mode after the toggle input is released", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.SwimmingHidden);
  });

  it("exits ski mode when toggled again", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.None);
  });

  it("keeps ski mode while firing", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(InputKey.Fire), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).toBe(PlayerSwimState.SwimmingHidden);
  });

  it("allows visible ski mode on enemy paint", () => {
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

    expect(player.swimState).toBe(PlayerSwimState.SkiVisible);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeGreaterThan(0);
  });

  it("keeps ski momentum when crossing from friendly slime onto enemy slime", () => {
    const player = createPlayer();
    const friendlyPaint = createPaintMap(player.paintGroupId);
    const enemyPaint = createPaintMap(player.paintGroupId + 1);

    stepPlayer(
      player,
      createInput(InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      friendlyPaint,
    );
    player.vel.z = 18;
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, enemyPaint);

    expect(player.swimState).toBe(PlayerSwimState.SkiVisible);
    expect(player.vel.z).toBeGreaterThan(TEST_CONFIG.movement.moveSpeed);
  });

  it("anchoring while in ski mode keeps ski mode active", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Anchor | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );
    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Anchor),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );

    expect(player.planetId).toBe("planet-0");
    expect(player.swimState).toBe(PlayerSwimState.SwimmingMoving);
    expect(player.isCarving).toBe(true);
    expect(player.movementState).toBe(PlayerMovementState.Moving);
    expect(player.vel.z).toBeGreaterThan(0);
  });

  it("clears carve pose when space is released in ski mode", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Anchor | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );
    stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.swimState).not.toBe(PlayerSwimState.None);
    expect(player.isCarving).toBe(false);
  });

  it("keeps carve pose while airborne if space is held in ski mode", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.swimState = PlayerSwimState.SwimmingMoving;

    stepPlayer(player, createInput(InputKey.Anchor), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT);

    expect(player.isCarving).toBe(true);
  });

  it("exiting ski mode with the toggle brakes back into normal movement", () => {
    const player = createPlayer();
    const paint = createPaintMap(player.paintGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    player.vel.z = 18;
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("planet-0");
    expect(player.swimState).toBe(PlayerSwimState.None);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeLessThan(0.1);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { stepPlayer, type PlanetData, type PlayerPhysics } from "./simulatedMovement.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimPlanetPaintState,
} from "@splat/simulation/match/simState.ts";
import { buildComputedRail, sampleRailAt } from "./railSpline.ts";

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
    friendlyPaintSpeedMultiplier: 1.5,
    enemySpeedMultiplier: 0.7,
    groundedDeceleration: 6,
    surfSpeedMultiplier: 2.4,
    surfAccelerationMultiplier: 3.0,
    surfDisturbanceMinSpeed: 1.5,
    waterSkiSpeedMultiplier: 2.8,
    waterSkiAccelerationMultiplier: 2.5,
    waterSkiFriction: 0.6,
    waterSkiLateralDrag: 4.0,
  },
  rail: {
    snapDistance: 3.0,
    minEntrySpeed: 12.0,
    balanceDriftRate: 0.35,
    balanceInputScale: 1.2,
    balanceRestoreRate: 0.4,
    bailThreshold: 0.95,
    paintCorridorRadius: 3.5,
    paintStampSpacing: 4.0,
    maxGrindSpeed: 35.0,
    centerBoostPerSecond: 2.0,
    visualRadius: 0.4,
  },
  terrain: {
    seed: 42,
    baseAmplitude: 0, // Flat for simplicity
    frequency: 0.8,
    octaves: 1,
    lacunarity: 2.0,
    persistence: 0.5,
    waterLevel: -10,
    snowLevel: 40,
    sandBand: 0.5,
    rockLevel: 30,
  },
} as const;

const TEST_PLANETS: PlanetData[] = [
  {
    id: "planet-0",
    center: { x: 0, y: 0, z: 0 },
    radius: 50,
  },
];

const EMPTY_PAINT = new Map<string, SimPlanetPaintState>();

// A simple straight rail along the Z axis, 10wu above surface
const TEST_RAIL_DEF = {
  id: 0,
  planetId: "planet-0",
  controlPoints: [
    { nx: 0, ny: 1, nz: -0.1, heightOffset: 10 },
    { nx: 0, ny: 1, nz: 0, heightOffset: 10 },
    { nx: 0, ny: 1, nz: 0.1, heightOffset: 10 },
  ],
  paintCorridorRadius: 3.5,
};

const TEST_RAIL = buildComputedRail(TEST_RAIL_DEF, TEST_PLANETS[0]!.center, TEST_CONFIG);

function createInput(keys = 0): InputMessage {
  return {
    seq: 1,
    keys,
    aimDir: { x: 0, y: 0, z: 1 },
    dt: 0.05,
  };
}

function createPlayer(): PlayerPhysics {
  return {
    pos: { x: 0, y: 65, z: 0 },
    vel: { x: 0, y: 0, z: 20 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    planetId: "",
    paintGroupId: 1,
    movementState: PlayerMovementState.Airborne,
    surfState: PlayerSurfState.None,
    isCarving: false,
    skiJumpCharge: 0,
    grindRailId: -1,
    grindT: 0,
    grindBalance: 0,
    grindSpeed: 0,
    grindCooldownMs: 0,
  };
}

describe("Rail Grinding", () => {
  it("allows player to snap to rail and offsets them above it", () => {
    const player = createPlayer();
    // Position player near the rail start
    player.pos = { ...TEST_RAIL.samples[0]!.pos };
    // Move them slightly away so they are "airborne" but within snap distance
    player.pos.y += 0.5;

    stepPlayer(player, createInput(), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT, [TEST_RAIL]);

    expect(player.movementState).toBe(PlayerMovementState.Grinding);
    expect(player.grindRailId).toBe(0);

    // Verify offset: visualRadius (0.4) + standingHeight (1.0) = 1.4wu from rail point
    const railPt = sampleRailAt(TEST_RAIL, player.grindT).pos;
    const dist = Math.sqrt(
      (player.pos.x - railPt.x) ** 2 +
        (player.pos.y - railPt.y) ** 2 +
        (player.pos.z - railPt.z) ** 2,
    );
    expect(dist).toBeCloseTo(1.4, 2);
  });

  it("allows player to jump to exit rail", () => {
    const player = createPlayer();
    player.pos = { ...TEST_RAIL.samples[5]!.pos };
    player.movementState = PlayerMovementState.Grinding;
    player.grindRailId = 0;
    player.grindT = TEST_RAIL.samples[5]!.arcLength;
    player.grindSpeed = 20;

    // Hold Anchor to charge, then release to launch.
    stepPlayer(player, createInput(InputKey.Anchor), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT, [
      TEST_RAIL,
    ]);
    expect(player.movementState).toBe(PlayerMovementState.Grinding);

    stepPlayer(player, createInput(), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT, [TEST_RAIL]);

    expect(player.movementState).toBe(PlayerMovementState.Airborne);
  });

  it("does not get stuck at the end of a rail", () => {
    const player = createPlayer();
    const lastSample = TEST_RAIL.samples[TEST_RAIL.samples.length - 1]!;
    player.pos = { ...lastSample.pos };
    player.movementState = PlayerMovementState.Grinding;
    player.grindRailId = 0;
    player.grindT = TEST_RAIL.totalLength - 0.1;
    player.grindSpeed = 20;

    // Move past the end
    stepPlayer(player, createInput(), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT, [TEST_RAIL]);

    // First step: should exit and become airborne
    expect(player.movementState).toBe(PlayerMovementState.Airborne);

    // Second step: should stay airborne and move away
    stepPlayer(player, createInput(), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_PAINT, [TEST_RAIL]);

    // BUG: It might snap back because it's still close to the end point
    // If it's still grinding, the bug is reproduced
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import { stepPlayer, type PlanetData, type PlayerPhysics } from "./simulatedMovement.ts";
import { NO_SLIME_GROUP_ID } from "@splat/protocol/schemas/slimedState.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import {
  PlayerMovementState,
  PlayerSurfState,
  type SimPlanetSlimeState,
} from "@splat/simulation/match/simState.ts";
import { createStampBuckets } from "@splat/simulation/slime/slimeDetection.ts";
import {
  getTerrainHeight,
  getTerrainRadius,
  type TerrainSurfaceProvider,
} from "../terrain/planetTerrain.ts";

const TEST_PLANETS: PlanetData[] = [
  {
    id: "planet-0",
    center: { ...DEV_MAP.planets[0]!.center },
    radius: 50,
  },
];
const EMPTY_SLIME = new Map<string, SimPlanetSlimeState>();

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
    friendlySlimeSpeedMultiplier: 1.5,
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
    snapDistance: 4.0,
    minEntrySpeed: 8.0,
    slimeCorridorRadius: 3.5,
    slimeStampSpacing: 4.0,
    maxGrindSpeed: 35.0,
    carveAccelerationPerSecond: 12.0,
    visualRadius: 0.4,
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
    slimeGroupId: 1,
    slimeLevel: 100,
    movementState: PlayerMovementState.Idle,
    surfState: PlayerSurfState.None,
    isCarving: false,
    skiJumpCharge: 0,
    grindRailId: -1,
    grindT: 0,
    lastGrindT: 0,
    grindSpeed: 0,
    grindCooldownMs: 0,
    isOnFriendlySlime: false,
  };
}

function createSlimeMap(slimeGroupId: number): Map<string, SimPlanetSlimeState> {
  const slime = new Map<string, SimPlanetSlimeState>([
    [
      "planet-0",
      {
        planetId: "planet-0",
        territoryRows: 1,
        territoryCols: 1,
        cells: [],
        stamps: [
          {
            slimeGroupId,
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
  slime.get("planet-0")!.stampBuckets[0] = [...slime.get("planet-0")!.stamps];
  return slime;
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

function findUnderwaterNormal(): { x: number; y: number; z: number } {
  const candidates = [
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
    { x: 0.55, y: 0.55, z: 0.62 },
    { x: -0.5, y: -0.45, z: -0.74 },
  ];
  for (const candidate of candidates) {
    if (
      getTerrainHeight(candidate.x, candidate.y, candidate.z, TEST_CONFIG) <
      TEST_CONFIG.terrain.waterLevel
    ) {
      return candidate;
    }
  }
  throw new Error("expected at least one underwater terrain sample in test config");
}

describe("stepPlayer", () => {
  it("moves a grounded player along the planet surface", () => {
    const player = createPlayer();

    stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

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

  it("uses an injected terrain provider for grounded surface contact", () => {
    const player = createPlayer();
    const raisedTerrain: TerrainSurfaceProvider = {
      getHeight(nx, ny, nz, cfg) {
        return getTerrainHeight(nx, ny, nz, cfg) + 5;
      },
      getRadius(nx, ny, nz, cfg) {
        return getTerrainRadius(nx, ny, nz, cfg) + 5;
      },
    };

    stepPlayer(
      player,
      createInput(0),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [],
      new Map(),
      raisedTerrain,
    );

    const dx = player.pos.x - TEST_PLANETS[0]!.center.x;
    const dy = player.pos.y - TEST_PLANETS[0]!.center.y;
    const dz = player.pos.z - TEST_PLANETS[0]!.center.z;
    const dist = Math.hypot(dx, dy, dz);
    const norm = { x: dx / dist, y: dy / dist, z: dz / dist };
    const expectedRadius =
      getTerrainRadius(norm.x, norm.y, norm.z, TEST_CONFIG) +
      5 +
      TEST_CONFIG.movement.standingHeight;

    expect(dist).toBeCloseTo(expectedRadius, 3);
  });

  it("jumps with space outside surf mode", () => {
    const player = createPlayer();

    stepPlayer(player, createInput(InputKey.Anchor), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.y).toBeGreaterThan(TEST_CONFIG.movement.jumpImpulse * 0.8);
    expect(player.surfState).toBe(PlayerSurfState.None);
  });

  it("carries normal movement input into a jump", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

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

  it("accelerates forward faster in surf mode when holding forward and anchor together", () => {
    const normalPlayer = createPlayer();
    const boostedPlayer = createPlayer();
    const paint = createSlimeMap(boostedPlayer.slimeGroupId);

    stepPlayer(normalPlayer, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    // Enter surf mode then ramp up with carving — needs several steps to surpass normal speed
    stepPlayer(
      boostedPlayer,
      createInput(InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );
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
    expect(boostedPlayer.surfState).toBe(PlayerSurfState.SurfingMoving);
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
      EMPTY_SLIME,
    );

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.vel.z).toBeGreaterThan(0);
  });

  it("keeps normal grounded movement from launching off stored upward velocity", () => {
    const player = createPlayer();
    player.vel.y = 20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.planetId).toBe("planet-0");
    expect(player.movementState).toBe(PlayerMovementState.Idle);
    expect(player.surfState).toBe(PlayerSurfState.None);
  });

  it("lets surf traversal leave the surface when the free path rises beyond snap distance", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    player.vel.y = 20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("");
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.surfState).toBe(PlayerSurfState.SurfingHidden);
  });

  it("keeps surf mode when landing back on slime after becoming airborne", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.surfState = PlayerSurfState.SurfingMoving;
    player.pos.y += 1;
    player.vel.y = -20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("planet-0");
    expect(player.surfState).not.toBe(PlayerSurfState.None);
  });

  it("keeps surf mode after landing on neutral ground", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.surfState = PlayerSurfState.SurfingMoving;
    player.pos.y += 1;
    player.vel.y = -20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.planetId).toBe("planet-0");
    expect(player.surfState).not.toBe(PlayerSurfState.None);
  });

  it("keeps upward stored velocity grounded in normal mode without jump input", () => {
    const player = createPlayer();
    player.vel.y = 20;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.planetId).toBe("planet-0");
    expect(player.movementState).not.toBe(PlayerMovementState.Airborne);
    expect(player.surfState).toBe(PlayerSurfState.None);
  });

  it("stops tangent velocity in normal mode without movement input", () => {
    const player = createPlayer();
    player.vel.z = 12;

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.planetId).toBe("planet-0");
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeLessThan(0.1);
  });

  it("does not accumulate slope slide in normal mode without movement input", () => {
    const player = createPlayer();
    const startPos = { ...player.pos };

    for (let i = 0; i < 10; i += 1) {
      stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);
    }

    expect(player.planetId).toBe("planet-0");
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeLessThan(0.1);
    expect(Math.hypot(player.pos.x - startPos.x, player.pos.z - startPos.z)).toBeLessThan(0.01);
  });

  it("uses direct movement in normal combat mode", () => {
    const player = createPlayer();
    player.vel.z = 4;

    stepPlayer(player, createInput(InputKey.Backward), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

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
      EMPTY_SLIME,
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

    stepPlayer(freePlayer, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);
    stepPlayer(
      anchoredPlayer,
      createInput(InputKey.Anchor),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      EMPTY_SLIME,
    );

    expect(anchoredPlayer.vel.y).toBeLessThan(freePlayer.vel.y);
  });

  it("adds forward flight acceleration while airborne with anchor held", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.pos.y += 5;

    stepPlayer(player, createInput(InputKey.Anchor), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.vel.z).toBeGreaterThan(TEST_CONFIG.movement.airBoostAcceleration * 0.1 - 0.1);
    expect(player.vel.z).toBeLessThan(TEST_CONFIG.movement.boostAcceleration * 0.1);
  });

  it("applies the friendly slime speed multiplier from config", () => {
    const player = createPlayer();
    // Add a stamp at the player's position to ensure isOnFriendlySlime is true
    const paint = createSlimeMap(player.slimeGroupId);
    const planet = paint.get("planet-0")!;
    planet.stamps.push({
      slimeGroupId: player.slimeGroupId,
      color: 0xff0000,
      patternId: 0,
      nx: 0,
      ny: 1,
      nz: 0,
      radius: 10,
      seq: 1,
    });
    // Rebuild buckets or just rely on the fallback to stamps since we only have one
    planet.stampBuckets = [[planet.stamps[0]!]];

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    for (let i = 0; i < 10; i++) {
      stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    }

    const speed = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThanOrEqual(
      TEST_CONFIG.movement.moveSpeed *
        TEST_CONFIG.movement.surfSpeedMultiplier *
        TEST_CONFIG.movement.friendlySlimeSpeedMultiplier *
        1.05,
    );
  });

  it("shows a subtle moving indicator while surfing on friendly slime with movement input", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );

    expect(player.surfState).toBe(PlayerSurfState.SurfingMoving);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeGreaterThan(0);
  });

  it("becomes hidden in surf mode when stationary", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.surfState).toBe(PlayerSurfState.SurfingHidden);
    expect(player.movementState).toBe(PlayerMovementState.Idle);
  });

  it("stays in surf mode after the toggle input is released", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.surfState).toBe(PlayerSurfState.SurfingHidden);
  });

  it("exits surf mode when toggled again", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.surfState).toBe(PlayerSurfState.None);
  });

  it("keeps surf mode while firing", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    stepPlayer(player, createInput(InputKey.Fire), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.surfState).toBe(PlayerSurfState.SurfingHidden);
  });

  it("allows visible surf mode on enemy slime", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId + 1);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );

    expect(player.surfState).toBe(PlayerSurfState.SurfingVisible);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeGreaterThan(0);
  });

  it("keeps surf momentum when crossing from friendly slime onto enemy slime", () => {
    const player = createPlayer();
    const friendlySlime = createSlimeMap(player.slimeGroupId);
    const enemySlime = createSlimeMap(player.slimeGroupId + 1);

    stepPlayer(
      player,
      createInput(InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      friendlySlime,
    );
    player.vel.z = 18;
    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, enemySlime);

    expect(player.surfState).toBe(PlayerSurfState.SurfingVisible);
    expect(player.vel.z).toBeGreaterThan(TEST_CONFIG.movement.moveSpeed);
  });

  it("anchoring while in surf mode keeps surf mode active", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

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
    expect(player.surfState).toBe(PlayerSurfState.SurfingMoving);
    expect(player.isCarving).toBe(true);
    expect(player.movementState).toBe(PlayerMovementState.Moving);
    expect(player.vel.z).toBeGreaterThan(0);
  });

  it("clears carve pose when space is released in surf mode", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(
      player,
      createInput(InputKey.Forward | InputKey.Anchor | InputKey.Submerge),
      0.1,
      TEST_PLANETS,
      TEST_CONFIG,
      paint,
    );
    stepPlayer(player, createInput(InputKey.Forward), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.surfState).not.toBe(PlayerSurfState.None);
    expect(player.isCarving).toBe(false);
  });

  it("keeps carve pose while airborne if space is held in surf mode", () => {
    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.surfState = PlayerSurfState.SurfingMoving;

    stepPlayer(player, createInput(InputKey.Anchor), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    expect(player.isCarving).toBe(true);
  });

  it("exiting surf mode with the toggle brakes back into normal movement", () => {
    const player = createPlayer();
    const paint = createSlimeMap(player.slimeGroupId);

    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);
    player.vel.z = 18;
    stepPlayer(player, createInput(InputKey.Submerge), 0.1, TEST_PLANETS, TEST_CONFIG, paint);

    expect(player.planetId).toBe("planet-0");
    expect(player.surfState).toBe(PlayerSurfState.None);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeLessThan(0.1);
  });

  it("lands on the water surface instead of below it over underwater terrain", () => {
    const player = createPlayer();
    const underwaterNormal = findUnderwaterNormal();
    const waterRadius = TEST_CONFIG.planet.radius + TEST_CONFIG.terrain.waterLevel;

    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.surfState = PlayerSurfState.None;
    player.pos = {
      x: TEST_PLANETS[0]!.center.x + underwaterNormal.x * (waterRadius + 1.2),
      y: TEST_PLANETS[0]!.center.y + underwaterNormal.y * (waterRadius + 1.2),
      z: TEST_PLANETS[0]!.center.z + underwaterNormal.z * (waterRadius + 1.2),
    };
    player.vel = {
      x: -underwaterNormal.x * 8,
      y: -underwaterNormal.y * 8,
      z: -underwaterNormal.z * 8,
    };

    stepPlayer(player, createInput(0), 0.1, TEST_PLANETS, TEST_CONFIG, EMPTY_SLIME);

    const distFromCenter = Math.hypot(
      player.pos.x - TEST_PLANETS[0]!.center.x,
      player.pos.y - TEST_PLANETS[0]!.center.y,
      player.pos.z - TEST_PLANETS[0]!.center.z,
    );
    expect(player.planetId).toBe("planet-0");
    expect(distFromCenter).toBeCloseTo(waterRadius + TEST_CONFIG.movement.standingHeight, 3);
  });

  it("loads onto a charged blast pad without consuming the charge", () => {
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const padStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 1 },
      ],
    ]);

    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );

    expect(player.movementState).toBe(PlayerMovementState.PadLoaded);
    expect(player.loadedPadId).toBe("test-pad");
    expect(player.planetId).toBe("planet-0"); // still on source planet
    // Charge is preserved until the actual launch — pad coverage untouched.
    expect(padStates.get("test-pad")?.coverageProgress).toBe(1);
    expect(padStates.get("test-pad")?.ownerSlimeGroupId).toBe(player.slimeGroupId);
  });

  it("does not load onto a neutral or enemy-owned blast pad", () => {
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const neutralStates = new Map([
      ["test-pad", { ownerSlimeGroupId: NO_SLIME_GROUP_ID, ownerColor: 0, coverageProgress: 0 }],
    ]);
    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      neutralStates,
    );
    expect(player.movementState).not.toBe(PlayerMovementState.PadLoaded);
    expect(player.planetId).toBe("planet-0");

    const enemyPlayer = createPlayer();
    const enemyStates = new Map([
      [
        "test-pad",
        {
          ownerSlimeGroupId: enemyPlayer.slimeGroupId + 1,
          ownerColor: 0x00ff00,
          coverageProgress: 1,
        },
      ],
    ]);
    stepPlayer(
      enemyPlayer,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      enemyStates,
    );
    expect(enemyPlayer.movementState).not.toBe(PlayerMovementState.PadLoaded);
    expect(enemyPlayer.planetId).toBe("planet-0");
  });

  it("does not load onto a partially-charged blast pad until coverage reaches 1", () => {
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const partialStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 0.6 },
      ],
    ]);
    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      partialStates,
    );
    expect(player.movementState).not.toBe(PlayerMovementState.PadLoaded);
    expect(player.planetId).toBe("planet-0");
    expect(partialStates.get("test-pad")?.coverageProgress).toBe(0.6);
  });

  it("hold-release on a loaded pad launches the player into FreeFlight along aim", () => {
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const padStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 1 },
      ],
    ]);

    const aimUp = { x: 0, y: 1, z: 0 };
    // 1. Enter PadLoaded.
    stepPlayer(
      player,
      { ...createInput(0), aimDir: aimUp },
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.movementState).toBe(PlayerMovementState.PadLoaded);

    // 2. Burn through the load-in wind-up (default 0.3s) at 0.05s/tick.
    for (let i = 0; i < 8; i++) {
      stepPlayer(
        player,
        { ...createInput(0), seq: i + 2, aimDir: aimUp },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
    }
    expect(player.padLoadProgress).toBe(1);

    // 3. Hold Anchor to charge.
    for (let i = 0; i < 6; i++) {
      stepPlayer(
        player,
        { ...createInput(InputKey.Anchor), seq: i + 20, aimDir: aimUp },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
    }
    expect(player.padChargeProgress ?? 0).toBeGreaterThan(0);

    // 4. Release Anchor — fire.
    stepPlayer(
      player,
      { ...createInput(0), seq: 100, aimDir: aimUp },
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );

    expect(player.movementState).toBe(PlayerMovementState.FreeFlight);
    expect(player.planetId).toBe("");
    expect(player.loadedPadId).toBe("");
    // Velocity along aim (+y).
    expect(player.vel.y).toBeGreaterThan(0);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeGreaterThan(
      TEST_CONFIG.movement.moveSpeed,
    );
    // Pad charge is consumed at launch.
    expect(padStates.get("test-pad")?.coverageProgress).toBe(0);
    expect(padStates.get("test-pad")?.ownerSlimeGroupId).toBe(NO_SLIME_GROUP_ID);
  });

  it("pressing a movement key during PadLoaded cancels without consuming the pad", () => {
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const padStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 1 },
      ],
    ]);

    // Enter PadLoaded.
    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.movementState).toBe(PlayerMovementState.PadLoaded);

    // Idle tick to arm the cancel gate (no movement keys held).
    stepPlayer(
      player,
      { ...createInput(0), seq: 2 },
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.padCancelArmed).toBe(true);

    // Press W to step off.
    stepPlayer(
      player,
      { ...createInput(InputKey.Forward), seq: 3 },
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.movementState).not.toBe(PlayerMovementState.PadLoaded);
    // Pad's charge is preserved on cancel.
    expect(padStates.get("test-pad")?.coverageProgress).toBe(1);
    expect(padStates.get("test-pad")?.ownerSlimeGroupId).toBe(player.slimeGroupId);
    // Stickiness: still inside footprint, so loadedPadId remains set to prevent re-load.
    expect(player.loadedPadId).toBe("test-pad");
  });

  it("charging on a loaded pad drains slime; release fires at the charge level", () => {
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const padStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 1 },
      ],
    ]);

    // Load + wind-up.
    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    for (let i = 0; i < 8; i++) {
      stepPlayer(
        player,
        { ...createInput(0), seq: i + 2 },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
    }
    expect(player.padLoadProgress).toBe(1);
    const slimeBeforeCharge = player.slimeLevel;

    // Charge for 3 ticks (0.15s) at the configured drain rate.
    for (let i = 0; i < 3; i++) {
      stepPlayer(
        player,
        { ...createInput(InputKey.Anchor), seq: i + 20 },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
    }
    // Slime tank should have dropped.
    expect(player.slimeLevel).toBeLessThan(slimeBeforeCharge);
    expect(player.padChargeProgress ?? 0).toBeGreaterThan(0);

    // Release Anchor — fires.
    stepPlayer(
      player,
      { ...createInput(0), seq: 100, aimDir: { x: 0, y: 1, z: 0 } },
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.movementState).toBe(PlayerMovementState.FreeFlight);
  });

  it("holding Anchor with zero slime accrues no charge and prevents launch", () => {
    const player = createPlayer();
    player.slimeLevel = 0;
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const padStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 1 },
      ],
    ]);

    // Load + wind-up.
    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    for (let i = 0; i < 8; i++) {
      stepPlayer(
        player,
        { ...createInput(0), seq: i + 2 },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
    }
    expect(player.padLoadProgress).toBe(1);

    // Hold Anchor across several ticks with no slime — no charge accrues.
    for (let i = 0; i < 5; i++) {
      stepPlayer(
        player,
        { ...createInput(InputKey.Anchor), seq: i + 20 },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
    }
    expect(player.padChargeProgress ?? 0).toBe(0);
    expect(player.movementState).toBe(PlayerMovementState.PadLoaded);

    // Release Anchor — nothing fires because charge stayed at 0.
    stepPlayer(
      player,
      { ...createInput(0), seq: 100 },
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.movementState).toBe(PlayerMovementState.PadLoaded);
    // Pad's charge is preserved — we never spent it.
    expect(padStates.get("test-pad")?.coverageProgress).toBe(1);
  });

  it("walking onto a charged pad with W held does not instantly cancel out", () => {
    // Repro for "I immediately pop back out" — the player presses W to step
    // onto the pad and the same W press shouldn't be re-interpreted as a
    // cancel input on the very next sim tick.
    const player = createPlayer();
    const blastPlanets: PlanetData[] = [
      ...TEST_PLANETS,
      { id: "planet-1", center: { x: 180, y: 0, z: 0 }, radius: 50 },
    ];
    const pad = {
      id: "test-pad",
      planetId: "planet-0",
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      radius: 8,
      launchSpeed: 70,
      upwardBias: 0.35,
    };
    const padStates = new Map([
      [
        "test-pad",
        { ownerSlimeGroupId: player.slimeGroupId, ownerColor: 0xff00ff, coverageProgress: 1 },
      ],
    ]);

    // Enter PadLoaded with no input (simulates the moment we cross into the
    // pad footprint).
    stepPlayer(
      player,
      createInput(0),
      0.05,
      blastPlanets,
      TEST_CONFIG,
      EMPTY_SLIME,
      [],
      [pad],
      padStates,
    );
    expect(player.movementState).toBe(PlayerMovementState.PadLoaded);
    expect(player.padCancelArmed).toBe(false);

    // Now several ticks with W still held — the gate is not armed yet, so
    // none of these ticks should cancel.
    for (let i = 0; i < 6; i++) {
      stepPlayer(
        player,
        { ...createInput(InputKey.Forward), seq: i + 2 },
        0.05,
        blastPlanets,
        TEST_CONFIG,
        EMPTY_SLIME,
        [],
        [pad],
        padStates,
      );
      expect(player.movementState).toBe(PlayerMovementState.PadLoaded);
      expect(player.padCancelArmed).toBe(false);
    }
  });

  it("recovers generic airborne players toward the nearest planet beyond the gravity zone", () => {
    // Generic airborne (jumps, rail launches) is always bound to a planet so the player
    // never drifts off into space. The force-free void is reserved for guided planet hops,
    // which runs through stepFreeFlight and never reaches stepAirborne.
    const player = createPlayer();
    const planet = { ...TEST_PLANETS[0]!, gravityRadius: 120 };
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.pos = { x: planet.center.x + 300, y: planet.center.y, z: planet.center.z };
    player.vel = { x: 0, y: 0, z: 12 };

    stepPlayer(player, createInput(0), 0.1, [planet], TEST_CONFIG, EMPTY_SLIME);

    expect(player.vel.x).toBeLessThan(0);
    expect(player.movementState).toBe(PlayerMovementState.Airborne);
  });

  it("keeps airborne players anchored to their current planet despite a closer-by-normalized-distance neighbour", () => {
    // Two planets with overlapping gravity zones. Without hysteresis, an airborne
    // player slightly into the overlap region gets yanked toward whichever
    // neighbour's zone they happen to be marginally further inside. With
    // hysteresis, they stay anchored to their previous planet until they exit
    // its (wider) capture radius.
    const planetA: PlanetData = {
      id: "planet-a",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 120,
      captureRadius: 160,
    };
    const planetB: PlanetData = {
      id: "planet-b",
      center: { x: 220, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 120,
      captureRadius: 160,
    };

    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    // 130 from A (just outside A's gravityRadius=120 but inside captureRadius=160),
    // 90 from B (well inside B's gravityRadius). Without hysteresis, the picker
    // would pull the player toward B. With anchor=A, A wins because the player
    // is still inside A's capture radius.
    player.gravityAnchorPlanetId = "planet-a";
    player.pos = { x: 130, y: 0, z: 0 };
    player.vel = { x: 0, y: 0, z: 0 };

    stepPlayer(player, createInput(0), 0.1, [planetA, planetB], TEST_CONFIG, EMPTY_SLIME);

    // Gravity should pull the player back toward A (-x), not toward B (+x).
    expect(player.vel.x).toBeLessThan(0);
    expect(player.gravityAnchorPlanetId).toBe("planet-a");
  });

  it("releases the gravity anchor once the player crosses out of its capture radius", () => {
    const planetA: PlanetData = {
      id: "planet-a",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 120,
      captureRadius: 160,
    };
    // Placed far enough that the player at the test position is inside B's
    // gravity well but well outside its terrain + standingHeight + snap
    // distance (so airborne integration doesn't immediately fire a landing
    // and zero the velocity).
    const planetB: PlanetData = {
      id: "planet-b",
      center: { x: 400, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 300,
      captureRadius: 320,
    };

    const player = createPlayer();
    player.planetId = "";
    player.movementState = PlayerMovementState.Airborne;
    player.gravityAnchorPlanetId = "planet-a";
    // 180 from A (past A's captureRadius=160), 220 from B (inside B's gravity
    // radius). The anchor expires; the picker should swap to B.
    player.pos = { x: 180, y: 0, z: 0 };
    player.vel = { x: 0, y: 0, z: 0 };

    stepPlayer(player, createInput(0), 0.1, [planetA, planetB], TEST_CONFIG, EMPTY_SLIME);

    expect(player.gravityAnchorPlanetId).toBe("planet-b");
    // Gravity should now pull toward B (+x).
    expect(player.vel.x).toBeGreaterThan(0);
  });

  it("FreeFlight applies no gravity — a dart aimed along its velocity flies straight", () => {
    // Pure ballistic dart: even with a planet in range, gravity must NOT bend
    // the path. With aim aligned to velocity, steering is a no-op too, so the
    // velocity is unchanged and the player travels in a straight line.
    const planetA: PlanetData = {
      id: "planet-a",
      center: { x: -100, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 250,
      captureRadius: 350,
    };
    const player = createPlayer();
    player.planetId = "";
    player.gravityAnchorPlanetId = "";
    player.movementState = PlayerMovementState.FreeFlight;
    player.pos = { x: 0, y: 0, z: 0 };
    player.vel = { x: 0, y: 0, z: 30 };
    const input: InputMessage = { ...createInput(0), aimDir: { x: 0, y: 0, z: 1 } };

    stepPlayer(player, input, 0.1, [planetA], TEST_CONFIG, EMPTY_SLIME);

    // No pull toward the planet (-x): velocity is untouched.
    expect(player.vel.x).toBeCloseTo(0, 5);
    expect(player.vel.y).toBeCloseTo(0, 5);
    expect(player.vel.z).toBeCloseTo(30, 5);
    // Anchor still tracks the nearest planet for the camera's up-reference.
    expect(player.gravityAnchorPlanetId).toBe("planet-a");
  });

  it("FreeFlight glide-steers the heading toward aim at a capped rate, preserving speed", () => {
    const planet: PlanetData = {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 80,
      captureRadius: 100,
    };
    const player = createPlayer();
    player.planetId = "";
    player.gravityAnchorPlanetId = "";
    player.movementState = PlayerMovementState.FreeFlight;
    player.pos = { x: 0, y: 0, z: 1000 };
    player.vel = { x: 0, y: 0, z: 50 };

    // Aim 90° off to +x. The heading turns toward +x but is capped to
    // turnRate*dt this tick (not the full 90°), and speed is preserved.
    const dt = 0.1;
    const input: InputMessage = { ...createInput(0), aimDir: { x: 1, y: 0, z: 0 } };
    stepPlayer(player, input, dt, [planet], TEST_CONFIG, EMPTY_SLIME);

    // TEST_CONFIG doesn't set freeFlightTurnRate, so the sim uses its 1.5 default.
    const maxTurn = 1.5 * dt; // radians this tick
    expect(player.vel.x).toBeGreaterThan(0); // turned toward +x
    expect(player.vel.z).toBeGreaterThan(0); // but mostly still +z
    // Capped: the heading moved by ~maxTurn, far short of the full 90°.
    expect(player.vel.x).toBeLessThan(50 * Math.sin(maxTurn) + 1);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeCloseTo(50, 4);
  });

  it("FreeFlight ignores Forward/Backward thrust input (launch energy is committed)", () => {
    // Holding W/S during FreeFlight should NOT change velocity beyond what
    // steering produces. Launch energy is whatever the pad-charge paid for;
    // no in-flight thrust. Compare a Forward-held step against a no-input step
    // from identical state — they must produce identical vel.
    const planet: PlanetData = {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 80,
      captureRadius: 100,
    };
    const setupPlayer = (): PlayerPhysics => {
      const p = createPlayer();
      p.planetId = "";
      p.gravityAnchorPlanetId = "";
      p.movementState = PlayerMovementState.FreeFlight;
      p.pos = { x: 0, y: 0, z: 1000 };
      p.vel = { x: 0, y: 0, z: 30 };
      return p;
    };

    const idlePlayer = setupPlayer();
    stepPlayer(
      idlePlayer,
      { ...createInput(0), aimDir: { x: 0, y: 0, z: 1 } },
      0.1,
      [planet],
      TEST_CONFIG,
      EMPTY_SLIME,
    );

    const thrustPlayer = setupPlayer();
    stepPlayer(
      thrustPlayer,
      { ...createInput(InputKey.Forward), aimDir: { x: 0, y: 0, z: 1 } },
      0.1,
      [planet],
      TEST_CONFIG,
      EMPTY_SLIME,
    );

    expect(thrustPlayer.vel.x).toBeCloseTo(idlePlayer.vel.x, 5);
    expect(thrustPlayer.vel.y).toBeCloseTo(idlePlayer.vel.y, 5);
    expect(thrustPlayer.vel.z).toBeCloseTo(idlePlayer.vel.z, 5);
  });

  it("FreeFlight keeps the gravity anchor frozen to the launch planet when passing a nearer world", () => {
    // The anchor drives the camera's up-reference. Repointing it at whatever
    // planet is momentarily nearest flips the camera (and, via aim-steering,
    // curves the dart into a fake orbit). It must stay pinned to the launch
    // planet for the whole flight.
    const launch: PlanetData = {
      id: "planet-a",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 80,
      captureRadius: 120,
    };
    const passing: PlanetData = {
      id: "planet-b",
      center: { x: 0, y: 0, z: 200 },
      radius: 20,
      gravityRadius: 80,
      captureRadius: 120,
    };
    const player = createPlayer();
    player.planetId = "";
    player.gravityAnchorPlanetId = "planet-a"; // launched from A
    player.movementState = PlayerMovementState.FreeFlight;
    // Nearer to B (100 from its centre vs 224 from A's) but well clear of its
    // surface, skimming tangentially so it doesn't land.
    player.pos = { x: 100, y: 0, z: 200 };
    player.vel = { x: 0, y: 0, z: 40 };
    const input: InputMessage = { ...createInput(0), aimDir: { x: 0, y: 0, z: 1 } };

    stepPlayer(player, input, 0.1, [launch, passing], TEST_CONFIG, EMPTY_SLIME);

    // Anchor stays A even though B is the nearer planet.
    expect(player.gravityAnchorPlanetId).toBe("planet-a");
    expect(player.movementState).toBe(PlayerMovementState.FreeFlight);
    // No gravity from B (or anyone): the dart keeps flying straight.
    expect(player.vel.x).toBeCloseTo(0, 5);
    expect(player.vel.z).toBeCloseTo(40, 5);
  });

  it("FreeFlight commits to a landing when crossing a planet's surface envelope", () => {
    const planet: PlanetData = {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: 50,
      gravityRadius: 80,
      captureRadius: 120,
    };
    const player = createPlayer();
    const surfaceRadius = getTerrainRadius(0, 1, 0, TEST_CONFIG);
    player.planetId = "";
    player.gravityAnchorPlanetId = "";
    player.movementState = PlayerMovementState.FreeFlight;
    // Surfing through the flight (as the pad launch leaves it) and diving in at
    // a glancing angle so there's tangential momentum to shed.
    player.surfState = PlayerSurfState.SurfingVisible;
    player.pos = { x: 0, y: surfaceRadius + TEST_CONFIG.movement.standingHeight + 2, z: 0 };
    player.vel = { x: 25, y: -40, z: 0 };
    const input: InputMessage = { ...createInput(0), aimDir: { x: 0, y: -1, z: 0 } };

    stepPlayer(player, input, 0.1, [planet], TEST_CONFIG, EMPTY_SLIME);

    expect(player.planetId).toBe("planet-0");
    expect(player.movementState).toBe(PlayerMovementState.Idle);
    expect(player.gravityAnchorPlanetId).toBe("planet-0");
    // Smash lands grounded (not surfing) and dead-stopped — no skid/bounce.
    expect(player.surfState).toBe(PlayerSurfState.None);
    expect(Math.hypot(player.vel.x, player.vel.y, player.vel.z)).toBeCloseTo(0, 5);
  });
});

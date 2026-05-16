import { describe, expect, it } from "vite-plus/test";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import { stepPlayer, type PlanetData, type PlayerPhysics } from "./simulatedMovement.ts";
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
});

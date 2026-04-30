import { describe, expect, it, vi } from "vite-plus/test";
import {
  CLUSTER_WEAPON_PICKUP_SPAWNS,
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  MAP_WEAPON_PICKUP_SPAWNS,
} from "@splat/content/combat/weaponDefs.ts";
import { DEV_MODE, FFA_MODE, TEAMS_MODE } from "@splat/content/modes/gameModes.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import {
  GAME_CONFIG,
  getPaintStampChordRadius,
  getPaintTerritoryDimensions,
  getPlayerTargetRadius,
  PLANET_POSITIONS,
} from "@splat/content/config/gameConfig.ts";
import { RAIL_DEFS } from "@splat/content/config/railDefs.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { appendPaintStamp, getPaintAtPoint } from "../paint/paintDetection.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";
import { buildComputedRail, sampleRailAt } from "../movement/railSpline.ts";
import { PlayerMovementState, PlayerSurfState } from "./simState.ts";
import { MatchSimulation } from "./matchSimulation.ts";
import { generateBotInput } from "../ai/botController.ts";

const MACHINE_GUN_KILL_SHOTS = Math.ceil(
  GAME_CONFIG.player.maxHealth / getWeaponDefinition(WeaponId.MachineGun).directDamage,
);

function createForwardInput(seq: number): InputMessage {
  return {
    seq,
    keys: InputKey.Forward,
    aimDir: { x: 0, y: 0, z: 1 },
    dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
  };
}

function snapshotX(simulation: MatchSimulation, sessionId: string): number {
  return simulation.buildSnapshotMessage().players.find((player) => player.sessionId === sessionId)!
    .pos.x;
}

function distanceBetweenPlayers(
  first: ReturnType<MatchSimulation["addPlayer"]>,
  second: ReturnType<MatchSimulation["addPlayer"]>,
): number {
  return Math.hypot(
    first.pos.x - second.pos.x,
    first.pos.y - second.pos.y,
    first.pos.z - second.pos.z,
  );
}

function surfaceNormalForCell(row: number, col: number): { x: number; y: number; z: number } {
  const { rows, cols } = getPaintTerritoryDimensions();
  const v = (row + 0.5) / rows;
  const u = (col + 0.5) / cols;
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  return {
    x: sinTheta * Math.cos(phi),
    y: Math.cos(theta),
    z: sinTheta * Math.sin(phi),
  };
}

function surfacePointForCell(
  planetId: string,
  row: number,
  col: number,
): { x: number; y: number; z: number } {
  const normal = surfaceNormalForCell(row, col);
  const radius = getTerrainRadius(normal.x, normal.y, normal.z, GAME_CONFIG);
  const planetIndex = Number(planetId.split("-")[1] ?? 0);
  const planet = PLANET_POSITIONS[planetIndex]!;
  return {
    x: planet.x + normal.x * radius,
    y: planet.y + normal.y * radius,
    z: planet.z + normal.z * radius,
  };
}

function expectedMuzzlePos(player: { pos: { x: number; y: number; z: number }; planetId: string }) {
  const planet =
    PLANET_POSITIONS.find((entry) => entry.id === player.planetId) ?? PLANET_POSITIONS[0]!;
  const dx = player.pos.x - planet.x;
  const dy = player.pos.y - planet.y;
  const dz = player.pos.z - planet.z;
  const len = Math.hypot(dx, dy, dz);
  return {
    x: player.pos.x + (dx / len) * GAME_CONFIG.player.projectileMuzzleHeight,
    y: player.pos.y + (dy / len) * GAME_CONFIG.player.projectileMuzzleHeight,
    z: player.pos.z + (dz / len) * GAME_CONFIG.player.projectileMuzzleHeight,
  };
}

function paintPlayerSurface(
  simulation: MatchSimulation,
  sessionId: string,
  paintGroupId: number,
  radius = Math.max(getPaintStampChordRadius(), 0.25),
): void {
  const player = simulation.players.get(sessionId);
  if (!player) return;
  const planet = simulation.matchState.planets.get(player.planetId);
  const planetPos = PLANET_POSITIONS.find((entry) => entry.id === player.planetId);
  if (!planetPos) return;
  if (!planet) return;

  const dx = player.pos.x - planetPos.x;
  const dy = player.pos.y - planetPos.y;
  const dz = player.pos.z - planetPos.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;

  appendPaintStamp(planet, {
    paintGroupId,
    color: 0xffffff,
    nx: dx / len,
    ny: dy / len,
    nz: dz / len,
    radius,
    seq: 1,
    patternId: 0,
  });
}

function makeAirborneSkier(player: ReturnType<MatchSimulation["addPlayer"]>): void {
  const planet = PLANET_POSITIONS[0]!;
  player.pos = {
    x: planet.x,
    y: planet.y + GAME_CONFIG.planet.radius + GAME_CONFIG.terrain.baseAmplitude + 18,
    z: planet.z,
  };
  player.vel = { x: 0, y: 6, z: 0 };
  player.planetId = "";
  player.movementState = PlayerMovementState.Airborne;
  player.surfState = PlayerSurfState.SkiVisible;
  player.airTrickAirTimeMs = GAME_CONFIG.tricks.minAirTimeMs;
}

function landAirbornePlayer(
  simulation: MatchSimulation,
  player: ReturnType<MatchSimulation["addPlayer"]>,
): void {
  const planet = PLANET_POSITIONS[0]!;
  const surfaceRadius = getTerrainRadius(0, 1, 0, GAME_CONFIG);
  player.pos = {
    x: planet.x,
    y: planet.y + surfaceRadius + GAME_CONFIG.movement.standingHeight + 0.2,
    z: planet.z,
  };
  player.vel = { x: 0, y: -20, z: 0 };
  player.planetId = "";
  player.movementState = PlayerMovementState.Airborne;
  simulation.tick(simulation.tickIntervalMs);
  simulation.tick(simulation.tickIntervalMs);
}

function makeGrindingSkier(player: ReturnType<MatchSimulation["addPlayer"]>): void {
  const railDef = RAIL_DEFS[0]!;
  const planet =
    PLANET_POSITIONS.find((entry) => entry.id === railDef.planetId) ?? PLANET_POSITIONS[0]!;
  const rail = buildComputedRail(railDef, { x: planet.x, y: planet.y, z: planet.z }, GAME_CONFIG);
  const railT = rail.totalLength * 0.35;
  const { pos, tangent } = sampleRailAt(rail, railT);
  const up = (() => {
    const dx = pos.x - planet.x;
    const dy = pos.y - planet.y;
    const dz = pos.z - planet.z;
    const len = Math.hypot(dx, dy, dz);
    return { x: dx / len, y: dy / len, z: dz / len };
  })();
  const offset = GAME_CONFIG.rail.visualRadius + GAME_CONFIG.movement.standingHeight;

  player.pos = {
    x: pos.x + up.x * offset,
    y: pos.y + up.y * offset,
    z: pos.z + up.z * offset,
  };
  player.vel = {
    x: tangent.x * GAME_CONFIG.rail.minEntrySpeed,
    y: tangent.y * GAME_CONFIG.rail.minEntrySpeed,
    z: tangent.z * GAME_CONFIG.rail.minEntrySpeed,
  };
  player.planetId = "";
  player.movementState = PlayerMovementState.Grinding;
  player.surfState = PlayerSurfState.SkiVisible;
  player.grindRailId = railDef.id;
  player.grindT = railT;
  player.lastGrindT = railT;
  player.grindSpeed = GAME_CONFIG.rail.minEntrySpeed;
  player.airTrickAirTimeMs = 0;
}

function trickInput(seq: number, pressedKeys: number): InputMessage {
  return {
    seq,
    keys: pressedKeys,
    pressedKeys,
    aimDir: { x: 0, y: 0, z: 1 },
    dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
  };
}

describe("MatchSimulation", () => {
  it("does not leave lobby when only bots are present", () => {
    const simulation = new MatchSimulation(FFA_MODE, { lobbyEnabled: true });

    const bot = simulation.addBot("bot-1");
    simulation.tick(simulation.tickIntervalMs);

    expect(bot.name.endsWith("Bot")).toBe(true);
    expect(simulation.matchState.matchPhase).toBe(MatchPhase.Lobby);
  });

  it("adds the Bot suffix to custom bot names exactly once", () => {
    const simulation = new MatchSimulation();

    const namedBot = simulation.addBot("bot-1", "Alpha");
    const preSuffixedBot = simulation.addBot("bot-2", "Bravo Bot");

    expect(namedBot.name).toBe("Alpha Bot");
    expect(preSuffixedBot.name).toBe("Bravo Bot");
  });

  it("can seed large friendly and enemy slime regions for movement testing when enabled", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: true });
    const planetPaint = simulation.matchState.planets;

    expect(getPaintAtPoint({ x: 0, y: 100, z: 0 }, "planet-0", planetPaint)?.paintGroupId).toBe(0);
    expect(getPaintAtPoint({ x: 0, y: -100, z: 0 }, "planet-0", planetPaint)?.paintGroupId).toBe(1);
    expect(simulation.getRecentPaintStamps().map((stamp) => stamp.paintGroupId)).toEqual(
      expect.arrayContaining([0, 1]),
    );
  });

  it("creates and removes players outside the room layer", () => {
    const simulation = new MatchSimulation();

    const player = simulation.addPlayer("session-1", "Alpha");

    expect(simulation.players.size).toBe(1);
    expect(player.name).toBe("Alpha");
    expect(player.paintGroupId).toBe(0);

    simulation.removePlayer("session-1");

    expect(simulation.players.size).toBe(0);
  });

  it("spawns players on their actual terrain contact using standing height", () => {
    const simulation = new MatchSimulation();
    const player = simulation.addPlayer("session-1", "Alpha");
    const planet =
      PLANET_POSITIONS.find((entry) => entry.id === player.planetId) ?? PLANET_POSITIONS[0]!;
    const dx = player.pos.x - planet.x;
    const dy = player.pos.y - planet.y;
    const dz = player.pos.z - planet.z;
    const len = Math.hypot(dx, dy, dz);
    const up = { x: dx / len, y: dy / len, z: dz / len };
    const expectedRadius =
      getTerrainRadius(up.x, up.y, up.z, GAME_CONFIG) + GAME_CONFIG.movement.standingHeight;

    expect(len).toBeCloseTo(expectedRadius, 5);
  });

  it("sanitizes join names and ignores coerced color indices", () => {
    const simulation = new MatchSimulation();

    const invalidName = simulation.addPlayer("session-1", "<>");
    const cleanedName = simulation.addPlayer("session-2", "  Alpha<script>  ", "3");
    const requestedColor = simulation.addPlayer("session-3", "Bravo", 3);

    expect(invalidName.name).toBe("Slime Rider");
    expect(cleanedName.name).toBe("Alphascript");
    expect(cleanedName.paletteIndex).toBe(1);
    expect(requestedColor.paletteIndex).toBe(3);
  });

  it("builds snapshot and leaderboard payloads from simulation state", () => {
    const simulation = new MatchSimulation();
    const player = simulation.addPlayer("session-1", "Alpha");
    simulation.tick(simulation.tickIntervalMs);

    const snapshot = simulation.buildSnapshotMessage();
    const leaderboard = simulation.buildLeaderboardMessage();

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]?.paintGroupId).toBe(player.paintGroupId);
    expect(snapshot.players[0]?.surfState).toBe(PlayerSurfState.SkiVisible);
    expect(snapshot.players[0]?.equippedWeaponId).toBe(player.equippedWeaponId);
    expect(snapshot.players[0]?.slimeLevel).toBe(player.slimeLevel);
    expect(snapshot.pickups.length).toBeGreaterThan(0);
    expect(leaderboard.entries).toHaveLength(1);
    expect(leaderboard.entries[0]?.name).toBe("Alpha");
    expect(leaderboard.entries[0]?.killCount).toBe(0);
    expect(leaderboard.entries[0]?.deathCount).toBe(0);
  });

  it("uses the explicit ffa mode definition for player assignment", () => {
    const simulation = new MatchSimulation(FFA_MODE);

    const first = simulation.addPlayer("session-1", "Alpha");
    const second = simulation.addPlayer("session-2", "Bravo");

    expect(first.teamId).toBe(255);
    expect(second.teamId).toBe(255);
    expect(first.paintGroupId).toBe(0);
    expect(second.paintGroupId).toBe(1);
    expect(first.slimeColor).toBe(FFA_MODE.palette[0]);
    expect(second.slimeColor).toBe(FFA_MODE.palette[1]);
    expect(simulation.buildLeaderboardMessage().teamScores).toHaveLength(0);
  });

  it("spreads new ffa spawns away from existing alive players", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });

    const first = simulation.addPlayer("session-1", "Alpha");
    const second = simulation.addPlayer("session-2", "Bravo");
    const third = simulation.addPlayer("session-3", "Charlie");

    expect(distanceBetweenPlayers(first, second)).toBeGreaterThan(55);
    expect(distanceBetweenPlayers(first, third)).toBeGreaterThan(40);
    expect(distanceBetweenPlayers(second, third)).toBeGreaterThan(40);
  });

  it("keeps team players on team colors and team-local spawn zones", () => {
    const simulation = new MatchSimulation(TEAMS_MODE, { seedTestPaint: false });

    const alpha = simulation.addPlayer("session-1", "Alpha", 1);
    const bravo = simulation.addPlayer("session-2", "Bravo", 0);
    const charlie = simulation.addPlayer("session-3", "Charlie");
    const delta = simulation.addPlayer("session-4", "Delta");

    expect(alpha.teamId).toBe(0);
    expect(charlie.teamId).toBe(0);
    expect(bravo.teamId).toBe(1);
    expect(delta.teamId).toBe(1);
    expect(alpha.paintGroupId).toBe(0);
    expect(bravo.paintGroupId).toBe(1);
    expect(alpha.slimeColor).toBe(TEAMS_MODE.teamColors[0]);
    expect(bravo.slimeColor).toBe(TEAMS_MODE.teamColors[1]);
    expect(TEAMS_MODE.slots[alpha.paletteIndex]?.teamId).toBe(alpha.teamId);
    expect(TEAMS_MODE.slots[bravo.paletteIndex]?.teamId).toBe(bravo.teamId);
    expect(distanceBetweenPlayers(alpha, charlie)).toBeLessThan(25);
    expect(distanceBetweenPlayers(bravo, delta)).toBeLessThan(25);
    expect(distanceBetweenPlayers(alpha, bravo)).toBeGreaterThan(80);
  });

  it("clusters dev spawns for faster combat testing without stacking players", () => {
    const simulation = new MatchSimulation(DEV_MODE, { seedTestPaint: false });

    const first = simulation.addPlayer("session-1", "Alpha");
    const second = simulation.addPlayer("session-2", "Bravo");
    const third = simulation.addPlayer("session-3", "Charlie");

    expect(distanceBetweenPlayers(first, second)).toBeGreaterThan(2);
    expect(distanceBetweenPlayers(second, third)).toBeGreaterThan(2);
    expect(distanceBetweenPlayers(first, second)).toBeLessThan(20);
    expect(distanceBetweenPlayers(first, third)).toBeLessThan(20);
    expect(distanceBetweenPlayers(second, third)).toBeLessThan(20);
  });

  it("uses map-distributed weapon pickups by default", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const pickups = Array.from(simulation.matchState.pickups.values());

    const highestPairDistance = pickups.reduce((maxDistance, pickup, index) => {
      for (const other of pickups.slice(index + 1)) {
        const dx = pickup.pos.x - other.pos.x;
        const dy = pickup.pos.y - other.pos.y;
        const dz = pickup.pos.z - other.pos.z;
        maxDistance = Math.max(maxDistance, Math.hypot(dx, dy, dz));
      }
      return maxDistance;
    }, 0);

    expect(highestPairDistance).toBeGreaterThan(60);
  });

  it("can cluster weapon pickups for fast server-side dev iteration", () => {
    const simulation = new MatchSimulation(FFA_MODE, {
      seedTestPaint: false,
      weaponPickupLayout: "cluster",
    });
    const pickups = Array.from(simulation.matchState.pickups.values());

    const highestPairDistance = pickups.reduce((maxDistance, pickup, index) => {
      for (const other of pickups.slice(index + 1)) {
        const dx = pickup.pos.x - other.pos.x;
        const dy = pickup.pos.y - other.pos.y;
        const dz = pickup.pos.z - other.pos.z;
        maxDistance = Math.max(maxDistance, Math.hypot(dx, dy, dz));
      }
      return maxDistance;
    }, 0);

    expect(highestPairDistance).toBeLessThan(50);
  });

  it("keeps pickup spawn anchors above the waterline", () => {
    const waterRadius = GAME_CONFIG.planet.radius + GAME_CONFIG.terrain.waterLevel;

    for (const spawn of [...MAP_WEAPON_PICKUP_SPAWNS, ...CLUSTER_WEAPON_PICKUP_SPAWNS]) {
      const terrainRadius = getTerrainRadius(
        spawn.normal.x,
        spawn.normal.y,
        spawn.normal.z,
        GAME_CONFIG,
      );
      expect(terrainRadius).toBeGreaterThan(waterRadius);
    }
  });

  it("keeps the map pickup layout at two spawns per weapon", () => {
    const counts = new Map<string, number>();

    for (const spawn of MAP_WEAPON_PICKUP_SPAWNS) {
      counts.set(spawn.weaponId, (counts.get(spawn.weaponId) ?? 0) + 1);
    }

    expect(counts.get(WeaponId.HeavyMachineGun)).toBe(2);
    expect(counts.get(WeaponId.Bazooka)).toBe(2);
    expect(counts.get(WeaponId.Sniper)).toBe(2);
  });

  it("advances the authoritative match timer inside simulation", () => {
    const simulation = new MatchSimulation();

    const result = simulation.tick(GAME_CONFIG.match.durationSeconds * 1000);

    expect(result.shouldBroadcastMatchPhase).toBe(true);
    expect(simulation.matchState.matchPhase).toBe(MatchPhase.Ended);
    expect(simulation.matchState.matchTimer).toBe(0);
  });

  it("broadcasts snapshots and leaderboards on configured tick cadence", () => {
    const simulation = new MatchSimulation();

    const first = simulation.tick(simulation.tickIntervalMs);
    expect(first.shouldBroadcastSnapshot).toBe(false);
    expect(first.shouldBroadcastLeaderboard).toBe(false);

    const second = simulation.tick(simulation.tickIntervalMs);
    expect(second.shouldBroadcastSnapshot).toBe(true);
    expect(second.shouldBroadcastLeaderboard).toBe(false);

    let latest = second;
    for (
      let tick = 3;
      tick <= NETWORK_CONFIG.simulation.tickRateHz / NETWORK_CONFIG.simulation.leaderboardRateHz;
      tick++
    ) {
      latest = simulation.tick(simulation.tickIntervalMs);
    }

    expect(latest.shouldBroadcastSnapshot).toBe(true);
    expect(latest.shouldBroadcastLeaderboard).toBe(true);
  });

  it("caps buffered inputs per player to the configured limit", () => {
    const capped = new MatchSimulation();
    capped.addPlayer("session-1", "Alpha");

    const control = new MatchSimulation();
    control.addPlayer("session-1", "Alpha");

    for (let seq = 1; seq <= NETWORK_CONFIG.input.maxBufferedInputs + 1; seq++) {
      capped.recordInput("session-1", createForwardInput(seq));
    }
    for (let seq = 2; seq <= NETWORK_CONFIG.input.maxBufferedInputs + 1; seq++) {
      control.recordInput("session-1", createForwardInput(seq));
    }

    capped.tick(capped.tickIntervalMs);
    control.tick(control.tickIntervalMs);

    expect(capped.buildSnapshotMessage().players[0]?.inputSeq).toBe(
      NETWORK_CONFIG.input.maxBufferedInputs + 1,
    );
    expect(snapshotX(capped, "session-1")).toBeCloseTo(snapshotX(control, "session-1"), 5);
  });

  it("rejects stale and duplicate input sequences", () => {
    const guarded = new MatchSimulation();
    guarded.addPlayer("session-1", "Alpha");
    guarded.recordInput("session-1", createForwardInput(2));
    guarded.tick(guarded.tickIntervalMs);

    const control = new MatchSimulation();
    control.addPlayer("session-1", "Alpha");
    control.recordInput("session-1", createForwardInput(2));
    control.tick(control.tickIntervalMs);

    guarded.recordInput("session-1", createForwardInput(1));
    guarded.recordInput("session-1", createForwardInput(2));
    guarded.recordInput("session-1", createForwardInput(3));
    control.recordInput("session-1", createForwardInput(3));

    guarded.tick(guarded.tickIntervalMs);
    control.tick(control.tickIntervalMs);

    expect(guarded.buildSnapshotMessage().players[0]?.inputSeq).toBe(3);
    expect(snapshotX(guarded, "session-1")).toBeCloseTo(snapshotX(control, "session-1"), 5);
  });

  it("rejects malformed input before it reaches simulation", () => {
    const guarded = new MatchSimulation();
    guarded.addPlayer("session-1", "Alpha");

    const control = new MatchSimulation();
    control.addPlayer("session-1", "Alpha");

    guarded.recordInput("session-1", {
      seq: Number.POSITIVE_INFINITY,
      keys: InputKey.Forward,
      aimDir: { x: 0, y: 0, z: 1 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    guarded.recordInput("session-1", {
      seq: 1,
      keys: InputKey.Forward,
      aimDir: { x: Number.NaN, y: 0, z: 1 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    guarded.recordInput("session-1", {
      seq: 2,
      keys: InputKey.Forward,
      aimDir: { x: 0, y: 0, z: 1 },
      dt: Number.NaN,
    });

    guarded.tick(guarded.tickIntervalMs);
    control.tick(control.tickIntervalMs);

    expect(guarded.buildSnapshotMessage().players[0]?.inputSeq).toBe(0);
    expect(snapshotX(guarded, "session-1")).toBeCloseTo(snapshotX(control, "session-1"), 5);
    expect(guarded.matchState.projectiles.size).toBe(0);
  });

  it("does not grant extra movement time for buffered max-dt inputs", () => {
    const guarded = new MatchSimulation();
    guarded.addPlayer("session-1", "Alpha");

    const control = new MatchSimulation();
    control.addPlayer("session-1", "Alpha");

    for (let seq = 1; seq <= NETWORK_CONFIG.input.maxBufferedInputs; seq++) {
      guarded.recordInput("session-1", {
        ...createForwardInput(seq),
        dt: 999,
      });
    }
    control.recordInput("session-1", createForwardInput(1));

    guarded.tick(guarded.tickIntervalMs);
    control.tick(control.tickIntervalMs);

    expect(guarded.buildSnapshotMessage().players[0]?.inputSeq).toBe(
      NETWORK_CONFIG.input.maxBufferedInputs,
    );
    expect(
      Math.abs(snapshotX(guarded, "session-1") - snapshotX(control, "session-1")),
    ).toBeLessThan(0.01);
  });

  it("does not let buffered fire inputs bypass server-time weapon cooldowns", () => {
    const simulation = new MatchSimulation();
    simulation.addPlayer("session-1", "Alpha");

    for (let seq = 1; seq <= NETWORK_CONFIG.input.maxBufferedInputs; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Fire,
        aimDir: { x: 1, y: 0, z: 0 },
        dt: 999,
      });
    }

    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.projectiles.size).toBe(1);
  });

  it("spawns authoritative projectiles when fire input is processed", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");

    simulation.recordInput("session-1", {
      seq: 1,
      keys: InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.projectiles.size).toBe(1);
    const projectile = Array.from(simulation.matchState.projectiles.values())[0];
    const muzzlePos = expectedMuzzlePos(shooter);
    expect(projectile?.ownerId).toBe("session-1");
    expect(projectile?.pos.x).toBeCloseTo(muzzlePos.x, 5);
    expect(projectile?.pos.y).toBeCloseTo(muzzlePos.y, 5);
    expect(projectile?.pos.z).toBeCloseTo(muzzlePos.z, 5);
  });

  it("aims authoritative projectiles from the muzzle toward the supplied aim point", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const machineGun = getWeaponDefinition(WeaponId.MachineGun);
    const muzzlePos = expectedMuzzlePos(shooter);
    const aimPoint = { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z + 10 };

    simulation.recordInput("session-1", {
      seq: 1,
      keys: InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      aimPoint,
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    const projectile = Array.from(simulation.matchState.projectiles.values())[0];
    const expectedAim = {
      x: aimPoint.x - projectile!.pos.x,
      y: aimPoint.y - projectile!.pos.y,
      z: aimPoint.z - projectile!.pos.z,
    };
    const expectedAimLength = Math.hypot(expectedAim.x, expectedAim.y, expectedAim.z);
    expect(projectile?.vel.x).toBeCloseTo(
      (expectedAim.x / expectedAimLength) * machineGun.projectileSpeed,
      5,
    );
    expect(projectile?.vel.y).toBeCloseTo(
      (expectedAim.y / expectedAimLength) * machineGun.projectileSpeed,
      5,
    );
    expect(projectile?.vel.z).toBeCloseTo(
      (expectedAim.z / expectedAimLength) * machineGun.projectileSpeed,
      5,
    );
  });

  it("hits a target that is very close to the shooter", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");
    const machineGun = getWeaponDefinition(WeaponId.MachineGun);

    target.pos = {
      x: shooter.pos.x + GAME_CONFIG.movement.collisionRadius,
      y: shooter.pos.y,
      z: shooter.pos.z,
    };
    target.vel = { x: 0, y: 0, z: 0 };
    target.planetId = shooter.planetId;

    simulation.recordInput("session-1", {
      seq: 1,
      keys: InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(target.health).toBe(GAME_CONFIG.player.maxHealth - machineGun.directDamage);
    expect(simulation.matchState.projectiles.size).toBe(0);
  });

  it("counts down disposable shots and reverts to default weapon when exhausted", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const bazooka = getWeaponDefinition(WeaponId.Bazooka);
    shooter.equippedWeaponId = WeaponId.Bazooka;
    shooter.disposableShotsRemaining = bazooka.disposableShots!;

    for (let seq = 1; seq <= bazooka.disposableShots!; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Fire,
        aimDir: { x: 1, y: 0, z: 0 },
        dt: bazooka.fireCooldownMs / 1000 + 0.1,
      });
      simulation.tick(bazooka.fireCooldownMs + 100);
    }

    expect(simulation.matchState.nextProjectileId).toBe(bazooka.disposableShots!);
    expect(shooter.equippedWeaponId).toBe(DEFAULT_WEAPON_ID);
    expect(shooter.disposableShotsRemaining).toBe(0);
  });

  it("keeps ski mode active and fires on the same tick", () => {
    const simulation = new MatchSimulation();
    const surfmer = simulation.addPlayer("session-1", "Alpha");
    paintPlayerSurface(simulation, surfmer.sessionId, surfmer.paintGroupId);

    simulation.tick(simulation.tickIntervalMs);

    expect(surfmer.surfState).toBe(PlayerSurfState.SurfmingHidden);

    simulation.recordInput("session-1", {
      seq: 2,
      keys: InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(surfmer.surfState).toBe(PlayerSurfState.SurfmingHidden);
    expect(simulation.matchState.projectiles.size).toBe(1);
    expect(simulation.buildSnapshotMessage().players[0]?.isShooting).toBe(true);
  });

  it("creates capped trick paint while airborne in ski mode", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const player = simulation.addPlayer("session-1", "Alpha");
    makeAirborneSkier(player);
    player.slimeLevel = GAME_CONFIG.tricks.minSlimeToTrick;

    simulation.recordInput("session-1", trickInput(1, InputKey.Left));
    simulation.tick(simulation.tickIntervalMs);
    expect(player.airTrickCombo).toBe(0);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);

    simulation.recordInput("session-1", trickInput(2, InputKey.Right));
    simulation.tick(simulation.tickIntervalMs);

    const events = simulation.drainTrickEventMessages();
    expect(player.airTrickCombo).toBe(1);
    expect(player.slimeLevel).toBeLessThan(GAME_CONFIG.tricks.minSlimeToTrick);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);
    expect(events).toEqual([
      {
        playerId: player.sessionId,
        trickId: "kickflip",
        combo: 1,
        seq: 1,
      },
    ]);

    landAirbornePlayer(simulation, player);

    const stamps = simulation.drainPaintStampMessages();
    expect(stamps).toHaveLength(1);
    expect(stamps[0]?.paintGroupId).toBe(player.paintGroupId);
    expect(simulation.matchState.paintSeq).toBe(stamps.length);
    expect(simulation.matchState.scores.get(player.paintGroupId.toString()) ?? 0).toBeGreaterThan(
      0,
    );
  });

  it("turns advanced air trick sequences into larger landing splats", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const player = simulation.addPlayer("session-1", "Alpha");
    makeAirborneSkier(player);
    player.slimeLevel = GAME_CONFIG.slime.maxLevel;

    const sequence = [InputKey.Left, InputKey.Forward, InputKey.Right, InputKey.Backward];
    for (let index = 0; index < sequence.length; index++) {
      simulation.recordInput("session-1", trickInput(index + 1, sequence[index]!));
      simulation.tick(simulation.tickIntervalMs);
    }

    const events = simulation.drainTrickEventMessages();
    expect(events).toEqual([
      {
        playerId: player.sessionId,
        trickId: "slimecopter",
        combo: 4,
        seq: 1,
      },
    ]);
    expect(player.airTrickCombo).toBe(4);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);

    landAirbornePlayer(simulation, player);

    const stamps = simulation.drainPaintStampMessages();
    expect(stamps).toHaveLength(1);
    expect(stamps[0]?.radius).toBe(getPaintStampChordRadius() * 4.2);
  });

  it("lets grinding players trigger trick combos and carry them until they land", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const player = simulation.addPlayer("session-1", "Alpha");
    makeGrindingSkier(player);
    player.slimeLevel = GAME_CONFIG.slime.maxLevel;

    simulation.recordInput("session-1", trickInput(1, InputKey.Left));
    simulation.tick(simulation.tickIntervalMs);
    simulation.recordInput("session-1", trickInput(2, InputKey.Right));
    simulation.tick(simulation.tickIntervalMs);

    expect(player.movementState).toBe(PlayerMovementState.Grinding);
    expect(player.airTrickCombo).toBe(1);
    expect(simulation.drainTrickEventMessages()).toEqual([
      {
        playerId: player.sessionId,
        trickId: "kickflip",
        combo: 1,
        seq: 1,
      },
    ]);
    simulation.drainPaintStampMessages();

    player.grindT = 0.01;
    player.lastGrindT = player.grindT;
    player.grindSpeed = -GAME_CONFIG.rail.maxGrindSpeed * 12;
    simulation.tick(simulation.tickIntervalMs);

    expect(player.movementState).toBe(PlayerMovementState.Airborne);
    expect(player.airTrickCombo).toBe(1);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);

    landAirbornePlayer(simulation, player);
    expect(simulation.drainPaintStampMessages()).toHaveLength(1);
    expect(player.airTrickCombo).toBe(0);
  });

  it("includes rail grinding state in snapshots for client reconciliation", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const player = simulation.addPlayer("session-1", "Alpha");
    makeGrindingSkier(player);

    const snapshot = simulation.buildSnapshotMessage();
    const playerSnapshot = snapshot.players.find((entry) => entry.sessionId === player.sessionId);

    expect(playerSnapshot?.movementState).toBe(PlayerMovementState.Grinding);
    expect(playerSnapshot?.grindRailId).toBe(player.grindRailId);
    expect(playerSnapshot?.grindT).toBe(player.grindT);
    expect(playerSnapshot?.lastGrindT).toBe(player.lastGrindT);
    expect(playerSnapshot?.grindSpeed).toBe(player.grindSpeed);
    expect(playerSnapshot?.grindCooldownMs).toBe(player.grindCooldownMs);
  });

  it("gates trick paint by ski mode, airtime, cooldown, and landing reset", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const player = simulation.addPlayer("session-1", "Alpha");
    makeAirborneSkier(player);

    player.surfState = PlayerSurfState.None;
    simulation.recordInput("session-1", trickInput(1, InputKey.Left));
    simulation.tick(simulation.tickIntervalMs);
    simulation.recordInput("session-1", trickInput(2, InputKey.Right));
    simulation.tick(simulation.tickIntervalMs);
    expect(player.airTrickCombo).toBe(0);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);

    player.surfState = PlayerSurfState.SkiVisible;
    player.airTrickAirTimeMs = 0;
    simulation.recordInput("session-1", trickInput(3, InputKey.Left));
    simulation.tick(simulation.tickIntervalMs);
    simulation.recordInput("session-1", trickInput(4, InputKey.Right));
    simulation.tick(simulation.tickIntervalMs);
    expect(player.airTrickCombo).toBe(0);

    player.airTrickAirTimeMs = GAME_CONFIG.tricks.minAirTimeMs;
    simulation.recordInput("session-1", trickInput(5, InputKey.Left));
    simulation.tick(simulation.tickIntervalMs);
    simulation.recordInput("session-1", trickInput(6, InputKey.Right));
    simulation.tick(simulation.tickIntervalMs);
    expect(player.airTrickCombo).toBe(1);
    const firstBurst = simulation.drainPaintStampMessages().length;
    const firstEvents = simulation.drainTrickEventMessages();
    expect(firstBurst).toBe(0);
    expect(firstEvents[0]?.trickId).toBe("kickflip");

    simulation.recordInput("session-1", trickInput(7, InputKey.Left));
    simulation.tick(simulation.tickIntervalMs);
    simulation.recordInput("session-1", trickInput(8, InputKey.Right));
    simulation.tick(simulation.tickIntervalMs);
    expect(player.airTrickCombo).toBe(1);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);
    expect(simulation.drainTrickEventMessages()).toHaveLength(0);

    landAirbornePlayer(simulation, player);
    expect(simulation.drainPaintStampMessages()).toHaveLength(1);
    expect(player.airTrickCombo).toBe(0);
    expect(player.airTrickAirTimeMs).toBe(0);
  });

  it("emits named spin trick events from held air rotation", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const player = simulation.addPlayer("session-1", "Alpha");
    makeAirborneSkier(player);

    for (let seq = 1; seq <= 10; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Right,
        aimDir: { x: 0, y: 0, z: 1 },
        dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    const events = simulation.drainTrickEventMessages();
    expect(events.some((event) => event.trickId === "spin360")).toBe(true);
    expect(player.airTrickCombo).toBeGreaterThanOrEqual(1);
    expect(simulation.drainPaintStampMessages()).toHaveLength(0);

    landAirbornePlayer(simulation, player);
    expect(simulation.drainPaintStampMessages().length).toBeGreaterThan(0);
  });

  it("emits named flip trick events from held forward and backward air rotation", () => {
    const frontSimulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const frontPlayer = frontSimulation.addPlayer("session-1", "Alpha");
    makeAirborneSkier(frontPlayer);

    for (let seq = 1; seq <= 10; seq++) {
      frontSimulation.recordInput("session-1", {
        seq,
        keys: InputKey.Forward,
        aimDir: { x: 0, y: 0, z: 1 },
        dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
      });
      frontSimulation.tick(frontSimulation.tickIntervalMs);
    }

    const frontEvents = frontSimulation.drainTrickEventMessages();
    expect(frontEvents.some((event) => event.trickId === "frontflip")).toBe(true);

    const backSimulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const backPlayer = backSimulation.addPlayer("session-1", "Alpha");
    makeAirborneSkier(backPlayer);

    for (let seq = 1; seq <= 10; seq++) {
      backSimulation.recordInput("session-1", {
        seq,
        keys: InputKey.Backward,
        aimDir: { x: 0, y: 0, z: 1 },
        dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
      });
      backSimulation.tick(backSimulation.tickIntervalMs);
    }

    const backEvents = backSimulation.drainTrickEventMessages();
    expect(backEvents.some((event) => event.trickId === "backflip")).toBe(true);
  });

  it("keeps a submerged player in surf mode when they survive a hit", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");
    paintPlayerSurface(simulation, target.sessionId, target.paintGroupId);

    simulation.tick(simulation.tickIntervalMs);

    expect(target.surfState).toBe(PlayerSurfState.SurfmingHidden);

    simulation.matchState.projectiles.set("hit-submerged", {
      id: "hit-submerged",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.MachineGun,
      paintGroupId: shooter.paintGroupId,
      slimeColor: shooter.slimeColor,
      patternId: 0,
      pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      planetId: target.planetId,
      lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(target.surfState).toBe(PlayerSurfState.SurfmingHidden);
    expect(target.health).toBeLessThan(GAME_CONFIG.player.maxHealth);
  });

  it.each([
    PlayerSurfState.SurfmingHidden,
    PlayerSurfState.SurfmingMoving,
    PlayerSurfState.SkiVisible,
    PlayerSurfState.SkiWater,
  ])("preserves surf mode %s when the player survives a hit", (surfState) => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    target.surfState = surfState;
    target.isCarving = true;
    target.skiJumpCharge = 0.75;

    simulation.matchState.projectiles.set("hit-surfer", {
      id: "hit-surfer",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.MachineGun,
      paintGroupId: shooter.paintGroupId,
      slimeColor: shooter.slimeColor,
      patternId: 0,
      pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      planetId: target.planetId,
      lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(target.surfState).toBe(surfState);
    expect(target.health).toBeLessThan(GAME_CONFIG.player.maxHealth);
  });

  it("prevents bots from targeting a player hidden in their own slime", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const simulation = new MatchSimulation();
      const bot = simulation.addBot("bot-1", undefined, {
        profile: {
          aggression: 8,
          prefersAttackBias: 1,
          prefersTerritoryBias: 0.2,
          prefersSurfBias: 0.1,
        },
      });
      const target = simulation.addPlayer("session-1", "Hidden");

      bot.pos = { ...target.pos };
      bot.planetId = target.planetId;
      bot.teamId = 255;

      paintPlayerSurface(simulation, target.sessionId, target.paintGroupId);
      target.surfState = PlayerSurfState.SurfmingHidden;

      const hiddenInput = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);
      expect(hiddenInput.keys & InputKey.Fire).toBe(0);

      simulation.matchState.elapsedMs += 1000;
      target.lastFireTimeMs = simulation.matchState.elapsedMs;
      const revealedInput = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);
      expect(revealedInput.keys & InputKey.Fire).toBe(InputKey.Fire);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("keeps bots in ski mode on the surface instead of leaving them unsurfed", () => {
    const simulation = new MatchSimulation();
    const bot = simulation.addBot("bot-surf", undefined, {
      profile: {
        aggression: 4,
        prefersAttackBias: 0.3,
        prefersTerritoryBias: 0.7,
        prefersSurfBias: 0.5,
      },
    });

    const input = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);

    expect(input.keys & InputKey.Submerge).toBe(0);
  });

  it("makes bots fire at territory when no enemy target is available", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const simulation = new MatchSimulation();
      const bot = simulation.addBot("bot-territory", undefined, {
        profile: {
          aggression: 4,
          prefersAttackBias: 0.2,
          prefersTerritoryBias: 1,
          prefersSurfBias: 0.1,
        },
      });

      simulation.matchState.elapsedMs = 1000;
      const input = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);

      expect(input.keys & InputKey.Fire).toBe(InputKey.Fire);
      expect(input.keys & InputKey.Forward).toBe(InputKey.Forward);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("makes surfer bots emit airborne trick inputs", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const simulation = new MatchSimulation();
      const bot = simulation.addBot("bot-surfer-tricks", undefined, {
        profile: {
          aggression: 2,
          prefersAttackBias: 0.1,
          prefersTerritoryBias: 0.3,
          prefersSurfBias: 1,
        },
      });

      makeAirborneSkier(bot);

      const first = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);
      const second = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);

      expect(first.pressedKeys).toBe(InputKey.Left);
      expect(second.pressedKeys).toBe(InputKey.Forward);
      expect(first.keys & InputKey.Left).toBe(InputKey.Left);
      expect(second.keys & InputKey.Forward).toBe(InputKey.Forward);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("allows non-surfer bots to emit airborne trick inputs too", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      const simulation = new MatchSimulation();
      const bot = simulation.addBot("bot-territory-tricks", undefined, {
        profile: {
          aggression: 4,
          prefersAttackBias: 0.2,
          prefersTerritoryBias: 1,
          prefersSurfBias: 0.2,
        },
      });

      makeAirborneSkier(bot);

      const input = generateBotInput(bot, simulation.matchState, simulation.tickIntervalMs);

      expect(input.pressedKeys).toBe(InputKey.Left);
      expect(input.keys & InputKey.Left).toBe(InputKey.Left);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("recharges slime slowly by default, faster on friendly paint, and fastest while skiing", () => {
    const neutralSimulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const paintedSimulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const skiingSimulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });

    const neutral = neutralSimulation.addPlayer("session-1", "Neutral");
    const painted = paintedSimulation.addPlayer("session-1", "Painted");
    const skier = skiingSimulation.addPlayer("session-1", "Skier");

    neutral.slimeLevel = 0;
    painted.slimeLevel = 0;
    skier.slimeLevel = 0;
    painted.surfState = PlayerSurfState.None;

    paintPlayerSurface(paintedSimulation, painted.sessionId, painted.paintGroupId, 0.25);
    paintPlayerSurface(skiingSimulation, skier.sessionId, skier.paintGroupId, 0.25);
    skier.surfState = PlayerSurfState.SkiVisible;

    neutralSimulation.tick(1000);
    paintedSimulation.tick(1000);
    skiingSimulation.tick(1000);

    expect(neutral.slimeLevel).toBeCloseTo(GAME_CONFIG.slime.passiveRechargePerSecond, 5);
    expect(painted.slimeLevel).toBeCloseTo(GAME_CONFIG.slime.friendlyPaintRechargePerSecond, 5);
    expect(skier.slimeLevel).toBeCloseTo(GAME_CONFIG.slime.submergedRechargePerSecond, 5);
    expect(neutral.slimeLevel).toBeLessThan(painted.slimeLevel);
    expect(painted.slimeLevel).toBeLessThan(skier.slimeLevel);
  });

  it("equips a bazooka when the player touches an active pickup", () => {
    const simulation = new MatchSimulation();
    const player = simulation.addPlayer("session-1", "Alpha");
    const pickup = Array.from(simulation.matchState.pickups.values()).find(
      (candidate) => candidate.weaponId === WeaponId.Bazooka && candidate.active,
    );

    if (!pickup) {
      throw new Error("expected a bazooka pickup");
    }

    player.pos = {
      x: pickup.pos.x - pickup.normal.x * GAME_CONFIG.pickups.hoverHeight,
      y: pickup.pos.y - pickup.normal.y * GAME_CONFIG.pickups.hoverHeight,
      z: pickup.pos.z - pickup.normal.z * GAME_CONFIG.pickups.hoverHeight,
    };
    player.planetId = pickup.planetId;
    simulation.tick(simulation.tickIntervalMs);

    expect(player.equippedWeaponId).toBe(WeaponId.Bazooka);
    expect(pickup.active).toBe(false);
    expect(simulation.buildSnapshotMessage().pickups.some((entry) => entry.id === pickup.id)).toBe(
      false,
    );
  });

  it("equips a heavy machine gun when the player touches its pickup", () => {
    const simulation = new MatchSimulation();
    const player = simulation.addPlayer("session-1", "Alpha");
    const pickup = Array.from(simulation.matchState.pickups.values()).find(
      (candidate) => candidate.weaponId === WeaponId.HeavyMachineGun && candidate.active,
    );

    if (!pickup) {
      throw new Error("expected a heavy machine gun pickup");
    }

    player.pos = {
      x: pickup.pos.x - pickup.normal.x * GAME_CONFIG.pickups.hoverHeight,
      y: pickup.pos.y - pickup.normal.y * GAME_CONFIG.pickups.hoverHeight,
      z: pickup.pos.z - pickup.normal.z * GAME_CONFIG.pickups.hoverHeight,
    };
    player.planetId = pickup.planetId;
    simulation.tick(simulation.tickIntervalMs);

    expect(player.equippedWeaponId).toBe(WeaponId.HeavyMachineGun);
    expect(player.disposableShotsRemaining).toBe(
      getWeaponDefinition(WeaponId.HeavyMachineGun).disposableShots,
    );
  });

  it("spins up before a heavy machine gun starts spraying", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");
    const heavyMachineGun = getWeaponDefinition(WeaponId.HeavyMachineGun);
    shooter.equippedWeaponId = WeaponId.HeavyMachineGun;
    shooter.disposableShotsRemaining = heavyMachineGun.disposableShots!;
    target.pos = {
      x: shooter.pos.x,
      y: shooter.pos.y + 4,
      z: shooter.pos.z + 10,
    };
    target.planetId = "";
    target.movementState = PlayerMovementState.Airborne;

    const ticksToSpinUp = Math.ceil((heavyMachineGun.spinUpMs ?? 0) / simulation.tickIntervalMs);
    for (let seq = 1; seq <= ticksToSpinUp; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Fire,
        aimDir: { x: 0, y: 0, z: 1 },
        aimPoint: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        dt: simulation.tickIntervalMs / 1000,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    expect(target.health).toBe(GAME_CONFIG.player.maxHealth);
    expect(simulation.matchState.projectiles.size).toBe(0);

    for (let seq = ticksToSpinUp + 1; seq <= ticksToSpinUp + 12; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Fire,
        aimDir: { x: 0, y: 0, z: 1 },
        aimPoint: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        dt: simulation.tickIntervalMs / 1000,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    expect(simulation.matchState.projectiles.size).toBe(0);
    expect(shooter.disposableShotsRemaining).toBeLessThan(heavyMachineGun.disposableShots!);
    expect(
      simulation
        .drainPaintStampMessages()
        .some((stamp) => stamp.paintGroupId === shooter.paintGroupId),
    ).toBe(true);
  });

  it("lets the heavy machine gun hit a grounded player after spin-up", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");
    const heavyMachineGun = getWeaponDefinition(WeaponId.HeavyMachineGun);
    shooter.equippedWeaponId = WeaponId.HeavyMachineGun;
    shooter.disposableShotsRemaining = heavyMachineGun.disposableShots!;

    target.pos = {
      x: shooter.pos.x,
      y: shooter.pos.y,
      z: shooter.pos.z + 10,
    };
    target.planetId = shooter.planetId;
    target.movementState = PlayerMovementState.Idle;

    const ticksToSpinUp = Math.ceil((heavyMachineGun.spinUpMs ?? 0) / simulation.tickIntervalMs);
    for (let seq = 1; seq <= ticksToSpinUp + 16; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Fire,
        aimDir: { x: 0, y: 0, z: 1 },
        aimPoint: {
          x: target.pos.x,
          y: target.pos.y + GAME_CONFIG.player.projectileMuzzleHeight * 0.7,
          z: target.pos.z,
        },
        dt: simulation.tickIntervalMs / 1000,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    expect(target.health).toBeLessThan(GAME_CONFIG.player.maxHealth);
    expect(simulation.matchState.projectiles.size).toBe(0);
  });

  it("keeps zero-radius hitscan weapons on the visible player target radius", () => {
    expect(getWeaponDefinition(WeaponId.HeavyMachineGun).projectileCollisionRadius).toBe(0);
    expect(getPlayerTargetRadius()).toBeCloseTo(
      GAME_CONFIG.movement.collisionRadius * GAME_CONFIG.player.targetRadiusMultiplier,
    );
    expect(getPlayerTargetRadius()).toBeGreaterThan(GAME_CONFIG.movement.collisionRadius);
  });

  it("reverts a heavy machine gun pickup to Pew Pew after the disposable spray runs out", () => {
    const simulation = new MatchSimulation(FFA_MODE, { seedTestPaint: false });
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const heavyMachineGun = getWeaponDefinition(WeaponId.HeavyMachineGun);
    shooter.equippedWeaponId = WeaponId.HeavyMachineGun;
    shooter.disposableShotsRemaining = heavyMachineGun.disposableShots!;

    const maxSeq =
      Math.ceil((heavyMachineGun.spinUpMs ?? 0) / simulation.tickIntervalMs) +
      (heavyMachineGun.disposableShots ?? 0) * 3;
    for (let seq = 1; seq <= maxSeq; seq++) {
      simulation.recordInput("session-1", {
        seq,
        keys: InputKey.Fire,
        aimDir: { x: 0, y: 0, z: 1 },
        aimPoint: { x: shooter.pos.x, y: shooter.pos.y, z: shooter.pos.z + 40 },
        dt: simulation.tickIntervalMs / 1000,
      });
      simulation.tick(simulation.tickIntervalMs);
      if (shooter.disposableShotsRemaining === 0) break;
    }

    expect(shooter.equippedWeaponId).toBe(DEFAULT_WEAPON_ID);
    expect(shooter.disposableShotsRemaining).toBe(0);
  });

  it("applies bazooka splash damage to nearby players", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");
    const nearby = simulation.addPlayer("session-3", "Charlie");

    nearby.pos = { x: target.pos.x + 1.2, y: target.pos.y, z: target.pos.z };
    nearby.planetId = target.planetId;

    const bazooka = getWeaponDefinition(WeaponId.Bazooka);
    simulation.matchState.projectiles.set("bazooka-hit", {
      id: "bazooka-hit",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.Bazooka,
      paintGroupId: shooter.paintGroupId,
      slimeColor: shooter.slimeColor,
      patternId: 0,
      pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      planetId: target.planetId,
      lifeMs: bazooka.projectileLifetimeMs,
    });

    simulation.tick(simulation.tickIntervalMs);

    expect(target.health).toBe(0);
    expect(target.movementState).toBe(PlayerMovementState.Dead);
    expect(nearby.health).toBeLessThan(GAME_CONFIG.player.maxHealth);
    expect(nearby.movementState).toBe(PlayerMovementState.Airborne);
    expect(Math.hypot(nearby.vel.x, nearby.vel.y, nearby.vel.z)).toBeGreaterThan(0);
    expect(
      simulation
        .getRecentPaintStamps()
        .filter((stamp) => stamp.paintGroupId === shooter.paintGroupId).length,
    ).toBeGreaterThanOrEqual(GAME_CONFIG.paint.deathBurstStampCount);
  });

  it("launches the shooter when a bazooka blast hits the ground underneath them", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const bazooka = getWeaponDefinition(WeaponId.Bazooka);
    const normal = { x: 0, y: 1, z: 0 };
    const surfaceRadius = getTerrainRadius(normal.x, normal.y, normal.z, GAME_CONFIG);
    const planet = PLANET_POSITIONS[0]!;
    shooter.pos = {
      x: planet.x,
      y: planet.y + surfaceRadius + GAME_CONFIG.movement.collisionRadius,
      z: planet.z,
    };
    shooter.vel = { x: 0, y: 0, z: 0 };
    shooter.planetId = planet.id;
    shooter.movementState = PlayerMovementState.Idle;

    const impactSpeed = 3 / (simulation.tickIntervalMs / 1000);
    simulation.matchState.projectiles.set("rocket-jump-test", {
      id: "rocket-jump-test",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.Bazooka,
      paintGroupId: shooter.paintGroupId,
      slimeColor: shooter.slimeColor,
      patternId: 0,
      pos: {
        x: shooter.pos.x,
        y: shooter.pos.y + 2,
        z: shooter.pos.z,
      },
      vel: { x: 0, y: -impactSpeed, z: 0 },
      planetId: "",
      lifeMs: bazooka.projectileLifetimeMs,
    });

    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.projectiles.size).toBe(0);
    expect(shooter.movementState).toBe(PlayerMovementState.Airborne);
    expect(shooter.planetId).toBe("");
    expect(shooter.vel.y).toBeGreaterThan(0);
  });

  it("applies paint when an airborne projectile hits a planet surface", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");

    const planetId = "planet-0";
    const targetNormal = surfaceNormalForCell(0, 0);
    const targetPoint = surfacePointForCell(planetId, 0, 0);
    const impactSpeed = 6 / (simulation.tickIntervalMs / 1000);
    // Projectile is airborne (planetId = "") so the launch-planet skip does not
    // apply, and the surface collision is detected as it enters planet-0.
    simulation.matchState.projectiles.set("surface-test", {
      id: "surface-test",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.MachineGun,
      paintGroupId: shooter.paintGroupId,
      slimeColor: shooter.slimeColor,
      patternId: 0,
      pos: {
        x: targetPoint.x + targetNormal.x * 5,
        y: targetPoint.y + targetNormal.y * 5,
        z: targetPoint.z + targetNormal.z * 5,
      },
      vel: {
        x: -targetNormal.x * impactSpeed,
        y: -targetNormal.y * impactSpeed,
        z: -targetNormal.z * impactSpeed,
      },
      planetId: "",
      lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
    });

    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.projectiles.size).toBe(0);
    expect(simulation.getRecentPaintStamps().some((stamp) => stamp.planetId === planetId)).toBe(
      true,
    );
    expect(simulation.matchState.scores.get(shooter.paintGroupId.toString()) ?? 0).toBeGreaterThan(
      0,
    );
  });

  it("sweeps projectile terrain collision across curved surface chords", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const machineGun = getWeaponDefinition(WeaponId.MachineGun);
    const planet = PLANET_POSITIONS[0]!;
    const startNormal = { x: 0, y: 1, z: 0 };
    const endAngle = 0.45;
    const endNormal = { x: 0, y: Math.cos(endAngle), z: Math.sin(endAngle) };
    const startRadius = getTerrainRadius(startNormal.x, startNormal.y, startNormal.z, GAME_CONFIG);
    const endRadius = getTerrainRadius(endNormal.x, endNormal.y, endNormal.z, GAME_CONFIG);
    const start = {
      x: planet.x + startNormal.x * (startRadius + 2),
      y: planet.y + startNormal.y * (startRadius + 2),
      z: planet.z + startNormal.z * (startRadius + 2),
    };
    const end = {
      x: planet.x + endNormal.x * (endRadius + 2),
      y: planet.y + endNormal.y * (endRadius + 2),
      z: planet.z + endNormal.z * (endRadius + 2),
    };
    const tickSeconds = simulation.tickIntervalMs / 1000;

    simulation.matchState.projectiles.set("surface-chord-test", {
      id: "surface-chord-test",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.MachineGun,
      paintGroupId: shooter.paintGroupId,
      slimeColor: shooter.slimeColor,
      patternId: 0,
      pos: start,
      vel: {
        x: (end.x - start.x) / tickSeconds,
        y: (end.y - start.y) / tickSeconds,
        z: (end.z - start.z) / tickSeconds,
      },
      planetId: "",
      lifeMs: machineGun.projectileLifetimeMs,
    });

    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.projectiles.size).toBe(0);
    expect(simulation.getRecentPaintStamps().some((stamp) => stamp.planetId === planet.id)).toBe(
      true,
    );
  });

  // holding off on multiple planets until I can figure out space flight/movement
  // it("applies paint when firing from one planet into the adjacent planet", () => {
  //   const simulation = new MatchSimulation();
  //   const shooter = simulation.addPlayer("session-1", "Alpha");
  //   const targetPlanetId = "planet-1";
  //   const targetPoint = surfacePointForCell(targetPlanetId, 5, 12);
  //   shooter.pos = { x: -150, y: 0, z: 0 };
  //   shooter.vel = { x: 0, y: 0, z: 0 };
  //   shooter.planetId = "planet-0";
  //   shooter.movementState = PlayerMovementState.Idle;

  //   const aimLength = Math.hypot(
  //     targetPoint.x - shooter.pos.x,
  //     targetPoint.y - shooter.pos.y,
  //     targetPoint.z - shooter.pos.z,
  //   );
  //   simulation.recordInput("session-1", {
  //     seq: 1,
  //     keys: InputKey.Fire,
  //     aimDir: {
  //       x: (targetPoint.x - shooter.pos.x) / aimLength,
  //       y: (targetPoint.y - shooter.pos.y) / aimLength,
  //       z: (targetPoint.z - shooter.pos.z) / aimLength,
  //     },
  //     dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
  //   });

  //   for (let tick = 0; tick < NETWORK_CONFIG.simulation.tickRateHz * 3; tick++) {
  //     simulation.tick(simulation.tickIntervalMs);
  //     if (simulation.getRecentPaintStamps().some((stamp) => stamp.planetId === targetPlanetId)) {
  //       break;
  //     }
  //   }

  //   expect(
  //     simulation.getRecentPaintStamps().some((stamp) => stamp.planetId === targetPlanetId),
  //   ).toBe(true);
  //   expect(simulation.matchState.scores.get(shooter.paintGroupId.toString()) ?? 0).toBeGreaterThan(
  //     0,
  //   );
  // });

  it("applies projectile damage and respawns defeated players", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    target.vel = { x: 0, y: 0, z: 0 };

    for (let shot = 0; shot < MACHINE_GUN_KILL_SHOTS; shot++) {
      simulation.matchState.projectiles.set(`test-${shot}`, {
        id: `test-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
        slimeColor: shooter.slimeColor,
        patternId: 0,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        planetId: target.planetId,
        lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    expect(target.health).toBe(0);
    expect(target.movementState).toBe(PlayerMovementState.Dead);
    expect(target.respawnTimer).toBe(GAME_CONFIG.respawn.durationSeconds);
    expect(shooter.killCount).toBe(1);
    expect(target.deathCount).toBe(1);
    expect(
      simulation.getRecentPaintStamps().some((stamp) => stamp.planetId === target.planetId),
    ).toBe(true);
    expect(simulation.matchState.scores.get(shooter.paintGroupId.toString()) ?? 0).toBeGreaterThan(
      0,
    );

    simulation.tick(GAME_CONFIG.respawn.durationSeconds * 1000);

    expect(target.health).toBe(GAME_CONFIG.player.maxHealth);
    expect(target.movementState).toBe(PlayerMovementState.Idle);
    expect(target.surfState).toBe(PlayerSurfState.SkiVisible);
    expect(target.respawnTimer).toBe(0);
    expect(distanceBetweenPlayers(shooter, target)).toBeGreaterThan(40);
  });

  it("counts one kill and one death for an elimination in the leaderboard payload", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    for (let shot = 0; shot < MACHINE_GUN_KILL_SHOTS; shot++) {
      simulation.matchState.projectiles.set(`leaderboard-kd-${shot}`, {
        id: `leaderboard-kd-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
        slimeColor: shooter.slimeColor,
        patternId: 0,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        planetId: target.planetId,
        lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    const leaderboard = simulation.buildLeaderboardMessage();
    const shooterEntry = leaderboard.entries.find((entry) => entry.sessionId === shooter.sessionId);
    const targetEntry = leaderboard.entries.find((entry) => entry.sessionId === target.sessionId);

    expect(shooterEntry?.killCount).toBe(1);
    expect(shooterEntry?.deathCount).toBe(0);
    expect(targetEntry?.killCount).toBe(0);
    expect(targetEntry?.deathCount).toBe(1);
  });

  it("emits kill events with weapon and identity data for confirmed eliminations", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    for (let shot = 0; shot < MACHINE_GUN_KILL_SHOTS; shot++) {
      simulation.matchState.projectiles.set(`test-${shot}`, {
        id: `kill-feed-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
        slimeColor: shooter.slimeColor,
        patternId: shooter.patternId,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        planetId: target.planetId,
        lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
      });
      simulation.tick(simulation.tickIntervalMs);
    }

    const killEvents = simulation.drainKillEventMessages();

    expect(killEvents).toHaveLength(1);
    expect(killEvents[0]).toMatchObject({
      killerSessionId: shooter.sessionId,
      killerName: shooter.name,
      killerSlimeColor: shooter.slimeColor,
      killerPatternId: shooter.patternId,
      victimSessionId: target.sessionId,
      victimName: target.name,
      victimSlimeColor: target.slimeColor,
      victimPatternId: target.patternId,
      weaponId: WeaponId.MachineGun,
      isSelfKill: false,
    });
    expect(killEvents[0]?.seq).toBeGreaterThan(0);
    expect(simulation.drainKillEventMessages()).toHaveLength(0);
  });

  it("counts respawn time down over intermediate ticks before reviving the player", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    for (let shot = 0; shot < MACHINE_GUN_KILL_SHOTS; shot++) {
      simulation.matchState.projectiles.set(`respawn-check-${shot}`, {
        id: `respawn-check-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
        slimeColor: shooter.slimeColor,
        patternId: 0,
        pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
        vel: { x: 0, y: 0, z: 0 },
        planetId: target.planetId,
        lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
      });
    }

    simulation.tick(simulation.tickIntervalMs);

    expect(target.movementState).toBe(PlayerMovementState.Dead);
    expect(target.respawnTimer).toBe(GAME_CONFIG.respawn.durationSeconds);

    simulation.tick(2000);

    expect(target.movementState).toBe(PlayerMovementState.Dead);
    expect(target.health).toBe(0);
    expect(target.respawnTimer).toBeCloseTo(GAME_CONFIG.respawn.durationSeconds - 2, 5);

    simulation.tick(3000);

    expect(target.health).toBe(GAME_CONFIG.player.maxHealth);
    expect(target.movementState).toBe(PlayerMovementState.Idle);
    expect(target.respawnTimer).toBe(0);
  });
});

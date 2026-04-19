import { describe, expect, it } from "vite-plus/test";
import { getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import { FFA_MODE } from "@splat/content/modes/gameModes.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { appendPaintStamp } from "../paint/paintDetection.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";
import { PlayerMovementState, PlayerSwimState } from "./simState.ts";
import { MatchSimulation } from "./matchSimulation.ts";

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

function surfaceNormalForCell(row: number, col: number): { x: number; y: number; z: number } {
  const rows = GAME_CONFIG.paint.territoryRows;
  const cols = GAME_CONFIG.paint.territoryCols;
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
  radius = 0.04,
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
  });
}

describe("MatchSimulation", () => {
  it("creates and removes players outside the room layer", () => {
    const simulation = new MatchSimulation();

    const player = simulation.addPlayer("session-1", "Alpha");

    expect(simulation.players.size).toBe(1);
    expect(player.name).toBe("Alpha");
    expect(player.paintGroupId).toBe(0);

    simulation.removePlayer("session-1");

    expect(simulation.players.size).toBe(0);
  });

  it("builds snapshot and leaderboard payloads from simulation state", () => {
    const simulation = new MatchSimulation();
    const player = simulation.addPlayer("session-1", "Alpha");
    simulation.tick(simulation.tickIntervalMs);

    const snapshot = simulation.buildSnapshotMessage();
    const leaderboard = simulation.buildLeaderboardMessage();

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]?.paintGroupId).toBe(player.paintGroupId);
    expect(snapshot.players[0]?.swimState).toBe(PlayerSwimState.None);
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
      x: shooter.pos.x + GAME_CONFIG.player.collisionRadius,
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

  it("consumes slime on accepted shots and rejects firing without enough slime", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const bazooka = getWeaponDefinition(WeaponId.Bazooka);
    shooter.equippedWeaponId = WeaponId.Bazooka;
    shooter.slimeLevel = bazooka.slimeCost;

    simulation.recordInput("session-1", {
      seq: 1,
      keys: InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.nextProjectileId).toBe(1);
    expect(shooter.slimeLevel).toBeCloseTo(
      GAME_CONFIG.slime.passiveRechargePerSecond / NETWORK_CONFIG.simulation.tickRateHz,
      5,
    );

    simulation.recordInput("session-1", {
      seq: 2,
      keys: InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(simulation.matchState.nextProjectileId).toBe(1);
    expect(shooter.slimeLevel).toBeLessThan(bazooka.slimeCost);
  });

  it("pops a submerged player out and fires on the same tick", () => {
    const simulation = new MatchSimulation();
    const swimmer = simulation.addPlayer("session-1", "Alpha");
    paintPlayerSurface(simulation, swimmer.sessionId, swimmer.paintGroupId);

    simulation.recordInput("session-1", {
      seq: 1,
      keys: InputKey.Submerge,
      aimDir: { x: 0, y: 0, z: 1 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(swimmer.swimState).toBe(PlayerSwimState.SwimmingHidden);

    simulation.recordInput("session-1", {
      seq: 2,
      keys: InputKey.Submerge | InputKey.Fire,
      aimDir: { x: 1, y: 0, z: 0 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(swimmer.swimState).toBe(PlayerSwimState.None);
    expect(simulation.matchState.projectiles.size).toBe(1);
  });

  it("pops a submerged player out when they are hit", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");
    paintPlayerSurface(simulation, target.sessionId, target.paintGroupId);

    simulation.recordInput("session-2", {
      seq: 1,
      keys: InputKey.Submerge,
      aimDir: { x: 0, y: 0, z: 1 },
      dt: 1 / NETWORK_CONFIG.simulation.tickRateHz,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(target.swimState).toBe(PlayerSwimState.SwimmingHidden);

    simulation.matchState.projectiles.set("hit-submerged", {
      id: "hit-submerged",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.MachineGun,
      paintGroupId: shooter.paintGroupId,
      pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z },
      vel: { x: 0, y: 0, z: 0 },
      planetId: target.planetId,
      lifeMs: getWeaponDefinition(WeaponId.MachineGun).projectileLifetimeMs,
    });
    simulation.tick(simulation.tickIntervalMs);

    expect(target.swimState).toBe(PlayerSwimState.None);
    expect(target.health).toBeLessThan(GAME_CONFIG.player.maxHealth);
  });

  it("recharges slime slowly by default, faster on friendly paint, and fastest while submerged", () => {
    const neutralSimulation = new MatchSimulation();
    const paintedSimulation = new MatchSimulation();
    const submergedSimulation = new MatchSimulation();

    const neutral = neutralSimulation.addPlayer("session-1", "Neutral");
    const painted = paintedSimulation.addPlayer("session-1", "Painted");
    const submerged = submergedSimulation.addPlayer("session-1", "Submerged");

    neutral.slimeLevel = 0;
    painted.slimeLevel = 0;
    submerged.slimeLevel = 0;

    paintPlayerSurface(paintedSimulation, painted.sessionId, painted.paintGroupId, 0.25);
    paintPlayerSurface(submergedSimulation, submerged.sessionId, submerged.paintGroupId, 0.25);
    submerged.swimState = PlayerSwimState.SwimmingHidden;

    neutralSimulation.tick(1000);
    paintedSimulation.tick(1000);
    submergedSimulation.tick(1000);

    expect(neutral.slimeLevel).toBeCloseTo(GAME_CONFIG.slime.passiveRechargePerSecond, 5);
    expect(painted.slimeLevel).toBeCloseTo(GAME_CONFIG.slime.friendlyPaintRechargePerSecond, 5);
    expect(submerged.slimeLevel).toBeCloseTo(GAME_CONFIG.slime.submergedRechargePerSecond, 5);
    expect(neutral.slimeLevel).toBeLessThan(painted.slimeLevel);
    expect(painted.slimeLevel).toBeLessThan(submerged.slimeLevel);
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
      y: planet.y + surfaceRadius + GAME_CONFIG.player.collisionRadius,
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
    const targetNormal = surfaceNormalForCell(5, 0);
    const targetPoint = surfacePointForCell(planetId, 5, 0);
    const impactSpeed = 6 / (simulation.tickIntervalMs / 1000);
    // Projectile is airborne (planetId = "") so the launch-planet skip does not
    // apply, and the surface collision is detected as it enters planet-0.
    simulation.matchState.projectiles.set("surface-test", {
      id: "surface-test",
      ownerId: shooter.sessionId,
      weaponId: WeaponId.MachineGun,
      paintGroupId: shooter.paintGroupId,
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

    for (let shot = 0; shot < 3; shot++) {
      simulation.matchState.projectiles.set(`test-${shot}`, {
        id: `test-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
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
    expect(target.respawnTimer).toBe(0);
  });

  it("counts one kill and one death for an elimination in the leaderboard payload", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    for (let shot = 0; shot < 3; shot++) {
      simulation.matchState.projectiles.set(`leaderboard-kd-${shot}`, {
        id: `leaderboard-kd-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
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

  it("counts respawn time down over intermediate ticks before reviving the player", () => {
    const simulation = new MatchSimulation();
    const shooter = simulation.addPlayer("session-1", "Alpha");
    const target = simulation.addPlayer("session-2", "Bravo");

    for (let shot = 0; shot < 3; shot++) {
      simulation.matchState.projectiles.set(`respawn-check-${shot}`, {
        id: `respawn-check-${shot}`,
        ownerId: shooter.sessionId,
        weaponId: WeaponId.MachineGun,
        paintGroupId: shooter.paintGroupId,
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

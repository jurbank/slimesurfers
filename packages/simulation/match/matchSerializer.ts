import { type GameModeDefinition } from "@splat/content/modes/gameModes.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import type {
  LeaderboardEntry,
  LeaderboardMessage,
  SnapshotMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { type SimMatchState, type SimPlayerState } from "./simState.ts";

export function isPlayerShooting(player: SimPlayerState, nowMs: number): boolean {
  return nowMs - player.lastFireTimeMs <= GAME_CONFIG.player.shootingRevealDurationMs;
}

export function buildSnapshotMessage(simState: SimMatchState, tickCount: number): SnapshotMessage {
  const players: SnapshotMessage["players"] = [];
  simState.players.forEach((player) => {
    players.push({
      sessionId: player.sessionId,
      pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      vel: { x: player.vel.x, y: player.vel.y, z: player.vel.z },
      rot: { x: player.rot.x, y: player.rot.y, z: player.rot.z, w: player.rot.w },
      planetId: player.planetId,
      slimeGroupId: player.slimeGroupId,
      movementState: player.movementState,
      surfState: player.surfState,
      isCarving: player.isCarving,
      skiJumpCharge: player.skiJumpCharge,
      grindRailId: player.grindRailId,
      grindT: player.grindT,
      lastGrindT: player.lastGrindT,
      grindSpeed: player.grindSpeed,
      grindCooldownMs: player.grindCooldownMs,
      splatCooldownMs: player.splatCooldownMs,
      gravityAnchorPlanetId: player.gravityAnchorPlanetId,
      loadedPadId: player.loadedPadId,
      padLoadProgress: player.padLoadProgress,
      padChargeProgress: player.padChargeProgress,
      padCancelArmed: player.padCancelArmed,
      isShooting: isPlayerShooting(player, simState.elapsedMs),
      equippedWeaponId: player.equippedWeaponId,
      disposableShotsRemaining: player.disposableShotsRemaining,
      health: player.health,
      slimeLevel: player.slimeLevel,
      respawnTimer: player.respawnTimer,
      isOnFriendlySlime: player.isOnFriendlySlime,
      slimeColor: player.slimeColor,
      patternId: player.patternId,
      inputSeq: player.inputSeq,
    });
  });

  const projectiles: SnapshotMessage["projectiles"] = [];
  simState.projectiles.forEach((projectile) => {
    projectiles.push({
      id: projectile.id,
      ownerId: projectile.ownerId,
      weaponId: projectile.weaponId,
      slimeGroupId: projectile.slimeGroupId,
      slimeColor: projectile.slimeColor,
      patternId: projectile.patternId,
      pos: { x: projectile.pos.x, y: projectile.pos.y, z: projectile.pos.z },
      vel: { x: projectile.vel.x, y: projectile.vel.y, z: projectile.vel.z },
      planetId: projectile.planetId,
      lifeMs: projectile.lifeMs,
      homingTargetId: projectile.homingTargetId,
      guaranteedHoming: projectile.guaranteedHoming,
    });
  });

  const pickups: SnapshotMessage["pickups"] = [];
  simState.pickups.forEach((pickup) => {
    if (!pickup.active) return;
    pickups.push({
      id: pickup.id,
      weaponId: pickup.weaponId,
      planetId: pickup.planetId,
      pos: { x: pickup.pos.x, y: pickup.pos.y, z: pickup.pos.z },
    });
  });

  const healthPickups: SnapshotMessage["healthPickups"] = [];
  simState.healthPickups.forEach((pickup) => {
    if (!pickup.active) return;
    healthPickups.push({
      id: pickup.id,
      pos: { x: pickup.pos.x, y: pickup.pos.y, z: pickup.pos.z },
    });
  });

  const blastPadStates: SnapshotMessage["blastPadStates"] = [];
  simState.blastPadStates.forEach((state, id) => {
    blastPadStates.push({
      id,
      ownerSlimeGroupId: state.ownerSlimeGroupId,
      ownerColor: state.ownerColor,
      coverageProgress: state.coverageProgress,
    });
  });

  return {
    tick: tickCount,
    players,
    projectiles,
    pickups,
    healthPickups,
    blastPadStates,
  };
}

export function buildLeaderboardMessage(
  simState: SimMatchState,
  mode: GameModeDefinition,
): LeaderboardMessage {
  const entries: LeaderboardEntry[] = [];
  simState.players.forEach((player) => {
    entries.push({
      sessionId: player.sessionId,
      name: player.name,
      teamId: player.teamId,
      slimeGroupId: player.slimeGroupId,
      slimeColor: player.slimeColor,
      patternId: player.patternId,
      slimeScore: player.slimeScore,
      killCount: player.killCount,
      deathCount: player.deathCount,
    });
  });
  entries.sort(
    (a, b) =>
      b.slimeScore - a.slimeScore ||
      b.killCount - a.killCount ||
      a.deathCount - b.deathCount ||
      a.name.localeCompare(b.name),
  );

  const teamScores = Array.from({ length: mode.teamCount }, () => 0);
  if (mode.isTeamBased) {
    for (let teamId = 0; teamId < mode.teamCount; teamId++) {
      teamScores[teamId] = simState.scores.get(teamId.toString()) ?? 0;
    }
  }

  return { entries, teamScores };
}

export function computeWinningTeamId(
  simState: SimMatchState,
  mode: GameModeDefinition,
): number | undefined {
  if (!mode.isTeamBased || mode.teamCount === 0) return undefined;
  const { teamScores } = buildLeaderboardMessage(simState, mode);
  if (teamScores.length === 0) return undefined;
  let winner = 0;
  for (let t = 1; t < teamScores.length; t++) {
    if ((teamScores[t] ?? 0) > (teamScores[winner] ?? 0)) winner = t;
  }
  return winner;
}

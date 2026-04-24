import type {
  GameModeDefinition,
  SpawnAnchorDefinition,
  SpawnPolicy,
} from "@splat/content/modes/gameModes.ts";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";
import { NO_TEAM_ID, PlayerMovementState, type SimPlayerState, type SimVec3 } from "./simState.ts";

export interface SpawnSelection {
  planetId: string;
  normal: SimVec3;
  surfacePos: SimVec3;
}

interface SpawnCandidate {
  planetId: string;
  normal: SimVec3;
}

interface SpawnRequest {
  playerIndex: number;
  teamId: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FFA_JITTER_DISTANCE = 2.5;
const CLUSTER_SAMPLE_COUNT = 10;
const CLUSTER_DESIRED_DISTANCE = 12;
const TEAMMATE_WEIGHT = 0.35;
const STACKING_DISTANCE = GAME_CONFIG.movement.collisionRadius * 4;
const FFA_SPAWN_RINGS = [
  { polarAngle: 0.42, count: 6, azimuthOffset: 0.0 },
  { polarAngle: 0.78, count: 8, azimuthOffset: 0.32 },
  { polarAngle: 1.12, count: 10, azimuthOffset: 0.16 },
] as const;

function normalize(vec: SimVec3): SimVec3 {
  const len = Math.hypot(vec.x, vec.y, vec.z);
  if (len < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
}

function scale(vec: SimVec3, scalar: number): SimVec3 {
  return { x: vec.x * scalar, y: vec.y * scalar, z: vec.z * scalar };
}

function add(a: SimVec3, b: SimVec3): SimVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: SimVec3, b: SimVec3): SimVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: SimVec3, b: SimVec3): SimVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function circularDistance(a: number, b: number, count: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, count - raw);
}

function getSurfacePosition(planetId: string, normal: SimVec3): SimVec3 {
  const planet = PLANET_POSITIONS.find((entry) => entry.id === planetId) ?? PLANET_POSITIONS[0]!;
  const radius =
    getTerrainRadius(normal.x, normal.y, normal.z, GAME_CONFIG) +
    GAME_CONFIG.movement.standingHeight;
  return {
    x: planet.x + normal.x * radius,
    y: planet.y + normal.y * radius,
    z: planet.z + normal.z * radius,
  };
}

function applyDeterministicJitter(normal: SimVec3, seed: number, distance: number): SimVec3 {
  const tangentA = normalize(
    Math.abs(normal.y) > 0.95
      ? cross({ x: 0, y: 0, z: 1 }, normal)
      : cross({ x: 0, y: 1, z: 0 }, normal),
  );
  const tangentB = normalize(cross(normal, tangentA));
  const jitterAngle = seed * GOLDEN_ANGLE;
  const jitterMagnitude = ((seed * 0.61803398875) % 1) * (distance / GAME_CONFIG.planet.radius);
  return normalize(
    add(
      normal,
      add(
        scale(tangentA, Math.cos(jitterAngle) * jitterMagnitude),
        scale(tangentB, Math.sin(jitterAngle) * jitterMagnitude),
      ),
    ),
  );
}

function buildFfaCandidates(): SpawnCandidate[] {
  const candidates: SpawnCandidate[] = [];
  for (const planet of PLANET_POSITIONS) {
    for (const ring of FFA_SPAWN_RINGS) {
      for (let index = 0; index < ring.count; index++) {
        const azimuth = ring.azimuthOffset + (index / ring.count) * Math.PI * 2;
        const sinPolar = Math.sin(ring.polarAngle);
        candidates.push({
          planetId: planet.id,
          normal: {
            x: sinPolar * Math.cos(azimuth),
            y: Math.cos(ring.polarAngle),
            z: sinPolar * Math.sin(azimuth),
          },
        });
      }
    }
  }
  return candidates;
}

function buildAnchoredCandidates(
  anchor: SpawnAnchorDefinition,
  radius: number,
  seed: number,
): SpawnCandidate[] {
  const candidates: SpawnCandidate[] = [
    { planetId: anchor.planetId, normal: normalize(anchor.normal) },
  ];
  for (let index = 0; index < CLUSTER_SAMPLE_COUNT; index++) {
    candidates.push({
      planetId: anchor.planetId,
      normal: applyDeterministicJitter(normalize(anchor.normal), seed + index + 1, radius),
    });
  }
  return candidates;
}

function distanceBetween(a: SimVec3, b: SimVec3): number {
  const delta = sub(a, b);
  return Math.hypot(delta.x, delta.y, delta.z);
}

function getMinDistance(
  point: SimVec3,
  players: readonly SimPlayerState[],
  filter: (player: SimPlayerState) => boolean,
): number {
  let minDistance = Infinity;
  for (const player of players) {
    if (!filter(player)) continue;
    minDistance = Math.min(minDistance, distanceBetween(point, player.pos));
  }
  return minDistance;
}

function getAlivePlayers(
  players: Iterable<SimPlayerState>,
  excludeSessionId?: string,
): readonly SimPlayerState[] {
  return Array.from(players).filter(
    (player) =>
      player.sessionId !== excludeSessionId && player.movementState !== PlayerMovementState.Dead,
  );
}

function pickByScore(
  candidates: readonly SpawnCandidate[],
  scorer: (candidate: SpawnCandidate, index: number) => number,
  preferredIndex: number,
): SpawnCandidate {
  let bestCandidate = candidates[preferredIndex] ?? candidates[0]!;
  let bestScore = -Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const tieBreakBias = 1 / (1 + circularDistance(index, preferredIndex, candidates.length));
    const score = scorer(candidate, index) + tieBreakBias * 1e-3;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

function selectFfaSpawn(alivePlayers: readonly SimPlayerState[], seed: number): SpawnCandidate {
  const candidates = buildFfaCandidates().map((candidate, index) => ({
    planetId: candidate.planetId,
    normal: applyDeterministicJitter(candidate.normal, seed + index + 1, FFA_JITTER_DISTANCE),
  }));
  const preferredIndex = ((seed % candidates.length) + candidates.length) % candidates.length;
  return pickByScore(
    candidates,
    (candidate) => {
      const surfacePos = getSurfacePosition(candidate.planetId, candidate.normal);
      const minDistance = getMinDistance(surfacePos, alivePlayers, () => true);
      return Number.isFinite(minDistance) ? minDistance : 0;
    },
    preferredIndex,
  );
}

function selectTeamSpawn(
  policy: Extract<SpawnPolicy, { kind: "team-zones" }>,
  alivePlayers: readonly SimPlayerState[],
  request: SpawnRequest,
  seed: number,
): SpawnCandidate {
  const teamAnchor =
    policy.teamAnchors[request.teamId % policy.teamAnchors.length] ?? policy.teamAnchors[0]!;
  const candidates = buildAnchoredCandidates(teamAnchor, policy.zoneRadius, seed);
  const preferredIndex = ((seed % candidates.length) + candidates.length) % candidates.length;
  return pickByScore(
    candidates,
    (candidate) => {
      const surfacePos = getSurfacePosition(candidate.planetId, candidate.normal);
      const enemyDistance = getMinDistance(
        surfacePos,
        alivePlayers,
        (player) => player.teamId !== request.teamId,
      );
      const teammateDistance = getMinDistance(
        surfacePos,
        alivePlayers,
        (player) => player.teamId === request.teamId,
      );
      const safeEnemyScore = Number.isFinite(enemyDistance) ? enemyDistance : 0;
      const teammateSpacingScore = Number.isFinite(teammateDistance)
        ? teammateDistance * TEAMMATE_WEIGHT
        : 0;
      return safeEnemyScore + teammateSpacingScore;
    },
    preferredIndex,
  );
}

function selectClusterSpawn(
  policy: Extract<SpawnPolicy, { kind: "cluster" }>,
  alivePlayers: readonly SimPlayerState[],
  seed: number,
): SpawnCandidate {
  const candidates = buildAnchoredCandidates(policy.anchor, policy.radius, seed);
  const preferredIndex = ((seed % candidates.length) + candidates.length) % candidates.length;
  return pickByScore(
    candidates,
    (candidate) => {
      const surfacePos = getSurfacePosition(candidate.planetId, candidate.normal);
      const minDistance = getMinDistance(surfacePos, alivePlayers, () => true);
      if (!Number.isFinite(minDistance)) return 0;
      if (minDistance < STACKING_DISTANCE) return -1000 - minDistance;
      return -Math.abs(minDistance - CLUSTER_DESIRED_DISTANCE);
    },
    preferredIndex,
  );
}

export function selectSpawnSurface(
  mode: GameModeDefinition,
  players: Iterable<SimPlayerState>,
  request: SpawnRequest,
  excludeSessionId?: string,
): SpawnSelection {
  const alivePlayers = getAlivePlayers(players, excludeSessionId);
  if (alivePlayers.length === 0) {
    const anchor =
      mode.spawnPolicy.kind === "team-zones"
        ? mode.spawnPolicy.teamAnchors[request.teamId % mode.spawnPolicy.teamAnchors.length]
        : mode.spawnPolicy.kind === "cluster"
          ? mode.spawnPolicy.anchor
          : null;
    const planetId = anchor?.planetId ?? mode.selectSpawnPlanet(request.playerIndex);
    const normal = anchor ? normalize(anchor.normal) : { x: 0, y: 1, z: 0 };
    return {
      planetId,
      normal,
      surfacePos: getSurfacePosition(planetId, normal),
    };
  }

  const seed = request.playerIndex + (request.teamId === NO_TEAM_ID ? 0 : request.teamId * 97);
  const selectedCandidate =
    mode.spawnPolicy.kind === "ffa-spread"
      ? selectFfaSpawn(alivePlayers, seed)
      : mode.spawnPolicy.kind === "team-zones"
        ? selectTeamSpawn(mode.spawnPolicy, alivePlayers, request, seed)
        : selectClusterSpawn(mode.spawnPolicy, alivePlayers, seed);

  return {
    planetId: selectedCandidate.planetId,
    normal: selectedCandidate.normal,
    surfacePos: getSurfacePosition(selectedCandidate.planetId, selectedCandidate.normal),
  };
}

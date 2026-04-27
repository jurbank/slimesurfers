import type { Vec3Data } from "@splat/protocol/network/clientMessages.ts";
import { type RailDef } from "@splat/content/config/railDefs.ts";
import { getTerrainRadius } from "../terrain/planetTerrain.ts";

// StepConfig subset needed to evaluate terrain height.
interface TerrainConfig {
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
  planet: { radius: number };
}

export interface RailSample {
  pos: Vec3Data;
  tangent: Vec3Data; // unit vector in direction of increasing arcLength
  arcLength: number; // cumulative distance from rail start (wu)
  segmentIndex: number; // which Catmull-Rom segment this sample belongs to
  localT: number; // t within that segment [0, 1]
}

export interface ComputedRail {
  id: number;
  planetId: string;
  planetCenter: Vec3Data;
  samples: RailSample[];
  totalLength: number;
  paintCorridorRadius: number;
  pts: Vec3Data[]; // padded control points for analytical re-evaluation
}

// -- Vec3 helpers (local, no imports needed) ---------------------------------

function add(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: Vec3Data, s: number): Vec3Data {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function vlen(a: Vec3Data): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function normalize(a: Vec3Data): Vec3Data {
  const l = vlen(a);
  return l < 1e-8 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / l);
}

// -- Catmull-Rom evaluation --------------------------------------------------

function catmullRomPoint(
  p0: Vec3Data,
  p1: Vec3Data,
  p2: Vec3Data,
  p3: Vec3Data,
  t: number,
): Vec3Data {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function catmullRomTangent(
  p0: Vec3Data,
  p1: Vec3Data,
  p2: Vec3Data,
  p3: Vec3Data,
  t: number,
): Vec3Data {
  const t2 = t * t;
  return {
    x:
      0.5 *
      (-p0.x +
        p2.x +
        2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t +
        3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    y:
      0.5 *
      (-p0.y +
        p2.y +
        2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t +
        3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t2),
    z:
      0.5 *
      (-p0.z +
        p2.z +
        2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t +
        3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2),
  };
}

// -- Public API --------------------------------------------------------------

/**
 * Build a ComputedRail from a RailDef.
 * planetCenter is the world-space center of the rail's planet.
 * cfg must satisfy TerrainConfig (GAME_CONFIG does).
 */
export function buildComputedRail(
  def: RailDef,
  planetCenter: Vec3Data,
  cfg: TerrainConfig,
): ComputedRail {
  const SAMPLES_PER_SEGMENT = 60;

  // Convert control points to world positions.
  const worldPts: Vec3Data[] = def.controlPoints.map((cp) => {
    const n = normalize({ x: cp.nx, y: cp.ny, z: cp.nz });
    const terrainR = getTerrainRadius(n.x, n.y, n.z, cfg);
    const waterR = cfg.planet.radius + cfg.terrain.waterLevel;
    // Ensure the base point for the height offset is at least at water level
    const baseR = Math.max(terrainR, waterR);
    return add(planetCenter, scale(n, baseR + cp.heightOffset));
  });

  const n = worldPts.length;
  if (n < 2)
    return {
      id: def.id,
      planetId: def.planetId,
      planetCenter,
      samples: [],
      totalLength: 0,
      paintCorridorRadius: def.paintCorridorRadius,
      pts: [],
    };

  // Ghost points for clamped Catmull-Rom at both ends.
  const pts: Vec3Data[] = [
    sub(scale(worldPts[0]!, 2), worldPts[1]!),
    ...worldPts,
    sub(scale(worldPts[n - 1]!, 2), worldPts[n - 2]!),
  ];

  const samples: RailSample[] = [];
  let arcLength = 0;

  for (let seg = 0; seg < n - 1; seg++) {
    const p0 = pts[seg]!;
    const p1 = pts[seg + 1]!;
    const p2 = pts[seg + 2]!;
    const p3 = pts[seg + 3]!;
    const isLastSeg = seg === n - 2;
    const count = isLastSeg ? SAMPLES_PER_SEGMENT + 1 : SAMPLES_PER_SEGMENT;

    for (let j = 0; j < count; j++) {
      const localT = j / SAMPLES_PER_SEGMENT;
      const pos = catmullRomPoint(p0, p1, p2, p3, localT);
      const rawTangent = catmullRomTangent(p0, p1, p2, p3, localT);
      const tangent = normalize(
        rawTangent.x === 0 && rawTangent.y === 0 && rawTangent.z === 0
          ? { x: 0, y: 0, z: 1 }
          : rawTangent,
      );

      if (samples.length > 0) {
        arcLength += vlen(sub(pos, samples[samples.length - 1]!.pos));
      }
      samples.push({ pos, tangent, arcLength, segmentIndex: seg, localT });
    }
  }

  return {
    id: def.id,
    planetId: def.planetId,
    planetCenter,
    samples,
    totalLength: arcLength,
    paintCorridorRadius: def.paintCorridorRadius,
    pts,
  };
}

/**
 * Sample the rail at a given arc-length (clamped to [0, totalLength]).
 * Position is linearly interpolated between pre-sampled points.
 * Tangent is evaluated analytically from the Catmull-Rom curve to avoid
 * the piecewise-linear jitter that lerping stored tangents produces on curves.
 */
export function sampleRailAt(
  rail: ComputedRail,
  arcLen: number,
): { pos: Vec3Data; tangent: Vec3Data } {
  const { samples, pts } = rail;
  if (samples.length === 0) return { pos: { x: 0, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: 1 } };
  if (samples.length === 1) return { pos: samples[0]!.pos, tangent: samples[0]!.tangent };

  const clamped = Math.max(0, Math.min(arcLen, rail.totalLength));

  // Binary search for the bracketing pair.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.arcLength <= clamped) lo = mid;
    else hi = mid;
  }

  const a = samples[lo]!;
  const b = samples[hi]!;
  const span = b.arcLength - a.arcLength;
  if (span < 1e-8) return { pos: a.pos, tangent: a.tangent };

  const t = (clamped - a.arcLength) / span;

  const pos: Vec3Data = {
    x: a.pos.x + (b.pos.x - a.pos.x) * t,
    y: a.pos.y + (b.pos.y - a.pos.y) * t,
    z: a.pos.z + (b.pos.z - a.pos.z) * t,
  };

  // Analytical tangent: interpolate localT within the segment and evaluate the
  // Catmull-Rom derivative directly. Falls back to lerp at segment boundaries.
  let tangent: Vec3Data;
  if (a.segmentIndex === b.segmentIndex) {
    const seg = a.segmentIndex;
    const localT = a.localT + (b.localT - a.localT) * t;
    const rawTangent = catmullRomTangent(pts[seg]!, pts[seg + 1]!, pts[seg + 2]!, pts[seg + 3]!, localT);
    tangent = normalize(
      rawTangent.x === 0 && rawTangent.y === 0 && rawTangent.z === 0
        ? { x: 0, y: 0, z: 1 }
        : rawTangent,
    );
  } else {
    // Segment boundary: use the chord direction between the two flanking sample
    // positions — always continuous and accurate at any sample density.
    tangent = normalize(sub(b.pos, a.pos));
  }

  return { pos, tangent };
}

/**
 * Find the closest point on the rail to a world-space position.
 * Returns the arc-length of that point and the distance to it.
 * O(samples.length) linear search — adequate for current rail counts.
 */
export function findClosestRailPoint(
  rail: ComputedRail,
  pos: Vec3Data,
): { arcLength: number; dist: number } {
  const { samples } = rail;
  let minDist = Infinity;
  let bestArcLength = 0;

  for (const sample of samples) {
    const dx = pos.x - sample.pos.x;
    const dy = pos.y - sample.pos.y;
    const dz = pos.z - sample.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < minDist) {
      minDist = d;
      bestArcLength = sample.arcLength;
    }
  }

  return { arcLength: bestArcLength, dist: minDist };
}

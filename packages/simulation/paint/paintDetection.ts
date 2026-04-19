import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import type { SimPaintStamp, SimPlanetPaintState, SimVec3 } from "../match/simState.ts";

export interface PaintDetectionResult {
  paintGroupId: number;
  color: number;
  alpha: number;
}

function normalize(x: number, y: number, z: number) {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapCol(col: number, cols: number): number {
  return ((col % cols) + cols) % cols;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-8) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function getPaintRenderRadius(stamp: Pick<SimPaintStamp, "radius">): number {
  return stamp.radius * GAME_CONFIG.paint.projectileStampRadiusMultiplier;
}

export function createStampBuckets(rows: number, cols: number): SimPaintStamp[][] {
  return Array.from({ length: Math.max(0, rows * cols) }, () => []);
}

function getBucketIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

function normalToBucket(
  nx: number,
  ny: number,
  nz: number,
  rows: number,
  cols: number,
): { row: number; col: number; theta: number } {
  const theta = Math.acos(clamp(ny, -1, 1));
  let phi = Math.atan2(nz, nx);
  if (phi < 0) phi += Math.PI * 2;

  const row = clamp(Math.floor((theta / Math.PI) * rows), 0, rows - 1);
  const col = wrapCol(Math.floor((phi / (Math.PI * 2)) * cols), cols);
  return { row, col, theta };
}

function getStampAngularRadius(stamp: Pick<SimPaintStamp, "radius">): number {
  return 2 * Math.asin(Math.min(1, getPaintRenderRadius(stamp) * 0.5));
}

function addStampToBuckets(planetState: SimPlanetPaintState, stamp: SimPaintStamp): void {
  const rows = planetState.territoryRows;
  const cols = planetState.territoryCols;
  if (rows <= 0 || cols <= 0) return;

  const {
    row: centerRow,
    col: centerCol,
    theta,
  } = normalToBucket(stamp.nx, stamp.ny, stamp.nz, rows, cols);
  const angularRadius = getStampAngularRadius(stamp);
  const rowReach = Math.min(rows - 1, Math.ceil((angularRadius / Math.PI) * rows) + 1);
  const sinTheta = Math.max(0.1, Math.sin(theta));
  const colReach = Math.min(cols, Math.ceil((angularRadius / (Math.PI * 2 * sinTheta)) * cols) + 1);

  for (
    let row = Math.max(0, centerRow - rowReach);
    row <= Math.min(rows - 1, centerRow + rowReach);
    row++
  ) {
    if (colReach >= cols / 2) {
      for (let col = 0; col < cols; col++) {
        planetState.stampBuckets[getBucketIndex(row, col, cols)]!.push(stamp);
      }
      continue;
    }

    for (let offset = -colReach; offset <= colReach; offset++) {
      const col = wrapCol(centerCol + offset, cols);
      planetState.stampBuckets[getBucketIndex(row, col, cols)]!.push(stamp);
    }
  }
}

function rebuildStampBuckets(planetState: SimPlanetPaintState): void {
  planetState.stampBuckets = createStampBuckets(
    planetState.territoryRows,
    planetState.territoryCols,
  );
  for (const stamp of planetState.stamps) {
    addStampToBuckets(planetState, stamp);
  }
}

export function appendPaintStamp(
  planetState: SimPlanetPaintState,
  stamp: SimPaintStamp,
  maxStamps = GAME_CONFIG.paint.maxVisualStampsPerPlanet,
): void {
  planetState.stamps.push(stamp);
  addStampToBuckets(planetState, stamp);
  if (planetState.stamps.length > maxStamps) {
    planetState.stamps.splice(0, planetState.stamps.length - maxStamps);
    rebuildStampBuckets(planetState);
  }
}

export function getPaintCoverageAlpha(dist: number, stamp: Pick<SimPaintStamp, "radius">): number {
  const renderRadius = getPaintRenderRadius(stamp);
  if (dist >= renderRadius) return 0;

  const innerRadius = renderRadius * (1 - GAME_CONFIG.paint.brushSoftness);
  return 1 - smoothstep(innerRadius, renderRadius, dist);
}

export function getPaintCollisionDistance(stamp: Pick<SimPaintStamp, "radius">): number {
  const threshold = GAME_CONFIG.paint.collisionAlphaThreshold;
  let lo = 0;
  let hi = getPaintRenderRadius(stamp);

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    if (getPaintCoverageAlpha(mid, stamp) > threshold) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return lo;
}

export function getPaintAtPoint(
  pos: SimVec3,
  planetId: string,
  planets: Map<string, SimPlanetPaintState>,
): PaintDetectionResult | null {
  const planetState = planets.get(planetId);
  const planetPos = PLANET_POSITIONS.find((p) => p.id === planetId);
  if (!planetState || !planetPos) return null;

  // Convert position to unit normal relative to planet center
  const {
    x: pNx,
    y: pNy,
    z: pNz,
  } = normalize(pos.x - planetPos.x, pos.y - planetPos.y, pos.z - planetPos.z);
  const bucket =
    planetState.territoryRows > 0 && planetState.territoryCols > 0
      ? normalToBucket(pNx, pNy, pNz, planetState.territoryRows, planetState.territoryCols)
      : null;
  const candidates = bucket
    ? (planetState.stampBuckets[
        getBucketIndex(bucket.row, bucket.col, planetState.territoryCols)
      ] ?? planetState.stamps)
    : planetState.stamps;

  // Check stamps newest to oldest for correct overlapping behavior
  for (let i = candidates.length - 1; i >= 0; i--) {
    const s = candidates[i]!;

    // Dot product to get angular distance
    const dot = pNx * s.nx + pNy * s.ny + pNz * s.nz;

    // Chord distance: dist = sqrt(2 * (1 - cos(theta)))
    const d2 = 2 * (1 - dot);
    const dist = Math.sqrt(Math.max(0, d2));

    const renderRadius = getPaintRenderRadius(s);
    if (dist < renderRadius) {
      const alpha = getPaintCoverageAlpha(dist, s);

      if (alpha > GAME_CONFIG.paint.collisionAlphaThreshold) {
        return {
          paintGroupId: s.paintGroupId,
          color: s.color,
          alpha,
        };
      }
    }
  }

  return null;
}

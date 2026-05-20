/**
 * Deterministic procedural terrain for spherical planets.
 *
 * This module is pure math — no Three.js, no DOM, no side effects.
 * It runs identically on server (Node) and client (browser) so that
 * physics simulation stays in sync.
 *
 * The noise implementation is a direct port of the GLSL hash/noise in
 * planetShader.ts so the visual character matches.
 */

import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import type {
  RuntimeMapPlanet,
  RuntimeTerrainFeature,
  RuntimeTerrainFeaturePoint,
  RuntimeTerrainJumpFeature,
  RuntimeTerrainSlopeFeature,
} from "@splat/content/map/runtimeMapData.ts";

// -- Types ------------------------------------------------------------------

export const BiomeType = {
  Ocean: 0,
  Sand: 1,
  Grass: 2,
  Rock: 3,
  Snow: 4,
} as const;
export type BiomeType = (typeof BiomeType)[keyof typeof BiomeType];

export interface BiomeResult {
  type: BiomeType;
  color: number;
}

/** Config slice needed by the terrain functions. */
export interface TerrainConfig {
  planet: { radius: number };
  terrain: {
    seed: number;
    baseAmplitude: number;
    frequency: number;
    octaves: number;
    lacunarity: number;
    persistence: number;
    heightSmoothingStrength?: number;
    heightSmoothingSampleAngle?: number;
    waterLevel: number;
    snowLevel: number;
    sandBand: number;
    rockLevel: number;
    icosahedronDetail?: number;
  };
  terrainFeatures?: RuntimeTerrainFeature[];
}

export type TerrainConfigPlanet = Pick<RuntimeMapPlanet, "radius" | "terrain" | "terrainFeatures">;

export function createTerrainConfig(planet: TerrainConfigPlanet): TerrainConfig {
  return {
    planet: { radius: planet.radius },
    terrain: planet.terrain,
    terrainFeatures: planet.terrainFeatures,
  };
}

export interface TerrainSurfaceProvider {
  getHeight(nx: number, ny: number, nz: number, cfg: TerrainConfig, planetId: string): number;
  getRadius(nx: number, ny: number, nz: number, cfg: TerrainConfig, planetId: string): number;
}

// -- Noise (ported from planetShader.ts GLSL) --------------------------------

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash(px: number, py: number, pz: number): number {
  let x = fract(px * 0.3183099 + 0.1);
  let y = fract(py * 0.3183099 + 0.1);
  let z = fract(pz * 0.3183099 + 0.1);
  x *= 17.0;
  y *= 17.0;
  z *= 17.0;
  return fract(x * y * z * (x + y + z));
}

function noise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  // smoothstep interpolation
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);

  const h000 = hash(ix, iy, iz);
  const h100 = hash(ix + 1, iy, iz);
  const h010 = hash(ix, iy + 1, iz);
  const h110 = hash(ix + 1, iy + 1, iz);
  const h001 = hash(ix, iy, iz + 1);
  const h101 = hash(ix + 1, iy, iz + 1);
  const h011 = hash(ix, iy + 1, iz + 1);
  const h111 = hash(ix + 1, iy + 1, iz + 1);

  const x00 = h000 + (h100 - h000) * fx;
  const x10 = h010 + (h110 - h010) * fx;
  const x01 = h001 + (h101 - h001) * fx;
  const x11 = h011 + (h111 - h011) * fx;

  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;

  return y0 + (y1 - y0) * fz;
}

// -- FBM (Fractal Brownian Motion) -------------------------------------------

function fbm(
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity: number,
  persistence: number,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmplitude; // normalized to [0, 1]
}

// -- Public API --------------------------------------------------------------

/**
 * Returns the signed terrain displacement at a point on the unit sphere.
 * Positive = above base radius, negative = below (ocean floor).
 */
function rawTerrainHeight(nx: number, ny: number, nz: number, cfg: TerrainConfig): number {
  const t = cfg.terrain;
  const sx = nx * t.frequency + t.seed;
  const sy = ny * t.frequency + t.seed * 1.7;
  const sz = nz * t.frequency + t.seed * 2.3;

  const n = fbm(sx, sy, sz, t.octaves, t.lacunarity, t.persistence);
  // Map [0,1] noise to [-amplitude, +amplitude]
  return (n * 2 - 1) * t.baseAmplitude;
}

function normalizeVec(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

function tangentFrame(
  nx: number,
  ny: number,
  nz: number,
): {
  tx: number;
  ty: number;
  tz: number;
  bx: number;
  by: number;
  bz: number;
} {
  let tx = Math.abs(ny) < 0.99 ? nz : 0;
  let ty = Math.abs(ny) < 0.99 ? 0 : -nz;
  let tz = Math.abs(ny) < 0.99 ? -nx : ny;
  const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  return {
    tx,
    ty,
    tz,
    bx: ny * tz - nz * ty,
    by: nz * tx - nx * tz,
    bz: nx * ty - ny * tx,
  };
}

/**
 * Returns the signed terrain displacement at a point on the unit sphere.
 * Positive = above base radius, negative = below (ocean floor).
 */
export function getTerrainHeight(nx: number, ny: number, nz: number, cfg: TerrainConfig): number {
  const center = rawTerrainHeight(nx, ny, nz, cfg);
  const smoothingStrength = cfg.terrain.heightSmoothingStrength ?? 0;
  if (smoothingStrength <= 0) return center;

  const offset = cfg.terrain.heightSmoothingSampleAngle ?? 0.03;
  const { tx, ty, tz, bx, by, bz } = tangentFrame(nx, ny, nz);
  let total = center * 2;
  const samples = [
    normalizeVec(nx + tx * offset, ny + ty * offset, nz + tz * offset),
    normalizeVec(nx - tx * offset, ny - ty * offset, nz - tz * offset),
    normalizeVec(nx + bx * offset, ny + by * offset, nz + bz * offset),
    normalizeVec(nx - bx * offset, ny - by * offset, nz - bz * offset),
    normalizeVec(nx + (tx + bx) * offset, ny + (ty + by) * offset, nz + (tz + bz) * offset),
    normalizeVec(nx - (tx + bx) * offset, ny - (ty + by) * offset, nz - (tz + bz) * offset),
  ];

  for (const sample of samples) {
    total += rawTerrainHeight(sample.x, sample.y, sample.z, cfg);
  }

  return center + (total / (samples.length + 2) - center) * Math.min(1, smoothingStrength);
}

/**
 * Returns the absolute radius at a point on the unit sphere (base + displacement).
 */
export function getTerrainRadius(nx: number, ny: number, nz: number, cfg: TerrainConfig): number {
  const baseRadius = cfg.planet.radius + getTerrainHeight(nx, ny, nz, cfg);
  return applyTerrainFeatures(nx, ny, nz, baseRadius, cfg);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function dot3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function catmullRom(v0: number, v1: number, v2: number, v3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * v1 +
      (-v0 + v2) * t +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
      (-v0 + 3 * v1 - 3 * v2 + v3) * t3)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function slopePointScalar(
  point: RuntimeTerrainFeaturePoint,
  key: "width" | "bank" | "edgeFalloff" | "smoothing",
  fallback: number,
): number {
  return point[key] ?? fallback;
}

function sampleSlopePath(
  feature: RuntimeTerrainSlopeFeature,
  planetRadius: number,
): Array<{
  x: number;
  y: number;
  z: number;
  heightOffset: number;
  width: number;
  bank: number;
  edgeFalloff: number;
  smoothing: number;
  distanceAlong: number;
}> {
  const samples: Array<{
    x: number;
    y: number;
    z: number;
    heightOffset: number;
    width: number;
    bank: number;
    edgeFalloff: number;
    smoothing: number;
    distanceAlong: number;
  }> = [];
  const { points } = feature;
  const samplesPerSegment = 8;
  let distanceAlong = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const startStep = i === 0 ? 0 : 1;

    for (let step = startStep; step <= samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const n = normalizeVec(
        catmullRom(p0.nx, p1.nx, p2.nx, p3.nx, t),
        catmullRom(p0.ny, p1.ny, p2.ny, p3.ny, t),
        catmullRom(p0.nz, p1.nz, p2.nz, p3.nz, t),
      );
      const previous = samples[samples.length - 1];
      if (previous) {
        distanceAlong += Math.acos(Math.max(-1, Math.min(1, dot3(previous, n)))) * planetRadius;
      }
      samples.push({
        ...n,
        heightOffset: catmullRom(
          p0.heightOffset,
          p1.heightOffset,
          p2.heightOffset,
          p3.heightOffset,
          t,
        ),
        width: clamp(
          catmullRom(
            slopePointScalar(p0, "width", feature.width),
            slopePointScalar(p1, "width", feature.width),
            slopePointScalar(p2, "width", feature.width),
            slopePointScalar(p3, "width", feature.width),
            t,
          ),
          0.001,
          200,
        ),
        bank: catmullRom(
          slopePointScalar(p0, "bank", feature.bank),
          slopePointScalar(p1, "bank", feature.bank),
          slopePointScalar(p2, "bank", feature.bank),
          slopePointScalar(p3, "bank", feature.bank),
          t,
        ),
        edgeFalloff: clamp(
          catmullRom(
            slopePointScalar(p0, "edgeFalloff", feature.edgeFalloff),
            slopePointScalar(p1, "edgeFalloff", feature.edgeFalloff),
            slopePointScalar(p2, "edgeFalloff", feature.edgeFalloff),
            slopePointScalar(p3, "edgeFalloff", feature.edgeFalloff),
            t,
          ),
          0,
          200,
        ),
        smoothing: clamp(
          catmullRom(
            slopePointScalar(p0, "smoothing", feature.smoothing),
            slopePointScalar(p1, "smoothing", feature.smoothing),
            slopePointScalar(p2, "smoothing", feature.smoothing),
            slopePointScalar(p3, "smoothing", feature.smoothing),
            t,
          ),
          0,
          1,
        ),
        distanceAlong,
      });
    }
  }

  return samples;
}

type SlopePathSamples = ReturnType<typeof sampleSlopePath>;
type PreparedTerrainFeature =
  | { feature: RuntimeTerrainJumpFeature }
  | { feature: RuntimeTerrainSlopeFeature; pathSamples: SlopePathSamples };

const preparedFeatureCache = new WeakMap<
  RuntimeTerrainFeature[],
  { planetRadius: number; prepared: PreparedTerrainFeature[] }
>();

function getPreparedTerrainFeatures(
  features: RuntimeTerrainFeature[],
  planetRadius: number,
): PreparedTerrainFeature[] {
  const cached = preparedFeatureCache.get(features);
  if (cached && cached.planetRadius === planetRadius) return cached.prepared;

  const prepared = features.map((feature): PreparedTerrainFeature => {
    if (feature.kind === "jump") return { feature };
    return { feature, pathSamples: sampleSlopePath(feature, planetRadius) };
  });
  preparedFeatureCache.set(features, { planetRadius, prepared });
  return prepared;
}

function baseTerrainRadiusAtNormal(
  normal: { x: number; y: number; z: number },
  cfg: TerrainConfig,
): number {
  return cfg.planet.radius + getTerrainHeight(normal.x, normal.y, normal.z, cfg);
}

export function applyTerrainFeatures(
  nx: number,
  ny: number,
  nz: number,
  baseRadius: number,
  cfg: TerrainConfig,
): number {
  const features = cfg.terrainFeatures ?? [];
  if (features.length === 0) return baseRadius;

  const normal = normalizeVec(nx, ny, nz);
  let radius = baseRadius;

  for (const preparedFeature of getPreparedTerrainFeatures(features, cfg.planet.radius)) {
    if (!("pathSamples" in preparedFeature)) {
      const { feature } = preparedFeature;
      if (!feature.enabled) continue;
      radius = applyJumpFeature(feature, normal, radius, cfg);
      continue;
    }

    const { feature } = preparedFeature;
    if (!feature.enabled) continue;
    if (feature.points.length < 2) continue;

    const pathSamples = preparedFeature.pathSamples;
    let best: {
      distance: number;
      signedAcross: number;
      segmentT: number;
      width: number;
      bank: number;
      edgeFalloff: number;
      smoothing: number;
      distanceAlong: number;
      start: (typeof pathSamples)[number];
      end: (typeof pathSamples)[number];
    } | null = null;

    for (let i = 0; i < pathSamples.length - 1; i++) {
      const start = pathSamples[i]!;
      const end = pathSamples[i + 1]!;
      const sx = start.x;
      const sy = start.y;
      const sz = start.z;
      const vx = end.x - sx;
      const vy = end.y - sy;
      const vz = end.z - sz;
      const lenSq = vx * vx + vy * vy + vz * vz;
      if (lenSq < 1e-8) continue;

      const segmentT = Math.max(
        0,
        Math.min(1, ((normal.x - sx) * vx + (normal.y - sy) * vy + (normal.z - sz) * vz) / lenSq),
      );
      const width = clamp(start.width + (end.width - start.width) * segmentT, 0.001, 200);
      const edgeFalloff = clamp(
        start.edgeFalloff + (end.edgeFalloff - start.edgeFalloff) * segmentT,
        0.001,
        200,
      );
      const maxDistance = width * 0.5 + edgeFalloff;
      const closest = normalizeVec(sx + vx * segmentT, sy + vy * segmentT, sz + vz * segmentT);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot3(normal, closest))));
      const distance = angle * cfg.planet.radius;
      if (distance > maxDistance) continue;
      const tangent = normalizeVec(end.x - start.x, end.y - start.y, end.z - start.z);
      const sideCross = cross3(tangent, closest);
      const side = normalizeVec(sideCross.x, sideCross.y, sideCross.z);
      const signedAcross =
        ((normal.x - closest.x) * side.x +
          (normal.y - closest.y) * side.y +
          (normal.z - closest.z) * side.z) *
        cfg.planet.radius;
      if (!best || distance < best.distance) {
        best = {
          distance,
          signedAcross,
          segmentT,
          width,
          bank: start.bank + (end.bank - start.bank) * segmentT,
          edgeFalloff,
          smoothing: clamp(start.smoothing + (end.smoothing - start.smoothing) * segmentT, 0, 1),
          distanceAlong: start.distanceAlong + (end.distanceAlong - start.distanceAlong) * segmentT,
          start,
          end,
        };
      }
    }

    if (!best) continue;

    const startRadius = baseTerrainRadiusAtNormal(best.start, cfg) + best.start.heightOffset;
    const endRadius = baseTerrainRadiusAtNormal(best.end, cfg) + best.end.heightOffset;
    const halfWidth = best.width * 0.5;
    const bankT = halfWidth > 0 ? Math.max(-1, Math.min(1, best.signedAcross / halfWidth)) : 0;
    const targetRadius =
      startRadius + (endRadius - startRadius) * best.segmentT + bankT * best.bank;
    const edgeT = best.distance <= halfWidth ? 0 : (best.distance - halfWidth) / best.edgeFalloff;
    const edgeBlend = smoothstep(0, 1, edgeT);
    const totalLength = pathSamples[pathSamples.length - 1]?.distanceAlong ?? 0;
    const transitionLength = Math.max(0, Math.min(feature.transitionLength, totalLength * 0.5));
    const transitionStrength =
      transitionLength <= 0 || totalLength <= 0
        ? 1
        : Math.min(
            smoothstep(0, transitionLength, best.distanceAlong),
            smoothstep(0, transitionLength, totalLength - best.distanceAlong),
          );
    const featureStrength =
      Math.max(0, Math.min(1, best.smoothing)) * (1 - edgeBlend) * transitionStrength;
    radius += (targetRadius - radius) * featureStrength;
  }

  return radius;
}

function applyJumpFeature(
  feature: RuntimeTerrainJumpFeature,
  normal: { x: number; y: number; z: number },
  radius: number,
  cfg: TerrainConfig,
): number {
  const center = normalizeVec(feature.nx, feature.ny, feature.nz);
  let tangent = normalizeVec(feature.tx, feature.ty, feature.tz);
  const tangentDotNormal = dot3(tangent, center);
  tangent = normalizeVec(
    tangent.x - center.x * tangentDotNormal,
    tangent.y - center.y * tangentDotNormal,
    tangent.z - center.z * tangentDotNormal,
  );
  const sideCross = cross3(tangent, center);
  const side = normalizeVec(sideCross.x, sideCross.y, sideCross.z);
  const dx = normal.x - center.x;
  const dy = normal.y - center.y;
  const dz = normal.z - center.z;
  const forward = (dx * tangent.x + dy * tangent.y + dz * tangent.z) * cfg.planet.radius;
  const across = (dx * side.x + dy * side.y + dz * side.z) * cfg.planet.radius;
  const halfLength = feature.length * 0.5;
  const halfWidth = feature.width * 0.5;
  const edge = Math.max(0.001, feature.edgeFalloff);
  if (forward < -halfLength - edge || forward > halfLength + edge) return radius;
  if (Math.abs(across) > halfWidth + edge) return radius;

  const forwardT = (forward + halfLength) / Math.max(0.001, feature.length);
  const ramp = smoothstep(0, 1, forwardT);
  const sideT = Math.abs(across) <= halfWidth ? 0 : (Math.abs(across) - halfWidth) / edge;
  const startEndT =
    forward < -halfLength
      ? (-halfLength - forward) / edge
      : forward > halfLength
        ? (forward - halfLength) / edge
        : 0;
  const edgeBlend = Math.max(smoothstep(0, 1, sideT), smoothstep(0, 1, startEndT));
  const strength = clamp(feature.smoothing, 0, 1) * (1 - edgeBlend);
  const targetRadius = baseTerrainRadiusAtNormal(normal, cfg) + feature.height * ramp;
  return radius + (targetRadius - radius) * strength;
}

export const PROCEDURAL_TERRAIN_PROVIDER: TerrainSurfaceProvider = {
  getHeight(nx, ny, nz, cfg) {
    return getTerrainHeight(nx, ny, nz, cfg);
  },
  getRadius(nx, ny, nz, cfg) {
    return getTerrainRadius(nx, ny, nz, cfg);
  },
};

/**
 * Computes the true surface normal at a point on the sphere using
 * central differences of the terrain radius function.
 *
 * The input (nx, ny, nz) must be a unit vector (direction from planet center).
 * Returns a unit normal vector.
 */
export function getTerrainNormal(
  nx: number,
  ny: number,
  nz: number,
  cfg: TerrainConfig,
): { nx: number; ny: number; nz: number } {
  const eps = 0.001;

  // Build a local tangent frame on the sphere
  let tx: number, ty: number, tz: number;
  if (Math.abs(ny) < 0.99) {
    // cross(normal, up)
    tx = nz;
    ty = 0;
    tz = -nx;
  } else {
    // cross(normal, right)
    tx = 0;
    ty = -nz;
    tz = ny;
  }
  const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  // bitangent = cross(normal, tangent)
  const bx = ny * tz - nz * ty;
  const by = nz * tx - nx * tz;
  const bz = nx * ty - ny * tx;

  // Sample height at offset points along tangent and bitangent
  const rCenter = getTerrainRadius(nx, ny, nz, cfg);

  // Tangent direction offset
  let ptx = nx + tx * eps;
  let pty = ny + ty * eps;
  let ptz = nz + tz * eps;
  let pLen = Math.sqrt(ptx * ptx + pty * pty + ptz * ptz);
  ptx /= pLen;
  pty /= pLen;
  ptz /= pLen;
  const rT = getTerrainRadius(ptx, pty, ptz, cfg);

  // Bitangent direction offset
  let pbx = nx + bx * eps;
  let pby = ny + by * eps;
  let pbz = nz + bz * eps;
  pLen = Math.sqrt(pbx * pbx + pby * pby + pbz * pbz);
  pbx /= pLen;
  pby /= pLen;
  pbz /= pLen;
  const rB = getTerrainRadius(pbx, pby, pbz, cfg);

  // Surface positions
  const cX = nx * rCenter;
  const cY = ny * rCenter;
  const cZ = nz * rCenter;
  const tX = ptx * rT;
  const tY = pty * rT;
  const tZ = ptz * rT;
  const bX = pbx * rB;
  const bY = pby * rB;
  const bZ = pbz * rB;

  // Tangent vectors on the surface
  const dTx = tX - cX;
  const dTy = tY - cY;
  const dTz = tZ - cZ;
  const dBx = bX - cX;
  const dBy = bY - cY;
  const dBz = bZ - cZ;

  // Cross product → surface normal
  let cnx = dTy * dBz - dTz * dBy;
  let cny = dTz * dBx - dTx * dBz;
  let cnz = dTx * dBy - dTy * dBx;

  // Ensure normal points outward (same hemisphere as the sphere normal)
  const outwardDot = cnx * nx + cny * ny + cnz * nz;
  if (outwardDot < 0) {
    cnx = -cnx;
    cny = -cny;
    cnz = -cnz;
  }

  const nLen = Math.sqrt(cnx * cnx + cny * cny + cnz * cnz);
  if (nLen < 1e-10) return { nx, ny, nz };
  return { nx: cnx / nLen, ny: cny / nLen, nz: cnz / nLen };
}

// Grass palette — picked per-face to break up monotony
const GRASS_COLORS = [0x3da33d, 0x4cb84c, 0x5ec45e, 0x48a848, 0x6dd46d, 0x3b9e3b];
const SAND_COLORS = [0xd4c078, 0xc8b468, 0xe0cc88, 0xbca858];
const ROCK_COLORS = [0x8a8a7a, 0x7a7a6d, 0x9a9a88, 0x6e6e60];
const OCEAN_COLORS = [0x1a7ab5, 0x1688c8, 0x2094d0, 0x1470a0];

/**
 * Returns the biome type and base color for a given terrain displacement.
 * Accepts an optional variation seed (0-1) to pick from a palette per face.
 */
export function getBiome(
  displacement: number,
  cfg: TerrainConfig,
  variation: number = 0,
): BiomeResult {
  const t = cfg.terrain;
  const pick = (palette: number[]): number =>
    palette[Math.floor(variation * palette.length) % palette.length]!;

  if (displacement < t.waterLevel) {
    return { type: BiomeType.Ocean, color: pick(OCEAN_COLORS) };
  }
  if (displacement < t.waterLevel + t.sandBand) {
    return { type: BiomeType.Sand, color: pick(SAND_COLORS) };
  }
  if (displacement >= t.snowLevel) {
    return { type: BiomeType.Snow, color: 0xeef4f8 };
  }
  if (displacement >= t.rockLevel) {
    return { type: BiomeType.Rock, color: pick(ROCK_COLORS) };
  }
  return { type: BiomeType.Grass, color: pick(GRASS_COLORS) };
}

/**
 * Convenience: get both radius and biome for mesh generation.
 */
export function sampleTerrain(
  nx: number,
  ny: number,
  nz: number,
  cfg: TerrainConfig = GAME_CONFIG,
): { radius: number; displacement: number; biome: BiomeResult } {
  const displacement = getTerrainHeight(nx, ny, nz, cfg);
  return {
    radius: cfg.planet.radius + displacement,
    displacement,
    biome: getBiome(displacement, cfg),
  };
}

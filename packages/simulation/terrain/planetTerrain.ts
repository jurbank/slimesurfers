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
  return cfg.planet.radius + getTerrainHeight(nx, ny, nz, cfg);
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

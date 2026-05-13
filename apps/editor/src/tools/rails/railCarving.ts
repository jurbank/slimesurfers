import * as THREE from "three";
import type { EditorConfig } from "../../types.ts";
import type { RailState } from "./RailTypes.ts";
import { RAIL_SURFACE_OFFSET, RAIL_TUNNEL_TERRAIN_THRESHOLD } from "./railConstants.ts";

export interface RailCarveSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  centerRadius: number;
  halfWidth: number;
  influenceAlong: number;
  targetRadius: number;
}

export interface RailCutterSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
}

export type RailRadiusSampler = (nx: number, ny: number, nz: number) => number;

export const MAX_TUNNEL_SHADER_SEGMENTS = 64;

const TUNNEL_SIDE_CLEARANCE = 3;
const TUNNEL_FLOOR_CLEARANCE = 1.5;
const TUNNEL_WATER_THRESHOLD = -0.1;
const MIN_ALONG_INFLUENCE = 3;

export function buildRailCarveSamples(
  tracks: readonly RailState[],
  config: EditorConfig,
  getRadiusAtNormal: RailRadiusSampler,
): RailCarveSample[] {
  const samples: RailCarveSample[] = [];

  for (const track of tracks) {
    if (track.points.length < 2) continue;
    const planet = config.planets.find((p) => p.id === track.planetId) ?? config.planets[0]!;
    const waterRadius = planet.radius + planet.terrain.waterLevel;

    const controls = track.points.map((point) => {
      if (point.position) return new THREE.Vector3(...point.position);

      const normal = new THREE.Vector3(...point.normal).normalize();
      const radius = getRadiusAtNormal(normal.x, normal.y, normal.z);
      return normal.multiplyScalar(radius + RAIL_SURFACE_OFFSET);
    });

    const closed = track.closed && controls.length >= 3;
    if ((!closed && controls.length < 2) || (closed && controls.length < 3)) continue;

    const curve = new THREE.CatmullRomCurve3(controls, closed, "centripetal");
    const divisions = Math.max(
      2,
      track.segmentsPerCurve * (closed ? controls.length : controls.length - 1),
    );

    const positions: THREE.Vector3[] = [];
    const widths: number[] = [];
    const banks: number[] = [];
    const terrainRadii: number[] = [];

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const position = curve.getPoint(t);
      const normal = position.clone().normalize();
      const scalars = interpolatePointScalars(track, t, closed);
      positions.push(position);
      widths.push(scalars.width);
      banks.push(scalars.bank);
      terrainRadii.push(getRadiusAtNormal(normal.x, normal.y, normal.z));
    }

    const rings = closed ? positions.length - 1 : positions.length;

    for (let i = 0; i < rings; i++) {
      const position = positions[i]!;
      const centerRadius = position.length();
      const isTunnel =
        centerRadius - terrainRadii[i]! < RAIL_TUNNEL_TERRAIN_THRESHOLD ||
        centerRadius - waterRadius < TUNNEL_WATER_THRESHOLD;
      if (!isTunnel) continue;

      const prev = closed ? positions[(i - 1 + rings) % rings]! : positions[Math.max(0, i - 1)]!;
      const next = closed ? positions[(i + 1) % rings]! : positions[Math.min(rings - 1, i + 1)]!;
      const surfaceNormal = position.clone().normalize();
      const tangent = next.clone().sub(prev);
      tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal));
      if (tangent.lengthSq() < 1e-8) continue;
      tangent.normalize();

      const side = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
      const bankRad = ((banks[i] ?? track.bank) * Math.PI) / 180;
      side.applyAxisAngle(tangent, bankRad);
      const up = surfaceNormal.clone().applyAxisAngle(tangent, bankRad).normalize();
      const halfWidth = (widths[i] ?? track.width) * 0.5 + TUNNEL_SIDE_CLEARANCE;
      const influenceAlong = Math.max(MIN_ALONG_INFLUENCE, next.distanceTo(prev) * 0.35);

      samples.push({
        position,
        tangent,
        side,
        up,
        centerRadius,
        halfWidth,
        influenceAlong,
        targetRadius: centerRadius - TUNNEL_FLOOR_CLEARANCE,
      });
    }
  }

  return samples;
}

export function getRailCarvedRadius(
  nx: number,
  ny: number,
  nz: number,
  radius: number,
  samples: readonly RailCarveSample[],
): number {
  if (samples.length === 0) return radius;

  const normal = new THREE.Vector3(nx, ny, nz).normalize();
  let carvedRadius = radius;

  for (const sample of samples) {
    const pointAtRailRadius = normal.clone().multiplyScalar(sample.centerRadius);
    const offset = pointAtRailRadius.sub(sample.position);
    const lateral = offset.dot(sample.side);
    const along = offset.dot(sample.tangent);
    const lateralT = Math.abs(lateral) / sample.halfWidth;
    const alongT = Math.abs(along) / sample.influenceAlong;

    const edgeT = Math.sqrt(lateralT * lateralT + alongT * alongT);
    if (edgeT >= 1) continue;

    const falloff = smoothstep(0.72, 1, edgeT);
    const target = THREE.MathUtils.lerp(sample.targetRadius, radius, falloff);
    carvedRadius = Math.min(carvedRadius, target);
  }

  return carvedRadius;
}

// -- Surface track samples (non-tunnel, near-ground sections) ----------------

export interface RailSurfaceSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
  centerRadius: number;
  halfWidth: number;
  influenceAlong: number;
}

/**
 * Build samples for rail sections that are usable as free-movement surfaces.
 * Tunnel carving can lower surrounding terrain, but the rail path itself
 * remains a playable floor.
 */
export function buildRailSurfaceSamples(
  tracks: readonly RailState[],
  config: EditorConfig,
  getRadiusAtNormal: RailRadiusSampler,
): RailSurfaceSample[] {
  const samples: RailSurfaceSample[] = [];

  for (const track of tracks) {
    if (track.points.length < 2) continue;

    const controls = track.points.map((point) => {
      if (point.position) return new THREE.Vector3(...point.position);
      const normal = new THREE.Vector3(...point.normal).normalize();
      const radius = getRadiusAtNormal(normal.x, normal.y, normal.z);
      return normal.multiplyScalar(radius + RAIL_SURFACE_OFFSET);
    });

    const closed = track.closed && controls.length >= 3;
    if ((!closed && controls.length < 2) || (closed && controls.length < 3)) continue;

    const curve = new THREE.CatmullRomCurve3(controls, closed, "centripetal");
    const divisions = Math.max(
      2,
      track.segmentsPerCurve * (closed ? controls.length : controls.length - 1),
    );

    const positions: THREE.Vector3[] = [];
    const widths: number[] = [];
    const banks: number[] = [];
    const terrainRadii: number[] = [];

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const position = curve.getPoint(t);
      const normal = position.clone().normalize();
      const scalars = interpolatePointScalars(track, t, closed);
      positions.push(position);
      widths.push(scalars.width);
      banks.push(scalars.bank);
      terrainRadii.push(getRadiusAtNormal(normal.x, normal.y, normal.z));
    }

    const rings = closed ? positions.length - 1 : positions.length;

    for (let i = 0; i < rings; i++) {
      const position = positions[i]!;
      const centerRadius = position.length();
      const prev = closed ? positions[(i - 1 + rings) % rings]! : positions[Math.max(0, i - 1)]!;
      const next = closed ? positions[(i + 1) % rings]! : positions[Math.min(rings - 1, i + 1)]!;
      const surfaceNormal = position.clone().normalize();
      const tangent = next.clone().sub(prev);
      tangent.addScaledVector(surfaceNormal, -tangent.dot(surfaceNormal));
      if (tangent.lengthSq() < 1e-8) continue;
      tangent.normalize();

      const bankRad = ((banks[i] ?? track.bank) * Math.PI) / 180;
      const side = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
      side.applyAxisAngle(tangent, bankRad);

      const halfWidth = (widths[i] ?? track.width) * 0.5;
      const influenceAlong = Math.max(MIN_ALONG_INFLUENCE, next.distanceTo(prev) * 0.8);

      samples.push({ position, tangent, side, centerRadius, halfWidth, influenceAlong });
    }
  }

  return samples;
}

/**
 * Raise the terrain radius in areas covered by surface rail paths.
 * Returns the maximum of the base radius and the ribbon surface height,
 * with a smooth falloff at the ribbon edges.
 */
export function getRailRaisedRadius(
  nx: number,
  ny: number,
  nz: number,
  radius: number,
  samples: readonly RailSurfaceSample[],
): number {
  if (samples.length === 0) return radius;

  const normal = new THREE.Vector3(nx, ny, nz).normalize();
  let raisedRadius = radius;

  for (const sample of samples) {
    const pointAtRailRadius = normal.clone().multiplyScalar(sample.centerRadius);
    const offset = pointAtRailRadius.sub(sample.position);
    const signedLateral = offset.dot(sample.side);
    const lateral = Math.abs(signedLateral);
    const along = Math.abs(offset.dot(sample.tangent));
    const lateralT = lateral / sample.halfWidth;
    const alongT = along / sample.influenceAlong;

    const edgeT = Math.sqrt(lateralT * lateralT + alongT * alongT);
    if (edgeT >= 1) continue;

    const falloff = smoothstep(0.72, 1, edgeT);
    const bankedSurfaceRadius = sample.position
      .clone()
      .addScaledVector(sample.side, signedLateral)
      .length();
    const target = THREE.MathUtils.lerp(bankedSurfaceRadius, radius, falloff);
    raisedRadius = Math.max(raisedRadius, target);
  }

  return raisedRadius;
}

export function buildRailCutterSegments(samples: readonly RailCarveSample[]): RailCutterSegment[] {
  const segments: RailCutterSegment[] = [];

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    const distance = a.position.distanceTo(b.position);
    const maxExpectedDistance = Math.max(a.influenceAlong, b.influenceAlong) * 3;
    if (distance <= 0.01 || distance > maxExpectedDistance) continue;

    const radius = Math.max(a.halfWidth, b.halfWidth, 5);
    const direction = b.position.clone().sub(a.position).normalize();
    const extension = radius * 0.85;

    segments.push({
      start: a.position.clone().addScaledVector(direction, -extension),
      end: b.position.clone().addScaledVector(direction, extension),
      radius,
    });
  }

  return segments;
}

function interpolatePointScalars(
  rail: RailState,
  t: number,
  closed: boolean,
): { width: number; bank: number } {
  const pointCount = rail.points.length;
  const segmentCount = closed ? pointCount : Math.max(1, pointCount - 1);
  const scaled = Math.min(t * segmentCount, segmentCount - Number.EPSILON);
  const index = Math.floor(scaled);
  const localT = scaled - index;
  const a = rail.points[Math.min(index, pointCount - 1)];
  const b = rail.points[closed ? (index + 1) % pointCount : Math.min(index + 1, pointCount - 1)];
  const widthA = a?.width ?? rail.width;
  const widthB = b?.width ?? rail.width;
  const bankA = a?.bank ?? rail.bank;
  const bankB = b?.bank ?? rail.bank;

  return {
    width: THREE.MathUtils.lerp(widthA, widthB, localT),
    bank: THREE.MathUtils.lerp(bankA, bankB, localT),
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

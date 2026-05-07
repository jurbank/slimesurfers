import type { BrushFalloff } from "../../types.ts";
import type {
  TerrainStampKind,
  TerrainStampSample,
  TerrainStampState,
} from "./TerrainStampTypes.ts";

const DEG_TO_RAD = Math.PI / 180;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function falloffWeight(t: number, falloff: BrushFalloff): number {
  switch (falloff) {
    case "linear":
      return 1 - t;
    case "sharp":
      return Math.pow(1 - t, 3);
    case "smooth":
      return 1 - 3 * t * t + 2 * t * t * t;
  }
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function pseudoNoise(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

function localPatchCoords(sample: TerrainStampSample): {
  angle: number;
  u: number;
  v: number;
  x: number;
  y: number;
  distance: number;
  weight: number;
} | null {
  const centerDot = clamp01(dot(sample.normal, sample.center));
  const angle = Math.acos(centerDot);
  if (angle > sample.radiusRadians) return null;

  const t = angle / sample.radiusRadians;
  const u = dot(sample.normal, sample.tangent);
  const v = dot(sample.normal, sample.bitangent);
  const scale = angle > 1e-6 ? angle / Math.sqrt(u * u + v * v) : 0;
  const x = u * scale;
  const y = v * scale;

  return {
    angle,
    u,
    v,
    x,
    y,
    distance: t,
    weight: falloffWeight(t, sample.falloff),
  };
}

export function terrainStampRadiusRadians(state: TerrainStampState): number {
  return Math.max(0.1, state.size) * DEG_TO_RAD;
}

export function terrainStampDelta(kind: TerrainStampKind, sample: TerrainStampSample): number {
  const coords = localPatchCoords(sample);
  if (!coords) return 0;

  const rough =
    sample.roughness <= 0
      ? 0
      : pseudoNoise(coords.x / sample.radiusRadians, coords.y / sample.radiusRadians) *
        sample.roughness *
        sample.strength *
        0.22 *
        coords.weight;

  switch (kind) {
    case "crater": {
      const bowl = -sample.strength * (1 - smoothstep(0, 0.76, coords.distance));
      const rim =
        sample.strength *
        0.48 *
        Math.exp(-Math.pow((coords.distance - 0.76) / 0.12, 2)) *
        coords.weight;
      return bowl + rim + rough;
    }
    case "ridge": {
      const halfLength = sample.radiusRadians;
      const halfWidth = sample.radiusRadians * 0.24;
      const along = Math.abs(coords.x) / halfLength;
      const across = Math.abs(coords.y) / halfWidth;
      if (along > 1 || across > 1) return 0;
      const profile = Math.pow(1 - across, 1.5) * smoothstep(1, 0.72, along);
      return sample.strength * profile + rough;
    }
    case "crevasse": {
      const halfLength = sample.radiusRadians;
      const halfWidth = sample.radiusRadians * 0.2;
      const along = Math.abs(coords.x) / halfLength;
      const across = Math.abs(coords.y) / halfWidth;
      if (along > 1 || across > 1.35) return 0;
      const cut =
        -sample.strength * Math.pow(Math.max(0, 1 - across), 0.65) * smoothstep(1, 0.72, along);
      const raisedEdges =
        sample.strength *
        0.22 *
        Math.exp(-Math.pow((across - 1.05) / 0.18, 2)) *
        smoothstep(1, 0.72, along);
      return cut + raisedEdges + rough;
    }
    case "mesa": {
      const top = 1 - smoothstep(0.48, 0.72, coords.distance);
      const shoulder =
        smoothstep(0.46, 0.62, coords.distance) * (1 - smoothstep(0.75, 1, coords.distance));
      return sample.strength * (top + shoulder * 0.35) * coords.weight + rough;
    }
  }
}

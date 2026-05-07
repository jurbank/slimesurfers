import type { BrushFalloff } from "../../types.ts";

export type TerrainStampKind = "crater" | "ridge" | "crevasse" | "mesa";

export interface TerrainStampState {
  kind: TerrainStampKind;
  size: number;
  strength: number;
  rotation: number;
  falloff: BrushFalloff;
  roughness: number;
}

export interface TerrainStampSample {
  normal: [number, number, number];
  center: [number, number, number];
  tangent: [number, number, number];
  bitangent: [number, number, number];
  radiusRadians: number;
  strength: number;
  roughness: number;
  falloff: BrushFalloff;
}

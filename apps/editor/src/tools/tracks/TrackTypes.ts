export type RailEditMode = "add" | "move" | "delete";

export interface RailPoint {
  id: string;
  normal: [number, number, number];
  position?: [number, number, number];
  width?: number;
  bank?: number;
}

export interface RailState {
  id: string;
  planetId: string;
  name: string;
  closed: boolean;
  width: number;
  bank: number;
  segmentsPerCurve: number;
  points: RailPoint[];
}

export interface RailToolState {
  mode: RailEditMode | null;
  track: RailState;
  selectedPointId: string | null;
}

export interface RailExport {
  version: 1;
  rails: RailState[];
}

export type TrackEditMode = RailEditMode;
export type TrackPoint = RailPoint;
export type TrackState = RailState;
export type TrackToolState = RailToolState;

export interface TrackExport {
  version: 1;
  tracks: RailState[];
}

let nextRailId = 1;

export function createDefaultRailState(name?: string, planetId = "planet-0"): RailState {
  const index = nextRailId++;
  return {
    id: `track-${index}`,
    planetId,
    name: name ?? `Rail ${index}`,
    closed: true,
    width: 8,
    bank: 0,
    segmentsPerCurve: 12,
    points: [],
  };
}

export const createDefaultTrackState = createDefaultRailState;

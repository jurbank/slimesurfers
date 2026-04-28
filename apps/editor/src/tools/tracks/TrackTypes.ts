export type TrackEditMode = "add" | "move" | "delete";

export interface TrackPoint {
  id: string;
  normal: [number, number, number];
  position?: [number, number, number];
  width?: number;
  bank?: number;
}

export interface TrackState {
  id: string;
  name: string;
  closed: boolean;
  width: number;
  bank: number;
  segmentsPerCurve: number;
  points: TrackPoint[];
}

export interface TrackToolState {
  mode: TrackEditMode | null;
  track: TrackState;
  selectedPointId: string | null;
}

export interface TrackExport {
  version: 1;
  tracks: TrackState[];
}

let nextTrackId = 1;

export function createDefaultTrackState(name?: string): TrackState {
  const index = nextTrackId++;
  return {
    id: `track-${index}`,
    name: name ?? `Track ${index}`,
    closed: true,
    width: 8,
    bank: 0,
    segmentsPerCurve: 12,
    points: [],
  };
}

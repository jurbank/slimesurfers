export interface RailControlPoint {
  nx: number;
  ny: number;
  nz: number;
  heightOffset: number; // wu above terrain surface
}

export interface RailDef {
  id: number;
  planetId: string;
  controlPoints: RailControlPoint[];
  paintCorridorRadius: number; // surface radius in wu
}

// Half-planet test rail at ~30° from north pole, 0°→180° longitude.
// Height 12 wu clears snowLevel (9 wu) everywhere for easy testing.
export const RAIL_DEFS: RailDef[] = [
  {
    id: 0,
    planetId: "planet-0",
    paintCorridorRadius: 8.0,
    controlPoints: [
      { nx: 0.5, ny: 0.866, nz: 0, heightOffset: 12 },
      { nx: 0.4698, ny: 0.866, nz: 0.171, heightOffset: 12 },
      { nx: 0.383, ny: 0.866, nz: 0.3214, heightOffset: 12 },
      { nx: 0.25, ny: 0.866, nz: 0.433, heightOffset: 12 },
      { nx: 0.0868, ny: 0.866, nz: 0.4924, heightOffset: 12 },
      { nx: -0.0868, ny: 0.866, nz: 0.4924, heightOffset: 12 },
      { nx: -0.25, ny: 0.866, nz: 0.433, heightOffset: 12 },
      { nx: -0.383, ny: 0.866, nz: 0.3214, heightOffset: 12 },
      { nx: -0.4698, ny: 0.866, nz: 0.171, heightOffset: 12 },
      { nx: -0.5, ny: 0.866, nz: 0, heightOffset: 12 },
    ],
  },
];

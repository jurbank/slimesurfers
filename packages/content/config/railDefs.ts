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
  slimeCorridorRadius: number; // surface radius in wu
}

// Half-planet test rail at ~30° from north pole, 0°→180° longitude.
// Height 12 wu clears snowLevel (9 wu) everywhere for easy testing.
export const RAIL_DEFS: RailDef[] = [
  {
    id: 0,
    planetId: "planet-0",
    slimeCorridorRadius: 8.0,
    controlPoints: [
      { nx: 0.5, ny: 0.866, nz: 0, heightOffset: 4.5 },
      { nx: 0.4698, ny: 0.866, nz: 0.171, heightOffset: 6.0 },
      { nx: 0.383, ny: 0.866, nz: 0.3214, heightOffset: 10.0 },
      { nx: 0.25, ny: 0.866, nz: 0.433, heightOffset: 12 },
      { nx: 0.0868, ny: 0.866, nz: 0.4924, heightOffset: 12 },
      { nx: -0.0868, ny: 0.866, nz: 0.4924, heightOffset: 12 },
      { nx: -0.25, ny: 0.866, nz: 0.433, heightOffset: 12 },
      { nx: -0.383, ny: 0.866, nz: 0.3214, heightOffset: 10.0 },
      { nx: -0.4698, ny: 0.866, nz: 0.171, heightOffset: 6.0 },
      { nx: -0.5, ny: 0.866, nz: 0, heightOffset: 4.5 },
    ],
  },
  {
    id: 1,
    planetId: "planet-0",
    slimeCorridorRadius: 8.0,
    controlPoints: [
      // Spanning ~280 degrees longitude to ensure a clear gap between ends
      { nx: -0.383, ny: -0.866, nz: -0.321, heightOffset: 4.5 }, // -140 deg
      { nx: -0.25, ny: -0.866, nz: -0.433, heightOffset: 6.0 }, // -120
      { nx: -0.087, ny: -0.866, nz: -0.492, heightOffset: 10.0 }, // -100
      { nx: 0.087, ny: -0.866, nz: -0.492, heightOffset: 12.0 }, // -80
      { nx: 0.25, ny: -0.866, nz: -0.433, heightOffset: 12.0 }, // -60
      { nx: 0.383, ny: -0.866, nz: -0.321, heightOffset: 12.0 }, // -40
      { nx: 0.47, ny: -0.866, nz: -0.171, heightOffset: 12.0 }, // -20
      { nx: 0.5, ny: -0.866, nz: 0, heightOffset: 12.0 }, // 0
      { nx: 0.47, ny: -0.866, nz: 0.171, heightOffset: 12.0 }, // 20
      { nx: 0.383, ny: -0.866, nz: 0.321, heightOffset: 12.0 }, // 40
      { nx: 0.25, ny: -0.866, nz: 0.433, heightOffset: 12.0 }, // 60
      { nx: 0.087, ny: -0.866, nz: 0.492, heightOffset: 12.0 }, // 80
      { nx: -0.087, ny: -0.866, nz: 0.492, heightOffset: 10.0 }, // 100
      { nx: -0.25, ny: -0.866, nz: 0.433, heightOffset: 6.0 }, // 120
      { nx: -0.383, ny: -0.866, nz: 0.321, heightOffset: 40.5 }, // 140 deg
    ],
  },
];

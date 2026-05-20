import { describe, expect, test } from "vite-plus/test";
import { getTerrainRadius, type TerrainConfig } from "./planetTerrain.ts";

const FLAT_CFG: TerrainConfig = {
  planet: { radius: 100 },
  terrain: {
    seed: 1,
    baseAmplitude: 0,
    frequency: 1,
    octaves: 1,
    lacunarity: 2,
    persistence: 0.5,
    heightSmoothingStrength: 0,
    heightSmoothingSampleAngle: 0.03,
    waterLevel: -3,
    snowLevel: 9,
    sandBand: 1.5,
    rockLevel: 7,
  },
};

describe("terrain features", () => {
  test("blends a slope corridor into terrain radius", () => {
    const cfg: TerrainConfig = {
      ...FLAT_CFG,
      terrainFeatures: [
        {
          id: "slope-1",
          kind: "slope",
          enabled: true,
          width: 30,
          bank: 0,
          edgeFalloff: 10,
          smoothing: 1,
          transitionLength: 0,
          points: [
            { nx: 0, ny: 1, nz: 0, heightOffset: 10 },
            { nx: 0.6, ny: 0.6, nz: 0.529, heightOffset: -10 },
          ],
        },
      ],
    };

    const start = getTerrainRadius(0, 1, 0, cfg);
    const end = getTerrainRadius(0.6, 0.6, 0.529, cfg);
    const outside = getTerrainRadius(-1, 0, 0, cfg);

    expect(start).toBeCloseTo(110, 4);
    expect(end).toBeCloseTo(90, 4);
    expect(outside).toBeCloseTo(100, 4);
  });

  test("applies slope banking across the corridor", () => {
    const cfg: TerrainConfig = {
      ...FLAT_CFG,
      terrainFeatures: [
        {
          id: "banked-slope",
          kind: "slope",
          enabled: true,
          width: 40,
          bank: 8,
          edgeFalloff: 8,
          smoothing: 1,
          transitionLength: 0,
          points: [
            { nx: 0, ny: 1, nz: 0, heightOffset: 0 },
            { nx: 1, ny: 0, nz: 0, heightOffset: 0 },
          ],
        },
      ],
    };

    const left = getTerrainRadius(0.12, 0.99, 0.1, cfg);
    const right = getTerrainRadius(0.12, 0.99, -0.1, cfg);

    expect(Math.abs(left - right)).toBeGreaterThan(4);
  });

  test("interpolates point width overrides along the slope", () => {
    const cfg: TerrainConfig = {
      ...FLAT_CFG,
      terrainFeatures: [
        {
          id: "variable-width-slope",
          kind: "slope",
          enabled: true,
          width: 10,
          bank: 0,
          edgeFalloff: 2,
          smoothing: 1,
          transitionLength: 0,
          points: [
            { nx: 0, ny: 1, nz: 0, heightOffset: 10, width: 10 },
            { nx: 1, ny: 0, nz: 0, heightOffset: 10, width: 60 },
          ],
        },
      ],
    };

    const narrowSide = getTerrainRadius(0, 0.98, 0.2, cfg);
    const wideSide = getTerrainRadius(0.98, 0, 0.2, cfg);

    expect(narrowSide).toBeCloseTo(100, 4);
    expect(wideSide).toBeGreaterThan(105);
  });

  test("eases slope strength near start and end transitions", () => {
    const cfg: TerrainConfig = {
      ...FLAT_CFG,
      terrainFeatures: [
        {
          id: "transition-slope",
          kind: "slope",
          enabled: true,
          width: 30,
          bank: 0,
          edgeFalloff: 10,
          smoothing: 1,
          transitionLength: 30,
          points: [
            { nx: 0, ny: 1, nz: 0, heightOffset: 10 },
            { nx: 1, ny: 0, nz: 0, heightOffset: 10 },
          ],
        },
      ],
    };

    const start = getTerrainRadius(0, 1, 0, cfg);
    const middle = getTerrainRadius(0.707, 0.707, 0, cfg);
    const end = getTerrainRadius(1, 0, 0, cfg);

    expect(start).toBeCloseTo(100, 4);
    expect(middle).toBeGreaterThan(109);
    expect(end).toBeCloseTo(100, 4);
  });

  test("adds a jump ramp along its tangent", () => {
    const cfg: TerrainConfig = {
      ...FLAT_CFG,
      terrainFeatures: [
        {
          id: "jump-1",
          kind: "jump",
          enabled: true,
          nx: 0,
          ny: 1,
          nz: 0,
          tx: 1,
          ty: 0,
          tz: 0,
          width: 40,
          length: 40,
          height: 12,
          edgeFalloff: 8,
          smoothing: 1,
        },
      ],
    };

    const start = getTerrainRadius(-0.2, 0.98, 0, cfg);
    const lip = getTerrainRadius(0.2, 0.98, 0, cfg);
    const outside = getTerrainRadius(0.2, 0.92, 0.34, cfg);

    expect(start).toBeCloseTo(100, 1);
    expect(lip).toBeGreaterThan(109);
    expect(outside).toBeCloseTo(100, 4);
  });
});

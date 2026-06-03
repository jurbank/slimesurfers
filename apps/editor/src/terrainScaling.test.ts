import { describe, expect, it } from "vite-plus/test";
import { defaultEditorPlanet, type EditorTerrainSlopeFeature } from "./types.ts";
import { scalePlanetForRadius } from "./terrainScaling.ts";

describe("scalePlanetForRadius", () => {
  it("scales terrain bands proportionally", () => {
    const planet = defaultEditorPlanet("planet-test");
    const scaled = scalePlanetForRadius(planet, 0.3);

    expect(scaled.terrain.baseAmplitude).toBeCloseTo(planet.terrain.baseAmplitude * 0.3, 10);
    expect(scaled.terrain.waterLevel).toBeCloseTo(planet.terrain.waterLevel * 0.3, 10);
    expect(scaled.terrain.sandBand).toBeCloseTo(planet.terrain.sandBand * 0.3, 10);
    expect(scaled.terrain.rockLevel).toBeCloseTo(planet.terrain.rockLevel * 0.3, 10);
    expect(scaled.terrain.snowLevel).toBeCloseTo(planet.terrain.snowLevel * 0.3, 10);
  });

  it("returns the planet unchanged for scale=1", () => {
    const planet = defaultEditorPlanet("planet-test");
    expect(scalePlanetForRadius(planet, 1)).toBe(planet);
  });

  it("returns the planet unchanged for invalid scale", () => {
    const planet = defaultEditorPlanet("planet-test");
    expect(scalePlanetForRadius(planet, 0)).toBe(planet);
    expect(scalePlanetForRadius(planet, -2)).toBe(planet);
    expect(scalePlanetForRadius(planet, NaN)).toBe(planet);
  });

  it("preserves shape parameters that don't scale with radius", () => {
    const planet = defaultEditorPlanet("planet-test");
    const scaled = scalePlanetForRadius(planet, 0.3);

    expect(scaled.terrain.seed).toBe(planet.terrain.seed);
    expect(scaled.terrain.octaves).toBe(planet.terrain.octaves);
    expect(scaled.terrain.lacunarity).toBe(planet.terrain.lacunarity);
    expect(scaled.terrain.persistence).toBe(planet.terrain.persistence);
    expect(scaled.colors).toEqual(planet.colors);
    expect(scaled.radius).toBe(planet.radius);
  });

  it("scales slope feature widths and point heightOffsets", () => {
    const slope: EditorTerrainSlopeFeature = {
      id: "slope-1",
      kind: "slope",
      name: "Test",
      enabled: true,
      width: 30,
      bank: 5,
      edgeFalloff: 8,
      smoothing: 0.9,
      transitionLength: 4,
      points: [
        { id: "p1", normal: [0, 1, 0], heightOffset: 10, width: 20, edgeFalloff: 6 },
        { id: "p2", normal: [1, 0, 0], heightOffset: 4 },
      ],
    };
    const planet = { ...defaultEditorPlanet("planet-test"), terrainFeatures: [slope] };
    const scaled = scalePlanetForRadius(planet, 0.5);
    const scaledSlope = scaled.terrainFeatures[0]! as EditorTerrainSlopeFeature;

    expect(scaledSlope.width).toBe(15);
    expect(scaledSlope.edgeFalloff).toBe(4);
    expect(scaledSlope.transitionLength).toBe(2);
    expect(scaledSlope.bank).toBe(5);
    expect(scaledSlope.smoothing).toBe(0.9);
    expect(scaledSlope.points[0]!.heightOffset).toBe(5);
    expect(scaledSlope.points[0]!.width).toBe(10);
    expect(scaledSlope.points[0]!.edgeFalloff).toBe(3);
    expect(scaledSlope.points[1]!.heightOffset).toBe(2);
    expect(scaledSlope.points[1]!.width).toBeUndefined();
  });

  it("scales jump feature dimensions", () => {
    const planet = defaultEditorPlanet("planet-test");
    const jumpPlanet = {
      ...planet,
      terrainFeatures: [
        {
          id: "jump-1",
          kind: "jump" as const,
          name: "J",
          enabled: true,
          normal: [0, 1, 0] as [number, number, number],
          tangent: [1, 0, 0] as [number, number, number],
          width: 24,
          length: 34,
          height: 10,
          edgeFalloff: 8,
          smoothing: 1,
        },
      ],
    };
    const scaled = scalePlanetForRadius(jumpPlanet, 2);
    const j = scaled.terrainFeatures[0]!;
    if (j.kind !== "jump") throw new Error("expected jump");

    expect(j.width).toBe(48);
    expect(j.length).toBe(68);
    expect(j.height).toBe(20);
    expect(j.edgeFalloff).toBe(16);
    expect(j.smoothing).toBe(1);
  });

  it("round-trips through compounded scale operations without drift beyond float epsilon", () => {
    const planet = defaultEditorPlanet("planet-test");
    let scaled = planet;
    // Simulate dragging radius 100 -> 30 (70 unit steps).
    for (let r = 99; r >= 30; r--) {
      scaled = scalePlanetForRadius(scaled, r / (r + 1));
    }
    expect(scaled.terrain.baseAmplitude).toBeCloseTo(planet.terrain.baseAmplitude * 0.3, 8);
  });
});

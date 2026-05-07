import { describe, expect, it } from "vite-plus/test";
import { terrainStampDelta } from "./terrainStampMath.ts";
import type { TerrainStampSample } from "./TerrainStampTypes.ts";

function sample(overrides: Partial<TerrainStampSample>): TerrainStampSample {
  return {
    normal: [0, 1, 0],
    center: [0, 1, 0],
    tangent: [1, 0, 0],
    bitangent: [0, 0, 1],
    radiusRadians: 0.2,
    strength: 6,
    roughness: 0,
    falloff: "smooth",
    ...overrides,
  };
}

describe("terrainStampDelta", () => {
  it("cuts crater centers and raises crater rims", () => {
    expect(terrainStampDelta("crater", sample({ normal: [0, 1, 0] }))).toBeLessThan(0);

    const rimNormal: [number, number, number] = [Math.sin(0.2 * 0.76), Math.cos(0.2 * 0.76), 0];
    expect(terrainStampDelta("crater", sample({ normal: rimNormal }))).toBeGreaterThan(0);
  });

  it("does not affect samples outside the stamp radius", () => {
    const outsideNormal: [number, number, number] = [Math.sin(0.3), Math.cos(0.3), 0];
    expect(terrainStampDelta("mesa", sample({ normal: outsideNormal }))).toBe(0);
  });

  it("uses directional profiles for ridges and crevasses", () => {
    const alongRidge: [number, number, number] = [Math.sin(0.1), Math.cos(0.1), 0];
    const acrossRidge: [number, number, number] = [0, Math.cos(0.1), Math.sin(0.1)];

    expect(terrainStampDelta("ridge", sample({ normal: alongRidge }))).toBeGreaterThan(0);
    expect(terrainStampDelta("ridge", sample({ normal: acrossRidge }))).toBe(0);
    expect(terrainStampDelta("crevasse", sample({ normal: alongRidge }))).toBeLessThan(0);
  });
});

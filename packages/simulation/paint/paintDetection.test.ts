import { describe, expect, it } from "vite-plus/test";
import {
  appendPaintStamp,
  createStampBuckets,
  getPaintAtPoint,
  getPaintCollisionDistance,
  getPaintCoverageAlpha,
  getPaintRenderRadius,
} from "./paintDetection.ts";

const TEST_STAMP = {
  radius: 0.04,
};

describe("paintDetection", () => {
  it("returns full coverage at the stamp center", () => {
    expect(getPaintCoverageAlpha(0, TEST_STAMP)).toBe(1);
  });

  it("falls to zero at the render radius", () => {
    expect(getPaintCoverageAlpha(getPaintRenderRadius(TEST_STAMP), TEST_STAMP)).toBe(0);
  });

  it("derives a collision distance that matches the configured alpha threshold", () => {
    const collisionDistance = getPaintCollisionDistance(TEST_STAMP);
    const alphaAtBoundary = getPaintCoverageAlpha(collisionDistance, TEST_STAMP);
    const alphaPastBoundary = getPaintCoverageAlpha(collisionDistance + 0.0005, TEST_STAMP);

    expect(alphaAtBoundary).toBeGreaterThan(0.2);
    expect(alphaPastBoundary).toBeLessThanOrEqual(0.2);
  });

  it("finds paint using the indexed bucket query path", () => {
    const planets = new Map([
      [
        "planet-0",
        {
          planetId: "planet-0",
          territoryRows: 12,
          territoryCols: 24,
          cells: [],
          stamps: [],
          stampBuckets: createStampBuckets(12, 24),
        },
      ],
    ]);

    appendPaintStamp(planets.get("planet-0")!, {
      paintGroupId: 1,
      color: 0xffffff,
      nx: -1,
      ny: 0,
      nz: 0,
      radius: TEST_STAMP.radius,
      seq: 1,
    });

    expect(getPaintAtPoint({ x: -251, y: 0, z: 0 }, "planet-0", planets)?.paintGroupId).toBe(1);
  });
});

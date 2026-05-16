import { describe, expect, it } from "vite-plus/test";
import { DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import {
  appendSlimeStamp,
  createStampBuckets,
  getSlimeAtPoint,
  getSlimeCollisionDistance,
  getSlimeCoverageAlpha,
  getSlimeRenderRadius,
} from "./slimeDetection.ts";

const TEST_STAMP = {
  radius: 0.04,
};

describe("paintDetection", () => {
  it("returns full coverage at the stamp center", () => {
    expect(getSlimeCoverageAlpha(0, TEST_STAMP)).toBe(1);
  });

  it("falls to zero at the render radius", () => {
    expect(getSlimeCoverageAlpha(getSlimeRenderRadius(TEST_STAMP), TEST_STAMP)).toBe(0);
  });

  it("derives a collision distance that matches the configured alpha threshold", () => {
    const collisionDistance = getSlimeCollisionDistance(TEST_STAMP);
    const alphaAtBoundary = getSlimeCoverageAlpha(collisionDistance, TEST_STAMP);
    const alphaPastBoundary = getSlimeCoverageAlpha(collisionDistance + 0.0005, TEST_STAMP);

    expect(alphaAtBoundary).toBeGreaterThan(0.2);
    expect(alphaPastBoundary).toBeLessThanOrEqual(0.2);
  });

  it("finds slime using the indexed bucket query path", () => {
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

    appendSlimeStamp(planets.get("planet-0")!, {
      slimeGroupId: 1,
      color: 0xffffff,
      nx: -1,
      ny: 0,
      nz: 0,
      radius: TEST_STAMP.radius,
      seq: 1,
      patternId: 0,
    });

    expect(
      getSlimeAtPoint({ x: -251, y: 0, z: 0 }, "planet-0", planets, DEV_MAP.planets)?.slimeGroupId,
    ).toBe(1);
  });
});

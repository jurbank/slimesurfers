import { describe, expect, test } from "vite-plus/test";
import { DEV_MAP, validateRuntimeMapData } from "./runtimeMapData.ts";

describe("validateRuntimeMapData", () => {
  test("DEV_MAP passes validation", () => {
    const result = validateRuntimeMapData(DEV_MAP);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects non-object", () => {
    expect(validateRuntimeMapData(null).valid).toBe(false);
    expect(validateRuntimeMapData("string").valid).toBe(false);
    expect(validateRuntimeMapData(42).valid).toBe(false);
  });

  test("rejects missing version", () => {
    const result = validateRuntimeMapData({ ...DEV_MAP, version: undefined });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "version")).toBe(true);
  });

  test("rejects non-integer version", () => {
    const result = validateRuntimeMapData({ ...DEV_MAP, version: 1.5 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "version")).toBe(true);
  });

  test("rejects empty mapId", () => {
    const result = validateRuntimeMapData({ ...DEV_MAP, mapId: "  " });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "mapId")).toBe(true);
  });

  test("rejects empty planets array", () => {
    const result = validateRuntimeMapData({ ...DEV_MAP, planets: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets")).toBe(true);
  });

  test("rejects duplicate planet ids", () => {
    const planet = DEV_MAP.planets[0]!;
    const result = validateRuntimeMapData({ ...DEV_MAP, planets: [planet, planet] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate"))).toBe(true);
  });

  test("rejects non-positive planet radius", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [{ ...DEV_MAP.planets[0]!, radius: -1 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets[0].radius")).toBe(true);
  });

  test("rejects non-positive planet gravity radius", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [{ ...DEV_MAP.planets[0]!, gravityRadius: 0 }],
      blastPads: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets[0].gravityRadius")).toBe(true);
  });

  test("rejects missing terrain field", () => {
    const planet0 = DEV_MAP.planets[0]!;
    const { seed: _seed, ...terrainWithoutSeed } = planet0.terrain;
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [{ ...planet0, terrain: terrainWithoutSeed }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets[0].terrain.seed")).toBe(true);
  });

  test("rejects non-integer octaves", () => {
    const planet0 = DEV_MAP.planets[0]!;
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [{ ...planet0, terrain: { ...planet0.terrain, octaves: 2.5 } }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets[0].terrain.octaves")).toBe(true);
  });

  test("rejects rail referencing unknown planet", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      rails: [{ ...DEV_MAP.rails[0]!, planetId: "planet-99" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "rails[0].planetId")).toBe(true);
  });

  test("rejects rail with fewer than 2 control points", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      rails: [{ ...DEV_MAP.rails[0]!, controlPoints: [DEV_MAP.rails[0]!.controlPoints[0]!] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "rails[0].controlPoints")).toBe(true);
  });

  test("rejects rail control point with non-unit normal", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      rails: [
        {
          ...DEV_MAP.rails[0]!,
          controlPoints: [
            { nx: 2.0, ny: 0.0, nz: 0.0, heightOffset: 5 },
            ...DEV_MAP.rails[0]!.controlPoints.slice(1),
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "rails[0].controlPoints[0]")).toBe(true);
  });

  test("accepts omitted terrain features", () => {
    const planet0 = DEV_MAP.planets[0]!;
    const { terrainFeatures: _terrainFeatures, ...planetWithoutFeatures } = planet0;
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [planetWithoutFeatures],
      blastPads: [],
    });

    expect(result.valid).toBe(true);
  });

  test("rejects non-array terrain features when present", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [{ ...DEV_MAP.planets[0]!, terrainFeatures: {} }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets[0].terrainFeatures")).toBe(true);
  });

  test("accepts slope terrain features", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [
        {
          ...DEV_MAP.planets[0]!,
          terrainFeatures: [
            {
              id: "slope-1",
              kind: "slope",
              enabled: true,
              width: 30,
              bank: 0,
              edgeFalloff: 10,
              smoothing: 0.9,
              transitionLength: 12,
              points: [
                { nx: 0, ny: 1, nz: 0, heightOffset: 8, width: 24, bank: 4 },
                {
                  nx: 0.6,
                  ny: 0.6,
                  nz: 0.529,
                  heightOffset: -10,
                  edgeFalloff: 14,
                  smoothing: 0.75,
                },
              ],
            },
          ],
        },
      ],
      blastPads: [],
    });

    expect(result.valid).toBe(true);
  });

  test("accepts jump terrain features", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [
        {
          ...DEV_MAP.planets[0]!,
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
              width: 24,
              length: 34,
              height: 10,
              edgeFalloff: 8,
              smoothing: 1,
            },
          ],
        },
      ],
      blastPads: [],
    });

    expect(result.valid).toBe(true);
  });

  test("rejects invalid slope terrain features", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      planets: [
        {
          ...DEV_MAP.planets[0]!,
          terrainFeatures: [
            {
              id: "bad-slope",
              kind: "slope",
              enabled: true,
              width: 0,
              bank: 0,
              edgeFalloff: 5,
              smoothing: 1,
              transitionLength: -1,
              points: [{ nx: 2, ny: 0, nz: 0, heightOffset: 0 }],
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "planets[0].terrainFeatures[0].width")).toBe(true);
    expect(
      result.errors.some((e) => e.field === "planets[0].terrainFeatures[0].transitionLength"),
    ).toBe(true);
    expect(result.errors.some((e) => e.field === "planets[0].terrainFeatures[0].points")).toBe(
      true,
    );
  });

  test("rejects team-zones spawn anchor referencing unknown planet", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      spawns: {
        ...DEV_MAP.spawns,
        teams: {
          kind: "team-zones",
          zoneRadius: 9,
          teamAnchors: [{ planetId: "planet-99", normal: { x: 1, y: 0, z: 0 } }],
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "spawns.teams.teamAnchors[0].planetId")).toBe(
      true,
    );
  });

  test("rejects cluster spawn anchor referencing unknown planet", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      spawns: {
        ...DEV_MAP.spawns,
        dev: {
          kind: "cluster",
          radius: 7,
          anchor: { planetId: "planet-99", normal: { x: 0, y: 1, z: 0 } },
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "spawns.dev.anchor.planetId")).toBe(true);
  });

  test("rejects blast pad referencing unknown target planet", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      blastPads: [
        {
          ...DEV_MAP.blastPads![0]!,
          targetPlanetId: "planet-99",
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "blastPads[0].targetPlanetId")).toBe(true);
  });

  test("rejects unknown spawn policy kind", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      spawns: { ffa: { kind: "unknown-mode" } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "spawns.ffa.kind")).toBe(true);
  });

  test("accumulates multiple errors", () => {
    const result = validateRuntimeMapData({
      version: 0,
      mapId: "",
      name: "",
      planets: [],
      terrain: {},
      rails: [],
      spawns: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

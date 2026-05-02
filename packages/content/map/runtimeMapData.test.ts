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

  test("rejects missing terrain field", () => {
    const { seed: _seed, ...terrainWithoutSeed } = DEV_MAP.terrain;
    const result = validateRuntimeMapData({ ...DEV_MAP, terrain: terrainWithoutSeed });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "terrain.seed")).toBe(true);
  });

  test("rejects non-integer octaves", () => {
    const result = validateRuntimeMapData({
      ...DEV_MAP,
      terrain: { ...DEV_MAP.terrain, octaves: 2.5 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "terrain.octaves")).toBe(true);
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

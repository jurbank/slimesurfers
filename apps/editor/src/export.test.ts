import { describe, expect, test } from "vite-plus/test";
import { validateRuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import { editorStateToRuntimeMap } from "./export.ts";
import {
  defaultEditorBlastPad,
  defaultEditorConfig,
  defaultEditorPlanet,
  type EditorBlastPad,
} from "./types.ts";
import type { RailState } from "./tools/rails/RailTypes.ts";

describe("editorStateToRuntimeMap rail export", () => {
  test("exports authored rails into runtime rail definitions", () => {
    const config = defaultEditorConfig();
    const rails: RailState[] = [
      {
        id: "editor-rail-1",
        planetId: "planet-0",
        name: "Test Rail",
        closed: false,
        width: 9.5,
        bank: 12,
        segmentsPerCurve: 16,
        points: [
          {
            id: "rail-point-1",
            normal: [1, 0, 0],
            position: [config.planets[0]!.radius + 6, 0, 0],
          },
          { id: "rail-point-2", normal: [0, 1, 0] },
        ],
      },
    ];

    const map = editorStateToRuntimeMap(
      config,
      rails,
      { planetId: "planet-0", normal: [0, 1, 0] },
      "Rail Test Map",
    );

    expect(map.rails).toHaveLength(1);
    expect(map.rails[0]).toEqual({
      id: 0,
      planetId: "planet-0",
      slimeCorridorRadius: 9.5,
      controlPoints: [
        { nx: 1, ny: 0, nz: 0, heightOffset: 6 },
        { nx: 0, ny: 1, nz: 0, heightOffset: 0 },
      ],
    });
    expect(validateRuntimeMapData(map).valid).toBe(true);
  });

  test("skips incomplete rails and rails attached to unknown planets", () => {
    const config = defaultEditorConfig();
    const rails: RailState[] = [
      {
        id: "one-point",
        planetId: "planet-0",
        name: "One Point",
        closed: false,
        width: 8,
        bank: 0,
        segmentsPerCurve: 12,
        points: [{ id: "point-1", normal: [1, 0, 0] }],
      },
      {
        id: "unknown-planet",
        planetId: "planet-99",
        name: "Unknown Planet",
        closed: false,
        width: 8,
        bank: 0,
        segmentsPerCurve: 12,
        points: [
          { id: "point-2", normal: [1, 0, 0] },
          { id: "point-3", normal: [0, 1, 0] },
        ],
      },
    ];

    const map = editorStateToRuntimeMap(
      config,
      rails,
      { planetId: "planet-0", normal: [0, 1, 0] },
      "Skipped Rails",
    );

    expect(map.rails).toEqual([]);
    expect("terrainFeatures" in map.planets[0]!).toBe(false);
    expect(validateRuntimeMapData(map).valid).toBe(true);
  });

  test("exports slope terrain features", () => {
    const config = defaultEditorConfig();
    config.planets[0]!.terrainFeatures = [
      {
        id: "slope-1",
        kind: "slope",
        name: "Main Slope",
        enabled: true,
        width: 32,
        bank: 6,
        edgeFalloff: 12,
        smoothing: 0.85,
        transitionLength: 18,
        points: [
          {
            id: "start",
            normal: [0, 1, 0],
            heightOffset: 6,
            width: 24,
            bank: 3,
            edgeFalloff: 8,
            smoothing: 0.7,
          },
          { id: "end", normal: [0.6, 0.6, 0.529], heightOffset: -12, width: 40, bank: 10 },
        ],
      },
      {
        id: "jump-1",
        kind: "jump",
        name: "Main Jump",
        enabled: true,
        normal: [0, 1, 0],
        tangent: [1, 0, 0],
        width: 24,
        length: 34,
        height: 10,
        edgeFalloff: 8,
        smoothing: 1,
      },
    ];

    const map = editorStateToRuntimeMap(
      config,
      [],
      { planetId: "planet-0", normal: [0, 1, 0] },
      "Slope Test Map",
    );

    expect(map.planets[0]!.terrainFeatures).toEqual([
      {
        id: "slope-1",
        kind: "slope",
        enabled: true,
        width: 32,
        bank: 6,
        edgeFalloff: 12,
        smoothing: 0.85,
        transitionLength: 18,
        points: [
          {
            nx: 0,
            ny: 1,
            nz: 0,
            heightOffset: 6,
            width: 24,
            bank: 3,
            edgeFalloff: 8,
            smoothing: 0.7,
          },
          {
            nx: 0.6,
            ny: 0.6,
            nz: 0.529,
            heightOffset: -12,
            width: 40,
            bank: 10,
            edgeFalloff: undefined,
            smoothing: undefined,
          },
        ],
      },
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
    ]);
    expect(validateRuntimeMapData(map).valid).toBe(true);
  });
});

describe("editorStateToRuntimeMap blast pad export", () => {
  test("exports authored blast pads with cameraProfile and drops pads with unknown source planet", () => {
    const config = defaultEditorConfig();
    config.planets = [
      defaultEditorPlanet("planet-0"),
      defaultEditorPlanet("planet-1", { x: 400, y: 0, z: 0 }),
    ];
    const validPad = defaultEditorBlastPad("pad-1", "planet-0");
    validPad.normal = [0, 1, 0];
    validPad.tangent = [1, 0, 0];
    validPad.radius = 6;
    validPad.launchSpeed = 95;
    validPad.upwardBias = 0.6;
    const unknownSource: EditorBlastPad = {
      ...defaultEditorBlastPad("pad-unknown", "planet-99"),
    };
    config.blastPads = [validPad, unknownSource];

    const map = editorStateToRuntimeMap(
      config,
      [],
      { planetId: "planet-0", normal: [0, 1, 0] },
      "Pad Test Map",
    );

    expect(map.blastPads).toEqual([
      {
        id: "pad-1",
        planetId: "planet-0",
        normal: { x: 0, y: 1, z: 0 },
        tangent: { x: 1, y: 0, z: 0 },
        radius: 6,
        launchSpeed: 95,
        upwardBias: 0.6,
        cameraProfile: "planetHop",
      },
    ]);
    expect(validateRuntimeMapData(map).valid).toBe(true);
  });

  test("omits blastPads field when no pads exist", () => {
    const config = defaultEditorConfig();
    const map = editorStateToRuntimeMap(
      config,
      [],
      { planetId: "planet-0", normal: [0, 1, 0] },
      "No Pads",
    );
    expect("blastPads" in map).toBe(false);
    expect(validateRuntimeMapData(map).valid).toBe(true);
  });
});

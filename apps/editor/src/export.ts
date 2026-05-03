import type { RuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import type { EditorConfig, PreviewSpawnState } from "./types.ts";
import type { TrackState } from "./tools/tracks/TrackTypes.ts";

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") || "map"
  );
}

export function editorStateToRuntimeMap(
  config: EditorConfig,
  tracks: TrackState[],
  previewSpawn: PreviewSpawnState,
  mapName: string,
): RuntimeMapData {
  const planetId = config.planets[0]?.id ?? "planet-0";
  const { radius: planetRadius } = config.planets[0] ?? { radius: 100 };
  const [sx, sy, sz] = previewSpawn.normal;

  const rails = tracks
    .filter((t) => t.points.length >= 2)
    .map((t, i) => ({
      id: i,
      planetId,
      paintCorridorRadius: t.width,
      controlPoints: t.points.map((pt) => ({
        nx: pt.normal[0],
        ny: pt.normal[1],
        nz: pt.normal[2],
        // If the point was moved with the gizmo it has an explicit 3D position;
        // otherwise it was placed directly on the surface (heightOffset ≈ 0).
        heightOffset:
          pt.position != null ? Math.max(0, dot(pt.position, pt.normal) - planetRadius) : 0,
      })),
    }));

  return {
    version: 1,
    mapId: slugify(mapName),
    name: mapName || "Untitled Map",
    planets: config.planets.map((p) => ({ id: p.id, center: p.center, radius: p.radius })),
    terrain: {
      seed: config.terrain.seed,
      baseAmplitude: config.terrain.baseAmplitude,
      frequency: config.terrain.frequency,
      octaves: config.terrain.octaves,
      lacunarity: config.terrain.lacunarity,
      persistence: config.terrain.persistence,
      heightSmoothingStrength: config.terrain.heightSmoothingStrength,
      heightSmoothingSampleAngle: config.terrain.heightSmoothingSampleAngle,
      waterLevel: config.terrain.waterLevel,
      snowLevel: config.terrain.snowLevel,
      sandBand: config.terrain.sandBand,
      rockLevel: config.terrain.rockLevel,
      icosahedronDetail: config.terrain.icosahedronDetail,
    },
    rails,
    spawns: {
      ffa: { kind: "ffa-spread" },
      teams: { kind: "ffa-spread" },
      dev: {
        kind: "cluster",
        radius: 7,
        anchor: { planetId, normal: { x: sx, y: sy, z: sz } },
      },
    },
  };
}

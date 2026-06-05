import type { RuntimeBlastPad, RuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import type { EditorBlastPad, EditorConfig, PreviewSpawnState } from "./types.ts";
import type { RailState } from "./tools/rails/RailTypes.ts";
import { editorTerrainFeaturesToRuntime } from "./terrainFeatures.ts";

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function toRuntimeBlastPad(pad: EditorBlastPad): RuntimeBlastPad {
  return {
    id: pad.id,
    planetId: pad.planetId,
    normal: { x: pad.normal[0], y: pad.normal[1], z: pad.normal[2] },
    tangent: { x: pad.tangent[0], y: pad.tangent[1], z: pad.tangent[2] },
    radius: pad.radius,
    launchSpeed: pad.launchSpeed,
    upwardBias: pad.upwardBias,
    cameraProfile: "planetHop",
  };
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
  rails: RailState[],
  previewSpawn: PreviewSpawnState,
  mapName: string,
): RuntimeMapData {
  const [sx, sy, sz] = previewSpawn.normal;
  const planetIds = new Set(config.planets.map((p) => p.id));
  const spawnPlanetId = planetIds.has(previewSpawn.planetId ?? "")
    ? previewSpawn.planetId!
    : (config.planets[0]?.id ?? "planet-0");

  const runtimeRails = rails
    .filter((rail) => rail.points.length >= 2 && planetIds.has(rail.planetId))
    .map((rail, i) => {
      const planetRadius = config.planets.find((p) => p.id === rail.planetId)?.radius ?? 100;
      return {
        id: i,
        planetId: rail.planetId,
        slimeCorridorRadius: rail.width,
        controlPoints: rail.points.map((pt) => ({
          nx: pt.normal[0],
          ny: pt.normal[1],
          nz: pt.normal[2],
          // If the point was moved with the gizmo it has an explicit 3D position;
          // otherwise it was placed directly on the surface (heightOffset ≈ 0).
          heightOffset:
            pt.position != null ? Math.max(0, dot(pt.position, pt.normal) - planetRadius) : 0,
        })),
      };
    });

  const runtimeBlastPads = (config.blastPads ?? [])
    .filter((pad) => planetIds.has(pad.planetId))
    .map(toRuntimeBlastPad);

  return {
    version: 1,
    mapId: slugify(mapName),
    name: mapName || "Untitled Map",
    planets: config.planets.map((p) => {
      const terrainFeatures = editorTerrainFeaturesToRuntime(p.terrainFeatures);
      return {
        id: p.id,
        center: p.center,
        radius: p.radius,
        terrain: p.terrain,
        colors: p.colors,
        atmosphere: p.atmosphere,
        lighting: p.lighting,
        props: p.props,
        hasWater: p.hasWater,
        ...(terrainFeatures.length > 0 ? { terrainFeatures } : {}),
      };
    }),
    cel: {
      bands: config.shaders.cel.bands,
      softness: config.shaders.cel.softness,
      hatchStrength: config.shaders.cel.hatchStrength,
      hatchScale: config.shaders.cel.hatchScale,
    },
    rails: runtimeRails,
    ...(runtimeBlastPads.length > 0 ? { blastPads: runtimeBlastPads } : {}),
    // The editor's "Preview Spawn" only drives the dev spawn policy — it's a
    // test seat for the author, not a production spawn anchor. Real ffa/teams
    // gameplay keeps the spread/zone policies, which will get their own editor
    // authoring (per-team anchors, FFA hot zones) when those are added.
    spawns: {
      ffa: { kind: "ffa-spread" },
      teams: { kind: "ffa-spread" },
      dev: {
        kind: "cluster",
        radius: 7,
        anchor: { planetId: spawnPlanetId, normal: { x: sx, y: sy, z: sz } },
      },
    },
  };
}

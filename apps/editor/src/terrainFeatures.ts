import type { RuntimeTerrainFeature } from "@splat/content/map/runtimeMapData.ts";
import type { EditorTerrainFeature } from "./types.ts";

export function editorTerrainFeaturesToRuntime(
  features: readonly EditorTerrainFeature[],
): RuntimeTerrainFeature[] {
  return features
    .filter(
      (feature) => feature.enabled && (feature.kind !== "slope" || feature.points.length >= 2),
    )
    .map((feature) => {
      if (feature.kind === "jump") {
        return {
          id: feature.id,
          kind: "jump",
          enabled: feature.enabled,
          nx: feature.normal[0],
          ny: feature.normal[1],
          nz: feature.normal[2],
          tx: feature.tangent[0],
          ty: feature.tangent[1],
          tz: feature.tangent[2],
          width: feature.width,
          length: feature.length,
          height: feature.height,
          edgeFalloff: feature.edgeFalloff,
          smoothing: feature.smoothing,
        };
      }
      return {
        id: feature.id,
        kind: "slope",
        enabled: feature.enabled,
        width: feature.width,
        bank: feature.bank,
        edgeFalloff: feature.edgeFalloff,
        smoothing: feature.smoothing,
        transitionLength: feature.transitionLength,
        points: feature.points.map((point) => ({
          nx: point.normal[0],
          ny: point.normal[1],
          nz: point.normal[2],
          heightOffset: point.heightOffset,
          width: point.width,
          bank: point.bank,
          edgeFalloff: point.edgeFalloff,
          smoothing: point.smoothing,
        })),
      };
    });
}

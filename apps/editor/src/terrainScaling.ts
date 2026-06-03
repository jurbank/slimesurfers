import type { EditorPlanet, EditorTerrainFeature } from "./types.ts";

/**
 * Scales a planet's terrain bands and feature heights to keep their proportions
 * sane after a radius change. Without this, shrinking a planet from radius 100
 * to 30 leaves 54-unit mountains that invert through the core; growing it to
 * 300 makes the same mountains look paper-thin.
 *
 * Bank angles, smoothing factors (0..1), and `seed`/`octaves`/`lacunarity` are
 * shape parameters that don't scale with size, so they're passed through.
 */
export function scalePlanetForRadius(
  planet: EditorPlanet,
  scale: number,
): EditorPlanet {
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return planet;
  return {
    ...planet,
    terrain: {
      ...planet.terrain,
      baseAmplitude: planet.terrain.baseAmplitude * scale,
      waterLevel: planet.terrain.waterLevel * scale,
      sandBand: planet.terrain.sandBand * scale,
      rockLevel: planet.terrain.rockLevel * scale,
      snowLevel: planet.terrain.snowLevel * scale,
    },
    terrainFeatures: planet.terrainFeatures.map((f) => scaleTerrainFeature(f, scale)),
  };
}

function scaleTerrainFeature(
  feature: EditorTerrainFeature,
  scale: number,
): EditorTerrainFeature {
  if (feature.kind === "jump") {
    return {
      ...feature,
      width: feature.width * scale,
      length: feature.length * scale,
      height: feature.height * scale,
      edgeFalloff: feature.edgeFalloff * scale,
    };
  }
  return {
    ...feature,
    width: feature.width * scale,
    edgeFalloff: feature.edgeFalloff * scale,
    transitionLength: feature.transitionLength * scale,
    points: feature.points.map((pt) => ({
      ...pt,
      heightOffset: pt.heightOffset * scale,
      width: pt.width != null ? pt.width * scale : undefined,
      edgeFalloff: pt.edgeFalloff != null ? pt.edgeFalloff * scale : undefined,
    })),
  };
}

import { getSlimeStampChordRadius } from "@splat/content/config/gameConfig.ts";
import type { SlimeStampMessage } from "@splat/protocol/network/serverMessages.ts";
import type { SimMatchState, SimSlimeStamp, SimPlanetSlimeState } from "../match/simState.ts";
import { appendSlimeStamp } from "./slimeDetection.ts";
import { applySlimeToTerritoryAtPoint } from "./territoryGrid.ts";
import { getTerrainHeight } from "../terrain/planetTerrain.ts";

function normalize(x: number, y: number, z: number): { nx: number; ny: number; nz: number } {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-8) return { nx: 0, ny: 1, nz: 0 };
  return { nx: x / len, ny: y / len, nz: z / len };
}

export function applySlimeImpact(
  simState: SimMatchState,
  planetState: SimPlanetSlimeState,
  impact: {
    planetId: string;
    pos: { x: number; y: number; z: number };
    slimeGroupId: number;
    slimeColor: number;
    patternId: number;
    radiusMultiplier: number;
  },
): SlimeStampMessage | null {
  const planetPos = simState.planetDefs.find((p) => p.id === impact.planetId);
  if (!planetPos) return null;

  const { nx, ny, nz } = normalize(
    impact.pos.x - planetPos.center.x,
    impact.pos.y - planetPos.center.y,
    impact.pos.z - planetPos.center.z,
  );
  const terrain = planetPos.terrain ?? simState.mapTerrain;
  const terrainCfg = { planet: { radius: planetPos.radius }, terrain };
  const waterDepth = terrain.waterLevel - getTerrainHeight(nx, ny, nz, terrainCfg);
  if (waterDepth > terrain.sandBand) {
    return null;
  }

  applySlimeToTerritoryAtPoint(impact, simState, planetState, impact.radiusMultiplier);

  // Sphere normal (direction from planet center to impact point).
  // Must be the sphere normal, NOT the terrain slope normal, because the
  // stamp shader positions stamps on the render target via chord distance
  // against sphere normals reconstructed from UVs.
  const stamp: SimSlimeStamp = {
    slimeGroupId: impact.slimeGroupId,
    color: impact.slimeColor,
    patternId: impact.patternId,
    nx,
    ny,
    nz,
    radius: getSlimeStampChordRadius(planetPos.radius) * impact.radiusMultiplier,
    seq: ++simState.slimeSeq,
  };

  appendSlimeStamp(planetState, stamp);

  return { planetId: impact.planetId, ...stamp };
}

import { GAME_CONFIG, getPaintStampChordRadius } from "@splat/content/config/gameConfig.ts";
import type { PaintStampMessage } from "@splat/protocol/network/serverMessages.ts";
import type { SimMatchState, SimPaintStamp, SimPlanetPaintState } from "../match/simState.ts";
import { appendPaintStamp } from "./paintDetection.ts";
import { applyPaintToTerritoryAtPoint } from "./territoryGrid.ts";
import { getTerrainHeight } from "../terrain/planetTerrain.ts";

function normalize(x: number, y: number, z: number): { nx: number; ny: number; nz: number } {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-8) return { nx: 0, ny: 1, nz: 0 };
  return { nx: x / len, ny: y / len, nz: z / len };
}

export function applyPaintImpact(
  simState: SimMatchState,
  planetState: SimPlanetPaintState,
  impact: {
    planetId: string;
    pos: { x: number; y: number; z: number };
    paintGroupId: number;
    slimeColor: number;
    patternId: number;
    radiusMultiplier: number;
  },
): PaintStampMessage | null {
  const planetPos = simState.planetDefs.find((p) => p.id === impact.planetId);
  if (!planetPos) return null;

  const { nx, ny, nz } = normalize(
    impact.pos.x - planetPos.center.x,
    impact.pos.y - planetPos.center.y,
    impact.pos.z - planetPos.center.z,
  );
  const waterDepth = GAME_CONFIG.terrain.waterLevel - getTerrainHeight(nx, ny, nz, GAME_CONFIG);
  if (waterDepth > GAME_CONFIG.terrain.sandBand) {
    return null;
  }

  applyPaintToTerritoryAtPoint(impact, simState, planetState, impact.radiusMultiplier);

  // Sphere normal (direction from planet center to impact point).
  // Must be the sphere normal, NOT the terrain slope normal, because the
  // stamp shader positions stamps on the render target via chord distance
  // against sphere normals reconstructed from UVs.
  const stamp: SimPaintStamp = {
    paintGroupId: impact.paintGroupId,
    color: impact.slimeColor,
    patternId: impact.patternId,
    nx,
    ny,
    nz,
    radius: getPaintStampChordRadius() * impact.radiusMultiplier,
    seq: ++simState.paintSeq,
  };

  appendPaintStamp(planetState, stamp);

  return { planetId: impact.planetId, ...stamp };
}

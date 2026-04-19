import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import type { PaintStampMessage } from "@splat/protocol/network/serverMessages.ts";
import type { SimMatchState, SimPaintStamp, SimPlanetPaintState } from "../match/simState.ts";
import { appendPaintStamp } from "./paintDetection.ts";
import { applyPaintToTerritoryAtPoint } from "./territoryGrid.ts";

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
    radiusMultiplier: number;
  },
): PaintStampMessage | null {
  const planetPos = PLANET_POSITIONS.find((p) => p.id === impact.planetId);
  if (!planetPos) return null;

  applyPaintToTerritoryAtPoint(impact, simState, planetState, impact.radiusMultiplier);

  // Sphere normal (direction from planet center to impact point).
  // Must be the sphere normal, NOT the terrain slope normal, because the
  // stamp shader positions stamps on the render target via chord distance
  // against sphere normals reconstructed from UVs.
  const { nx, ny, nz } = normalize(
    impact.pos.x - planetPos.x,
    impact.pos.y - planetPos.y,
    impact.pos.z - planetPos.z,
  );
  const stamp: SimPaintStamp = {
    paintGroupId: impact.paintGroupId,
    color: impact.slimeColor,
    nx,
    ny,
    nz,
    radius: GAME_CONFIG.paint.impactStampRadius * impact.radiusMultiplier,
    seq: ++simState.paintSeq,
  };

  appendPaintStamp(planetState, stamp);

  return { planetId: impact.planetId, ...stamp };
}

import { getPaintStampAngularRadius, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { NO_PAINT_GROUP_ID } from "@splat/protocol/schemas/paintedState.ts";
import type { SimMatchState, SimPlanetPaintState, SimTerritoryCell } from "../match/simState.ts";
import { getTerrainHeight } from "../terrain/planetTerrain.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPlanetPosition(planetId: string): { x: number; y: number; z: number } | null {
  return PLANET_POSITIONS.find((planet) => planet.id === planetId) ?? null;
}

function getCellNormal(row: number, col: number, rows: number, cols: number) {
  const v = (row + 0.5) / rows;
  const u = (col + 0.5) / cols;
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const sinTheta = Math.sin(theta);
  return {
    x: sinTheta * Math.cos(phi),
    y: Math.cos(theta),
    z: sinTheta * Math.sin(phi),
  };
}

function getWaterDepthAtCell(row: number, col: number, rows: number, cols: number): number {
  const normal = getCellNormal(row, col, rows, cols);
  return (
    GAME_CONFIG.terrain.waterLevel - getTerrainHeight(normal.x, normal.y, normal.z, GAME_CONFIG)
  );
}

function dot(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(x: number, y: number, z: number) {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

function adjustPaintGroupScore(simState: SimMatchState, paintGroupId: number, delta: number): void {
  if (paintGroupId === NO_PAINT_GROUP_ID || delta === 0) return;

  const key = paintGroupId.toString();
  const nextScore = Math.max(0, (simState.scores.get(key) ?? 0) + delta);
  simState.scores.set(key, nextScore);

  simState.players.forEach((player) => {
    if (player.paintGroupId === paintGroupId) {
      player.paintScore = Math.max(0, player.paintScore + delta);
    }
  });
}

export function createTerritoryCells(rows: number, cols: number): SimTerritoryCell[] {
  const cells: SimTerritoryCell[] = [];
  for (let index = 0; index < rows * cols; index++) {
    cells.push({
      ownerPaintGroupId: NO_PAINT_GROUP_ID,
      color: 0,
    });
  }
  return cells;
}

export function isTerritoryCellPaintable(
  row: number,
  col: number,
  rows: number,
  cols: number,
): boolean {
  return getWaterDepthAtCell(row, col, rows, cols) <= GAME_CONFIG.terrain.sandBand;
}

export function countPaintableTerritoryCells(rows: number, cols: number): number {
  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (isTerritoryCellPaintable(row, col, rows, cols)) {
        count++;
      }
    }
  }
  return count;
}

export interface PaintPlayerInput {
  planetId: string;
  pos: { x: number; y: number; z: number };
  paintGroupId: number;
  slimeColor: number;
}

export function applyPaintToTerritoryAtPoint(
  paint: PaintPlayerInput,
  simState: SimMatchState,
  planetState: SimPlanetPaintState,
  radiusMultiplier = 1,
): number {
  const planetPos = getPlanetPosition(paint.planetId);
  if (!planetPos) return 0;

  const normal = normalize(
    paint.pos.x - planetPos.x,
    paint.pos.y - planetPos.y,
    paint.pos.z - planetPos.z,
  );
  const angularRadius = clamp(getPaintStampAngularRadius() * radiusMultiplier, 0, Math.PI);
  const cosThreshold = Math.cos(angularRadius);

  let changedCells = 0;
  for (let row = 0; row < planetState.territoryRows; row++) {
    for (let col = 0; col < planetState.territoryCols; col++) {
      const cellNormal = getCellNormal(
        row,
        col,
        planetState.territoryRows,
        planetState.territoryCols,
      );
      if (dot(normal, cellNormal) < cosThreshold) continue;

      const index = row * planetState.territoryCols + col;
      const cell = planetState.cells[index];
      if (!cell || cell.ownerPaintGroupId === paint.paintGroupId) continue;

      adjustPaintGroupScore(simState, cell.ownerPaintGroupId, -1);
      cell.ownerPaintGroupId = paint.paintGroupId;
      cell.color = paint.slimeColor;
      adjustPaintGroupScore(simState, paint.paintGroupId, 1);
      changedCells++;
    }
  }

  return changedCells;
}

import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";

export const NO_PAINT_GROUP_ID = 65535;

export class TerritoryCell extends Schema {
  /** Paint/scoring ownership group for this cell. NO_PAINT_GROUP_ID means neutral. */
  declare ownerPaintGroupId: number;
  /** 0xRRGGBB packed integer used for client rendering. */
  declare color: number;
}
defineTypes(TerritoryCell, {
  ownerPaintGroupId: "uint16",
  color: "uint32",
});

// -- PlanetPaintState --------------------------------------------------------
// Authoritative territory ownership on one planet. Keyed in GameState by planetId.

export class PlanetPaintState extends Schema {
  declare planetId: string;
  declare territoryRows: number;
  declare territoryCols: number;
  /** Fixed-size authoritative territory grid used for scoring. */
  declare cells: ArraySchema<TerritoryCell>;
}
defineTypes(PlanetPaintState, {
  planetId: "string",
  territoryRows: "uint16",
  territoryCols: "uint16",
  cells: [TerritoryCell],
});

// -- RailPaintState ----------------------------------------------------------
// Authoritative paint nodes for a rail. Keyed in GameState by railId string.

export const RAIL_PAINT_NODES = 64;

export class RailPaintState extends Schema {
  declare railId: number;
  /** Fixed-size array of 0xRRGGBB colors for nodes along the rail. */
  declare nodes: ArraySchema<number>;
}
defineTypes(RailPaintState, {
  railId: "uint32",
  nodes: ["uint32"],
});

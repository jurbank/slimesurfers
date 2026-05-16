import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";

export const NO_SLIME_GROUP_ID = 65535;

export class TerritoryCell extends Schema {
  /** Slime/scoring ownership group for this cell. NO_SLIME_GROUP_ID means neutral. */
  declare ownerSlimeGroupId: number;
  /** 0xRRGGBB packed integer used for client rendering. */
  declare color: number;
}
defineTypes(TerritoryCell, {
  ownerSlimeGroupId: "uint16",
  color: "uint32",
});

// -- PlanetSlimeState --------------------------------------------------------
// Authoritative territory ownership on one planet. Keyed in GameState by planetId.

export class PlanetSlimeState extends Schema {
  declare planetId: string;
  declare territoryRows: number;
  declare territoryCols: number;
  /** Fixed-size authoritative territory grid used for scoring. */
  declare cells: ArraySchema<TerritoryCell>;
}
defineTypes(PlanetSlimeState, {
  planetId: "string",
  territoryRows: "uint16",
  territoryCols: "uint16",
  cells: [TerritoryCell],
});

// -- RailSlimeState ----------------------------------------------------------
// Authoritative slime nodes for a rail. Keyed in GameState by railId string.

export const RAIL_SLIME_NODES = 64;

export class RailSlimeState extends Schema {
  declare railId: number;
  /** Fixed-size array of 0xRRGGBB colors for nodes along the rail. */
  declare nodes: ArraySchema<number>;
}
defineTypes(RailSlimeState, {
  railId: "uint32",
  nodes: ["uint32"],
});

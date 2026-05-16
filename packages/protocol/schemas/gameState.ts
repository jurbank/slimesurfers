import { ArraySchema, Encoder, Schema, MapSchema, defineTypes } from "@colyseus/schema";

Encoder.BUFFER_SIZE = 64 * 1024;
import { PlayerState } from "./playerState.ts";
import { PlanetSlimeState, RailSlimeState } from "./slimedState.ts";

import { MatchPhase } from "../network/matchPhase.ts";
export { MatchPhase };

export const NO_WINNING_TEAM_ID = 255;

// -- GameState (root Colyseus room state) ------------------------------------

export class GameState extends Schema {
  /** All connected players keyed by sessionId. Physics stays in snapshot messages. */
  declare players: MapSchema<PlayerState>;
  /** Per-planet authoritative territory ownership keyed by planetId. */
  declare planets: MapSchema<PlanetSlimeState>;
  /** Per-rail authoritative slime status keyed by railId. */
  declare railStates: MapSchema<RailSlimeState>;

  declare matchPhase: MatchPhase;
  /** Seconds remaining in the current phase (countdown or match timer) */
  declare matchTimer: number;
  /** Aggregate territory scores keyed by slimeGroupId.toString(); leaderboard ordering stays message-driven. */
  declare scores: MapSchema<number>;
  /** True when this room runs a team-based mode. */
  declare isTeamBased: boolean;
  /** Team colors in team-index order (0xRRGGBB). Empty for FFA. */
  declare teamColors: ArraySchema<number>;
  /** Winning team index when the match has ended. NO_WINNING_TEAM_ID means unset/FFA. */
  declare winningTeamId: number;
}
defineTypes(GameState, {
  players: { map: PlayerState },
  planets: { map: PlanetSlimeState },
  railStates: { map: RailSlimeState },
  matchPhase: "uint8",
  matchTimer: "float32",
  scores: { map: "uint32" },
  isTeamBased: "boolean",
  teamColors: ["uint32"],
  winningTeamId: "uint8",
});

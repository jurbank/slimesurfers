import { Encoder, Schema, MapSchema, defineTypes } from "@colyseus/schema";

Encoder.BUFFER_SIZE = 64 * 1024;
import { PlayerState } from "./playerState.ts";
import { PlanetPaintState } from "./paintedState.ts";

import { MatchPhase } from "../network/matchPhase.ts";
export { MatchPhase };

// -- GameState (root Colyseus room state) ------------------------------------

export class GameState extends Schema {
  /** All connected players keyed by sessionId. Physics stays in snapshot messages. */
  declare players: MapSchema<PlayerState>;
  /** Per-planet authoritative territory ownership keyed by planetId. */
  declare planets: MapSchema<PlanetPaintState>;

  declare matchPhase: MatchPhase;
  /** Seconds remaining in the current phase (countdown or match timer) */
  declare matchTimer: number;
  /** Aggregate territory scores keyed by paintGroupId.toString(); leaderboard ordering stays message-driven. */
  declare scores: MapSchema<number>;
}
defineTypes(GameState, {
  players: { map: PlayerState },
  planets: { map: PlanetPaintState },
  matchPhase: "uint8",
  matchTimer: "float32",
  scores: { map: "uint32" },
});

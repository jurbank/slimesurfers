// Extracted from packages/protocol/schemas/gameState.ts so that
// packages/simulation can import this enum without pulling in @colyseus/schema.

export const MatchPhase = {
  Lobby: 0,
  Countdown: 1,
  Active: 2,
  Ended: 3,
} as const;
export type MatchPhase = (typeof MatchPhase)[keyof typeof MatchPhase];

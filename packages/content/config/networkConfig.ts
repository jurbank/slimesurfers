export const NETWORK_CONFIG = {
  rooms: {
    // Target room size for the intended large-action arena. This is the design target,
    // not a claim that the current implementation is production-ready at this population yet.
    maxPlayers: 40,
    targetPlayersBeforeNewRoom: 36,
    maxRoomsPerProcess: 8,
  },
  simulation: {
    tickRateHz: 20,
    snapshotRateHz: 10,
    leaderboardRateHz: 2,
  },
  input: {
    sendRateHz: 20,
    maxBufferedInputs: 3,
    maxInputSilenceMs: 1000,
  },
  limits: {
    maxProjectilesPerRoom: 200,
    maxEventsInFeed: 50,
    maxPaintUpdatesPerTick: 128,
  },
  rateLimits: {
    renameCooldownMs: 10000,
    maxRenameAttemptsPerMinute: 6,
    maxMessagesPerSecond: 30,
  },
  reconciliation: {
    positionSnapDistance: 3.5,
    positionLerpRate: 12,
    remoteInterpolationBackTimeMs: 100,
  },
  debug: {
    disablePlanetGravity: false,
    disableSurfaceSnap: false,
    disableArenaReturn: false,
  },
} as const;

import { ArraySchema, MapSchema } from "@colyseus/schema";
import type { GameModeDefinition } from "@splat/content/modes/gameModes.ts";
import type {
  KillEventMessage,
  LeaderboardMessage,
  MatchPhaseMessage,
  PaintStampMessage,
  SnapshotMessage,
  TrickEventMessage,
} from "@splat/protocol/network/serverMessages.ts";
import { MatchPhase } from "@splat/protocol/network/matchPhase.ts";
import { GameState, NO_WINNING_TEAM_ID } from "@splat/protocol/schemas/gameState.ts";
import {
  PlanetPaintState,
  TerritoryCell,
  RailPaintState,
} from "@splat/protocol/schemas/paintedState.ts";
import { PlayerState } from "@splat/protocol/schemas/playerState.ts";
import { MatchSimulation, type TickResult } from "@splat/simulation/match/matchSimulation.ts";
import type {
  SimMatchState,
  SimPlanetPaintState,
  SimPlayerState,
  SimTerritoryCell,
  SimRailPaintState,
} from "@splat/simulation/match/simState.ts";

export interface MatchRoomTickBroadcasts {
  killEvents: KillEventMessage[];
  leaderboard?: LeaderboardMessage;
  matchPhase?: MatchPhaseMessage;
  paintStamps: PaintStampMessage[];
  snapshot?: SnapshotMessage;
  trickEvents: TrickEventMessage[];
}

export interface MatchRoomJoinBootstrap {
  paintStamps: readonly PaintStampMessage[];
  snapshot: SnapshotMessage;
}

function syncCell(schema: TerritoryCell, sim: SimTerritoryCell): void {
  schema.ownerPaintGroupId = sim.ownerPaintGroupId;
  schema.color = sim.color;
}

function schemaPlanetFromSim(simPlanet: SimPlanetPaintState): PlanetPaintState {
  const schemaPlanet = new PlanetPaintState();
  schemaPlanet.planetId = simPlanet.planetId;
  schemaPlanet.territoryRows = simPlanet.territoryRows;
  schemaPlanet.territoryCols = simPlanet.territoryCols;
  schemaPlanet.cells = new ArraySchema<TerritoryCell>();
  for (const simCell of simPlanet.cells) {
    const cell = new TerritoryCell();
    syncCell(cell, simCell);
    schemaPlanet.cells.push(cell);
  }
  return schemaPlanet;
}

function schemaRailFromSim(simRail: SimRailPaintState): RailPaintState {
  const schemaRail = new RailPaintState();
  schemaRail.railId = simRail.railId;
  schemaRail.nodes = new ArraySchema<number>(...simRail.nodes);
  return schemaRail;
}

function schemaFromSimPlayer(sim: SimPlayerState): PlayerState {
  const schema = new PlayerState();
  schema.sessionId = sim.sessionId;
  schema.isBot = sim.isBot;
  schema.name = sim.name;
  schema.teamId = sim.teamId;
  schema.paintGroupId = sim.paintGroupId;
  schema.paletteIndex = sim.paletteIndex;
  schema.patternId = sim.patternId;
  schema.slimeColor = sim.slimeColor;
  schema.health = sim.health;
  schema.slimeLevel = sim.slimeLevel;
  schema.paintScore = sim.paintScore;
  schema.killCount = sim.killCount;
  schema.deathCount = sim.deathCount;
  schema.respawnTimer = sim.respawnTimer;
  return schema;
}

export function createRoomState(simState: SimMatchState, mode: GameModeDefinition): GameState {
  const state = new GameState();
  state.players = new MapSchema<PlayerState>();
  state.planets = new MapSchema<PlanetPaintState>();
  state.railStates = new MapSchema<RailPaintState>();
  state.scores = new MapSchema<number>();
  state.matchPhase = simState.matchPhase;
  state.matchTimer = simState.matchTimer;
  state.isTeamBased = mode.isTeamBased;
  state.teamColors = new ArraySchema<number>(...mode.teamColors);
  state.winningTeamId = NO_WINNING_TEAM_ID;

  simState.planets.forEach((planet, planetId) => {
    state.planets.set(planetId, schemaPlanetFromSim(planet));
  });

  simState.railStates.forEach((rail, railId) => {
    state.railStates.set(railId.toString(), schemaRailFromSim(rail));
  });

  return state;
}

export function addSimPlayerToRoomState(state: GameState, simPlayer: SimPlayerState): void {
  state.players.set(simPlayer.sessionId, schemaFromSimPlayer(simPlayer));
}

export function syncRoomStateFromSimulation(state: GameState, simState: SimMatchState): void {
  simState.players.forEach((sim, sessionId) => {
    const schema = state.players.get(sessionId);
    if (!schema) return;
    schema.health = sim.health;
    schema.slimeLevel = sim.slimeLevel;
    schema.paintScore = sim.paintScore;
    schema.killCount = sim.killCount;
    schema.deathCount = sim.deathCount;
    schema.respawnTimer = sim.respawnTimer;
  });

  simState.planets.forEach((simPlanet, planetId) => {
    let schemaPlanet = state.planets.get(planetId);
    if (!schemaPlanet) {
      schemaPlanet = schemaPlanetFromSim(simPlanet);
      state.planets.set(planetId, schemaPlanet);
      return;
    }

    schemaPlanet.planetId = simPlanet.planetId;
    schemaPlanet.territoryRows = simPlanet.territoryRows;
    schemaPlanet.territoryCols = simPlanet.territoryCols;

    while (schemaPlanet.cells.length < simPlanet.cells.length) {
      schemaPlanet.cells.push(new TerritoryCell());
    }
    while (schemaPlanet.cells.length > simPlanet.cells.length) {
      schemaPlanet.cells.pop();
    }
    for (let index = 0; index < simPlanet.cells.length; index++) {
      const schemaCell = schemaPlanet.cells[index];
      const simCell = simPlanet.cells[index];
      if (!schemaCell || !simCell) continue;
      syncCell(schemaCell, simCell);
    }
  });

  simState.railStates.forEach((simRail, railId) => {
    const key = railId.toString();
    let schemaRail = state.railStates.get(key);
    if (!schemaRail) {
      schemaRail = schemaRailFromSim(simRail);
      state.railStates.set(key, schemaRail);
      return;
    }

    // Direct node sync
    for (let i = 0; i < simRail.nodes.length; i++) {
      if (schemaRail.nodes[i] !== simRail.nodes[i]) {
        schemaRail.nodes[i] = simRail.nodes[i];
      }
    }
  });

  state.matchPhase = simState.matchPhase;
  state.matchTimer = simState.matchTimer;
  simState.scores.forEach((score, key) => {
    state.scores.set(key, score);
  });
}

export function syncRoomWinnerFromSimulation(state: GameState, simulation: MatchSimulation): void {
  state.winningTeamId =
    simulation.matchState.matchPhase === MatchPhase.Ended
      ? (simulation.computeWinningTeamId() ?? NO_WINNING_TEAM_ID)
      : NO_WINNING_TEAM_ID;
}

export function buildJoinBootstrap(simulation: MatchSimulation): MatchRoomJoinBootstrap {
  return {
    paintStamps: simulation.getRecentPaintStamps(),
    snapshot: simulation.buildSnapshotMessage(),
  };
}

export function buildTickBroadcasts(
  result: TickResult,
  simulation: MatchSimulation,
): MatchRoomTickBroadcasts {
  const simState = simulation.matchState;

  return {
    killEvents: simulation.drainKillEventMessages(),
    matchPhase: result.shouldBroadcastMatchPhase
      ? {
          phase: simState.matchPhase,
          timer: simState.matchTimer,
          winningTeamId:
            simState.matchPhase === MatchPhase.Ended
              ? simulation.computeWinningTeamId()
              : undefined,
        }
      : undefined,
    snapshot: result.shouldBroadcastSnapshot ? simulation.buildSnapshotMessage() : undefined,
    leaderboard: result.shouldBroadcastLeaderboard
      ? simulation.buildLeaderboardMessage()
      : undefined,
    paintStamps: simulation.drainPaintStampMessages(),
    trickEvents: simulation.drainTrickEventMessages(),
  };
}

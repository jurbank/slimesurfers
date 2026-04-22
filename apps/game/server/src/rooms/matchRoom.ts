import { Room, type Client } from "@colyseus/core";
import type { InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { MessageType } from "@splat/protocol/network/messageTypes.ts";
import { GameState } from "@splat/protocol/schemas/gameState.ts";
import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { MatchSimulation } from "@splat/simulation/match/matchSimulation.ts";
import {
  addSimPlayerToRoomState,
  buildJoinBootstrap,
  buildTickBroadcasts,
  createRoomState,
  syncRoomStateFromSimulation,
} from "./matchRoomReplication.ts";

export class MatchRoom extends Room<{ state: GameState }> {
  private simulation = new MatchSimulation();

  onCreate() {
    this.setState(createRoomState(this.simulation.matchState));
    this.maxClients = NETWORK_CONFIG.rooms.maxPlayers;

    this.onMessage(MessageType.Input, (client: Client, msg: InputMessage) => {
      this.simulation.recordInput(client.sessionId, msg);
    });

    this.setSimulationInterval((dt) => this.tick(dt), this.simulation.tickIntervalMs);
  }

  onJoin(client: Client, options: { name?: string; colorIndex?: number } = {}) {
    const simPlayer = this.simulation.addPlayer(client.sessionId, options.name, options.colorIndex);
    addSimPlayerToRoomState(this.state, simPlayer);
    void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });

    const bootstrap = buildJoinBootstrap(this.simulation);
    if (bootstrap.paintStamps.length > 0) {
      client.send(MessageType.PaintStamps, { stamps: [...bootstrap.paintStamps] });
    }
    client.send(MessageType.Snapshot, bootstrap.snapshot);
    this.broadcast(MessageType.Snapshot, bootstrap.snapshot, { except: client });
  }

  onLeave(client: Client) {
    this.simulation.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    void this.setMetadata({ takenColorIndices: this.simulation.takenColorIndices() });
  }

  private tick(dt: number): void {
    const result = this.simulation.tick(dt);
    syncRoomStateFromSimulation(this.state, this.simulation.matchState);

    const broadcasts = buildTickBroadcasts(result, this.simulation);
    if (broadcasts.matchPhase) {
      this.broadcast(MessageType.MatchPhase, broadcasts.matchPhase);
    }
    if (broadcasts.snapshot) {
      this.broadcast(MessageType.Snapshot, broadcasts.snapshot);
    }
    if (broadcasts.leaderboard) {
      this.broadcast(MessageType.Leaderboard, broadcasts.leaderboard);
    }
    if (broadcasts.paintStamps.length > 0) {
      this.broadcast(MessageType.PaintStamps, { stamps: broadcasts.paintStamps });
    }
    if (broadcasts.trickEvents.length > 0) {
      this.broadcast(MessageType.TrickEvents, { events: broadcasts.trickEvents });
    }
  }
}

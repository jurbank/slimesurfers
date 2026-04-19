import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MatchRoom } from "./rooms/matchRoom.ts";

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server({ transport: new WebSocketTransport() });

gameServer.define("match", MatchRoom);

void gameServer.listen(port).then(() => {
  console.log(`ws://localhost:${port}`);
});

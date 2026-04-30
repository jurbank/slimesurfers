try {
  process.loadEnvFile(".env");
} catch {
  // no .env in production — env vars set in environment
}

import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Request, Response } from "express";
import { resolveGameMode } from "@splat/content/modes/gameModes.ts";
import { MatchRoom } from "./rooms/matchRoom.ts";

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.get("/colors", (_req: Request, res: Response) => {
      void matchMaker.query({ name: "match" }).then((rooms) => {
        const taken = rooms.flatMap(
          (r) => (r.metadata as { takenColorIndices?: number[] })?.takenColorIndices ?? [],
        );
        const roomIsTeamBased = rooms.some(
          (r) => (r.metadata as { isTeamBased?: boolean })?.isTeamBased === true,
        );
        res.json({
          takenColorIndices: [...new Set(taken)],
          isTeamBased: roomIsTeamBased || resolveGameMode(process.env.MATCH_MODE).isTeamBased,
        });
      });
    });
  },
});

gameServer.define("match", MatchRoom).filterBy(["devClusterSpawns"]);
gameServer.define("match_teams", MatchRoom, { matchMode: "teams" }).filterBy(["devClusterSpawns"]);

void gameServer.listen(port).then(() => {
  console.log(`ws://localhost:${port}`);
});

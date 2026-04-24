try {
  process.loadEnvFile(".env");
} catch {
  // no .env in production — env vars set in environment
}

import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Request, Response } from "express";
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
        res.json({ takenColorIndices: [...new Set(taken)] });
      });
    });
  },
});

gameServer.define("match", MatchRoom);

void gameServer.listen(port).then(() => {
  console.log(`ws://localhost:${port}`);
});

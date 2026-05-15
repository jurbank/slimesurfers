try {
  process.loadEnvFile(".env");
} catch {
  // no .env in production — env vars set in environment
}

import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Request, Response } from "express";
import { GAME_CONFIG, resolveConfiguredBotCount } from "@splat/content/config/gameConfig.ts";
import { FFA_MODE, TEAMS_MODE } from "@splat/content/modes/gameModes.ts";
import { MatchRoom, type MatchRoomMetadata } from "./rooms/matchRoom.ts";

const port = Number(process.env.PORT) || 2567;
const PUBLIC_MATCH_MODES = [FFA_MODE, TEAMS_MODE] as const;

interface LobbyPlayerSummary {
  name: string;
  isBot: boolean;
  teamId: number;
  colorIndex: number;
  slimeColor: number;
  patternId: number;
}

interface PublicModeLobbySummary {
  matchMode: "ffa" | "teams";
  displayName: string;
  isTeamBased: boolean;
  teamColors: number[];
  takenColorIndices: number[];
  players: LobbyPlayerSummary[];
  teamCounts: number[];
  suggestedTeamId?: number;
}

function resolvePreviewPopulation(mode: (typeof PUBLIC_MATCH_MODES)[number]): number {
  const configured = resolveConfiguredBotCount();
  if (!mode.isTeamBased || mode.teamCount <= 1) return configured;
  return Math.ceil(configured / mode.teamCount) * mode.teamCount;
}

function emptyModeSummary(mode: (typeof PUBLIC_MATCH_MODES)[number]): PublicModeLobbySummary {
  const previewCount = resolvePreviewPopulation(mode);
  const previewPlayers = Array.from({ length: previewCount }, (_, index) => {
    const bot = GAME_CONFIG.bot.namedBots[index];
    const slot = mode.slots[index % mode.slots.length] ?? mode.slots[0]!;
    const teamId = mode.isTeamBased ? index % Math.max(1, mode.teamCount) : 255;
    return {
      name: bot?.name ? `${bot.name} Bot` : `Bot ${index + 1}`,
      isBot: true,
      teamId,
      colorIndex: index % mode.slots.length,
      slimeColor: slot.color,
      patternId: slot.patternId,
    };
  });
  const teamCounts = Array.from({ length: mode.teamCount }, () => 0);
  for (const player of previewPlayers) {
    if (mode.isTeamBased && player.teamId >= 0 && player.teamId < teamCounts.length) {
      teamCounts[player.teamId] = (teamCounts[player.teamId] ?? 0) + 1;
    }
  }

  return {
    matchMode: mode.id as "ffa" | "teams",
    displayName: mode.displayName,
    isTeamBased: mode.isTeamBased,
    teamColors: [...mode.teamColors],
    takenColorIndices: mode.isTeamBased ? [] : previewPlayers.map((player) => player.colorIndex),
    players: previewPlayers,
    teamCounts,
    suggestedTeamId: mode.isTeamBased ? 0 : undefined,
  };
}

function buildLobbySummaries(roomMetadatas: MatchRoomMetadata[]): {
  modes: Record<"ffa" | "teams", PublicModeLobbySummary>;
} {
  const modes = {
    ffa: emptyModeSummary(FFA_MODE),
    teams: emptyModeSummary(TEAMS_MODE),
  };

  for (const metadata of roomMetadatas) {
    const summary = modes[metadata.matchMode];
    if (!summary) continue;
    if (summary.players.every((player) => player.isBot)) {
      summary.players = [];
      summary.takenColorIndices = [];
      summary.teamCounts = Array.from({ length: summary.teamCounts.length }, () => 0);
    }
    summary.takenColorIndices = [
      ...new Set([...summary.takenColorIndices, ...(metadata.takenColorIndices ?? [])]),
    ];
    summary.players.push(...metadata.players);
    metadata.teamCounts.forEach((count, teamId) => {
      summary.teamCounts[teamId] = (summary.teamCounts[teamId] ?? 0) + count;
    });
  }

  const teamCounts = modes.teams.teamCounts;
  if (teamCounts.length > 0) {
    let suggested = 0;
    for (let teamId = 1; teamId < teamCounts.length; teamId++) {
      if ((teamCounts[teamId] ?? 0) < (teamCounts[suggested] ?? 0)) suggested = teamId;
    }
    modes.teams.suggestedTeamId = suggested;
  }

  return { modes };
}

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.get("/lobbies", (_req: Request, res: Response) => {
      void matchMaker.query({ name: "match" }).then((rooms) => {
        res.json(
          buildLobbySummaries(
            rooms.map((room) => room.metadata as MatchRoomMetadata).filter(Boolean),
          ),
        );
      });
    });

    app.get("/colors", (_req: Request, res: Response) => {
      void matchMaker.query({ name: "match" }).then((rooms) => {
        const summaries = buildLobbySummaries(
          rooms.map((room) => room.metadata as MatchRoomMetadata).filter(Boolean),
        );
        res.json({
          takenColorIndices: summaries.modes.ffa.takenColorIndices,
          isTeamBased: false,
        });
      });
    });
  },
});

gameServer.define("match", MatchRoom).filterBy(["devClusterSpawns", "matchMode"]);

void gameServer.listen(port).then(() => {
  console.log(`ws://localhost:${port}`);
  for (const mode of PUBLIC_MATCH_MODES) {
    void matchMaker
      .createRoom("match", { matchMode: mode.id, devClusterSpawns: false })
      .catch((err) => {
        console.warn(`Failed to create ${mode.id} lobby room`, err);
      });
  }
});

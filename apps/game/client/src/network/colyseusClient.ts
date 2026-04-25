import { Client } from "@colyseus/sdk";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

export const colyseusClient = new Client(serverUrl);

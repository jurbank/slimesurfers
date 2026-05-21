import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeMapData } from "@splat/content/map/runtimeMapData.ts";
import { defineConfig } from "vite-plus";

const editorDir = dirname(fileURLToPath(import.meta.url));
const runtimeMapPath = resolve(editorDir, "../game/server/my-map.json");

interface DevServer {
  middlewares: {
    use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
  };
}

function runtimeMapPublisher() {
  return {
    name: "slime-surfers-runtime-map-publisher",
    apply: "serve" as const,
    configureServer(server: DevServer) {
      server.middlewares.use("/__editor/publish-runtime-map", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("error", () => {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Could not read request body" }));
        });
        req.on("end", () => {
          void (async () => {
            try {
              const map = JSON.parse(body) as unknown;
              const result = validateRuntimeMapData(map);
              if (!result.valid) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Invalid runtime map", errors: result.errors }));
                return;
              }

              await mkdir(dirname(runtimeMapPath), { recursive: true });
              await writeFile(runtimeMapPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, path: runtimeMapPath }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : "Publish failed",
                }),
              );
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), runtimeMapPublisher()],
});

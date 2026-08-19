import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { createApi } from "./api.ts";
import { HUGO_PORT, loadConfig, PORT } from "./config.ts";
import { ContentIndex } from "./content/index.ts";
import { Hugo, PREVIEW_PATH } from "./hugo.ts";
import { createPtyServer } from "./pty.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = resolve(here, "../../client");
const PID_FILE = resolve(here, "../../.hugo-studio.pid");

/**
 * Kill a Hugo left behind by a previous run that was SIGKILLed.
 *
 * The pid is verified to still be Hugo before anything is signalled — pids get
 * reused, and killing an unrelated process would be a far worse bug than
 * leaving a stray server running.
 */
function reapStaleHugo(): void {
  let pid: number;
  try {
    pid = Number(readFileSync(PID_FILE, "utf8").trim());
  } catch {
    return;
  }

  if (!Number.isInteger(pid) || pid <= 1) return;

  try {
    const comm = execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (comm.includes("hugo")) {
      process.kill(pid, "SIGTERM");
      console.log(`studio: reaped stale hugo (pid ${pid})`);
    }
  } catch {
    // No such process, which is the common case.
  } finally {
    rmSync(PID_FILE, { force: true });
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log(`studio: site root ${cfg.root}`);

  const index = new ContentIndex(cfg);
  await index.scan();
  console.log(`studio: indexed ${index.all().length} pages`);

  reapStaleHugo();
  const hugo = new Hugo(cfg, PORT, HUGO_PORT);

  const app = express();
  const server = createServer(app);

  app.use("/api", createApi(cfg, index, hugo));

  // The site's own webfonts, so the editor sets text in the same faces the
  // published page does. Served directly rather than through the preview proxy
  // so the editor still reads correctly when Hugo is down.
  app.use("/fonts", express.static(resolve(cfg.staticDir, "fonts"), { maxAge: "1h" }));

  // Mounted at the root rather than at PREVIEW_PATH on purpose: app.use(path)
  // strips the prefix before the handler sees it, and Hugo is serving *under*
  // that prefix because its baseURL says so. Passing the URL through unaltered
  // is what keeps the proxy free of path rewriting.
  const preview = hugo.middleware();
  app.use((req, res, next) => {
    const isPreview = req.url === PREVIEW_PATH || req.url.startsWith(`${PREVIEW_PATH}/`);
    if (isPreview) preview(req, res, next);
    else next();
  });

  // Vite owns everything the API and the preview did not claim, and its HMR
  // websocket rides on the same server so the whole editor is one port.
  const vite = await createViteServer({
    configFile: resolve(CLIENT_ROOT, "vite.config.ts"),
    // Node 24 imports TypeScript directly, so the config needs no esbuild
    // pre-bundle. The default loader writes that bundle into the client's
    // node_modules, which the dev watcher then sees as a change — a restart
    // loop that reloads the config and writes the file again.
    configLoader: "native",
    root: CLIENT_ROOT,
    // "custom" rather than "spa": the SPA fallback would answer every unmatched
    // path with index.html, including requests for site assets that belong to
    // Hugo. The shell is served explicitly below, after those have had a turn.
    appType: "custom",
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);

  // Site assets the theme emitted without the /preview prefix, which Vite just
  // declined to serve.
  app.use(hugo.assetFallback());

  // Everything else is the editor itself.
  app.use(async (req, res, next) => {
    try {
      const template = await readFile(resolve(CLIENT_ROOT, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "content-type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  const pty = createPtyServer(cfg.root);
  const events = new WebSocketServer({ noServer: true });

  const broadcast = (payload: unknown) => {
    const text = JSON.stringify(payload);
    for (const client of events.clients) {
      if (client.readyState === client.OPEN) client.send(text);
    }
  };

  await index.watch((event) => broadcast({ type: "content", ...event }));
  hugo.onStatus((status) => broadcast({ type: "hugo", ...status }));

  events.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "hugo", ...hugo.getStatus() }));
  });

  // Route our own websockets by path and leave everything else to Vite, which
  // attached its own upgrade handler for HMR.
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    if (pathname === "/ws/pty") {
      pty.handleUpgrade(req, socket, head, (ws) => pty.emit("connection", ws, req));
    } else if (pathname === "/ws/events") {
      events.handleUpgrade(req, socket, head, (ws) => events.emit("connection", ws, req));
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`studio: port ${PORT} is already in use. Set STUDIO_PORT to use another.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, () => {
    console.log(`studio: http://localhost:${PORT}`);
    hugo.start();
    const pid = hugo.pid();
    if (pid) writeFileSync(PID_FILE, String(pid));
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    hugo.stop();
    rmSync(PID_FILE, { force: true });
    void index.close();
    void vite.close();
    server.close(() => process.exit(0));
    // Open websockets keep the server alive; do not wait on them forever.
    setTimeout(() => process.exit(0), 1_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", () => hugo.stop());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

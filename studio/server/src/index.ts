import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { createApi } from "./api.ts";
import { HUGO_BIND, HUGO_PORT, loadConfig, LOG_FILE, PID_FILE, PORT } from "./config.ts";
import { ContentIndex } from "./content/index.ts";
import { Hugo } from "./hugo.ts";
import { createPtyServer } from "./pty.ts";
import { EDITOR_PATH, isEditorPath } from "./routes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = resolve(here, "../../client");

/** Hugo's own LiveReload socket, which the mirror has to carry. */
const LIVERELOAD_PATH = "/livereload";

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log(`studio: site root ${cfg.root}`);

  const index = new ContentIndex(cfg);
  await index.scan();
  console.log(`studio: indexed ${index.all().length} pages`);

  const hugo = new Hugo(cfg, {
    port: HUGO_PORT,
    bind: HUGO_BIND,
    editorPort: PORT,
    pidFile: PID_FILE,
    logFile: LOG_FILE,
  });

  const app = express();
  const server = createServer(app);

  // Everything below is ordered by who owns the URL. The editor claims one
  // prefix; Hugo gets the entire rest of the port, unaltered, so a page reached
  // through the editor and the same page reached directly on Hugo's own port
  // are the same bytes at the same paths.
  app.use(`${EDITOR_PATH}/api`, createApi(cfg, index, hugo));

  // The site's own webfonts, so the editor sets text in the same faces the
  // published page does. Served from static/ directly rather than through the
  // mirror so the editor still reads correctly when Hugo is down.
  app.use(`${EDITOR_PATH}/fonts`, express.static(resolve(cfg.staticDir, "fonts"), { maxAge: "1h" }));

  // Vite is configured with EDITOR_PATH as its base, so it answers for its own
  // assets under that prefix and calls next() for everything else. Its HMR
  // websocket rides on the same server, so the whole editor is one port.
  const vite = await createViteServer({
    configFile: resolve(CLIENT_ROOT, "vite.config.ts"),
    // Node 24 imports TypeScript directly, so the config needs no esbuild
    // pre-bundle. The default loader writes that bundle into the client's
    // node_modules, which the dev watcher then sees as a change — a restart
    // loop that reloads the config and writes the file again.
    configLoader: "native",
    root: CLIENT_ROOT,
    // "custom" rather than "spa": the SPA fallback would answer unmatched
    // paths with index.html, and every unmatched path here belongs to Hugo.
    appType: "custom",
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);

  // The editor shell, for any path under the prefix that Vite did not claim.
  // Tested against originalUrl because Vite's base middleware has by now
  // stripped the prefix from req.url.
  app.use(async (req, res, next) => {
    if (!isEditorPath(req.originalUrl)) return next();

    // The shell resolves its assets relative to the prefix, which needs the
    // trailing slash to mean "directory".
    if (req.originalUrl === EDITOR_PATH) return res.redirect(302, `${EDITOR_PATH}/`);

    try {
      const template = await readFile(resolve(CLIENT_ROOT, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "content-type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  // Everything else is the site.
  app.use(hugo.mirror());

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

  // Route our own websockets by path, hand Hugo's LiveReload to the mirror,
  // and leave everything else to Vite, which attached its own upgrade handler
  // for HMR.
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    if (pathname === `${EDITOR_PATH}/ws/pty`) {
      pty.handleUpgrade(req, socket, head, (ws) => pty.emit("connection", ws, req));
    } else if (pathname === `${EDITOR_PATH}/ws/events`) {
      events.handleUpgrade(req, socket, head, (ws) => events.emit("connection", ws, req));
    } else if (pathname === LIVERELOAD_PATH) {
      hugo.upgrade(req, socket, head);
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
    console.log(`studio: editor http://localhost:${PORT}${EDITOR_PATH}/`);
    console.log(`studio: site   http://localhost:${HUGO_PORT}/ (mirrored on ${PORT})`);
    hugo.start();
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    // Hugo is deliberately left running: the pid file it is recorded in is
    // what lets the next studio adopt it instead of rebuilding from cold.
    hugo.detach();
    void index.close();
    void vite.close();
    server.close(() => process.exit(0));
    // Open websockets keep the server alive; do not wait on them forever.
    setTimeout(() => process.exit(0), 1_000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

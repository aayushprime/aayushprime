import { spawn, type ChildProcess } from "node:child_process";
import type { RequestHandler } from "express";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";
import type { SiteConfig } from "./config.ts";

export type HugoState = "starting" | "ready" | "failed" | "stopped";

export type HugoStatus = {
  state: HugoState;
  /** Tail of stderr, so a build error is visible in the UI rather than the terminal. */
  log: string[];
};

/** The path the editor serves Hugo under, on its own origin. */
export const PREVIEW_PATH = "/preview";

const LOG_LINES = 60;

/**
 * Supervises `hugo server` and re-serves it on the editor's own origin.
 *
 * Hugo is started with its baseURL pointing at the editor's /preview path, so
 * every URL it generates — pages, stylesheets, images — already carries that
 * prefix and the proxy needs no path rewriting. Serving it same-origin is what
 * lets the editor script the preview iframe at all; a cross-origin frame is an
 * opaque rectangle.
 *
 * LiveReload is deliberately off. The editor knows exactly when it has written
 * a file, so it can reload the frame itself, and that avoids proxying Hugo's
 * websocket for a signal we already have.
 */
export class Hugo {
  private child: ChildProcess | null = null;
  private status: HugoStatus = { state: "stopped", log: [] };
  private listeners = new Set<(s: HugoStatus) => void>();
  private lastEmitted: HugoState | null = null;

  constructor(
    private cfg: SiteConfig,
    private editorPort: number,
    private hugoPort: number,
  ) {}

  /** The running child's pid, for reaping a server this process outlives. */
  pid(): number | undefined {
    return this.child?.pid;
  }

  getStatus(): HugoStatus {
    return { state: this.status.state, log: [...this.status.log] };
  }

  onStatus(fn: (s: HugoStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(state: HugoState): void {
    this.status.state = state;
    this.emit();
  }

  private log(chunk: string): void {
    for (const line of chunk.split("\n")) {
      if (line.trim() === "") continue;
      this.status.log.push(line);
      // Hugo reports build failures on stderr and recovers on the next save,
      // so a rebuild that succeeds should clear the error state.
      if (/^Built in|^Change detected/.test(line) && this.status.state === "failed") {
        this.status.state = "ready";
      }
      if (/error|ERROR|failed/.test(line)) this.status.state = "failed";
    }
    this.status.log = this.status.log.slice(-LOG_LINES);

    // Hugo logs a line per rebuild. Pushing all of that to the client would be
    // noise, so a healthy server is announced once; a failing one keeps
    // streaming, because then the log lines are the useful part.
    if (this.status.state !== this.lastEmitted || this.status.state === "failed") this.emit();
  }

  private emit(): void {
    this.lastEmitted = this.status.state;
    const snapshot = this.getStatus();
    for (const fn of this.listeners) fn(snapshot);
  }

  start(): void {
    if (this.child) return;

    this.status = { state: "starting", log: [] };
    this.emit();

    const args = [
      "server",
      "--port", String(this.hugoPort),
      "--bind", "127.0.0.1",
      "--baseURL", `http://localhost:${this.editorPort}${PREVIEW_PATH}/`,
      "--appendPort=false",
      "--disableLiveReload",
      // Drafts are the whole point of an editor preview.
      "--buildDrafts",
      "--buildFuture",
      // Fast render serves partially-updated pages after a change, which reads
      // as a bug when you are watching the preview to check your own edit.
      "--disableFastRender",
    ];

    const child = spawn("hugo", args, {
      cwd: this.cfg.root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    child.stdout?.on("data", (d: Buffer) => this.log(d.toString()));
    child.stderr?.on("data", (d: Buffer) => this.log(d.toString()));

    child.on("spawn", () => {
      // Hugo prints its listening banner a moment after spawn; treating spawn
      // as ready is close enough because the proxy retries a refused connection
      // as a plain 503 the UI already knows how to show.
      this.setState("ready");
    });

    child.on("error", (err) => {
      this.log(`failed to start hugo: ${err.message}`);
      this.setState("failed");
      this.child = null;
    });

    child.on("exit", (code, signal) => {
      this.child = null;
      if (signal === "SIGTERM" || signal === "SIGINT") {
        this.setState("stopped");
        return;
      }
      this.log(`hugo exited with code ${code ?? "null"}`);
      this.setState("failed");
    });
  }

  restart(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    const child = this.child;
    if (!child) return;
    this.child = null;
    child.kill("SIGTERM");
    // Hugo normally goes down immediately; this is the backstop for when it
    // does not, so the port is free for the next start.
    const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
    force.unref();
  }

  /**
   * Catch site-absolute asset URLs that never got the /preview prefix.
   *
   * Most of what Hugo emits is built through relURL and so already carries the
   * base path. A few things are not: a `cover.image` written as
   * `/posts/slug/x.png` in frontmatter, and the configured favicon, are both
   * emitted verbatim. Left alone those requests fall through to the editor's
   * own SPA, which answers every unknown path with its index page — so the
   * browser asks for a PNG and is handed HTML.
   *
   * Anything with a file extension is a site asset rather than an editor
   * route, so it is forwarded to Hugo under the prefix it should have had.
   */
  assetFallback(): RequestHandler {
    const proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${this.hugoPort}`,
      changeOrigin: false,
      ws: false,
      pathRewrite: (path) => `${PREVIEW_PATH}${path}`,
    });

    return (req, res, next) => {
      const path = req.url.split("?")[0] ?? "";
      const last = path.slice(path.lastIndexOf("/") + 1);

      const isAsset = last.includes(".");
      const isEditorOwn = /^\/(@|src\/|node_modules\/|api\/|favicon\.svg)/.test(path);

      if (req.method !== "GET" || !isAsset || isEditorOwn) return next();
      return proxy(req, res, next);
    };
  }

  /**
   * Reverse-proxy for /preview, with a small script injected into HTML so the
   * frame can keep its scroll position across the reloads the editor triggers.
   */
  middleware(): RequestHandler {
    return createProxyMiddleware({
      target: `http://127.0.0.1:${this.hugoPort}`,
      changeOrigin: false,
      ws: false,
      selfHandleResponse: true,
      on: {
        error: (_err, _req, res) => {
          const response = res as { writeHead?: (c: number, h: object) => void; end?: (b: string) => void };
          response.writeHead?.(503, { "content-type": "text/plain" });
          response.end?.("hugo is not answering");
        },
        proxyRes: responseInterceptor(async (buffer, proxyRes) => {
          const type = String(proxyRes.headers["content-type"] ?? "");
          if (!type.includes("text/html")) return buffer;
          return buffer.toString("utf8").replace("</body>", `${PREVIEW_SCRIPT}</body>`);
        }),
      },
    });
  }
}

/**
 * Injected into every previewed page.
 *
 * Keeps the scroll position across the reloads the editor triggers on save,
 * and accepts a request from the editor to scroll to a given heading — which
 * is how the preview follows the cursor without Hugo emitting source maps.
 */
const PREVIEW_SCRIPT = `<script>
(function () {
  var KEY = "studio-scroll:" + location.pathname;

  try {
    var saved = sessionStorage.getItem(KEY);
    if (saved !== null) window.scrollTo(0, parseInt(saved, 10) || 0);
  } catch (e) {}

  addEventListener("scroll", function () {
    try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {}
  }, { passive: true });

  addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "studio:scroll-to-heading") return;

    var wanted = String(data.text || "").trim().toLowerCase();
    if (wanted === "") return;

    var headings = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].textContent.trim().toLowerCase() === wanted) {
        headings[i].scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  });
})();
</script>`;

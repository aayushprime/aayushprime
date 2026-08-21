import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import type { RequestHandler } from "express";
import {
  createProxyMiddleware,
  responseInterceptor,
  type RequestHandler as ProxyHandler,
} from "http-proxy-middleware";
import type { SiteConfig } from "./config.ts";

export type HugoState = "starting" | "ready" | "failed" | "stopped";

export type HugoStatus = {
  state: HugoState;
  /** Tail of Hugo's output, so a build error is visible in the UI rather than only in a file. */
  log: string[];
};

export type HugoOptions = {
  port: number;
  bind: string;
  /** The port the site is mirrored on, which LiveReload has to be told about. */
  editorPort: number;
  /** Records the running server so the next studio process can adopt it. */
  pidFile: string;
  /** Hugo's stdout and stderr. A file rather than a pipe, because the process outlives us. */
  logFile: string;
};

const LOG_LINES = 60;

/** How much of an existing log to read back when adopting a running server. */
const SEED_BYTES = 16 * 1024;

/** Backstop for the file watcher, and the liveness check for an adopted pid. */
const POLL_MS = 2_000;

/**
 * The flags the supervised server runs with.
 *
 * Exported and pure so the choices here can be asserted in tests: two of them
 * are load-bearing, and both were regressions once.
 */
export function hugoArgs(opts: { port: number; bind: string }): string[] {
  return [
    "server",
    "--port", String(opts.port),
    "--bind", opts.bind,
    // No --baseURL. Hugo then describes itself at its own address, so this is
    // a normal, browsable dev server rather than something only the editor can
    // render. A preview-only baseURL is what used to force a second
    // `hugo server` into existence just to read the site.
    //
    // Never render to disk. A server that writes public/ leaves the output
    // owned by whoever started it, and a single run under sudo then blocks
    // every later build with a permission error.
    "--renderToMemory",
    // Drafts and future dates are the whole point of a preview.
    "--buildDrafts",
    "--buildFuture",
    // Fast render serves partially-updated pages after a change, which reads
    // as a bug when you are watching the preview to check your own edit.
    "--disableFastRender",
    // LiveReload is deliberately left on: it is what a plain `hugo server`
    // gives you, and it is why a browser pointed straight at Hugo refreshes.
  ];
}

/**
 * What the mirror changes about a page on its way through.
 *
 * Two edits, both of them the editor's business rather than the site's:
 *
 * Hugo stamps its own port into the LiveReload script tag. A page served by
 * the mirror that dials that port sends the mirror's Origin to Hugo, and
 * Hugo's LiveReload answers 403 -- it requires Origin and Host to agree.
 * Pointed back at the mirror the two agree again, and the preview reloads on
 * the real end of a build rather than after a guessed delay.
 *
 * Then the editor's own script, which keeps the scroll position across those
 * reloads and lets the editor scroll the frame to a heading. It is injected
 * here rather than added to the site's layouts, so the published site carries
 * no trace of the editor.
 */
export function mirrorHtml(html: string, editorPort: number): string {
  return html
    .replace(/(\/livereload\.js\?[^"']*?port=)\d+/, `$1${editorPort}`)
    .replace("</body>", `${PREVIEW_SCRIPT}</body>`);
}

/** Whether a pid is alive and is in fact a Hugo. */
export function isHugo(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;

  try {
    const comm = execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return comm.includes("hugo");
  } catch {
    return false; // No such process, which is the common case.
  }
}

/**
 * Supervises `hugo server` and mirrors it onto the editor's own origin.
 *
 * The server is spawned detached, so it survives this process restarting --
 * which the dev watcher does on every edit to the editor's own source -- and
 * the next studio to start adopts it from a pid file instead of paying for a
 * cold rebuild. Its output goes to a file rather than a pipe for the same
 * reason: a pipe dies with its parent, and the build log has to outlive it.
 *
 * The mirror exists so the preview frame is same-origin, which is what lets
 * the editor script it at all; a cross-origin frame is an opaque rectangle.
 * Hugo is proxied verbatim, with no prefix and no path rewriting, so every URL
 * it emits resolves identically whether the site is reached through the editor
 * or directly on Hugo's own port.
 */
export class Hugo {
  private child: ChildProcess | null = null;
  /** Set whether the server was spawned here or adopted from a previous run. */
  private serverPid: number | null = null;
  private status: HugoStatus = { state: "stopped", log: [] };
  private listeners = new Set<(s: HugoStatus) => void>();
  private lastEmitted: HugoState | null = null;
  private args: string[];

  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private offset = 0;

  private proxy: ProxyHandler;

  constructor(
    private cfg: SiteConfig,
    private opts: HugoOptions,
  ) {
    this.args = hugoArgs(opts);
    this.proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${opts.port}`,
      changeOrigin: false,
      // Left off on purpose. With ws:true this proxy subscribes to the
      // server's upgrade event and would then answer *every* socket on the
      // port, including Vite's HMR and the editor's own. Upgrades are routed
      // by path instead, and this proxy is handed only the ones that are
      // Hugo's.
      ws: false,
      selfHandleResponse: true,
      on: {
        error: (_err, _req, res) => {
          const response = res as {
            writeHead?: (c: number, h: object) => void;
            end?: (b: string) => void;
          };
          response.writeHead?.(503, { "content-type": "text/plain" });
          response.end?.("hugo is not answering");
        },
        proxyRes: responseInterceptor(async (buffer, proxyRes) => {
          const type = String(proxyRes.headers["content-type"] ?? "");
          if (!type.includes("text/html")) return buffer;
          return mirrorHtml(buffer.toString("utf8"), opts.editorPort);
        }),
      },
    });
  }

  getStatus(): HugoStatus {
    return { state: this.status.state, log: [...this.status.log] };
  }

  onStatus(fn: (s: HugoStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Adopt a server left running by a previous studio, or spawn a new one. */
  start(): void {
    if (this.serverPid !== null) return;
    if (!this.adopt()) this.spawn();
  }

  restart(): void {
    this.kill();
    this.spawn();
  }

  /**
   * Stop following the log and leave Hugo running.
   *
   * This is shutdown. The whole point of the pid file is that the server it
   * names outlives the editor, so the next start is warm.
   */
  detach(): void {
    this.unfollow();
    this.child = null;
    this.serverPid = null;
  }

  /** Deliberately stop the server this studio is responsible for. */
  kill(): void {
    const pid = this.serverPid;
    this.unfollow();
    this.child = null;
    this.serverPid = null;

    if (pid === null) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    this.clearRecord();
    this.setState("stopped");
  }

  /** Hugo serves everything the editor does not claim. */
  mirror(): RequestHandler {
    return this.proxy;
  }

  /**
   * LiveReload's websocket, routed here by path from the editor's server.
   *
   * Node types an upgrade socket as Duplex; for a TCP server it is always a
   * net.Socket, which is what the proxy asks for.
   */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.proxy.upgrade(req, socket as Socket, head);
  }

  private adopt(): boolean {
    const record = this.readRecord();
    if (!record) return false;

    if (!isHugo(record.pid)) {
      this.clearRecord();
      return false;
    }

    // A server started under different flags serves a different site, so it is
    // replaced rather than adopted.
    if (record.args.join(" ") !== this.args.join(" ")) {
      try {
        process.kill(record.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
      this.clearRecord();
      return false;
    }

    this.serverPid = record.pid;
    this.status = { state: "ready", log: [] };
    this.follow({ seed: true });
    this.emit();
    return true;
  }

  private spawn(): void {
    this.status = { state: "starting", log: [] };
    this.emit();

    // Truncated, so the log holds this run and nothing older.
    const fd = openSync(this.opts.logFile, "w");
    let child: ChildProcess;
    try {
      child = spawn("hugo", this.args, {
        cwd: this.cfg.root,
        detached: true,
        stdio: ["ignore", fd, fd],
      });
    } finally {
      closeSync(fd);
    }

    this.child = child;
    // Detached and unreferenced: the server is not this process's to keep
    // alive, and must not hold the event loop open at shutdown.
    child.unref();

    child.on("spawn", () => {
      this.serverPid = child.pid ?? null;
      if (child.pid) this.writeRecord(child.pid);
      this.follow({ seed: false });
      // Hugo prints its listening banner a moment after spawn; treating spawn
      // as ready is close enough because the proxy answers a refused
      // connection with a 503 the UI already knows how to show.
      this.setState("ready");
    });

    child.on("error", (err) => {
      this.ingest(`failed to start hugo: ${err.message}`);
      this.setState("failed");
      this.child = null;
      this.serverPid = null;
    });

    child.on("exit", (code, signal) => {
      this.child = null;
      this.serverPid = null;
      this.clearRecord();
      if (signal === "SIGTERM" || signal === "SIGINT") {
        this.setState("stopped");
        return;
      }
      // Whatever Hugo said on the way out is the useful part.
      this.drain();
      this.ingest(`hugo exited with code ${code ?? "null"}`);
      this.setState("failed");
    });
  }

  // ---------------------------------------------------------------- log file

  /**
   * Follow Hugo's log file.
   *
   * The file is the only channel there is: the process is detached, so there
   * is no pipe to read. `seed` replays the tail of an existing log, which is
   * how an adopted server's state -- including a build that is currently
   * failing -- is recovered rather than guessed.
   */
  private follow(opts: { seed: boolean }): void {
    this.unfollow();
    this.offset = opts.seed ? 0 : this.size();

    if (opts.seed) this.seed();

    try {
      this.watcher = watch(this.opts.logFile, () => this.drain());
      this.watcher.unref();
    } catch {
      // Not created yet; the poll below picks it up.
    }

    this.timer = setInterval(() => {
      this.drain();
      this.checkAlive();
    }, POLL_MS);
    this.timer.unref();
  }

  private unfollow(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private size(): number {
    try {
      return statSync(this.opts.logFile).size;
    } catch {
      return 0;
    }
  }

  /** Replay the tail of an existing log so an adopted server's state is real. */
  private seed(): void {
    this.offset = Math.max(0, this.size() - SEED_BYTES);
    this.drain();
    // The replayed lines set the state; a log that says nothing useful still
    // means a server that is up and answering.
    if (this.status.state === "starting") this.status.state = "ready";
  }

  /** Read whatever Hugo has appended since the last read. */
  private drain(): void {
    const size = this.size();

    // Truncated behind our back -- start over rather than read past the end.
    if (size < this.offset) this.offset = 0;
    if (size === this.offset) return;

    const length = size - this.offset;
    const buffer = Buffer.allocUnsafe(length);

    let fd: number;
    try {
      fd = openSync(this.opts.logFile, "r");
    } catch {
      return;
    }

    try {
      const read = readSync(fd, buffer, 0, length, this.offset);
      this.offset += read;
      this.ingest(buffer.subarray(0, read).toString("utf8"));
    } finally {
      closeSync(fd);
    }
  }

  /**
   * An adopted server has no exit event, so liveness is checked rather than
   * observed. Cheap: one signal-zero probe every couple of seconds.
   */
  private checkAlive(): void {
    const pid = this.serverPid;
    if (pid === null || this.status.state === "stopped") return;

    try {
      process.kill(pid, 0);
    } catch {
      this.serverPid = null;
      this.unfollow();
      this.clearRecord();
      this.ingest("hugo is no longer running");
      this.setState("failed");
    }
  }

  private ingest(chunk: string): void {
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

  // ----------------------------------------------------------------- pid file

  private readRecord(): { pid: number; args: string[] } | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.opts.pidFile, "utf8"));
      if (typeof parsed !== "object" || parsed === null) return null;

      const { pid, args } = parsed as { pid?: unknown; args?: unknown };
      if (typeof pid !== "number" || !Array.isArray(args)) return null;
      if (!args.every((a): a is string => typeof a === "string")) return null;

      return { pid, args };
    } catch {
      return null; // Absent, or written by something else.
    }
  }

  private writeRecord(pid: number): void {
    // The args are recorded alongside the pid so a server left over from
    // different flags is replaced instead of adopted.
    writeFileSync(this.opts.pidFile, `${JSON.stringify({ pid, args: this.args }, null, 2)}\n`);
  }

  private clearRecord(): void {
    try {
      unlinkSync(this.opts.pidFile);
    } catch {
      // Already gone.
    }
  }

  private setState(state: HugoState): void {
    this.status.state = state;
    this.emit();
  }

  private emit(): void {
    this.lastEmitted = this.status.state;
    const snapshot = this.getStatus();
    for (const fn of this.listeners) fn(snapshot);
  }
}

/**
 * Injected into every mirrored page. See mirrorHtml.
 *
 * Keeps the scroll position across the reloads LiveReload and the editor
 * trigger, and accepts a request from the editor to scroll to a given heading
 * -- which is how the preview follows the cursor without Hugo emitting source
 * maps.
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

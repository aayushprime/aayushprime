import { spawn } from "node-pty";
import { WebSocketServer } from "ws";

/**
 * Terminal bridge — a pty per connection, wired to an xterm in the browser.
 *
 * Carried over from the webmux repo. It exists here because publishing is
 * deliberately not built into the editor: commits and pushes happen by hand,
 * and this is where that happens. So the shell starts in the site root rather
 * than the home directory, and it is a login shell rather than tmux, because
 * the job is `git`, not session persistence. Set STUDIO_SHELL to override.
 */
export function createPtyServer(cwd: string): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const shell = process.env.STUDIO_SHELL ?? process.env.SHELL ?? "/bin/zsh";

  wss.on("connection", (ws) => {
    const pty = spawn(shell, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd,
      env: process.env as Record<string, string>,
    });

    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    pty.onExit(() => ws.close());

    ws.on("message", (data) => {
      const message = data.toString();

      try {
        const parsed = JSON.parse(message) as { type?: string; cols?: number; rows?: number };
        if (parsed.type === "resize" && parsed.cols && parsed.rows) {
          pty.resize(parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // Not JSON, so it is ordinary terminal input.
      }

      pty.write(message);
    });

    ws.on("close", () => pty.kill());
  });

  return wss;
}

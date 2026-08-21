import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "preact/hooks";
import { BASE } from "../lib/api.ts";

/**
 * A shell in the site root.
 *
 * Publishing is deliberately not wired into the editor — commits and pushes
 * happen here, by hand, which keeps git history something you author rather
 * than something a save button generates.
 */
export function Terminal({ visible }: { visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!host.current) return;

    const term = new Xterm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "var(--font-mono), monospace",
      theme: {
        background: "#00000000",
        foreground: "#d8d8d8",
        cursor: "#7aa2f7",
        selectionBackground: "#2a3050",
      },
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    fit.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(host.current);
    fitAddon.fit();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${proto}://${location.host}${BASE}ws/pty`);

    const sendResize = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    socket.onopen = sendResize;
    socket.onmessage = (event) => term.write(String(event.data));
    socket.onclose = () => term.write("\r\n\x1b[31mdisconnected\x1b[0m\r\n");

    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        sendResize();
      } catch {
        // Fitting a hidden element throws; it refits when shown again.
      }
    });
    observer.observe(host.current);

    return () => {
      observer.disconnect();
      socket.close();
      term.dispose();
      fit.current = null;
    };
  }, []);

  // The dock hides panes with CSS, so the terminal has to be told to refit
  // when it comes back — xterm cannot measure an element with no layout.
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      try {
        fit.current?.fit();
      } catch {
        // Not laid out yet; the ResizeObserver will catch up.
      }
    }, 30);
    return () => clearTimeout(id);
  }, [visible]);

  return <div class="terminal" ref={host} />;
}

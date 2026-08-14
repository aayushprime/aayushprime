---
title: "xterm.js in the browser"
date: 2026-08-14T12:10:00+0545
draft: false
searchHidden: false
tags: [terminals, web]
---

xterm.js is a terminal *emulator* — it parses escape sequences and paints cells.
It does not know where the bytes come from, which is what makes it composable:
you own the transport.

The shape that works: a WebSocket server spawns a [[pty]] on connect and bridges
bytes in both directions. The browser side is then almost trivial — forward
keystrokes up, write everything received into the emulator.

The part that is not trivial is resize. The terminal's dimensions live in the
browser, but the process that cares about them lives behind the pty, so you have
to send window size out-of-band and call `ioctl` on the master end.

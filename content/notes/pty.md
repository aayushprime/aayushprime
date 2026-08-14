---
title: "Pseudoterminals"
date: 2026-08-14T12:00:00+0545
draft: false
searchHidden: false
tags: [systems, terminals]
---

A pty is a pair of character devices that pretend to be a terminal. The master
end is held by whatever wants to *drive* a terminal; the slave end is what the
child process opens as its controlling terminal, so the child believes it is
talking to real hardware.

That belief is the whole point. It is why a shell spawned under a pty still does
line editing, still reports a window size, still emits colour — none of which
happens when you just pipe to it.

The two consumers I keep coming back to: [[tmux]], which multiplexes many ptys
behind one, and [xterm.js](xterm-js), which renders one in a browser tab.

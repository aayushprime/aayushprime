---
title: "tmux is a server, not a wrapper"
date: 2026-08-14T12:05:00+0545
draft: false
searchHidden: false
tags: [terminals, tmux]
---

The mental model that made tmux click: `tmux` the command is a *client*. The
first invocation starts a long-lived server process, and every pane in every
session is a [[pty]] owned by that server, not by your shell.

This is why detaching loses nothing. Your client dies, the server keeps the ptys
open, the processes inside never learn anything happened.

It also explains the failure mode where a stale server holds an old environment:
you are not restarting a wrapper, you are talking to a daemon that outlived the
thing that configured it.

See also [[tmux-snippets]].

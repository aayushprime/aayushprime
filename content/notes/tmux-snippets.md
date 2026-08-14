---
title: "Snippet plugin design"
date: 2026-08-14T12:15:00+0545
draft: false
searchHidden: false
tags: [tmux]
---

A snippet manager for [[tmux]] only needs three things: somewhere to keep the
snippets, a way to pick one, and a way to inject it.

Injection is the interesting constraint. `send-keys` types into the target pane
as if you had typed it, which means it composes with whatever shell, editor or
REPL happens to be focused — no integration per program.

The cost is that you cannot tell whether the paste landed somewhere sensible.
`send-keys` is fire-and-forget; a snippet dropped into a `less` pager is just
keystrokes to `less`.

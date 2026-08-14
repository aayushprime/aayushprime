---
title: "Force-directed layouts"
date: 2026-08-14T12:20:00+0545
draft: false
searchHidden: false
tags: [graphs, web]
---

A force layout has no idea what a good drawing looks like. It only knows three
local rules: nodes repel each other, linked nodes are pulled together by a
spring, and something weak drags everything toward the centre so the whole thing
does not drift off screen.

Run those to equilibrium and structure falls out for free — clusters become
visibly clustered, bridges become visibly thin. Nobody designed that; it is just
what minimising the energy looks like.

The honest limitation: the result is not stable or reproducible. Same graph, same
code, different starting jitter, different picture. Which means a force layout is
a good tool for *exploring* a graph and a bad one for *referring* to it.

The layout of the graph on this site is exactly this, with the node colours
coming from [[oklch]]. On why the notes are small enough for it to work:
[[zettelkasten]].

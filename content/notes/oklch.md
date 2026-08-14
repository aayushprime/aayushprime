---
title: "Why this site's colours are oklch"
date: 2026-08-14T12:30:00+0545
draft: false
searchHidden: false
tags: [web]
---

Every colour on this site is `oklch(L C H)` — lightness, chroma, hue. The reason
is that lightness in OKLCH is *perceptual*, so two colours with the same `L` look
equally bright to the eye. In HSL they do not: `hsl(60 100% 50%)` and
`hsl(240 100% 50%)` are both "50% lightness" and one of them is yellow while the
other is nearly black.

That makes a theme derivable instead of hand-picked. The whole palette here hangs
off one `--neutral-hue`, and the dark theme is mostly the same chromas with the
lightness ramp inverted.

It also makes dimming honest. Fading a node in a graph to 15% opacity keeps its
hue and just moves it down the lightness ramp, so a dimmed cluster still reads as
the same cluster.

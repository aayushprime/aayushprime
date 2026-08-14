---
title: "recover() only works in the panicking goroutine"
date: 2026-08-14T12:35:00+0545
draft: false
searchHidden: false
tags: [golang, systems]
---

`recover()` is scoped to the goroutine that panicked. A deferred recover in
`main` does nothing for a panic in a goroutine you spawned — that panic unwinds
its own stack, finds no recover, and takes the whole process down.

Which is the correct default. A goroutine that panicked has no idea what
invariants it broke on the way out, and a process that keeps serving after that
is lying to its callers.

The practical consequence is that every goroutine you spawn needs its own
recover if you want it survivable, and "I have a recover in my HTTP handler" does
not cover work you handed off to a background goroutine.

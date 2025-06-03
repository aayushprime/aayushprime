---
title: "Why is my Golang server (not) crashing?"
date: 2025-06-03T15:47:09+0545
draft: false 
searchHidden: false
ShowBreadCrumbs: true 
ShowToc: false
TocOpen: false
cover:
    image: "/posts/golang-silent-panic/recover.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---

I was hit by one of these "you didn't know this, now suffer" moments today.
I was working on a websocket server and was gradually adding new functionality. Out of nowhere, the server started disconnecting the client. Without any error whatsoever. I even wasted some time thinking maybe the client was doing something wrong.

Then with no luck with anything I tried, I tried to use the debugger. The debugger would execute the last line of a function and then the client would disconnect.
This is the exact function

```go
func (g *Game) ShuffleCardsForPlayers() {
	for _, player := range g.State.Players {
		original := g.State.PlayerHands[player]
		rand.Shuffle(len(original), func(i, j int) {
			original[i], original[j] = original[j], original[i]
		})
		g.State.PlayerHands[player] = original[:4]
		g.State.PlayerDecks[player] = original[4:]
	}
}
```

This function was called from the `handleMove` function and there are other steps after it. But the client would disconnect and not run anything after this function. So, I added logs, logs and more logs. I disabled the whole function and found out it was fine. Then I added logs and found everything was printed except the last line (after the `g.State.PlayerDecks[player] = original[4:]` was executed.

This is even stranger since both the PlayerHands and PlayerDecks are exact same type. And I would have loved to see the panic message. But, nothing. Then after some googling and ChatGPT, I found out the problem was this.

A struct field that is declared as a map in Go will be nil by default. If you try to read from a nil map, it will not panic, but if you try to write to it, it will panic with a runtime error.

And where was my error/panic going?
The net/http package in Go has a default recovery middleware that recovers from panics and logs them. However, if you are using a custom handler or if the panic occurs outside of the HTTP request context (like in a goroutine), it will not be caught by this middleware.

```go
	go func() {
		defer func() {
			if p := recover(); p != nil {
				panicChan <- p
			}
		}()
		h.handler.ServeHTTP(tw, r)
		close(done)
	}()
```


Lesson learnt, I guess!

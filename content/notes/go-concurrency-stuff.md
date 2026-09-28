---
title: "Golang concurrency"
date: 2026-09-28T00:39:34+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: [golang, concurrency, garbage collection]
---

Few notes from this [article](https://antonz.org/go-concurrency-distilled/) and exploration.

Sending through channel is synchronous. This means it blocks if channel is full.

A common pattern: making a channel and returning it; instead of returning value returning the channel and pushing the value into the channel.
```go
func generate(start, stop int) chan int {
    out := make(chan int)
    go func() {
        for i := start; i < stop; i++ {
            out <- i
        }
    }()
    return out
}
```

To close a channel: `defer close(channel)`; A channel can only be closed once. GC will collect a channel regardless of it is closed or not (if it is not referenced).


## Tri-color marking
GO uses something called a tracing GC.  
It is a classic mark and sweep.    
     - concurrently run and mark every object in the heap into white(garbage)  
     - gray: discovered these but not whats inside them  
     - black: disconvered these and all the objects they point to are at least gray  

The processing starts from the roots(the variables on the stack and globals) and marks stuff pointed by it (classic mark and sweep).  
   Because this is concurrent, the compiler does some magic (white barrier; injected code) to prevent GC from deleting a new object (concurrently created). It marks the new object Gray.
   
##  Green Tea
The fancy new thing in 1.26 that was praised.
Because the mark-and-sweep described above process is just pointer chasing, cache locality was all over the place. CPU was free but data wasn't available (cache misses). Green Tea solves this. Go's alloator groups objects of similar size together(spans). Spans can be multiple memory pages. Instead of just loading what the pointer points to it loads a entire span and more often than not it hits cache. 
`GOMEMLIMIT` tell go in runtime how much memory is allowed. To prevent frequent GC runs.


`range` can iterate over a channel.  
Channel can have directions. 
![](/notes/go-concurrency-stuff/image.png)

nil channel: writing or reading to a nil channel blocks forever. Close nil channel = panic
```go
var stream chan int
//blocked 
stream <- 1
//blocked 
<-stream
```

Building pipelines using channels:

```go
func merge(in1, in2 <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for in1 != nil || in2 != nil {
            select {
            case val1, ok := <-in1:
                if ok { out <- val1 } else { in1 = nil }
            case val2, ok := <-in2:
                if ok { out <- val2 } else { in2 = nil }
            }
        }
    }()
    return out
}
```
Setting in1 = nil means next iteration will pull from nil which blocks! Otherwise, pulling from a closed channel will return default value 0, false and it will spin forever.


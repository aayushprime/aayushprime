---
title: "Custom Thenable"
date: 2026-08-20T16:44:56+05:45
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: [typescript, javascript, promises]
---

```ts
const thenable: PromiseLike<string> = {
  then<TResult1 = string, TResult2 = void>(
    resolve: (value: string) => TResult1 | PromiseLike<TResult1>,
    reject: (reason: any) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve("hello").then(resolve, reject);
  },
};

console.log("isPromise", thenable instanceof Promise); // false
const result = await thenable;
console.log("result", result); // hello
```

Cloudflare RPC mention an interesting construct in the JS promises [here](https://developers.cloudflare.com/workers/runtime-apis/rpc/#promise-pipelining).
They are using custom promise objects (that can be awaited) to batch (over the network) multiple RPC calls sequentially without awaiting the result of the first.

Using a thenable construct. When awaited, the thenable object will run the `then` and can resolve the promise. But since promises allow chaining, we must propagate the generic types `TResult1` and `TResult2` and return a `PromiseLike`.

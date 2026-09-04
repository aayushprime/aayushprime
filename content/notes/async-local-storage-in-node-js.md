---
title: "Async Local Storage in Node.JS"
date: 2026-09-05T01:10:40+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: []
---

Say we want to write transactions within transactions. We would like to use the same DB client when calling `client.query` but without the pesky context parameter being passed around to each sub transaction.

But we also don't want the client to be global. I still want to let my transactions run concurrently and on different clients.

This is the exact problem `AsyncLocalStorage` solves.
```ts
import { AsyncLocalStorage } from "async_hooks";

// global counter to know the unique client
let i = 0;

// simple function to mint a client
// attach a function to print its id
function createClient() {
  return {
    i: ++i,
    fn(message: string) {
      console.log(this.i, message);
    },
  };
}

type Client = ReturnType<typeof createClient>;

// create a store
const store = new AsyncLocalStorage();

// mock db class
class DB {
  async with<T>(fn: (client: Client) => Promise<T>) {
    // get the context
    const client = store.getStore() as Client | undefined;
    // if i am already in the context reuse the client
    if (client) {
      return await fn(client);
    } else {
      // if i am not create a client
      const client = createClient();
      // store.run it!
      return await store.run(client, async () => {
        await fn(client);
      });
    }
  }
}

const db = new DB();

async function tx1() {
  db.with(async (client) => {
    client.fn("tx1");
  });
}

// client 1 created!
tx1();


async function tx2() {
  db.with(async (client) => {
    // eventhough tx1 creates a new client when called previously
    // here it doesn't!
    // instead of passing context into tx1() from tx2()
    // async local storage does it for us internally
    await tx1();
    client.fn("tx2");
  });
}


// client 2 created!
tx2();
```

Quite a useful Node.JS feature.
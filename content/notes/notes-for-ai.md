---
title: "effective ai-agents use"
date: 2026-09-23T01:09:59+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: [agents]
---

Notes from this [video](https://x.com/poteto/status/2102050467505430555?s=20).  
Motivation: build trust in the agent's work  

1. *Custom Tools*: Ask agents to build tools and ask them to use them. (to prevent duplicate work), and build custom tools that even you can run and verify.
2. *Code is Memory*: Enforce strict patterns so that the agent follow them. (make wrong things hard to do). Dont let a wrong patterns spread (like comments everywhere)
3. *Architecture*: Strict boundaries and conventions about what can run where. Enforce architecture rules strictly. (dont let slow code leak into the hot path)
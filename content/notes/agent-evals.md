---
title: "Agent Evals"
date: 2026-08-20T00:54:58+05:45
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: [ai, evals, agents]
---

notes from [this](https://www.youtube.com/watch?v=dzVogKf9jIM) short video.

We want agents to be reliable.
Reliability = Observability + Evals

Observability means we can see what agent did. What the model response was, what the tool response was.

LLM response desired properties:
- Relevance: Answer relevance to the user's query

- Groundedness (relates to hallucination as well): uses the particular context provided (as opposed to the generic response)

- Tool Sequence Accuracy: does not do wasteful tool calls, and follows correct sequence of tool calls


Evals = QA for agents

Who does evals?
Whoever builds the app, also runs evals.

make a synthetic dataset to run evals (in the beginning to kickstart the eval process)
or a golden dataset (domain expert designed)

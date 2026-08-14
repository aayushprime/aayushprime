---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: []
---

Link other notes either way — both become graph edges:

[[some-other-note]] or [with your own text](some-other-note)

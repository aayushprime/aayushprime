---
title: "TMUX get-over-here"
date: 2026-09-28T21:49:53+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: []
---

![](/notes/tmux-get-over-here/image.png)
```set -s command-alias[100] get-over-here='choose-tree -w "join-pane -v -s %%"'```

This is a quaint little command that will bring a pane(you can select interactively) to this window. You wont need it often but is such a time saver. 

set -s : Server wide option (not just the pane, window)  
command-alias[100]: add it to slot 100, 0-99 are already occupied!  
choose-tree -w: Show all options of windows  
join-tree -v -s: vertical split, s = source from this location  
%%: Place holder for selection output.
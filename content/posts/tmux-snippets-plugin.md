---
title: "Tmux Snippets (take your commands with you everywhere!)"
date: 2025-05-18T17:18:22+0545
draft: false 
searchHidden: false
ShowBreadCrumbs: true 
ShowToc: false
TocOpen: false
cover:
    image: "/posts/tmux-snippets-plugin/{TMUX} Snippets.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---


Wouldn't it be great if you could take your commands with you everywhere?
Sure aliases are great but can you really put a price on the feeling of just getting the command you want when you are in a ssh session?

So here it is. Use tmux snippets. Your terminal remembers your commands for you.

## Installation
Use tmux plugin manager `tpm` to install the plugin. 

```bash
set -g @plugin 'nyuyuyu/tmux-pet'
```


Use `prefix + I` (Uppercase I)  to install the plugin using TPM.

Then set the trigger key by setting the variable `@tmux-new-pane-key`

`set -g @pet-new-pane-key 'C-f'`


Detailed instructions are present in the `nyuyuyu/tmux-pet` repository.

The plugin depends on [pet](github.com/knqyf263/pet) so install it.

Then you can use pet to manage your snippets. 
`pet edit`


And call the tmux plugin to insert your snippets.



# Quickly fetch important info
I wanted to extend this a bit more. So I added another command to put the selected snippet into the clipboard. This way you can quickly fetch your snippet and paste it somewhere. You can save information that needs to be copied over and over like your address, email, profile links, etc.

Similar to the original plugin, install it using `tpm`. 
```bash
set -g @plugin 'aayushprime/tmux-pet'
```

On this one, you can set the trigger key using the variable `@tmux-pet-copy-key`. 
```bash
set -g @pet_new_pane_copy_key 'C-p'
```

Then the selected snippet will be copied to the clipboard! Yay!

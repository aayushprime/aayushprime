---
title: "Making stickman animation in Blender"
date: 2026-08-21T22:38:52+0545
draft: false
searchHidden: false
ShowBreadCrumbs: false
ShowToc: true
TocOpen: true
cover:
    image: "/posts/making-stickman-animation-in-blender/image.png"
    alt: "hello"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
tags:
  - blender
  - animation
---

I made a short animation!

Simplest possible setup. I create a few Grease pencil objects. Add keyframes to them. 
For speech I use [google ai studio](https://aistudio.google.com/generate-speech).  
For sound I use ElevenLabs (haven't run out of the free credits yet.)

Few Gotchas.
- I kept on copying keyframes from one grease pencil layer to another (super confusing); cmd+c and cmd+v only in the intended layer!
- Audio settings are in the property panel. Added a `fadeIn` modifier, and decreased volume but dont know how to add `fadeIn` to the decreased volume yet.
- Render settings has include audio set to None. Make sure to add it otherwise rendering might be wasted.

So the final animation is [here](https://www.youtube.com/@moderndaygenie/shorts)
Hey just like the Chinese Movie thats going viral maybe these will as well (for being bad at animation).
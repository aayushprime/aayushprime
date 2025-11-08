---
title: "Flashing AOSP on my old phone"
date: 2025-11-08T23:20:00+0545
draft: false 
searchHidden: false
ShowBreadCrumbs: true 
ShowToc: false
TocOpen: false
cover:
    image: "/posts/flashing-aosp-on-my-old-phone/custom-rom.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---

A collegue of mine convinced me to play Clash of Clans again, because apparently the waiting time is lesser now. I used to play that game a lot when it had only 10 town halls (now there's 17). So to recover my old account, I rebooted my old phone. Its a Redmi Note 10. It was unbearably slow, some kind of app kept opening, crashing and opening again. Maybe it was because I hadn't used it in a long time. And then I remembered, I could flash AOSP. Almost 10 years ago now, I fixed an old Tablet by flashing a custom rom. It used to be risky business, because you could brick the device. But fortunately I never had such misfortune.

So, how easy is it to flash AOSP on a Redmi Note 10 in 2024? Turns out, very easy.

I went to XDA and looked around for AOSP roms. Then I looked for youtube video (to see what kind of OS it even is). I found this [tutorial](https://www.youtube.com/watch?v=gf34JMkEw38).



And the instructions are pretty clear, and seems no risk at all. Fortunately, I'd already unlocked the bootloader. So, I just had to download a few files. All files downloadable from [here](https://yaaprom.org/device?codename=sunny).

1. recovery (YAAP provides one)
1. the firmware (again my phone was supported by the distribution of YAAP)
1. the rom itself


Then following the exact instructions from the video. These commands. Platform tools zip is easily downloadable from a simple google search.

```bash
 fastboot update --skip-reboot recovery-YAAP-16-Banshee-20251104.zip
 fastboot update --skip-reboot sunny-fw.zip
 fastboot reboot recovery # boot into recovery, wipe data, then sideload from adb
 adb sideload YAAP-16-Banshee-sunny-20251104.zip
 ```

And so I have a new rom. And it feels faster, snappy, and seems all features I need are working. Now to see if something breaks.


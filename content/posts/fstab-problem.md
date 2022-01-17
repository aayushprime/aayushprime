---
title: "Why does my drive mount as read only?"
date: 2022-01-17T20:29:33+05:45
draft: false 
searchHidden: false
ShowBreadCrumbs: false
ShowToc: true
TocOpen: true
cover:
    image: "/posts/fstab-problem/ro.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---
Today I tried to write an `fstab` entry so that my drive would automount on boot.  
It went as smoothly as I had hoped (at first).  
So, I ran `sudo blkid` to find the UUID of the drive I wanted to mount and added the entry `UUID=288C1E6C8C1E3532 /hdrive auto defaults 0 0` following the steps  in this wonderful article. (Some options are different after I realized what I wanted.)  
[Article](https://www.techrepublic.com/article/how-to-properly-automount-a-drive-in-ubuntu-linux/)  
Then I ran `sudo mount -a` to check if the mounts were working properly. But here the problem began. The drive was mounted as readonly. There is no mention of readonly mount in the options.  
In fact I learnt that `defaults` option is shorthand for `rw` (read write) and bunch of other options.
Then I tried various mount options and got sick of rebooting. I tried directly mounting as `ntfs` instead of `auto`. But it didn't work.  
After lot of struggle I figured out the problem. It was because of my Windows Installation!  
I have dual boot setup. And turns out windows stores some files for faster booting (fast boot) in the harddisk thus linux cannot mount the drive cleanly and can only mount it as a read only drive. So to fix this I had to boot to windows and change the fast boot setting. Here's how,  
- Go to control panel
- Power options
- Choose what the power buttons do
- Turn off fastboot  
And after that the same fstab entry worked.
Here's the SO entry where I found the fix: [SO](https://superuser.com/questions/1257638/disk-mounted-as-read-only-but-defined-as-read-write-in-fstab)

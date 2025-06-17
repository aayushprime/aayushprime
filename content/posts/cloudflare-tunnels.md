---
title: "Cloudflare Tunnels: Expose your local server to the internet."
date: 2025-06-17T16:33:48+0545
draft: false 
searchHidden: false
ShowBreadCrumbs: true 
ShowToc: false
TocOpen: false
cover:
    image: "/posts/cloudflare-tunnels/thumbnail.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---

How can you quickly expose your local server to the internet?  
There's ngrok which is as easy as `ngrok http 8000` but it has a free tier and the domain changing every time is a hassle.

So I use Cloudflare tunnels. It is free and you can use your own domain.

Add you domain to Cloudflare and then install the `cloudflared` tool.

Then create a tunnel using the following command:
```bash
cloudflared tunnel create my-local-tunnel
```

This will create a credntial file at `~/.cloudflared/<tunnel-id>.json` and a tunnel named `my-local-tunnel`.

Write this config at `~/.cloudflared/config.yml`
```yaml
tunnel: my-local-tunnel
credentials-file: /<User home>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: game.lamichhaneaayush.com.np
    service: http://localhost:8000
  - hostname: api.lamichhaneaayush.com.np
    service: http://localhost:8080
  - service: http_status:404
  ```

Adjust it according to your needs.
This will ponit `game.lamichhaneaayush.com.np` to `localhost:8000` and `api.lamichhaneaayush.com.np` to `localhost:8080`.

Then run the following commands to create a tunnel and route the DNS.
```bash
cloudflared tunnel route dns my-local-tunnel api.lamichhaneaayush.com.np # point the CNAME for api to this tunnel
cloudflared tunnel route dns my-local-tunnel game.lamichhaneaayush.com.np # point the CNAME for game to this tunnel
```

Finally, run the tunnel.
```bash
cloudflared tunnel run my-local-tunnel # run the tunnel
```


That's it! Better than typing `wss://e78c-27-34-25-179.ngrok-free.app/` right.

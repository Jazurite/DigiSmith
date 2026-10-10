# Own domain for Nexus: serve the Workbox's services on jazurite.com

**Status:** Idea, Jack (2026-10-10 ~21:4x UTC+7 [14:4xZ]): "I want to add my own domain too." ClickUp: **DGS-325** (C.5: Nexus, task id
`14zcebrvcyp`). Blocked while the Mac Workbox is on the company network.

## What changes, what does not

The services behind stay the same (see [nexus-hosting-pattern.md](nexus-hosting-pattern.md), DGS-323). Only the **front door** changes:
today Tailscale Serve at `https://workbox.tail730dcf.ts.net` (tailnet only, no DNS); with an own domain, a public front door plus DNS records
such as `maestro.jazurite.com`, `grafana.jazurite.com`.

## Options for the front door

| Option | Needs |
|---|---|
| Caddy on the Mac + router port forward | A router Jack controls, a real public IP (not CGNAT), dynamic DNS, a login gate |
| Cloudflare tunnel + Cloudflare Access | jazurite.com DNS moved to Cloudflare (copy every record first, email too); login built in |
| A small VPS relay | A server outside; DNS can stay at Namecheap |
| Tailnet-only nice names | Split DNS so a jazurite.com name works only on Jack's devices; nothing public (check) |

## Facts (2026-10-10)

- jazurite.com DNS is at Namecheap (`registrar-servers.com`); jazurite.com points to 162.255.119.186.
- The Mac Workbox is on the **company network**: a port forward is impossible, and any tunnel would publish a command-running service from
  inside the company network around company IT. Blocked until the Mac is on Jack's own network or IT approves.
- A login gate in front of every public service, and DGS-177 hardening, come first.

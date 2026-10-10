# The Workbox as the mothership: one hosting pattern and URL scheme for every service on it

**Status:** Idea, Jack (2026-10-10). ClickUp: **DGS-323** (C.5: Nexus, task id `14zcebrvcyj`). No design yet.

## The model (in plain words)

One web address, many services behind it. **Tailscale Serve is the front door** (a "reverse proxy"): it owns the address
`https://workbox.tail730dcf.ts.net` and its HTTPS certificate, and hands each URL path to a different program running on the Mac. It works
like a front-end router, except each route goes to a separate program instead of a component.

```
https://workbox.tail730dcf.ts.net/                ->  OpenCode maestro server   (127.0.0.1:4198)  live 2026-10-10
https://workbox.tail730dcf.ts.net/power-metrics   ->  power-metrics API          (127.0.0.1:4300)  DGS-324
https://workbox.tail730dcf.ts.net/grafana         ->  Grafana dashboard          (127.0.0.1:3000)  DGS-322
https://workbox.tail730dcf.ts.net/mcp             ->  DigiSmith MCP server       (maybe)           DGS-216
```

- Each service listens only on `127.0.0.1:<port>` (private to the Mac); nothing reaches it except through the front door.
- Adding a service = one routing line, for example `tailscale serve --bg --set-path /power-metrics http://127.0.0.1:4300`.
- Reachable only from Jack's own devices (tailnet), with a login. No DNS, no domain, no router change.

## Design choices to settle

- **Paths where possible, a port for apps that want the root.** Some web apps break under a sub-path: Grafana needs a setting to live under
  `/grafana`; the OpenCode web app expects `/` (that is why it holds the root today). Those can get their own HTTPS port instead
  (for example `https://workbox.tail730dcf.ts.net:8443`).
- A registry of what runs: path or port, local port, start method (LaunchAgent or LaunchDaemon, Jack installs), login, logs, health check.
- Where each service runs: the depot (DGS-265).

## Own domain later

"To the world" uses the same pattern with a different front door: a public reverse proxy (Caddy, or a Cloudflare tunnel) and Jack's own
domain (jazurite.com) instead of the tailnet name. The services behind it do not change. Ticket: DGS-325 (own domain for Nexus).

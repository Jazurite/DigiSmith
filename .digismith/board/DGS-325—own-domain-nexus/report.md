# DGS-325 report: own domain for Nexus (design and plan)

Ticket: DGS-325. Date: 2026-10-13. Status: design and plan approved by Jack; build in progress (this report is updated at the end of the build).

## Summary
`pazurite.com` (Nexus, `/api/v1/...`) and `opencode.pazurite.com` (OpenCode at `/`) become DNS-only Cloudflare records pointing to the Workbox's
tailnet address `100.108.1.19`. Tailscale Serve keeps port 443 and forwards the raw TCP stream to Caddy on `127.0.0.1:8443`; Caddy ends TLS,
gets its certificates by DNS challenge, and also serves `workbox.tail730dcf.ts.net`. Caddy listens on loopback only.

## Findings that shaped the design
- A non-root process on macOS 26.7.1 cannot bind port 443 on a specific address (`100.108.1.19` and `127.0.0.1` both denied); only `0.0.0.0` works,
  and that includes the company LAN. Hence the raw TCP forward from Tailscale Serve.
- Caddy `v2.11.7` with `caddy-dns/cloudflare` `v0.2.4` comes pre-built from Caddy's download service (no Go); the hash is reproducible.
- Throwaway Caddy on `127.0.0.1:18443`: SSE streams, a websocket upgrade works, the LAN and tailnet addresses refuse the connection.
- IPv6: Tailscale Serve's `tcp6` listener did not answer from the Mac on `fd7a:115c:a1e0::753b:114` (timeout), so the Shopify AAAA is removed, not repointed.

## Files
`design.md` (8 points, DNS table, names, version rule), `plan.md` (pins, files, build tasks, Jack's steps J1-J8), `scripts/caddy/test-stream.mjs`.

## Known gaps
Not built yet: `test-config.mjs`, `install.sh`, the Caddyfile in the repo. The staging certificate needs Jack's Cloudflare token. The `ts.net` certificate through
Caddy is untested until the loopback proof. Desktop-app pairing can only be tested at the cut-over (J7).

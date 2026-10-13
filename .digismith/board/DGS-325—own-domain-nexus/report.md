# DGS-325 report: own domain for Nexus (design and plan)

Ticket: DGS-325. Date: 2026-10-13. Status: design and plan approved by Jack (2026-10-13, J7 cut-over included). Build tasks 1-3 done; task 4 waits for Jack's Cloudflare token.

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

## Build done (branch `dgs-325-own-domain-nexus`, not merged)
- `scripts/caddy/`: `Caddyfile`, `caddy-run.sh`, `com.jazurite.digismith.caddy.plist.tmpl`, `install.sh`, `test-config.mjs` (28 checks, written failing first), `test-stream.mjs` (6 checks). All pass.
- `install.sh` ran for real: the depot has the pinned Caddy (SHA-256 matches), `bin/caddy-run`, `caddy/Caddyfile` and the rendered plist. No service loaded, nothing in `~/Library/LaunchAgents`.
- Live OpenCode server through a throwaway Caddy (`127.0.0.1:18445`, no sudo): `/` 200, `/api/event` 401 and a websocket upgrade 401, same as direct.

## Known gaps
The authenticated SSE and websocket proof on the live server is not done: it needs the server password, which no agent reads.  The `ts.net` certificate through
Caddy is untested until the loopback proof. Desktop-app pairing can only be tested at the cut-over (J7).

## Staging certificate (task 4, 2026-10-13)
`scripts/caddy/staging-cert.sh` with `Caddyfile.staging` (Let's Encrypt staging, DNS challenge through Cloudflare, `127.0.0.1:18443`, `skip_install_trust`, temp data dir, no sudo) obtained certificates for `pazurite.com` and `opencode.pazurite.com`. The token was read like `caddy-run.sh` reads it and never printed. Caddy stopped afterwards; no service, no LaunchAgent.

## Review
An independent read-only Claude review found no LAN exposure and no secret leak. Verified findings fixed: `install.sh` ignored the pin only with `DGS_CADDY_TEST=1` now, refuses odd depot paths, downloads next to the target (atomic move, trap on INT and TERM) and prints the J6 commands; `caddy-run.sh` strips a CR and one pair of quotes; the apex "no reverse_proxy" test no longer checks a port that never appears; both tests kill Caddy on exit and the stream test requires a LAN address and counts only a refusal as refused; plan text now matches the code (`@DEPOT@`, real `caddy-run.sh`, port 18444). Left alone: a stricter `.env`-printing regex (low, scripts are clean).

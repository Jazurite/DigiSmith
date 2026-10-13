# DGS-325 report: own domain for Nexus (design and plan)

Ticket: DGS-325. Date: 2026-10-13. Status: built, cut over and first use passed (2026-10-13).

## Summary
`pazurite.com` (Nexus, `/api/v1/...`) and `opencode.pazurite.com` (OpenCode at `/`) become DNS-only Cloudflare records pointing to the Workbox's
tailnet address `100.108.1.19`. Tailscale Serve keeps port 443 and forwards the raw TCP stream to Caddy on `127.0.0.1:8443`; Caddy ends TLS,
gets its certificates by DNS challenge, Caddy listens on loopback only. The `workbox.tail730dcf.ts.net` name is dropped (Jack, 2026-10-13): Caddy's Tailscale certificate getter cannot reach the local `tailscaled` here; after the cut-over (J7) that URL stops working and Jack re-pairs the OpenCode Desktop app with `https://opencode.pazurite.com`. The rollback brings it back.

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
The authenticated SSE and websocket check was done by Jack in J7 (no agent touched the password).  The `ts.net` certificate through
Caddy is untested until the loopback proof. Desktop-app pairing can only be tested at the cut-over (J7).

## Staging certificate (task 4, 2026-10-13)
`scripts/caddy/staging-cert.sh` with `Caddyfile.staging` (Let's Encrypt staging, DNS challenge through Cloudflare, `127.0.0.1:18443`, `skip_install_trust`, temp data dir, no sudo) obtained certificates for `pazurite.com` and `opencode.pazurite.com`. The token was read like `caddy-run.sh` reads it and never printed. Caddy stopped afterwards; no service, no LaunchAgent.

## Loopback proof on the running Caddy (task 5, 2026-10-13)
`opencode.pazurite.com` 200 and `pazurite.com` 404 with real Let's Encrypt certificates (expire 2027-01-11); the OpenCode body hash matches the server direct; `/api/event` and a websocket upgrade give 401, same as direct; `192.168.103.45:8443` and `100.108.1.19:8443` refuse. The `ts.net` name failed and was dropped.

## Cut-over and first use (Jack's steps, 2026-10-13)
- J6 (LaunchAgent) done: Caddy runs on `127.0.0.1:8443` only with real Let's Encrypt certificates for `pazurite.com` and `opencode.pazurite.com`.
- J7 done at about 17:32 UTC+7: Tailscale Serve is a single TCP forward from 443 to `127.0.0.1:8443`; Caddy was restarted with the two-name config. Undo reference: `~/.digismith-depot/caddy/serve-before.json`; the rollback in the plan brings the old `ts.net` mapping back.
- First use passed at about 17:4x: Jack logged in at `https://opencode.pazurite.com` with the server password and streaming works (live events and the terminal view). The Nexus Maestro's checks: 200 with a valid certificate for opencode, 404 on `pazurite.com`, LAN 443 and 8443 refused.
- The `workbox.tail730dcf.ts.net` URL no longer works (accepted); the Desktop app is re-paired with the new name.

## Review
An independent read-only Claude review found no LAN exposure and no secret leak. Verified findings fixed: `install.sh` ignored the pin only with `DGS_CADDY_TEST=1` now, refuses odd depot paths, downloads next to the target (atomic move, trap on INT and TERM) and prints the J6 commands; `caddy-run.sh` strips a CR and one pair of quotes; the apex "no reverse_proxy" test no longer checks a port that never appears; both tests kill Caddy on exit and the stream test requires a LAN address and counts only a refusal as refused; plan text now matches the code (`@DEPOT@`, real `caddy-run.sh`, port 18444). Left alone: a stricter `.env`-printing regex (low, scripts are clean).

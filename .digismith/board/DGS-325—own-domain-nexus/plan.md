# DGS-325 plan: own domain for Nexus (private, tailnet only)

Domain: **`pazurite.com`** (Jack's development domain). `jazurite.com` is not touched.

Design: `design.md` in this folder (read it first). This plan is for a later build order; nothing here is installed yet. Jack approves
this plan at checkpoint 2. Agents never install a service, run `sudo`, touch Cloudflare or Namecheap, change Tailscale Serve or pf, or
touch the live OpenCode server (4198).

## Open questions for Jack (answer before the build)
1. Cloudflare account: which email, and is 2FA on? The token can edit the DNS of `pazurite.com`.
2. IPv6: the plan removes the Shopify AAAA (design.md section 2). Say so if you want the Tailscale IPv6 instead; it needs a proof first.

## Pins
- Caddy `v2.11.7` with `github.com/caddy-dns/cloudflare` `v0.2.4`, darwin/amd64.
- URL: `https://caddyserver.com/api/download?os=darwin&arch=amd64&p=github.com/caddy-dns/cloudflare&version=v2.11.7`
- SHA-256: `f7f2a3cb2b913d4a68eecb8462384306e7248be2719eedcd8b768606b821763f` (same hash on two downloads, 2026-10-13).
- Updating Caddy = a new ticket line: new version, new hash, `caddy validate`, `test-stream.mjs`, restart.

## Files (repo `scripts/caddy/`, following `scripts/opencode-boot`)
| File | Role |
|---|---|
| `Caddyfile` | routes for the three names; no secrets in it |
| `caddy-run.sh` | wrapper: reads only `CLOUDFLARE_API_TOKEN` (and `NEXUS_BASIC_AUTH_HASH` once it exists) from `~/.digismith-depot/.env`, sets `XDG_DATA_HOME`, `exec`s Caddy |
| `com.jazurite.digismith.caddy.plist.tmpl` | LaunchAgent template, `@DEPOT@` replaced by `install.sh` |
| `install.sh` | copies into the depot, downloads and checks the pinned binary; never loads a service; `CADDY_URL`/`CADDY_SHA256` overrides only with `DGS_CADDY_TEST=1` |
| `test-stream.mjs` | exists already (design proof): SSE, websocket, loopback-only |
| `test-config.mjs` | new: `caddy validate` on the Caddyfile and assertion tests (below) |

Depot result: `~/.digismith-depot/bin/caddy`, `bin/caddy-run`, `caddy/Caddyfile`, `caddy/data/`, `caddy/logs/`, and
`~/.digismith-depot/caddy/com.jazurite.digismith.caddy.plist` (generated, for Jack to copy).

### Caddyfile (checked with `caddy validate` on 2026-10-13)
```
{
	admin off
	https_port 8443
	auto_https disable_redirects
	default_bind 127.0.0.1
}

(opencode_routes) {
	reverse_proxy 127.0.0.1:4198
}

opencode.pazurite.com {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
	import opencode_routes
}

pazurite.com {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
	# later, DGS-324: handle /api/v1/power-metrics* { basic_auth { jack {env.NEXUS_BASIC_AUTH_HASH} }  reverse_proxy 127.0.0.1:4300 }
	handle {
		respond "Not found" 404
	}
}

workbox.tail730dcf.ts.net {
	tls {
		get_certificate tailscale
	}
	import opencode_routes
}
```
Route table: `opencode.pazurite.com/` and `workbox.tail730dcf.ts.net/` = OpenCode (4198); `pazurite.com` = Nexus: `/api/v1/...` only (first
`/api/v1/power-metrics`, DGS-324; a breaking change gets `/api/v2/`, old versions stay until Jack drops them), 404 everywhere else, `/` included.

### caddy-run.sh (source: `scripts/caddy/caddy-run.sh`)
```sh
#!/bin/sh
# Starts the depot Caddy for the front door (DGS-325). Gives Caddy only its own variables from .env, never the rest of the file.
set -eu
D="${DIGISMITH_DEPOT:-$HOME/.digismith-depot}"
val() { sed -n "s/^$1=//p" "$D/.env" | head -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }   # tolerates CR and one pair of quotes
CLOUDFLARE_API_TOKEN=$(val CLOUDFLARE_API_TOKEN)
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "caddy-run: CLOUDFLARE_API_TOKEN is not set in the depot env file" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN
NEXUS_BASIC_AUTH_HASH=$(val NEXUS_BASIC_AUTH_HASH)
[ -z "$NEXUS_BASIC_AUTH_HASH" ] || export NEXUS_BASIC_AUTH_HASH
export XDG_DATA_HOME="$D/caddy/data" XDG_CONFIG_HOME="$D/caddy/config"
exec "$D/bin/caddy" run --config "$D/caddy/Caddyfile" --adapter caddyfile
```
The value in `.env` is written without quotes (one pair of quotes and a trailing CR are tolerated). Nothing prints it.

### LaunchAgent plist (source: `scripts/caddy/com.jazurite.digismith.caddy.plist.tmpl`; `install.sh` replaces `@DEPOT@` with the depot path)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jazurite.digismith.caddy</string>
  <key>ProgramArguments</key><array><string>@DEPOT@/bin/caddy-run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>@DEPOT@/caddy/logs/caddy.log</string>
  <key>StandardErrorPath</key><string>@DEPOT@/caddy/logs/caddy.log</string>
</dict>
</plist>
```

## Build tasks (a later order, TDD, pnpm only if any package is touched; these are shell and node scripts with no dependencies)
1. **Config tests first** (`test-config.mjs`, `CADDY_BIN` env). Failing first, then the Caddyfile makes them pass:
   - `caddy validate` passes with a 40-character dummy `CLOUDFLARE_API_TOKEN`.
   - The adapted JSON (`caddy adapt`) has every `listen` address on `127.0.0.1:8443` and no `:80`, and no `0.0.0.0`.
   - It contains exactly the three host names. `opencode.pazurite.com` and the `ts.net` name route to `127.0.0.1:4198`;
     the apex `pazurite.com` has no `reverse_proxy` and answers 404.
   - A throwaway run (`127.0.0.1:18444`, `tls internal`, `skip_install_trust`, backend stub on a high port) checks the route table by SNI:
     `Host: pazurite.com` -> 404 for `/`, `/api/v1/anything` and an unversioned `/api/anything`; `Host: opencode...` -> the stub's 200.
     When DGS-324 adds its route, its test adds: `/api/v1/power-metrics` without credentials -> 401, `/api/power-metrics` -> 404.
   - `caddy-run.sh` and `install.sh` never `echo` or `cat` `.env` (grep for it; `shellcheck` if present).
2. **`install.sh`**: creates the depot folders, copies files, downloads the pinned URL into a temp file, compares SHA-256, only then moves it to
   `bin/caddy` (mode 755); renders the plist to `~/.digismith-depot/caddy/`. Refuses on a hash mismatch. Prints the next commands for Jack.
   Test: run with `DEPOT` pointing at a temp folder (the script takes `DEPOT` from the environment, default `~/.digismith-depot`).
3. **Stream test in the repo**: commit `test-stream.mjs` (exists).
4. **Staging certificate** (needs Jack's token, step J4): a second Caddyfile `Caddyfile.staging` in the repo with `acme_ca
   https://acme-staging-v02.api.letsencrypt.org/directory`, `skip_install_trust`, `https_port 18443`, `default_bind 127.0.0.1`, site
   `pazurite.com`; run with a temp data dir; success = a log line "certificate obtained successfully"; stop Caddy. No sudo, no
   trust-store change.
5. **Loopback proof before the cut-over** (Caddy as a LaunchAgent on `127.0.0.1:8443`, Serve untouched):
   - Both names answer through loopback, for example
     `curl --resolve opencode.pazurite.com:8443:127.0.0.1 https://opencode.pazurite.com:8443/` (OpenCode login), the same for the `ts.net`
     name, and `pazurite.com` (404); the `ts.net` certificate must be issued (the main risk; fallback in design.md section 6).
   - **OpenCode streaming through Caddy (changed by the Nexus Maestro, 2026-10-13):** read-only on the live server: open the event stream (SSE,
     `/api/event`) and a websocket upgrade through Caddy only. No prompt is sent and no session is created. Both need the server's password.
     The unauthenticated part is done (throwaway Caddy, production routing, `tls internal`, `127.0.0.1:18445`): `/` 200 text/html and
     `/api/event` 401 application/json, and a websocket upgrade 401, identical direct and through Caddy. The authenticated stream is not tested by an agent
     (decided by the Nexus Maestro: no agent and no extra script touches the password); it moves to J7, done by Jack.
   - **OpenCode Desktop pairing through Caddy:** the Desktop app runs on Jack's laptop, which cannot reach loopback, so it is tested at the
     cut-over (J7) with the rollback ready. Before that, the agent proves SSE and websocket through Caddy against the throwaway backend (done)
     and the live server (above); that covers the transports the pairing uses.
   - From another Mac interface: `nc -z 192.168.103.45 8443` fails and `nc -z 100.108.1.19 8443` fails (refused).
6. **Report**: `report.md`, `report.html` (`<section id="summary">`), committed with `plan.md` and `design.md` by path.

## Jack's step list (in order; each is Jack's, no agent does these)
**Before anything is installed**
- J1. Answer the two open questions above.
- J2. Cloudflare: create or open the account, add `pazurite.com` on the Free plan. Do **not** change Namecheap yet.
- J3. DNS table (design.md section 2): compare the imported Cloudflare records with the Namecheap Advanced DNS page. Then, in Cloudflare, each
  change exactly (all rows DNS only):
  - apex A `23.227.38.65` -> `100.108.1.19`
  - apex AAAA `2620:127:f00f:5::` -> remove
  - `www` CNAME `shops.myshopify.com` -> remove
  - `opencode` A (none) -> add `100.108.1.19`
  - unchanged: the five Google MX rows with priorities, TXT `google-site-verification=WY-Fd9AvU1K39tDCBVRGQtG8yKP_q1NNO_u0ul0dytc`,
    TXT `sw-domain-hash=0ad030f83960f88d94cdcbc9d1497ac1`.
- J4. Create the API token: My Profile > API Tokens > Create Token > Custom: Zone DNS Edit + Zone Read, Zone Resources: only
  `pazurite.com`. Add `CLOUDFLARE_API_TOKEN=<value>` (no quotes) to `~/.digismith-depot/.env`. Never paste the value in a chat.
- J5. **Nameserver switch**: Namecheap > Domain List > Manage `pazurite.com` > Nameservers > Custom DNS: the two Cloudflare names (no
  DNSSEC, so no DS record to remove). Wait for Cloudflare's "active" email. Check `dig NS`, `dig MX`, `dig A pazurite.com` and
  `dig A opencode.pazurite.com` (`100.108.1.19`), `dig AAAA pazurite.com` and `dig www.pazurite.com` (empty). Send a test mail both ways.
  Rollback: Nameservers back to "Namecheap BasicDNS" (the Namecheap zone, Shopify rows included, was never touched).

**After the build order has put the files in the depot (the build order runs Task 4 staging after J5)**
- J6. Install the LaunchAgent:
  ```
  cp ~/.digismith-depot/caddy/com.jazurite.digismith.caddy.plist ~/Library/LaunchAgents/
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.caddy.plist
  launchctl print gui/$(id -u)/com.jazurite.digismith.caddy | grep -E 'state|pid'
  tail ~/.digismith-depot/caddy/logs/caddy.log
  ```
  Stop: `launchctl bootout gui/$(id -u)/com.jazurite.digismith.caddy`.
  Caddy now listens on `127.0.0.1:8443` only; nothing else changed. The agent runs Task 5 (loopback proof).

**Cut-over: touches the live OpenCode server's front door (C.1). Do it when no worker session needs the server for a minute.**
- J7. Save the current Serve config: `tailscale serve status --json > ~/.digismith-depot/caddy/serve-before.json`.
  Then: `tailscale serve --https=443 off` and `tailscale serve --bg --tcp=443 tcp://127.0.0.1:8443`.
  Check: `tailscale serve status`; from the laptop with Tailscale on, `https://workbox.tail730dcf.ts.net/` and
  `https://opencode.pazurite.com/` both show the OpenCode login, `https://pazurite.com/` answers 404; the Desktop app pairs and a session streams.
  **Streaming check (Jack, replaces the agent proof):** in the browser and in the OpenCode Desktop app, through `https://opencode.pazurite.com/`:
  log in, open a session, and see live events (the event stream) and the terminal view (the websocket). On any failure, run the rollback below.
  **Rollback (exact):** `tailscale serve --tcp=443 off` then `tailscale serve --bg --https=443 http://127.0.0.1:4198`, then
  `tailscale serve status` shows `https://workbox.tail730dcf.ts.net` with `/ proxy http://127.0.0.1:4198` again.
- J8. First use: laptop, Tailscale on: `https://opencode.pazurite.com/` loads with a valid certificate and shows the OpenCode login;
  `https://pazurite.com/` answers 404. Tailscale off: neither connects.

## Not in this plan
Public access (Cloudflare Tunnel, Access, VPS relay), the `/api/v1/power-metrics` route and its `basic_auth` (DGS-324), changes to DGS-323's
scheme, any change to pf.

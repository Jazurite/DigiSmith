# DGS-325 design: own domain for Nexus, private (tailnet only)

Date: 2026-10-13. Checkpoint 1 answers and Jack's later corrections (same day) are folded in. Decided by Jack, not reopened: private for now
(the names point to the Workbox's Tailscale address `100.108.1.19`), DNS moves to Cloudflare Free with Namecheap staying the registrar, Caddy is
the front door with a DNS-challenge certificate. **The domain is `pazurite.com` (Jack's development domain, Namecheap, no DNSSEC).
`jazurite.com` is not touched at all.** The bare `pazurite.com` is Nexus; there is no `nexus.` subdomain. Jack does not use the Shopify
store, so the apex and `www` leave Shopify.

## Summary
`pazurite.com` (the Nexus API) and `opencode.pazurite.com` (the OpenCode server) are Cloudflare DNS-only A records pointing to
`100.108.1.19`, a tailnet address, so only Jack's devices with Tailscale on can reach them. Tailscale Serve keeps owning port 443 on the
tailnet address but forwards the raw TCP stream to Caddy on `127.0.0.1:8443`. Caddy ends TLS, serves `pazurite.com`,
`opencode.pazurite.com` and `workbox.tail730dcf.ts.net`, and routes to services on `127.0.0.1`. Nothing listens on the LAN.

## Facts found (2026-10-13)
- macOS 26.7.1, Intel (x86_64). Not installed: Caddy, Go, xcaddy, brew.
- A non-root process on macOS cannot bind a port below 1024 on a specific address (tested: `100.108.1.19:444` and `127.0.0.1:444` both
  "Permission denied"). It can bind `0.0.0.0:444`, which includes the company LAN. So Caddy cannot own 443 as a normal user without
  listening on the LAN.
- Tailscale 1.102.5. `tailscale serve --tcp=<port> tcp://host:port` forwards raw TCP. Today Serve has `https://workbox.tail730dcf.ts.net`
  with `/` -> `http://127.0.0.1:4198` (OpenCode server).
- The Caddy download service builds `caddy-dns/cloudflare` for darwin/amd64: Caddy `v2.11.7`, cloudflare module `v0.2.4`
  (libdns/cloudflare `v0.2.2`), SHA-256 `f7f2a3cb2b913d4a68eecb8462384306e7248be2719eedcd8b768606b821763f`. The same URL with
  `&version=v2.11.7` gave the same hash twice, so the pin is reproducible. The binary also contains `tls.get_certificate.tailscale`.

## 1. Names (decided by Jack)
| Name | Serves |
|---|---|
| `pazurite.com` (apex) | Nexus: `/api/v1/...` (first: `/api/v1/power-metrics`, DGS-324); `/` answers 404 for now, kept for a Nexus index |
| `opencode.pazurite.com` | the OpenCode server (`127.0.0.1:4198`) at its root `/` |
| `workbox.tail730dcf.ts.net` | keeps `/` = OpenCode (today's address stays working) |

- Both `pazurite.com` names are DNS-only A records to `100.108.1.19`. Each gets its own certificate by DNS challenge; no wildcard is needed.
- This replaces DGS-323's "one name, many paths" example for the own domain. DGS-323 (C.1) still owns the Workbox-wide scheme and is not
  edited here. It fits because OpenCode must live at `/` (it breaks under a sub-path) and Nexus owns its own `/api` space.
- A new service that breaks under a sub-path gets its own `<name>.pazurite.com` record; one that fits goes under `/api/v1/...` on the apex.
- **API version rule:** every Nexus path starts with `/api/v1/`. A breaking change gets `/api/v2/...`; old versions stay until Jack drops
  them. Anything else under `/api/` (for example `/api/power-metrics` without a version) answers 404.

## 2. DNS move checklist (for Jack)
Public records read with `dig` on 2026-10-13, also asked of `dns1.registrar-servers.com` (the apex answers match). Jack does not use the
Shopify store, so the Shopify rows change or go.

| Name | Type | Today | In Cloudflare |
|---|---|---|---|
| `pazurite.com` | NS | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` | replaced at the switch (Cloudflare's two names) |
| `pazurite.com` | A | `23.227.38.65` (Shopify) | **change** to `100.108.1.19`, DNS only |
| `pazurite.com` | AAAA | `2620:127:f00f:5::` (Shopify) | **remove** |
| `www` | CNAME | `shops.myshopify.com` | **remove** |
| `opencode` | A | none | **add** `100.108.1.19`, DNS only |
| `pazurite.com` | MX | 1 `aspmx.l.google.com`; 5 `alt1.aspmx.l.google.com`; 5 `alt2.aspmx.l.google.com`; 10 `aspmx2.googlemail.com`; 10 `aspmx3.googlemail.com` | **unchanged**, with the priorities (email) |
| `pazurite.com` | TXT | `google-site-verification=WY-Fd9AvU1K39tDCBVRGQtG8yKP_q1NNO_u0ul0dytc` | **unchanged** |
| `pazurite.com` | TXT | `sw-domain-hash=0ad030f83960f88d94cdcbc9d1497ac1` | **unchanged** (a Shopify domain hash; Jack's word: keep) |
| `pazurite.com` | CAA | none | none |
| `pazurite.com` | DS, DNSKEY | none | none: no DNSSEC, so the switch needs no DS change |
| `_dmarc` (TXT), DKIM `google`, `default`, `selector1`, `selector2`, `k1`, `mail`, `s1`, `s2` `._domainkey` (TXT), SPF (`v=spf1`) | | none found | none (no SPF today) |
| `mail`, `calendar`, `autodiscover`, `smtp`, `imap`, `ftp`, `cpanel`, `webmail`, `shop`, `store`, `checkout`, `nexus` | any | none | none |

**IPv6 (AAAA): recommendation is to remove it.** Left in place it sends IPv6 clients to Shopify. The alternative, pointing it to the Workbox's
Tailscale IPv6 `fd7a:115c:a1e0::753b:114`, is not proven: Tailscale Serve shows a `tcp6` listener on 443, but a connection from the Mac to
`[fd7a:115c:a1e0::753b:114]:443` timed out after 5 s while the same request over `100.108.1.19` answered 200 (probe of today's Serve,
read-only). Caddy's forward target is `127.0.0.1` too. So IPv4 only: clients reach the name over IPv4, which works for every tailnet device.

`dig` cannot list a zone: the Namecheap Advanced DNS page is the authority, and Jack compares it row by row with this table before the switch
(Namecheap-only items such as URL redirect or email forwarding show only there).

Steps:
1. In Cloudflare add `pazurite.com` (Free plan). Cloudflare scans and imports records; the scan misses names it cannot guess.
2. Compare the imported records with the table and the Namecheap page. MX, both TXT rows stay as they are. Every row is "DNS only" (grey
   cloud).
3. Make the Shopify changes in Cloudflare, each exactly: apex A `23.227.38.65` -> `100.108.1.19`; apex AAAA `2620:127:f00f:5::` -> remove;
   `www` CNAME `shops.myshopify.com` -> remove. Add `opencode` A `100.108.1.19`. (Proxy would break these: Cloudflare cannot reach a
   tailnet address.)
4. In Namecheap: Domain List > Manage > Nameservers > Custom DNS: the two names Cloudflare gave. The domain stays registered and renewed
   at Namecheap.
5. Wait for Cloudflare's "now active" email. Check `dig NS pazurite.com` (Cloudflare names), `dig MX pazurite.com` (the five Google rows),
   `dig A pazurite.com` and `dig A opencode.pazurite.com` (`100.108.1.19`), `dig AAAA pazurite.com` and `dig www.pazurite.com` (empty).
   Send a test mail both ways.

Rollback: at Namecheap set Nameservers back to "Namecheap BasicDNS". The Namecheap zone is untouched, so mail and Shopify resume after the
TTL. (Changes made in Cloudflare do not touch the Namecheap zone.)

## 3. API token
- Cloudflare API token (not the Global Key). Permissions: Zone > DNS > Edit, plus Zone > Zone > Read (listed in the
  `caddy-dns/cloudflare` README as required; the plan re-checks it before Jack creates the token). Zone Resources: Include > Specific
  zone > `pazurite.com` only.
- Variable `CLOUDFLARE_API_TOKEN` in `~/.digismith-depot/.env`, created and stored by Jack. No agent reads or prints the value.
- `caddy validate` accepts a 40-character dummy token and rejects a short one as malformed, so the tests never need the real value.

## 4. Caddy: build, repo, depot, start
- Build: the Caddy download service, no Go needed. URL:
  `https://caddyserver.com/api/download?os=darwin&arch=amd64&p=github.com/caddy-dns/cloudflare&version=v2.11.7`, checked against the
  pinned SHA-256 above. Checked in the scratchpad only; the depot copy belongs to the build order.
- Repo (the factory, DGS-265), following the `scripts/opencode-boot` pattern: `scripts/caddy/` holds `Caddyfile`, `caddy-run.sh`,
  `com.jazurite.digismith.caddy.plist.tmpl`, `install.sh`, `test-config.mjs`, `test-stream.mjs`.
- Depot (runs it): `~/.digismith-depot/bin/caddy`, `bin/caddy-run`, `caddy/Caddyfile`, `caddy/data` (certificates), `caddy/logs/`.
  `install.sh` copies the files in and checks the SHA-256; it never installs a service.
- Start: a LaunchAgent that Jack installs (`~/Library/LaunchAgents/com.jazurite.digismith.caddy.plist`), exact text in plan.md. A
  wrapper reads only `CLOUDFLARE_API_TOKEN` (and later `NEXUS_BASIC_AUTH_HASH`) from `.env`, so Caddy does not receive the other secrets in
  that file.

## 5. Listen on the tailnet only
Options for port 443 given the macOS bind rule:

| Option | Result |
|---|---|
| **A (chosen): Tailscale Serve forwards raw TCP 443 to Caddy on `127.0.0.1:8443`** | no root, no pf change, no LAN listener; Tailscale accepts 443 only from the tailnet |
| B: root LaunchDaemon, Caddy on `100.108.1.19:443` | works, but a root web server |
| C: Caddy on `100.108.1.19:8443`, URL has `:8443` | works, ugly URL |
| D: pf redirect 443 -> 8443 | rejected: no pf change |
| `0.0.0.0:443` as non-root | rejected: listens on the LAN |

Caddy settings: `default_bind 127.0.0.1`, `https_port 8443`, `auto_https disable_redirects` (no port-80 listener), `admin off`,
`skip_install_trust` in tests.
pf: no rule needed for 443. The only listener Caddy opens is loopback; the tailnet 443 listener is Tailscale's.
Caveat: behind the raw forward Caddy sees `127.0.0.1` as the client, so no gate may depend on client IP. Tailscale can add the client
address with PROXY protocol v2 (`--proxy-protocol`) if ever needed.

## 6. Port 443 handover (touches the live OpenCode front door: Jack's step, at the end of the plan)
Today: `tailscale serve` holds `https://workbox.tail730dcf.ts.net` with `/` -> `http://127.0.0.1:4198`. Both cannot own 443.
New: Serve forwards 443 as raw TCP to Caddy; Caddy serves all three names by SNI.
Before: save `tailscale serve status --json`; start Caddy; prove all three names through loopback (plan, Task 5).
Cut-over: `tailscale serve --https=443 off`, then `tailscale serve --bg --tcp=443 tcp://127.0.0.1:8443`.
Rollback: `tailscale serve --tcp=443 off`, then `tailscale serve --bg --https=443 http://127.0.0.1:4198`; check with
`tailscale serve status`. Exact flags are re-read from `tailscale serve --help` in the plan; nothing was run against the live Serve.
Risk: Caddy's `get_certificate tailscale` must reach the Tailscale app's local API as Jack's user. Fallback: `tailscale cert` writes
files, Caddy loads them with `tls <cert> <key>`.

## 7. Login for services without one
Caddy `basic_auth` on each Nexus path whose service has no login (`/api/v1/power-metrics*`), bcrypt hash (`caddy hash-password`) in `.env` as
`NEXUS_BASIC_AUTH_HASH`.
- Tailnet identity headers need Tailscale Serve to end the connection; with a raw TCP forward they do not exist.
- A Caddy Tailscale-auth module is third-party code and one more custom build.
- Never on `opencode.pazurite.com` or the `ts.net` name: OpenCode keeps its own password, and both would use the `Authorization` header.
- The tailnet is the main gate; basic auth covers another tailnet device or a shared laptop.
The first Caddyfile has no such path yet; DGS-324 (power metrics) adds `/api/v1/power-metrics` with this gate.

## 8. Proof
Done in the scratchpad, without Jack:
- `caddy validate`: "Valid configuration" for the candidate Caddyfile.
- `scripts/caddy/test-stream.mjs` (throwaway backend and Caddy on `127.0.0.1:18500` and `:18443`, `skip_install_trust`): SSE arrives as
  three separate chunks over 596 ms; a websocket upgrade returns 101 and a frame; connections to `192.168.103.45:18443` and
  `100.108.1.19:18443` are refused; no `sudo` or trust-store attempt in the log. The test was not mutation-checked on the bind (that needs a
  `0.0.0.0` bind, which is ruled out).
- An earlier throwaway run without `skip_install_trust` tried to install Caddy's local CA root through `sudo`; it failed without a password and
  changed nothing. All later tests use `skip_install_trust`.
Needs Jack's token first: a Let's Encrypt staging certificate (`acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`).
First use for Jack: laptop with Tailscale on, `https://opencode.pazurite.com/` loads with a valid certificate and shows the OpenCode login,
and `https://pazurite.com/` answers 404 (`/api/v1/` is empty until DGS-324); with Tailscale off neither connects.

## Open questions for Jack
1. Cloudflare account: which email owns it, and is 2FA on? The token can edit the DNS of `pazurite.com`.
2. IPv6: the plan removes the Shopify AAAA. Say so if you want the Tailscale IPv6 instead; that needs a proof that Serve answers on it first.

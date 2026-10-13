# DGS-324 plan: Nexus API, power metrics over a URL

Design: `design.md` (same folder), approved with changes at checkpoint 1 (2026-10-13). This plan is **the build, a later order after Jack approves**. Nothing here runs yet.
Rules for the build: pnpm only, TDD (test first, watch it fail, then code), Vitest from the repo root (`pnpm test`; the root config already picks up `scripts/**/*.test.ts`),
no `sudo`, no service, no change to the running Caddy, Tailscale Serve, pf or the OpenCode server (4198). Version `v1` is a placeholder (DGS-452). No AI attribution; commit by named paths.

Layout (source in the repo, runtime in the depot, DGS-265):
```
scripts/nexus-api/
  src/version.ts            API_VERSION = 'v1'   <- the one constant
  src/types.ts              PowerMetrics, CollectorStatus, ApiError (copy of design section 1)
  src/parse-powermetrics.ts text -> the six thermal fields
  src/collector-file.ts     read file, status ok|stale|down (injectable clock)
  src/live.ts               load, memory, top processes, OpenCode RSS (injectable exec, 5 s cache)
  src/reading.ts            build one PowerMetrics
  src/server.ts             node:http on 127.0.0.1:4300
  src/*.test.ts, src/fixtures/
  collector/digismith-nexus-collector.sh              root script (about 8 lines)
  collector/com.jazurite.digismith.nexus-collector.plist
  com.jazurite.digismith.nexus-api.plist.tmpl         LaunchAgent template
  nexus-api.sh              depot wrapper (baked node path)
  install.sh                copies into the depot only
  test-install.test.ts
```
Depot (run copies): `~/.digismith-depot/nexus-api/` (src), `bin/nexus-api`, `nexus/` (fixture, staged root files, rendered plists). Root files (Jack installs): `/usr/local/libexec/digismith-nexus-collector`,
`/Library/LaunchDaemons/com.jazurite.digismith.nexus-collector.plist`, output dir `/var/db/digismith-nexus/`.

## Task 0: the fixture (Jack's step J1, before Task 2)
Jack runs `powermetrics` once and saves the text in the depot (J1 below). Until it exists, Task 2 uses a hand-built fixture from the labels in `workbox-health`, marked `synthetic`; when the real file
exists the same tests run against it (a test reads `~/.digismith-depot/nexus/fixture-powermetrics.txt` when present, skipped when absent). A parse failure on the real file is a stop-and-ask, not a silent fix.

## Task 1: version and types
Test: `types.test.ts` builds one object per case (ok, stale, down) and checks it with `satisfies PowerMetrics`; `version.test.ts` asserts `API_VERSION` matches `/^v\d+$/`. Code: the two files.

## Task 2: parser
Tests first: full text -> six values (`56.77, 45.00, 1831.18, "Nominal", 0, 0` from the 2026-10-10 reading's labels); a missing label -> that field `null`, others kept; empty text -> all `null`;
a `# epoch=` header read as the reading time; a header that is missing or not a number -> reading time `null` (counts as `down`). Code: `parse-powermetrics.ts` with one regex per label; no `eval`, no shell.

## Task 3: collector file status
Tests (fake clock, fake file): age 0 and 59 s -> `ok`; 60 s -> `ok`; 61 s -> `stale`; file missing, unreadable, empty, or without the header -> `down`; future epoch (clock skew up to 5 s) -> `ok` with `ageSeconds` 0.
Mutation check: change 60 to 90 in the code, the 61 s test must fail. Code: `collector-file.ts` (`STALE_AFTER_S = 60`, path from a parameter; default `/var/db/digismith-nexus/powermetrics.txt`).

## Task 4: live readers (no root)
Tests with a fake `exec`: `top -l 2 -n 0 -s 1` output -> `cpuIdlePct`; `sysctl -n vm.loadavg` -> three loads; `memory_pressure` -> `freePct`; `ps -Ao rss,%cpu,comm` -> top 5 by RSS with the path stripped
from the name; `lsof -nP -iTCP:4198 -sTCP:LISTEN -t` then `ps -o rss= -p` -> `rssMb`, or `null` when nothing listens. One reader failing -> its fields `null`, the rest kept. Cache: two calls within 5 s run `exec` once; a call after 5 s
runs it again. One smoke test against the real commands (no sudo): the values are numbers in range. Code: `live.ts`; `execFile` with fixed absolute paths and fixed arguments, never a shell.

## Task 5: reading and server
Tests (throwaway server on `127.0.0.1` port 0, fake collector file): `GET /api/<API_VERSION>/power-metrics` -> 200 JSON matching the type; collector missing -> 200, `collector.status: "down"`, six thermal fields `null`,
live fields filled; stale -> 200, `status: "stale"`, thermal `null`, `ageSeconds` set; every live read fails -> `503 {"error":"no_reading"}` with `Retry-After: 5`; `POST` -> 405; `/api/power-metrics` (no version),
`/api/v0/power-metrics`, `/` and `/api/<version>/other` -> 404; `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`; the server's `address()` is `127.0.0.1` (mutation: bind `0.0.0.0`, the test must fail).
Routes are built from `API_VERSION` only; a test greps `src/` (not tests) for `'v1'` and finds it only in `version.ts`. Entry: `server.ts` reads `PORT` default 4300 (an env var, no secrets), logs one line per start.

## Task 6: Caddy route (change to a file in the repo; the live Caddy is not touched)
Edit `scripts/caddy/Caddyfile`: replace the `# later, DGS-324` comment in the `pazurite.com` block with
```
	handle /api/* {
		basic_auth {
			jack {env.NEXUS_BASIC_AUTH_HASH}
		}
		reverse_proxy 127.0.0.1:4300
	}
```
`handle { respond "Not found" 404 }` stays last. Extend `scripts/caddy/test-config.mjs` (it already adapts, validates and starts a throwaway Caddy on a high loopback port with `skip_install_trust`): set a dummy
`NEXUS_BASIC_AUTH_HASH` from `caddy hash-password` on a dummy password; `caddy validate` passes; the adapted JSON has `basic_auth` only inside the `/api/*` route of `pazurite.com`; with a stub backend:
no credentials 401, wrong 401, right 200 with the stub's body, `/` 404, `/api/` with right credentials reaches the stub, `opencode.pazurite.com` route has no `basic_auth`. Check that the Caddy `basic_auth` handler's `Authorization`
header is not forwarded in a way that breaks the API (read the adapted JSON; note the result in report.md). `caddy-run.sh` already exports `NEXUS_BASIC_AUTH_HASH` when set; add a test that an unset hash does not stop the wrapper
but Caddy then rejects every `/api/*` request (401): safe failure, documented in the runbook. A bcrypt hash contains `$`; the wrapper reads `.env` with `sed`, not the shell, so `$` is safe (test it with a dummy `$2a$14$...` line).

## Task 7: collector files (written, tested, not installed)
`collector/digismith-nexus-collector.sh`:
```sh
#!/bin/sh
# Root LaunchDaemon job (DGS-324): one powermetrics reading to a file the workbox user can read. No input of any kind.
set -eu
PATH=/usr/bin:/bin
DIR=/var/db/digismith-nexus
OUT="$DIR/powermetrics.txt"
TMP="$DIR/.powermetrics.tmp"
umask 022
/usr/bin/powermetrics --samplers smc,thermal -i 1000 -n 1 > "$TMP"
{ echo "# epoch=$(/bin/date +%s)"; cat "$TMP"; } > "$TMP.out"
mv "$TMP.out" "$OUT"
rm -f "$TMP"
```
Failure leaves the old file in place (it then goes stale, never half-written). `collector/com.jazurite.digismith.nexus-collector.plist`: `Label`, `ProgramArguments` = the script path, `StartInterval` 15, `RunAtLoad` true,
`StandardErrorPath` and `StandardOutPath` = `/var/log/digismith-nexus-collector.log`; no `UserName` key (root), no `KeepAlive`, no `Sockets`, no `WatchPaths`.
Tests: `plutil -lint` passes; a test with a copy of the script where `/usr/bin/powermetrics` and `DIR` are replaced by `sed` with a stub and a temp folder: output file has the header, then the stub text, mode 644; a stub that fails
leaves the old file unchanged and no `powermetrics.txt` half-file; the script contains no `$1`/`$@`/`read`/`nc`/`curl`/`eval` (guard test, so the root code cannot grow an input).

## Task 8: install.sh, wrapper and LaunchAgent template (depot copy only)
`install.sh` (like `scripts/caddy/install.sh`): `DEPOT` override; copies `src/` to `$DEPOT/nexus-api/`; writes `$DEPOT/bin/nexus-api` (the wrapper, with the absolute `node` path found by `command -v node` baked in, running
`node --experimental-strip-types $DEPOT/nexus-api/src/server.ts`); renders the LaunchAgent plist to `$DEPOT/nexus/com.jazurite.digismith.nexus-api.plist` (`RunAtLoad`, `KeepAlive`, `ThrottleInterval` 10, logs in
`$DEPOT/nexus/logs/nexus-api.log`); copies the two collector files to `$DEPOT/nexus/root/` (staging, so Jack reviews them before `sudo cp`); copies the Caddyfile through `scripts/caddy/install.sh` (not edited here).
It never uses `sudo`, never writes outside `$DEPOT`, never calls `launchctl`; it prints Jack's steps. `test-install.test.ts` runs it with `DEPOT=<tmp>` and checks files, modes, the baked node path, that nothing outside the temp
folder changed, and that the output names no `.env` value.

## Task 9: runbook and report
`.digismith/board/DGS-324.../runbook.md` (or the repo's runbook location, the build decides): the step list below plus how to read `collector.status`, uninstall, and the DGS-452 version note. `plan.md`, `report.md`, `report.html`
(`<section id="summary">`) committed together by named paths, one ticket on the ticket line.
Proof in the report: test output (counts), the two mutation checks, the throwaway end-to-end run (collector stub file -> API on a high port -> throwaway Caddy with basic auth -> `curl -u`), and what is left for Jack.

## Jack's step list (exact; every step is Jack's, an agent never runs them)
Notation: `$D` = `~/.digismith-depot`. Steps J2 to J6 come after the build is merged and `sh scripts/nexus-api/install.sh` has filled the depot (the build order runs that: it needs no sudo).

**J1. The fixture (before the build; one `sudo`, you type the password):**
```
mkdir -p ~/.digismith-depot/nexus
sudo powermetrics --samplers smc,thermal -i 1000 -n 1 > ~/.digismith-depot/nexus/fixture-powermetrics.txt
head -50 ~/.digismith-depot/nexus/fixture-powermetrics.txt
```
(The `>` is done by your shell, so the file is yours. The `head` is to look at it; no need to send it anywhere.) The agent then reads the file from the depot.

**J2. Review, then install the collector (root):**
```
cat ~/.digismith-depot/nexus/root/digismith-nexus-collector.sh
sudo install -d -o root -g wheel -m 755 /var/db/digismith-nexus /usr/local/libexec
sudo install -o root -g wheel -m 755 ~/.digismith-depot/nexus/root/digismith-nexus-collector.sh /usr/local/libexec/digismith-nexus-collector
sudo install -o root -g wheel -m 644 ~/.digismith-depot/nexus/root/com.jazurite.digismith.nexus-collector.plist /Library/LaunchDaemons/com.jazurite.digismith.nexus-collector.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.jazurite.digismith.nexus-collector.plist
```
Check after 20 s: `ls -l /var/db/digismith-nexus/powermetrics.txt` shows `-rw-r--r-- root wheel`; `head -3 /var/db/digismith-nexus/powermetrics.txt` starts with `# epoch=`; `cat` of it works without sudo.

**J3. Start the API (LaunchAgent, your user):**
```
cp ~/.digismith-depot/nexus/com.jazurite.digismith.nexus-api.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist
curl -s http://127.0.0.1:4300/api/v1/power-metrics | head -c 600
```
You see JSON with `collector.status: "ok"` and temperatures. (Caddy is not in the path yet.)

**J4. The login:** choose a password. `~/.digismith-depot/bin/caddy hash-password` prompts for it twice and prints a hash starting `$2a$`. Add one line to `~/.digismith-depot/.env`:
`NEXUS_BASIC_AUTH_HASH=<the whole hash>` (no quotes needed). Do not paste the hash or the password into a chat. The user name is `jack`.

**J5. Caddy takes the new route** (after the build merged the Caddyfile and the install step copied it to `$D/caddy/Caddyfile`):
```
~/.digismith-depot/bin/caddy validate --config ~/.digismith-depot/caddy/Caddyfile --adapter caddyfile
launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.caddy
```
(`validate` needs `NEXUS_BASIC_AUTH_HASH` and `CLOUDFLARE_API_TOKEN` in the shell; if it complains, skip it: the kickstart log is the check, `tail $D/caddy/logs/caddy.log`.)

**J6. First use (laptop, Tailscale on):**
```
curl -u jack https://pazurite.com/api/v1/power-metrics
```
It asks the password and returns the JSON. In a browser the same URL asks once. From a page: `fetch(url, { headers: { Authorization: 'Basic ' + btoa('jack:<password>') } })` (same-origin or non-browser;
a page on another origin needs the CORS change, not in this ticket). Without credentials: 401. Tailscale off: no connection.
Stale check: `sudo launchctl bootout system/com.jazurite.digismith.nexus-collector`, wait 70 s, the same URL answers 200 with `collector.status: "stale"` and the six thermal fields `null`; then
`sudo launchctl bootstrap system /Library/LaunchDaemons/com.jazurite.digismith.nexus-collector.plist` and it is `ok` again within 20 s.

**Order:** J1 (now) -> build merged and installed into the depot -> J2 -> J3 -> J4 -> J5 -> J6. Caddy is last, so the route never points at a service that is not up.

**Uninstall (each independent):**
```
launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api && rm ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist
sudo launchctl bootout system/com.jazurite.digismith.nexus-collector
sudo rm /Library/LaunchDaemons/com.jazurite.digismith.nexus-collector.plist /usr/local/libexec/digismith-nexus-collector
sudo rm -r /var/db/digismith-nexus
```
Each `rm` is a delete: Jack runs it himself; no agent runs it. The Caddy route comes out by restoring the earlier `Caddyfile` and kickstarting Caddy.

## Risks and what is not verified
- `powermetrics` text on macOS 26.7.1 is unproven until J1; the parser tests re-run on the real file.
- `StartInterval` 15 s with a sample of about 1 s keeps `powermetrics` running about 7% of the time; if the fan or load rises, raise the interval (one number in the plist).
- Tailscale Serve forwards TCP, so Caddy sees `127.0.0.1` as the client: no gate uses the client IP (DGS-325).
- Time: a stopped Mac clock jump makes the reading look stale or in the future; handled by the 5 s skew rule in Task 3, otherwise `stale`.
- A basic-auth login over Tailscale-only HTTPS is a second lock, not the first.

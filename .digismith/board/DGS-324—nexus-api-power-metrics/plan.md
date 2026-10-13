# DGS-324 plan: Nexus API, power metrics over a URL (on demand)

Design: `design.md` rev 2 (same folder). **The build is a later order after Jack approves.** Nothing here runs yet. Build rules: pnpm only, TDD, Vitest from the repo root (`pnpm test`), no `sudo`, no service, no change to the running Caddy,
Tailscale Serve, pf or the OpenCode server (4198). `v1` is a placeholder (DGS-452). No AI attribution; commit by named paths. The plan is written for option (b) (SMC helper, recommended); the tasks that change under option (a) are marked **[a]**.

Layout (repo source; depot runtime, DGS-265):
```
scripts/nexus-api/
  src/version.ts    API_VERSION = 'v1'  (the one constant)
  src/types.ts      PowerMetrics, SourceStatus, ApiError (design section 1)
  src/source.ts     ThermalSource: single-flight, 5 s cache, timeout; wraps a "run" function
  src/smc-source.ts run nexus-smc, parse its output -> thermal fields        [a]: powermetrics-source.ts + parser
  src/live.ts       load, memory, top processes, OpenCode RSS (injectable exec, same cache rule)
  src/reading.ts    build one PowerMetrics
  src/server.ts     node:http on 127.0.0.1:4300
  smc/nexus-smc.c   the helper (from probe-smc.c, trimmed to a fixed key list, prints one JSON line)
  com.jazurite.digismith.nexus-api.plist.tmpl, nexus-api.sh, install.sh, tests next to each file
```
Depot: `~/.digismith-depot/nexus-api/` (src), `bin/nexus-api` (wrapper, absolute `node` path baked in), `bin/nexus-smc` (compiled), `nexus/` (rendered LaunchAgent plist, logs, J1 fixtures).

## Task 0: calibration fixture (Jack's J1, before Task 2)
J1 gives `fixture-powermetrics.txt` and `fixture-smc.txt` taken together. The build compares the numbers: the SMC keys whose values match `powermetrics`' "CPU die temperature", "GPU die temperature" and "Fan" (within about 2 C / 50 rpm) become the helper's keys;
if none match, stop and ask. Until then tests use synthetic fixtures marked `synthetic`.

## Task 1: version and types
Tests: sample objects (ok, failed, timeout) typed with `satisfies PowerMetrics`; `API_VERSION` matches `/^v\d+$/`. Code: the two files.

## Task 2: the helper `nexus-smc` and its parser
Tests first (TypeScript, fake child output): one JSON line with `fans` array, the CPU/GPU temperature keys, no extra text -> six-field thermal object (fanRpm = highest fan); a missing key (`null` in the JSON) -> that field `null`; empty output, bad JSON, a number out of range (below -20 or above 130 C) -> `failed`.
Code: `smc/nexus-smc.c` (about 60 lines: open `AppleSMC`, read a fixed list of keys, print JSON; no arguments, no input; exits 1 when AppleSMC cannot be opened) and `smc-source.ts`. Real-hardware smoke test (no sudo): the helper runs, exits 0 within 1 s, values are numbers in range.
`pressure` from `notifyutil -g com.apple.system.thermalpressurelevel` (0..4 mapped to Nominal, Moderate, Heavy, Trapping, Sleeping; the mapping is checked against XNU's names in the build) and `cpuThermalLevel` from `sysctl -n machdep.xcpm.cpu_thermal_level`; each failing alone -> its field `null`.
**[a]** instead: `powermetrics-source.ts` parses the text (one regex per label, `prochots` included) with `execFile('/usr/bin/sudo', ['-n', '/usr/bin/powermetrics', '--samplers', 'smc,thermal', '-i', '1000', '-n', '1'])`; fixture = J1's file; add the sudoers step.

## Task 3: the on-demand source (single-flight, cache, timeout)
Tests with a fake run function and fake clock: 10 concurrent calls -> the fake runs once; a second call at 4.9 s -> no run, at 5.1 s -> a run; `ageSeconds` follows the clock; a run that never ends -> `timeout` at 3 s and the child killed; a run that rejects -> `failed`;
a failure is cached too (no new run within 5 s); after a failure the next call after 5 s tries again. Mutations: cache 5 s -> 0 (the 4.9 s test fails); timeout 3 s -> 30 s (the timeout test fails). Code: `source.ts`.

## Task 4: live readers (no root)
Fake `exec` tests: `top -l 2 -n 0 -s 1` -> `cpuIdlePct`; `sysctl -n vm.loadavg` -> three loads; `memory_pressure` -> `freePct`; `ps -Ao rss,%cpu,comm` -> top 5 by RSS, path stripped; `lsof -nP -iTCP:4198 -sTCP:LISTEN -t` then `ps -o rss= -p` -> `rssMb` or `null`.
One failing reader -> its fields `null`, the rest kept. Same single-flight and 5 s cache (the `top` read takes about 1 s). One smoke test on the real commands. `execFile` only, fixed absolute paths, no shell.

## Task 5: reading and server
Throwaway server on `127.0.0.1` port 0: 200 matching the type; source `failed` or `timeout` -> 200 with `source.status` set and thermal `null`; every read fails -> `503 {"error":"no_reading"}` with `Retry-After: 5`; `POST` 405; unversioned or other-version path, `/`, unknown name -> 404;
`Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`; `address()` is `127.0.0.1` (mutation: `0.0.0.0` fails the test); 20 parallel requests start at most one helper run; a guard test finds `'v1'` only in `version.ts` under `src/` (not tests). `PORT` env default 4300.

## Task 6: Caddy route (repo file only; the live Caddy is untouched)
Replace the `# later, DGS-324` comment in the `pazurite.com` block of `scripts/caddy/Caddyfile` with the `handle /api/*` block from design section 5; `handle { respond "Not found" 404 }` stays last. Extend `scripts/caddy/test-config.mjs`: dummy `NEXUS_BASIC_AUTH_HASH` from
`caddy hash-password` on a dummy password; validate passes; `basic_auth` only in the `/api/*` route of `pazurite.com`; throwaway Caddy on a high loopback port with `skip_install_trust` and a stub backend: no credentials 401, wrong 401, right 200, `/` 404, `opencode.pazurite.com` has no `basic_auth`.
Unset hash: `caddy-run.sh` still starts, every `/api/*` request is rejected (safe failure). A bcrypt hash contains `$`; `caddy-run.sh` reads `.env` with `sed`, so test it with a dummy `$2a$14$...` line.

## Task 7: install.sh, wrapper, LaunchAgent template (depot only)
`install.sh`: `DEPOT` override; copies `src/` to `$DEPOT/nexus-api/`; compiles `smc/nexus-smc.c` with `cc` to `$DEPOT/bin/nexus-smc` (fails clearly if `cc` is missing); writes `$DEPOT/bin/nexus-api` (baked absolute `node`, runs `node --experimental-strip-types $DEPOT/nexus-api/src/server.ts`);
renders the plist to `$DEPOT/nexus/com.jazurite.digismith.nexus-api.plist` (`RunAtLoad`, `KeepAlive`, `ThrottleInterval` 10, logs in `$DEPOT/nexus/logs/`). Never `sudo`, never outside `$DEPOT`, never `launchctl`; prints Jack's steps. Test: runs with `DEPOT=<tmp>`, checks files and modes, the baked node path, the helper runs, nothing else changed, no `.env` value printed.

## Task 8: runbook and report
Runbook with the step list below, how to read `source.status`, uninstall, and the DGS-452 note. `plan.md`, `report.md`, `report.html` (`<section id="summary">`) committed together by named paths, one ticket on the ticket line. Report proof: test counts, the three mutation checks,
the throwaway end-to-end run (API on a high port -> throwaway Caddy with basic auth -> `curl -u`), and what is left for Jack.

## Jack's step list (every step is Jack's; an agent never runs them)
`$D` = `~/.digismith-depot`.

**J1. Calibration fixture (now; one `sudo`, you type the password once; the build agent then reads the two files from the depot, no chat paste):**
```
mkdir -p ~/.digismith-depot/nexus
cc -o ~/.digismith-depot/nexus/smc-probe ~/Workspace/Jazurite/DigiSmith/.digismith/board/DGS-324—nexus-api-power-metrics/probe-smc.c -framework IOKit
sudo powermetrics --samplers smc,thermal -i 1000 -n 1 > ~/.digismith-depot/nexus/fixture-powermetrics.txt; ~/.digismith-depot/nexus/smc-probe FNum F0Ac F1Ac TC0P TC0E TC0F TC1C TCXC TCGC TG0P TG1P > ~/.digismith-depot/nexus/fixture-smc.txt
```
(After the design branch is merged to main so that `probe-smc.c` is in that folder; until then use the worktree path `.worktrees/dgs-324/...`.) The two readings are seconds apart, so the numbers compare. `cc` only compiles; `probe-smc.c` only reads.

**J2. Start the API** (after the build is merged and `sh scripts/nexus-api/install.sh` filled the depot; no sudo):
```
cp ~/.digismith-depot/nexus/com.jazurite.digismith.nexus-api.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist
curl -s http://127.0.0.1:4300/api/v1/power-metrics | head -c 700
```
JSON with `source.status: "ok"` and temperatures. (Caddy is not in the path yet.)

**J3. The login:** `~/.digismith-depot/bin/caddy hash-password` (asks the password twice, prints a hash starting `$2a$`); add one line to `~/.digismith-depot/.env`: `NEXUS_BASIC_AUTH_HASH=<the whole hash>`. Do not paste the hash or password into a chat. User name: `jack`.

**J4. Caddy takes the new route** (the build's install step copied the Caddyfile to `$D/caddy/Caddyfile`):
```
launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.caddy
tail ~/.digismith-depot/caddy/logs/caddy.log
```

**J5. First use (laptop, Tailscale on):** `curl -u jack https://pazurite.com/api/v1/power-metrics` asks the password and returns the JSON. In a browser the URL asks once. In a page: `fetch(url, { headers: { Authorization: 'Basic ' + btoa('jack:<password>') } })` (same-origin or non-browser; cross-origin needs the CORS change). Without credentials: 401. Tailscale off: no connection.
Refresh test: ten calls in one second leave `source.ageSeconds` under 5.

**Option (a) only, extra step J2a (before J2):**
```
printf 'workbox ALL=(root) NOPASSWD: /usr/bin/powermetrics --samplers smc\\,thermal -i 1000 -n 1\n' > /tmp/digismith-nexus.sudoers
visudo -cf /tmp/digismith-nexus.sudoers
sudo install -o root -g wheel -m 440 /tmp/digismith-nexus.sudoers /etc/sudoers.d/digismith-nexus
sudo -n /usr/bin/powermetrics --samplers smc,thermal -i 1000 -n 1 | head -5
```
**Order:** J1 now -> build merged and installed into the depot -> J2 -> J3 -> J4 -> J5. Caddy last, so the route never points at nothing.

**Uninstall:** `launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api` and `rm ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist` (a delete: Jack runs it); restore the earlier Caddyfile and kickstart Caddy. Option (a): `sudo rm /etc/sudoers.d/digismith-nexus`.

## Risks, not verified
- Which SMC keys equal `powermetrics`' CPU and GPU die numbers: settled by J1, not before. SMC keys are undocumented and model-specific; a macOS update can change them (the helper reports `null`, never a wrong number from a missing key; a test pins the key list).
- Thermal pressure level names: mapping from XNU's level numbers, to be checked in the build.
- Option (b) has no `prochots`.
- Tailscale Serve forwards TCP, so Caddy sees `127.0.0.1` as the client: no gate uses the client IP (DGS-325).
- Basic auth is a second lock behind the tailnet.

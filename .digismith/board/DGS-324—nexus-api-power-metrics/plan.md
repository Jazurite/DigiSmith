# DGS-324 plan: Nexus API, power metrics over a URL (on demand, option (a))

Design: `design.md` (same folder), rev 3. Approved by Jack 2026-10-13: no collector, one fixed `powermetrics` command behind a narrow sudoers rule, broad sampler set. This plan lists the build tasks (done in this order, test first) and **Jack's step list**.
Rules kept: pnpm only, TDD, Vitest from the repo root, no `sudo` in any test or script of the build, no `launchctl`, no sudoers change, no Caddy restart, no change to Tailscale Serve, pf or the OpenCode server (4198). `v1` is a placeholder (DGS-452). No AI attribution; commit by named paths.

## Files
```
scripts/nexus-api/src/  version.ts (API_VERSION, the one constant)   types.ts (PowerMetrics)   command.ts (the fixed command, timeout, sudoers line)
                        parse-powermetrics.ts   source.ts (single-flight, 5 s cache, timeout)   powermetrics-source.ts (sudo -n ... through execFile)
                        live.ts (top, sysctl, memory_pressure, ps, lsof)   reading.ts   server.ts (127.0.0.1:4300)   print-sudoers.ts
                        fixtures/ (two real powermetrics outputs, one synthetic block)   *.test.ts
scripts/nexus-api/      install.sh   nexus-api.sh.tmpl   com.jazurite.digismith.nexus-api.plist.tmpl   test-install.test.ts
scripts/caddy/          Caddyfile (the /api/* route)   caddy-run.sh (no hash)   test-config.mjs (route tests)
```
Depot after `install.sh`: `~/.digismith-depot/nexus-api/src/`, `bin/nexus-api`, `nexus/com.jazurite.digismith.nexus-api.plist`, `nexus/digismith-nexus.sudoers` (staged, not installed), `nexus/logs/`; `scripts/caddy/install.sh` refreshed `caddy/Caddyfile` and `bin/caddy-run` (the running Caddy is untouched until Jack restarts it).

## Tasks (all test first)
1. **Version and types** (`version.test.ts`, `types.test.ts`): `API_VERSION` matches `v<number>`; no other file under `src/` spells a version literal.
2. **The fixed command** (`command.test.ts`): `SUDO_ARGS` is exactly `-n /usr/bin/powermetrics --samplers <list> -i 1000 -n 1`; the list has thermal, smc, cpu_power, gpu_power, tasks, disk, network, battery and not interrupts; the sudoers line equals the command argument by argument; a user name that could add a second rule is refused; `visudo -cf` passes (no root).
3. **Parser** (`parse-powermetrics.test.ts`): real 2026-10-08 sample (typed fields, per-CPU frequency, top tasks, `powermetrics` itself left out, task names with spaces); real J1 default run (battery, network, disk, GPU, AGPM kept raw; interrupt table dropped; lines capped at 300 characters); a missing label gives null for that field; the last sample wins; empty text or `sudo: a password is required` throws.
4. **On-demand source** (`source.test.ts`, `powermetrics-source.test.ts`): ten concurrent callers, one run; reuse for 5 s, new run after; a failure is cached too; timeout after the limit aborts the run; wiring test that the real source uses the 5 s cache.
5. **Live readers** (`live.test.ts`): load, memory, top 5 by RSS, OpenCode RSS; one failing reader nulls only its fields; fixed absolute paths; 5 s cache; smoke test on the real commands.
6. **Reading and server** (`reading.test.ts`, `server.test.ts`): 200 with source ok, failed, timeout; 503 `no_reading` only when everything fails; 405 with `Allow`, 404 for every other path (unversioned, other version, extra segment); `127.0.0.1` bind; no-store.
7. **Caddy route** (`scripts/caddy/test-config.mjs`): `handle /api/* { reverse_proxy 127.0.0.1:4300 { header_up -Authorization } }`, no login (DGS-458); `/api/...` reaches the API stub with no credentials; a client's `Authorization` header never reaches it; `/` 404; opencode unchanged; `caddy-run.sh` passes Caddy no login hash and ignores a leftover one.
8. **install.sh** (`test-install.test.ts`): depot only, no tests or fixtures copied, node path baked in, plist passes `plutil -lint`, staged sudoers rule equals `sudoersLine(user)`, the depot copy serves a request with a fake run, no `sudo`/`launchctl`/`/etc/` in the script.

## Jack's step list (every step is Jack's; an agent never runs them)
**Status 2026-10-13: J1 done, J2 done, J3 done, J4 dropped (no login, DGS-458), J5 done, J6 done: first use passed at about 18:46 UTC+7 (full JSON, `source.status: "ok"`, CPU die 85.03 C, fan 1845.6 rpm, 45.55 W). J1b not run.**

`$D` = `~/.digismith-depot`. J1 is done: `fixture-powermetrics.txt` (sample time 2026-10-13 17:56:14 UTC+7) is in the depot and the parser is tested on it.

**J1b (optional, one sudo; times the final command and records the thermal section, which the default run lacks):**
```
( time sudo powermetrics --samplers tasks,battery,network,disk,cpu_power,gpu_power,gpu_agpm_stats,smc,thermal -i 1000 -n 1 > ~/.digismith-depot/nexus/fixture-final.txt ) 2>&1 | tail -4
wc -c ~/.digismith-depot/nexus/fixture-final.txt
```
Tell the Nexus Maestro the `real` time; the API timeout is 10 s (one number in `command.ts`).

**[done] J2. The sudoers rule (root; the only root step):**
```
cat ~/.digismith-depot/nexus/digismith-nexus.sudoers
visudo -cf ~/.digismith-depot/nexus/digismith-nexus.sudoers
sudo install -o root -g wheel -m 440 ~/.digismith-depot/nexus/digismith-nexus.sudoers /etc/sudoers.d/digismith-nexus
sudo visudo -c
sudo -n /usr/bin/powermetrics --samplers tasks,battery,network,disk,cpu_power,gpu_power,gpu_agpm_stats,smc,thermal -i 1000 -n 1 | head -12
```
`install` copies the file to a root-owned, mode 0440 file: never symlink the depot file into `/etc/sudoers.d` (the depot copy is yours to write, so a link would let any process of yours rewrite a root rule). `cat` must show one line: `workbox ALL=(root) NOPASSWD: /usr/bin/powermetrics --samplers tasks\,battery\,network\,disk\,cpu_power\,gpu_power\,gpu_agpm_stats\,smc\,thermal -i 1000 -n 1`. The last command runs without a password prompt (`sudo -n` fails at once if the rule is wrong).
Check the rule is narrow: `sudo -n /usr/bin/powermetrics -n 1` must fail with `sudo: a password is required`.

**[done] J3. Start the API (LaunchAgent, your user):**
```
cp ~/.digismith-depot/nexus/com.jazurite.digismith.nexus-api.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist
curl -s http://127.0.0.1:4300/api/v1/power-metrics | head -c 800
```
JSON with `source.status: "ok"`, temperatures and `topTasks`. (`source.status: "failed"` means J2 is wrong or missing.)

**J4. (dropped)** No login for now: Jack's decision, the login design is DGS-458. Nothing to do; no hash goes into `.env`.

**[done] J5. Caddy takes the new route** (needs the DGS-325 front door running; the build already copied the new `Caddyfile` and `caddy-run` to the depot; this restart is what loads the `/api/*` route):
```
launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.caddy
tail -5 ~/.digismith-depot/caddy/logs/caddy.log
```
**[done] J6. First use (laptop, Tailscale on):** `curl https://pazurite.com/api/v1/power-metrics` returns the JSON (no password). In a browser the URL just loads. In a page on the same origin: `fetch('https://pazurite.com/api/v1/power-metrics')`
(another origin needs `Access-Control-Allow-Origin`, not in this ticket). `curl https://pazurite.com/` answers 404. Tailscale off: no connection. Refresh test: ten calls in one second leave `source.ageSeconds` under 5.

**Order:** J2 -> J3 -> J5 -> J6. Caddy last, so the route never points at nothing.
**Uninstall (each a delete: Jack runs it himself):** `launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api` and `rm ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist`; `sudo rm /etc/sudoers.d/digismith-nexus`; restore the earlier Caddyfile and kickstart Caddy.

## Risks, not verified
- The wall time of the nine-sampler command (J1b); the real run took 1033 ms of sampling. Thermal pressure level names come from the 2026-10-08 probe (`Nominal`); other levels are unseen.
- `gpu_agpm_stats` and `gpu_power` text is kept raw; the typed fields stay at the four proven samplers.
- Any `workbox` process can run this one read-only command as root (accepted by Jack). A macOS update that changes `powermetrics` arguments breaks the rule and the API together (source `failed`, never a wrong number).
- Tailscale Serve forwards TCP, so Caddy sees `127.0.0.1` as the client: no gate uses the client IP (DGS-325). The tailnet is the only gate; any device on it can read the API (Jack's decision; login design DGS-458).
- I ran `sudo -n true` once during the design (it answered "a password is required" and changed nothing); no sudo ran after that.

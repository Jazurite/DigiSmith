# DGS-324 report: Nexus API, power metrics over a URL

Date: 2026-10-13. Branch `DGS-324__nexus-api-power-metrics`. Not merged; not installed beyond the depot.

## Summary
`GET /api/<version>/power-metrics` reads the Workbox on demand and answers JSON: CPU and GPU die temperature, fan, thermal pressure and levels, prochots, package power, CPU frequency, top tasks, raw battery/network/disk/GPU lines
(root-only, from one fixed `sudo -n powermetrics` command), and load, CPU idle, memory free, top processes and the OpenCode server's memory (no root). One run at a time, a 5 s cache, a 10 s timeout. A failed read gives HTTP 200 with
`source.status` and null root fields; 503 only when nothing can be read. Caddy gates `/api/*` with basic auth. The version prefix is one constant (`v1`, a placeholder for DGS-452).

## What changed
- `scripts/nexus-api/`: the API (TypeScript, Node 24, no dependencies), 10 test files, `install.sh`, wrapper and LaunchAgent templates, three fixtures (two real `powermetrics` outputs, one synthetic block).
- `scripts/caddy/`: the `/api/*` route (`basic_auth`, `header_up -Authorization`), tests, and `caddy-run.sh` gives `/api/*` a random placeholder hash when `NEXUS_BASIC_AUTH_HASH` is unset (an empty hash makes Caddy refuse to start, which would also take OpenCode down).
- Board folder: ticket, design (rev 3), plan with Jack's step list, `probe-smc.c` (a record of the dropped option (b)).

## Decisions on the way (all by Jack, 2026-10-13)
Degraded 200 instead of 503; `/api/*` gated in Caddy; no collector (moved to DGS-455); option (a), a narrow sudoers rule, over an SMC helper (b) because all metrics must be readable; broad sampler set.
Option (b) was measured on this Mac without root (fan, CPU and GPU temperatures, thermal levels all readable; no prochots) and is kept only as a record.

## Proof
- `pnpm exec vitest run scripts/nexus-api`: 10 files, 71 tests pass. Whole repo `pnpm test`: 145 files, 2037 tests pass.
- `CADDY_BIN=~/.digismith-depot/bin/caddy node scripts/caddy/test-config.mjs`: every check passes (401 without, with a wrong password and with a wrong user; 200 with the right login; `/` 404; no login on opencode; the API never sees `Authorization`).
- Mutation checks: cache TTL 5000 -> 0 (the wiring test fails), bind `127.0.0.1` -> `0.0.0.0` (the bind test fails), timeout 10 s -> 100 s (the command test fails), run guard removed (the pile-up test fails).
- `install.sh` ran into the real depot: `nexus-api/src`, `bin/nexus-api`, the LaunchAgent plist and the staged sudoers rule (`visudo -cf` passes). No service loaded, no sudoers file installed, running Caddy untouched.
- The parser is tested on two real `powermetrics` outputs: the 2026-10-08 probe (smc, cpu_power, thermal, tasks) and Jack's J1 default run (2026-10-13 17:56 UTC+7).

## Review (Claude whole-branch review)
No blocking bug. Fixed after it, each with a test that failed first: a timed-out `powermetrics` child is not proven dead, so a second run is refused while the first is alive (no pile-up of root processes); a synchronously throwing run can no longer wedge the cache;
`PORT` is validated; `install.sh` refuses `" $ \` \` in the depot or node path; `caddy-run.sh` has a second, fixed placeholder hash if hashing itself fails (it would otherwise exit and take the OpenCode front door down); the plan says to copy the sudoers file, never symlink it.
Left as is: port 4300 has no login of its own (auth is in Caddy; any local process can read it, at most one root run per 5 s). `package power` parsing is Intel-only (this Mac).
The reviewer could not run the tests from its working directory (the root Vitest config excludes `.worktrees`); they run from the worktree root.

## Not verified
- The wall time of the final nine-sampler command (the J1 run sampled 1033 ms); J1b times it. The API timeout is 10 s.
- The sudoers rule on the live system and the LaunchAgent: Jack's steps J2, J3.
- End to end through Tailscale and Caddy with the real hash: J6.
- Battery, network, disk, GPU and AGPM lines are kept raw on purpose; `Battery: percent_charge: 6821` is not a plain percentage.
- Thermal pressure names other than `Nominal` (unseen).

## Process note
During the design I ran `sudo -n true` once to see whether a password was needed (answer: yes; nothing changed). The order forbids sudo; no sudo ran after that, and no test or script of this ticket calls sudo (a guard test checks `install.sh`).

## Jack's steps
J2 sudoers rule, J3 API LaunchAgent, J4 login hash, J5 Caddy restart, J6 first use; J1b optional. Exact text in `plan.md`.

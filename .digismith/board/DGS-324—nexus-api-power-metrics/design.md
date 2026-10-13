# DGS-324 design: Nexus API, power metrics over a URL (on demand, no collector)

Date: 2026-10-13, rev 2 (Jack at checkpoint 2: no collector; the periodic root job moved to DGS-455). Design only; nothing installed. `v1` is a placeholder (DGS-452).

## Summary
Each `GET /api/<version>/power-metrics` reads the machine on demand. Root-only values come from **one fixed command**, `sudo -n /usr/bin/powermetrics --samplers tasks,battery,network,disk,cpu_power,gpu_power,gpu_agpm_stats,smc,thermal -i 1000 -n 1`,
allowed by **one narrow sudoers rule** that Jack installs (decided by Jack: option (a), because all the machine's metrics must be readable). The API (Node, LaunchAgent, no root, `127.0.0.1:4300`) runs that command through `execFile`
(no shell, fixed arguments, nothing from a request), plus the live non-root readers (`top`, `sysctl`, `memory_pressure`, `ps`, `lsof`). Caddy gates `/api/*` with basic auth. The version prefix is one constant. Option (b) (SMC helper) is dropped; `probe-smc.c` stays only as a record.

## 1. Shape (TypeScript type for the front-end; the same text is `scripts/nexus-api/src/types.ts`)
```ts
export type SourceStatus = 'ok' | 'failed' | 'timeout'

export interface PowerMetrics {
  readAt: string; readAtUtc7: string          // when the API answered (ISO UTC; "2026-10-13 18:02:15")
  source: { status: SourceStatus; readAt: string | null; ageSeconds: number | null }   // the powermetrics read; ageSeconds 0..5 (cache)
  // From powermetrics. All null / empty unless source.status === 'ok'.
  machine: { model: string | null; osBuild: string | null }
  power: { packagePowerW: number | null }
  cpu: { avgFrequencyMhz, avgFrequencyPctOfNominal, packageCStateResidencyPct, coresActivePct, avgCoresActive, gpuActivePct: number | null
         performanceLimitedDueTo: string | null; perCpuFrequencyMhz: number[] }
  thermal: { cpuDieTempC, gpuDieTempC, fanRpm, cpuThermalLevel, gpuThermalLevel, ioThermalLevel, cpuPlimit, gpuPlimit, prochots: number | null; pressure: string | null }
  topTasks: Array<{ name: string; pid: number; cpuMsPerS: number; userPct: number }>      // top 5 by CPU, from the tasks sampler
  extraSections: Array<{ title: string; lines: string[] }>    // battery, network, disk, GPU, AGPM as raw lines (max 12 sections, 40 lines, 300 characters)
  // No root: read by the API (cached 5 s)
  load: { cpuIdlePct: number | null; load1: number | null; load5: number | null; load15: number | null }
  memory: { freePct: number | null }
  opencodeServer: { port: number; rssMb: number | null }
  topProcesses: Array<{ name: string; rssMb: number; cpuPct: number }>                   // top 5 by RSS
}
export interface ApiError { error: 'no_reading'; message: string }                         // HTTP 503
```
(The file has every field written out with its type and a comment.) Source failed or timed out: HTTP 200, `source.status` says which, the powermetrics fields are null or empty, the live fields are filled. `503 no_reading` only when every read fails.

## 2. Sampler set for the one fixed command
`powermetrics -h` on this Mac lists: tasks, battery, network, disk, interrupts, cpu_power, thermal, sfi, gpu_power, gpu_agpm_stats, smc, gpu_dcc_stats, nvme_ssd, io_throttle_ssd. Jack's full default run (J1, 2026-10-13 17:56 UTC+7, `fixture-powermetrics.txt`, 23 KB, 314 lines) and the 2026-10-08 probe (smc, cpu_power, thermal, tasks) are the evidence.
| Sampler | In the command? | Why | Shown as |
|---|---|---|---|
| `smc` | yes | CPU/GPU die temperature, fan, thermal levels, Plimit, prochots (real text, both runs) | `thermal` |
| `thermal` | yes | `Current pressure level` (not in the default set; real text from the 2026-10-08 probe) | `thermal.pressure` |
| `cpu_power` | yes | package power, frequency, C-states, cores active, per-CPU frequency | `power`, `cpu` |
| `tasks` | yes | top tasks by CPU (the biggest block, about 120 lines) | `topTasks` |
| `gpu_power`, `gpu_agpm_stats` | yes | GPU C/P-state residency (`GPU 0 name IntelIG`), AGPM statistics | `extraSections` (raw) |
| `battery`, `network`, `disk` | yes | battery/backlight, packets and bytes per second, disk ops and KBytes per second | `extraSections` (raw) |
| `interrupts` | **no** | per-CPU interrupt table (50 lines of 314), nothing a person reads from a phone | dropped |
| `sfi`, `gpu_dcc_stats`, `nvme_ssd`, `io_throttle_ssd` | no | not in the default set, no sign they print anything useful here; untested, so not in a root command | |
Run time: the sample takes the requested 1000 ms (the real run: 1033.18 ms elapsed) plus start-up; the **timeout is 10 s** (`command.ts`). The wall time of the final nine-sampler command is not measured: J1b (below) times it. Output size: about 20 KB of text; the API limits the buffer to 4 MB.
Unknown labels: only `smc`, `thermal`, `cpu_power` and `tasks` have typed fields (proven on real text). Battery, network, disk, GPU and AGPM stay raw lines until a front-end needs numbers: a wrong guess at a label cannot give a wrong number. `Battery: percent_charge: 6821` on this Mac is not a plain percentage, which is why those lines are not typed.

## 3. Sudoers rule and on-demand reading
`/etc/sudoers.d/digismith-nexus` (`root:wheel`, 0440), one line, generated by `install.sh` from `command.ts` (so the rule and the API's command cannot drift; a test compares them argument by argument; `visudo -cf` passes on a scratch copy, no root needed):
```
workbox ALL=(root) NOPASSWD: /usr/bin/powermetrics --samplers tasks\,battery\,network\,disk\,cpu_power\,gpu_power\,gpu_agpm_stats\,smc\,thermal -i 1000 -n 1
```
Any other `powermetrics` argument list is refused by sudo, so a bug in the API cannot run another mode as root. The risk Jack accepts: any process of the `workbox` user can run this one read-only command as root without a password. It prints system sensors and the task list.
- **One run at a time:** one in-flight promise; concurrent requests share it. **Cache 5 s:** an ok or failed result is reused for 5 s, so a refresh loop starts at most one run per 5 s. `source.ageSeconds` shows the age.
- **Timeout 10 s:** the run is aborted (`execFile` signal), `source.status: "timeout"`. A non-zero exit, `sudo: a password is required` (rule missing), or unparsable output gives `failed`.
- The live readers use the same single-flight and 5 s cache.

## 4. API service
- TypeScript on Node 24, no dependencies (`node:http`), `node --experimental-strip-types`; source `scripts/nexus-api/` (Vitest from the repo root), runtime copy in `~/.digismith-depot/nexus-api/` (DGS-265). No compiled code.
- Bind `127.0.0.1:4300` only; GET only (405 otherwise); other paths 404. Version constant: `src/version.ts` `API_VERSION = 'v1'`, the one place.
- CORS: none now. A page on another origin sending `Authorization` triggers a preflight that basic auth would answer 401; Caddy would have to answer `OPTIONS` before auth. Added when a real page needs it.

## 5. Caddy route
Replace the commented line in the `pazurite.com` block of `scripts/caddy/Caddyfile`:
```
handle /api/* {
	basic_auth {
		jack {env.NEXUS_BASIC_AUTH_HASH}
	}
	reverse_proxy 127.0.0.1:4300 {
		header_up -Authorization
	}
}
```
The API never sees the credentials (`header_up -Authorization`). Without `NEXUS_BASIC_AUTH_HASH` in `.env`, Caddy would refuse to start (empty `basic_auth` hash) and take the OpenCode front door down too; `caddy-run.sh` therefore gives `/api/*` a hash of a random password nobody knows (every login fails) and logs one line.
`handle { respond "Not found" 404 }` stays last. Tests extend `scripts/caddy/test-config.mjs`: validate with a dummy hash; 401 without and with wrong credentials, 200 with right ones through a stub backend, `/` 404, no `basic_auth` on `opencode.pazurite.com`.
Login: bcrypt hash in `~/.digismith-depot/.env` as `NEXUS_BASIC_AUTH_HASH` (DGS-325 section 7); `caddy-run.sh` already passes it.

## 6. Jack's steps (exact text in plan.md)
J1 fixture (done by Jack, 2026-10-13 17:56 UTC+7); J1b optional timing run; J2 the sudoers rule (one `sudo`); J3 the API LaunchAgent; J4 the login hash; J5 Caddy restart; J6 first use. No LaunchDaemon.

## 7. Proof
Without root: parser tests on two real fixtures (2026-10-08 four samplers; J1 default samplers) plus a synthetic network/disk/battery block; reader tests with a fake run (ok, failed, timeout, concurrent calls share one run, 5 s cache, failure cached); API tests; Caddy tests
(401/200, `/` 404, no login on opencode, the API never sees the Authorization header, unset hash does not stop Caddy); install test (depot only, sudoers staged and `visudo -cf` clean). Mutation checks: cache TTL, bind address, timeout. **No test runs `sudo`.**
Needs Jack: the sudoers rule, the LaunchAgent, the end-to-end URL. **First use for Jack:** laptop, Tailscale on: `curl -u jack https://pazurite.com/api/v1/power-metrics` returns JSON with `source.status: "ok"`, `thermal.cpuDieTempC` and `topTasks`; ten refreshes in one second leave `source.ageSeconds` under 5; Tailscale off: no connection.

## 8. Split with C.4
Only the current reading, no history. DGS-322 stores and charts it; **DGS-455 (C.4) now owns the periodic root collector** with the Grafana dashboard and may poll this API or read the same SMC source.

## Decided
Degraded 200 instead of 503 (checkpoint 1); `/api/*` gate; no collector, on demand (checkpoint 2); **option (a), the narrow sudoers rule, and a broad fixed command (Jack, 2026-10-13)**; the SMC helper is dropped.
## Open for Jack
None blocking. J1b (timing the final command) is optional.

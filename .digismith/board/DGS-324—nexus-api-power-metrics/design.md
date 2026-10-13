# DGS-324 design: Nexus API, power metrics over a URL (on demand, no collector)

Date: 2026-10-13, rev 2 (Jack at checkpoint 2: no collector; the periodic root job moved to DGS-455). Design only; nothing installed. `v1` is a placeholder (DGS-452).

## Summary
Each `GET /api/<version>/power-metrics` builds a reading on demand. A Node API (LaunchAgent, no root, `127.0.0.1:4300`) reads the live non-root values itself (`top`, `sysctl`, `memory_pressure`, `ps`, `lsof`)
and the temperature/fan values from a **thermal source**. Recommendation: the source is **no root at all** (option b): a ~60-line C helper, built from source, reads the Mac's SMC as a normal user. Cost: no `prochots`.
Option (a), a narrow sudoers rule for `powermetrics`, is specified below as the alternative. Caddy gates `/api/*` with basic auth. The version prefix is one constant.

## 1. Shape (TypeScript type for the front-end)
```ts
export type SourceStatus = 'ok' | 'failed' | 'timeout'

export interface PowerMetrics {
  readAt: string              // ISO UTC, when the API answered ("2026-10-13T11:02:15Z")
  readAtUtc7: string          // same moment, "2026-10-13 18:02:15"
  source: {                   // the thermal source (SMC helper, or powermetrics under option a)
    kind: 'smc' | 'powermetrics'
    status: SourceStatus      // ok | failed (exit error, bad output) | timeout
    readAt: string | null     // when the source was read (null if never succeeded)
    ageSeconds: number | null // 0..5: a cached read is reused for up to 5 s
  }
  // From the source. All null unless source.status === 'ok'. (No prochots under option b.)
  thermal: {
    cpuDieTempC: number | null
    gpuDieTempC: number | null
    fanRpm: number | null            // the highest of the fans
    pressure: string | null          // "Nominal" | "Moderate" | "Heavy" | "Trapping" | "Sleeping"
    cpuThermalLevel: number | null
    // option (a) only: prochots: number | null
  }
  // No root; read on each request (cached 5 s)
  load: { cpuIdlePct: number | null; load1: number | null; load5: number | null; load15: number | null }
  memory: { freePct: number | null }
  opencodeServer: { port: number; rssMb: number | null }   // null when nothing listens on 4198
  topProcesses: Array<{ name: string; rssMb: number; cpuPct: number }>   // top 5 by RSS
}
export interface ApiError { error: 'no_reading'; message: string }       // HTTP 503
```
- Source failed or timed out: HTTP 200, `source.status` says which, the `thermal` fields are `null`, everything else is filled. `503 no_reading` only when every read fails.
- Example (ok): `cpuDieTempC 56.77, gpuDieTempC 45.0, fanRpm 1831.18, pressure "Nominal", cpuThermalLevel 0` (the 2026-10-10 reading in `health.csv`).
- Verified: `health.csv` label names and units. Times: UTC ISO and UTC+7.

## 2. Thermal source: evaluation
Facts measured today (this Mac: `MacBookPro16,1`, Intel, macOS 26.7.1, no sudo, read-only; probe source kept as `probe-smc.c` in this folder):
| Value | Without root | Evidence |
|---|---|---|
| Fan speed | yes, SMC key `F0Ac` (and `F1Ac`; `FNum` = 2) | 1846.87 and 1693.31 rpm; `health.csv` had 1831.18 rpm |
| CPU temperatures | yes, SMC `TC0P` 55.44 C, `TCXC` 68.20 C (PECI), `TC0E` 66.88, `TC0F` 69.23, `TC1C` 51.00 | read as the normal user in 8 ms |
| GPU temperatures | yes, SMC `TG0P` 51.06, `TG1P` 46.38, `TCGC` 56.00; the AMD GPU's own `Temperature(C)` in `ioreg` = 56 to 57 | `health.csv` GPU die: 45.00 |
| Thermal pressure | yes: `notifyutil -g com.apple.system.thermalpressurelevel` -> `0` (Nominal) | |
| CPU thermal level | yes: `sysctl machdep.xcpm.cpu_thermal_level` -> `0`; also `gpu_thermal_level`, `io_thermal_level` | `health.csv`: CPU level 0 |
| CPU speed limit | yes: `pmset -g therm` -> `CPU_Speed_Limit = 100`, scheduler limit, CPUs available | |
| **Prochots** | **no non-root source found** (the `powermetrics` thermal sampler prints the count) | |
**Not verified:** which SMC key `powermetrics` calls "CPU die" and "GPU die" (my candidates are `TC0P`/`TCXC` and `TG1P`/`TG0P`/`TCGC`); the `powermetrics` text on macOS 26 (never run: no sudo). J1 settles both:
Jack runs `powermetrics` once and the SMC probe right after (J1 below); the build picks the keys whose values match the `powermetrics` numbers. Apple does not document SMC keys; they can differ by model and change with macOS.
Why a helper is needed: Node cannot call IOKit without a native add-on, so a tiny C program (`cc` from the Command Line Tools, present) built from source and run with `execFile` is the smallest piece; no third-party binary.

| | (b) SMC helper, no root (recommended) | (a) sudoers rule for `powermetrics` |
|---|---|---|
| Root | none anywhere; nothing for Jack to `sudo` | one file in `/etc/sudoers.d/`; every process of the `workbox` user can run that one read-only command as root |
| Fields | all except `prochots`; adds nothing | all, including `prochots`, exactly as `workbox-health` |
| Speed | 8 ms | about 1 s per run (`-i 1000`) |
| Risk | undocumented keys; helper must be rebuilt if it stops working | `sudo -n` fails if the rule is wrong; nothing else |
| Maintenance | key list in one file with a test | none |
**Recommendation: (b).** It removes the root part completely, which was the hardest part of this ticket, and 8 ms means no run-stacking problem. Jack loses `prochots` only. If Jack wants it later, add (a) as a second `source`
(`kind: 'powermetrics'`) in a later ticket; the type already allows it.

### Option (a), if Jack chooses it
`/etc/sudoers.d/digismith-nexus` (`root:wheel`, mode 0440), one line (the comma is escaped as sudoers requires; parsed OK by `visudo -cf` today on a scratch copy, no root needed):
```
workbox ALL=(root) NOPASSWD: /usr/bin/powermetrics --samplers smc\,thermal -i 1000 -n 1
```
Install: write to a scratch file, `visudo -cf <file>`, then `sudo install -o root -g wheel -m 440 <file> /etc/sudoers.d/digismith-nexus`. The API runs
`execFile('/usr/bin/sudo', ['-n', '/usr/bin/powermetrics', '--samplers', 'smc,thermal', '-i', '1000', '-n', '1'])`: fixed arguments, no shell, no input from the request; `sudo -n` never asks for a password and fails at once if the rule is missing.
A different argument list is refused by sudo, so a bug in the API cannot run another `powermetrics` mode as root.

## 3. On-demand reading (both options)
- **One run at a time:** one in-flight promise; concurrent requests await the same run.
- **Cache 5 s:** a result (ok or failed) is reused for 5 s, so a refresh loop cannot start more than one read per 5 s. `source.ageSeconds` shows the age. The live readers (`top` takes about 1 s) use the same 5 s cache and single-flight.
- **Timeout:** 3 s for the SMC helper (5 s under (a)); the child is killed; `source.status: "timeout"`, thermal fields `null`.
- **Failure:** non-zero exit, unparsable output, helper missing -> `status: "failed"`, thermal `null`, HTTP 200. A key the Mac does not have -> that one field `null`, status stays `ok`.
- Concurrency of the HTTP server itself: `node:http`, no limits needed beyond the above (every request is answered from the cache within 5 s).

## 4. API service
- TypeScript on Node 24, no dependencies (`node:http`), `node --experimental-strip-types`; source `scripts/nexus-api/` (Vitest from the repo root), runtime copy in `~/.digismith-depot/nexus-api/` (DGS-265). The helper's C source is in `scripts/nexus-api/smc/` and built by `install.sh` into `$DEPOT/bin/nexus-smc` (compile only: `cc` from the Command Line Tools, no sudo).
- Bind `127.0.0.1:4300` only; GET only (405 otherwise); other paths 404. Version constant: `src/version.ts` `API_VERSION = 'v1'`, the one place.
- CORS: none now. A page on another origin sending `Authorization` triggers a preflight that basic auth would answer 401; Caddy would have to answer `OPTIONS` before auth. Added when a real page needs it.

## 5. Caddy route
Replace the commented line in the `pazurite.com` block of `scripts/caddy/Caddyfile`:
```
handle /api/* {
	basic_auth {
		jack {env.NEXUS_BASIC_AUTH_HASH}
	}
	reverse_proxy 127.0.0.1:4300
}
```
`handle { respond "Not found" 404 }` stays last. Tests extend `scripts/caddy/test-config.mjs`: validate with a dummy hash; 401 without and with wrong credentials, 200 with right ones through a stub backend, `/` 404, no `basic_auth` on `opencode.pazurite.com`.
Login: bcrypt hash in `~/.digismith-depot/.env` as `NEXUS_BASIC_AUTH_HASH` (DGS-325 section 7); `caddy-run.sh` already passes it.

## 6. Jack's steps (exact text in plan.md)
J1 the calibration fixture (one `sudo`, now); then after the build: J2 start the API LaunchAgent; J3 hash into `.env`; J4 Caddy kickstart; J5 first use. Under (a) one more step: the sudoers rule. No LaunchDaemon.

## 7. Proof
Without root or Jack: parser and SMC-output tests on fixtures; reader tests with a fake child (ok, failed, timeout, concurrent calls share one run, cache 5 s, a failure is cached too); API tests; the helper against the real SMC (values in range, missing key -> null);
Caddy tests; mutation checks on the 5 s cache, the bind address and the timeout. Needs Jack: J1 (key calibration), the LaunchAgent, the end-to-end URL.
**First use for Jack:** laptop, Tailscale on: `curl -u jack https://pazurite.com/api/v1/power-metrics` returns JSON with `source.status: "ok"`; refresh ten times in one second: `source.ageSeconds` stays under 5 and `ps` shows one helper at a time; Tailscale off: no connection.

## 8. Split with C.4
Only the current reading, no history. DGS-322 stores and charts it; **DGS-455 (C.4) now owns the periodic root collector** with the Grafana dashboard and may poll this API or read the same SMC source.

## Decided
Degraded 200 instead of 503 (checkpoint 1); `/api/*` gate; fixture written by Jack into the depot; **no collector, on demand (checkpoint 2)**.
## Open for Jack
1. Option (b) without `prochots` (recommended) or option (a) with it?

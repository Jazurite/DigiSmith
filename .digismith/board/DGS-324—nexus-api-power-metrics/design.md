# DGS-324 design: Nexus API, power metrics over a URL

Date: 2026-10-13. Design only; nothing installed, no sudo run. Version segment is a placeholder: `v1` stands for whatever DGS-452 decides.

## Summary
A root LaunchDaemon (Jack installs) runs `powermetrics` every 15 s and writes the raw text to one root-owned file. A Node API (LaunchAgent, no root, `127.0.0.1:4300`)
reads that file, adds the live non-root readings (`top`, `sysctl`, `memory_pressure`, `ps`, `lsof`), and answers `GET /api/<version>/power-metrics` as JSON. Caddy
gates `/api/*` with basic auth and proxies to it. The version prefix is one constant in the API source.

## 1. Fields and shape
Reuse from `workbox-health` (DGS-319): the same `powermetrics --samplers smc,thermal -i 1000 -n 1` call and the same text labels
(`CPU die temperature`, `GPU die temperature`, `Fan`, `Current pressure level`, `CPU Thermal level`, `Number of prochots`), `top -l 2` idle, `vm.loadavg`,
`memory_pressure` free percentage, `ps` top by RSS, RSS of the listener on 4198. CSV columns map one to one (names below add units).

The shape, as a TypeScript type Jack's front-end can copy (`src/types.ts` in the API; the tests check a real response against it):

```ts
export type CollectorStatus = 'ok' | 'stale' | 'down'

export interface PowerMetrics {
  readAt: string              // ISO UTC, when the API read the live parts ("2026-10-13T11:02:15Z")
  readAtUtc7: string          // same moment, "2026-10-13 18:02:15"
  collector: {
    status: CollectorStatus   // ok: reading <= 60 s old; stale: older; down: no readable file
    readAt: string | null     // the collector's reading time (null when down)
    ageSeconds: number | null // now minus collector.readAt (null when down)
  }
  // Root-only: all six are null unless collector.status === 'ok'
  thermal: {
    cpuDieTempC: number | null
    gpuDieTempC: number | null
    fanRpm: number | null
    pressure: string | null          // "Nominal" | "Moderate" | "Heavy" | ... (text from powermetrics)
    cpuThermalLevel: number | null
    prochots: number | null
  }
  // No root: read by the API on each request (cached 5 s)
  load: { cpuIdlePct: number | null; load1: number | null; load5: number | null; load15: number | null }
  memory: { freePct: number | null }
  opencodeServer: { port: number; rssMb: number | null }   // null when nothing listens on 4198
  topProcesses: Array<{ name: string; rssMb: number; cpuPct: number }>  // top 5 by RSS
}

export interface ApiError { error: 'no_reading'; message: string }   // HTTP 503
```
Example (collector ok): `thermal: { cpuDieTempC: 56.77, gpuDieTempC: 45.0, fanRpm: 1831.18, pressure: "Nominal", cpuThermalLevel: 0, prochots: 0 }`,
`load: { cpuIdlePct: 92.38, load1: 2.87, load5: 3.43, load15: 3.43 }`, `memory: { freePct: 77 }`, `opencodeServer: { port: 4198, rssMb: 1341 }`.
Collector down: HTTP 200, `collector: { status: "down", readAt: null, ageSeconds: null }`, all six `thermal` fields null, everything else filled.
Stale (reading older than 60 s): HTTP 200, `status: "stale"`, `ageSeconds` set, the six thermal fields null (an old temperature is not shown as current).
- Verified: label names and units against the one full reading in `health.csv` (2026-10-10 20:39: 56.77 C, 45.00 C, 1831.18 rpm, Nominal, 0, 0).
- **Not verified** (cannot run `powermetrics` without sudo): the exact text on macOS 26.7.1 today, and the plist (`-f plist`) key names. Decided: the
  collector saves text (the format the labels were proven on); the build's first task has Jack run the collector command once into a file in the depot, which is the parser's fixture (no chat paste).

## 2. Collector (root)
- **Cadence: launchd `StartInterval` 15 s**, one-shot script (no sleep loop in root code). Stale limit for the API: 60 s (four missed runs). On demand is rejected: it needs a
  channel into root.
- **Output:** `/var/db/digismith-nexus/powermetrics.txt`, directory `root:wheel 0755`, file `root:wheel 0644` (the workbox user reads it, only root writes it), written to a temp name then `mv` (atomic: the API never reads half a file).
  First line `# epoch=<seconds>`, then the raw `powermetrics` output. Raw text means the root code does no parsing; the API parses and has tests.
- **Root code (about 8 lines)**, installed root-owned at `/usr/local/libexec/digismith-nexus-collector` (not in the depot: a root job must never run a file the user can edit):
  `powermetrics --samplers smc,thermal -i 1000 -n 1 > tmp; { echo "# epoch=$(date +%s)"; cat tmp; } > out.tmp; mv out.tmp powermetrics.txt`. Fixed absolute commands, no arguments,
  no environment use, no reading of any user-writable file.
- **Why no network input reaches root:** the daemon has no listener (no port, no socket, no stdin); launchd starts it on a timer; its only inputs are the kernel's sensors.
  The API (non-root) can only read the output file. The only way to influence root is to edit the root-owned script or plist, which needs root already.

## 3. API service
- **TypeScript on Node 24 (already on the Workbox), no dependencies**: `node:http`, run with `node --experimental-strip-types` (as `scripts/` already does).
  pnpm workspace package `scripts/nexus-api/` (source in repo); Vitest tests; runtime copy in `~/.digismith-depot/nexus-api/` (DGS-265 factory pattern, `install.sh` copies, never starts).
- **Bind `127.0.0.1:4300` only**; any method other than GET answers 405; any other path 404.
- **Version constant:** `src/version.ts`: `export const API_VERSION = 'v1'` (placeholder, DGS-452); routes are built from it, tests import it. The Caddy route does **not** name the
  version: it gates and forwards `/api/*` (see 4), so changing the version touches one file.
- **Errors (Jack, 2026-10-13):** collector down or stale is **not** an error: HTTP 200 with the `collector` block and the six root-only fields null (see the type). `503 {"error":"no_reading"}` with
  `Retry-After: 5` only when the API cannot build any reading (all live reads fail). The stale limit is 60 s, the cadence 15 s. Other: 404 unknown path, 405 non-GET.
- **CORS:** none now (same-origin or non-browser callers need none). A page on another origin sending `Authorization` triggers a preflight that basic auth would answer 401, so if that is
  ever needed Caddy answers `OPTIONS` before auth with an origin allow-list. Say so and add it when a real page needs it.

## 4. Caddy route
Replace the commented line in the `pazurite.com` block of `scripts/caddy/Caddyfile` with:
```
handle /api/* {
	basic_auth { jack {env.NEXUS_BASIC_AUTH_HASH} }
	reverse_proxy 127.0.0.1:4300
}
```
Rest of the apex stays `handle { respond "Not found" 404 }`. The API itself answers 404 for an unversioned or unknown `/api/...` path. The brief's example named `/api/v1/power-metrics*`;
I propose `/api/*` so the version lives in one place; the auth gate covers every later Nexus API path, which is DGS-325's rule 7 anyway.
Tests (extend `scripts/caddy/test-config.mjs`): adapt/validate with dummy `NEXUS_BASIC_AUTH_HASH` (from `caddy hash-password` on a dummy password); throwaway Caddy on `127.0.0.1` high port + stub backend:
no credentials → 401; wrong → 401; right → 200 from the stub; `/` → 404; `opencode.pazurite.com` has no `basic_auth`. `wrapper caddy-run.sh` already passes `NEXUS_BASIC_AUTH_HASH` (checked in the plan).
Login: Caddy `basic_auth`, bcrypt in `~/.digismith-depot/.env` as `NEXUS_BASIC_AUTH_HASH` (DGS-325 section 7). A browser asks once and keeps it; `fetch()` sends `Authorization: Basic` itself.

## 5. Jack's steps (exact text in plan.md)
1. Pick a password, make the hash with `caddy hash-password`, add `NEXUS_BASIC_AUTH_HASH=...` to `~/.digismith-depot/.env` (Jack types it; no agent reads it). Escape `$` if the wrapper needs it (plan checks).
2. `sudo` install the collector: copy script to `/usr/local/libexec/`, plist to `/Library/LaunchDaemons/com.jazurite.digismith.nexus-collector.plist` (`root:wheel 0644`), `sudo launchctl bootstrap system ...`. Check file after 20 s.
3. Install the API LaunchAgent (`~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist`, `launchctl bootstrap gui/$(id -u) ...`).
4. Restart Caddy with the new Caddyfile (`launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.caddy`).
Uninstall steps for each go in the plan. Order: 2, 3, then 1+4, so the route never points at nothing.

## 6. Proof
Without root or Jack: parser tests on fixtures (text from `health.csv`-proven labels, plus a truncated and an empty file); API tests with a fake collector file (ok, missing, stale at 59 s and 61 s, down, 503 when every live read fails,
wrong method, wrong path, unversioned path, bind address check); live parts against the real `top`, `sysctl`, `memory_pressure`, `ps`; Caddy tests above; a throwaway API on a high port. Mutation checks on stale threshold and bind.
Needs Jack: collector really writes the file under launchd, and the end-to-end URL.
**First use for Jack:** laptop, Tailscale on: `curl -u jack https://pazurite.com/api/v1/power-metrics` (or `fetch` with the header) returns JSON with `ageSeconds` under 20; stop the collector
(`sudo launchctl bootout system/...`), after 60 s the same URL still answers 200 but `collector.status` is `stale` and the six thermal fields are null; Tailscale off: no connection.

## 7. Split with C.4
This API gives only the current reading, no history. DGS-322 stores and charts and may poll it (every 15 s matches the collector) with the same basic-auth login or, on the Workbox itself, `127.0.0.1:4300` directly.
No time-series code here.

## Decided at checkpoint 1
Degraded 200 instead of 503, 15 s / 60 s, `/api/*` gate in Caddy, fixture written by Jack into the depot, root script root-owned in `/usr/local/libexec`.

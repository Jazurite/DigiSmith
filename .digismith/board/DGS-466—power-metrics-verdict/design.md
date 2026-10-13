# DGS-466 design: power metrics, a plain-language verdict

Date: 2026-10-13. Approved by the Nexus Maestro at checkpoint 1. Extends DGS-324 (`GET /api/<version>/power-metrics`).

## Summary
The response starts with `verdict`: `status`, one-sentence `summary`, and `reasons` (one plain sentence per signal that is not fine, empty when ok). A pure function, `computeVerdict(reading)` in `scripts/nexus-api/src/verdict.ts`, builds it from fields the API already reads. No new read, no new dependency.

## Type (copy into the front-end; same text as `types.ts`)
```ts
export type VerdictStatus = 'ok' | 'busy' | 'hot' | 'throttling' | 'unknown'
export interface Verdict { status: VerdictStatus; summary: string; reasons: string[] }
// PowerMetrics = { verdict: Verdict, readAt, ... } (verdict first)
```

## Status rules (the worst one wins: throttling > hot > busy > unknown > ok)
| Status | Signal | Limit | Source of the limit |
|---|---|---|---|
| throttling | `thermal.pressure` | not "Nominal" (null is not judged) | powermetrics; Nominal in every fixture |
| throttling | `thermal.cpuPlimit` or `gpuPlimit` | above 0 | 0 in every fixture |
| throttling | `thermal.prochots` | above 0 | 0 in every reading |
| throttling | `cpu.performanceLimitedDueTo` | text names thermal, power or prochot (`/thermal\|power\|prochot\|plimit\|PL[12](?!\d)/i`) | see below |
| hot | CPU or GPU die temperature | 90 C or more | Intel's maximum for the i7-9750H is 100 C; today's burst peak was 85 C, called normal |
| hot | `thermal.fanRpm` | 4503 rpm or more | 85 % of this Mac's real fan 0 maximum, 5297.4 rpm (see below) |
| busy | `memory.freePct` | under 15 % | ticket proposal; readings were 73 to 77 % |
| busy | `load.cpuIdlePct` | under 20 % | readings were 82 to 93 % idle even at load average 31 |
| unknown | `source.status` | `failed` or `timeout` | the heat and throttling fields are then empty |

- **Load average is ignored.** Many short agent jobs push it to 31 while the CPU is 85 % idle.
- **`cpuThermalLevel` is not judged.** 35 was seen at 85 C with pressure Nominal, prochots 0 and no power limit: nothing was slowed. It stays in the raw data.
- **`performanceLimitedDueTo`:** the only value in the fixtures (real 2026-10-08 and 2026-10-13 runs, and today's readings) is `CPU LIMIT MAX_TURBO_LIMIT`. It is the chip's normal top speed and appears in healthy readings, so it is ok. Test: `MAX_TURBO_LIMIT` gives ok.
- **Fan maximum, measured not guessed:** the SMC keys read once without root with `probe-smc.c` (DGS-324 board folder), 2026-10-13: `F0Mx` 5297.40 rpm, `F1Mx` 4905.00, `F0Mn` 1836.00, `F1Mn` 1700.00, `FNum` 2. powermetrics' `Fan:` value (1843.65 at the time) matches fan 0 (`F0Ac` 1839.06), so the limit is 85 % of `F0Mx`: 4503 rpm. Fan 1 tops out lower (4905); the API shows one fan value.
- **Unknown rule:** the live fields (CPU idle, memory) are still judged. A worse status (busy) wins over unknown, and the sensor sentence is added to the reasons. With nothing else wrong the status is `unknown`, never `ok`, because heat and throttling could not be checked.
- Limits are inclusive for temperature and fan (90 C is hot), strict for memory and idle (exactly 15 % free is ok). Tests cover each edge.

## Sentences
Summary: ok "The Mac is fine: cool, not throttling, plenty of memory." busy "The Mac is working hard but not in trouble." hot "The Mac is running hot." throttling "The Mac is slowing itself down to stay safe." unknown "The heat sensors can't be read right now, so this is not certain."

Reasons: "The system reports thermal pressure: Heavy." / "The chip is being held back by a power limit." / "The chip has cut its speed to cool down (3 times)." / "The chip reports a limit: <text>." / "The CPU is at 91 C; the chip protects itself at 100 C." (same for the GPU) / "The fan is at 5200 rpm, close to its maximum." / "Only 12 % of memory is free." / "The CPU is only 15 % idle." / "The heat and throttling sensors could not be read." No "I" in API text.

## Proof
Vitest: one test per status, per limit edge, `MAX_TURBO_LIMIT` ok, `cpuThermalLevel` 35 ok, unknown (failed and timeout), unknown plus busy, `buildReading` puts `verdict` first, and the HTTP body starts with `{"verdict":`. `install.sh` into the depot only. **Jack's step:** one `launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api`, then `curl https://pazurite.com/api/v1/power-metrics` starts with `verdict`.

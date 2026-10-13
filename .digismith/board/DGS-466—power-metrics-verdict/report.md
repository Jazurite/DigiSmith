# DGS-466 report: power metrics verdict

Date: 2026-10-13. Branch `dgs-466` (worktree `.worktrees/dgs-466`). Not merged. Depot copy installed; the running API is not restarted.

## Summary
`GET /api/<version>/power-metrics` now starts with `verdict`: `status` (ok, busy, hot, throttling, unknown; the worst wins), a one-sentence `summary` and `reasons`. It is computed by the pure function `computeVerdict` from fields the API already reads. Limits: 90 C hot (CPU, GPU), fan 4503 rpm (85 % of the measured 5297 rpm maximum), memory under 15 % free and CPU idle under 20 % busy, any thermal pressure, power limit, prochot or a thermal/power cause in `performanceLimitedDueTo` is throttling. The CPU at 85 C or more with the fan within 10 % of its real minimum (F0Mn 1836.0 rpm, at most 2019.6 rpm) is also hot, with the reason "The CPU is at 94 C but the fan is still at its slowest speed (1830 rpm).". Load average and `cpuThermalLevel` are ignored; `CPU LIMIT MAX_TURBO_LIMIT` is ok.

## Evidence
- Fan limits read once from the SMC without root: F0Mx 5297.40, F1Mx 4905.00, F0Mn 1836.00, F1Mn 1700.00 rpm.
- `performanceLimitedDueTo` has one value in all fixtures: `CPU LIMIT MAX_TURBO_LIMIT` (healthy). A test pins it ok.
- Tests: 106 pass (32 verdict tests, reading and HTTP tests for verdict first). No sudo in any test.
- The depot copy on a scratch port (4391, the running API untouched) answered with `verdict` first, and for this Mac at that moment: **throttling**, "The system reports thermal pressure: Moderate." and "The CPU is at 94 C". So the verdict is already useful: the Mac was hot under load then.
- Claude whole-branch review: no findings. One nit fixed (the `PL1`/`PL2` pattern now matches `PL1_LIMIT`).

## Jack's step
`launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api`, then `curl https://pazurite.com/api/v1/power-metrics`: the JSON starts with `verdict`.

## First use (passed)
About 19:3x UTC+7 (2026-10-13) the Nexus API was restarted on Jack's word (pid 49118). The JSON starts with `verdict`: status `ok`, "The Mac is fine: cool, not throttling, plenty of memory.", `reasons` empty (CPU 52.5 C, fan 1825 rpm, pressure Nominal). Reported by the Nexus Maestro.

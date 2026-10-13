# DGS-466 plan: power metrics verdict

Design: `design.md` (approved at checkpoint 1). Test-first.

1. `verdict.test.ts`: one test per status and per limit edge, MAX_TURBO_LIMIT ok, cpuThermalLevel 35 ok, unknown (failed, timeout), unknown plus busy. Red.
2. `verdict.ts`: pure `computeVerdict`. Green.
3. `types.ts`: `Verdict`, `VerdictStatus`, `verdict` first in `PowerMetrics`; `reading.ts` calls it; reading and server tests (verdict first in the body).
4. Read the fan maximum from the SMC with `probe-smc.c` (once, no root); write it into the design.
5. Run all tests; `sh scripts/nexus-api/install.sh` (depot only).
6. Claude whole-branch review; fix verified findings.
7. report.md, report.html; commit by named paths. Stop before the merge; Jack's step: one `launchctl kickstart`.

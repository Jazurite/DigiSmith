# DGS-665 report: a limit on concurrent runs

Head before the report commit: 2a56de9e. Full report: report.html. Findings: findings.md. Tokens: tokens.json.

- Limits: builder 2 (the factory ticket counts as one), reviewer 1, role 1, from `nightwatch.limits` in the main checkout's `.digismith/config.yml`; `stale_after_minutes` 120.
- `dg run start` refuses over the limit (exit 1, no record, no `--force`). `dg run limit` shows the count. The scan waits (`busy`, `builder-limit`) while hand builders fill the limit. Status and the catch-up Health show the limits.
- Beyond the plan: the factory ticket's own builder start is never refused; the config is read from the main checkout; `other` counts as a role.
- Protected paths touched: `.digismith/config.yml`, `packages/cli/src/autonomous/*`, `skills/reviewer/SKILL.md`. Merge needs the Maestro's approval.
- Suite: 292 files, 4744 tests pass (`--maxWorkers=2`).
- Conductor by hand after the merge: runbook lines in `.sdd-workspace/runbook-lines.md`.

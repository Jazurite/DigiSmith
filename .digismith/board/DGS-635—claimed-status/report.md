# DGS-635 implementation report

Date: 2026-10-25 (UTC+7). Branch `DGS-635__claimed-status`, rebased on main `b8bd1d87`, head `386a0398` (12 commits). Sign-off: Auto.

## What shipped

- `dg clickup rename-status`: renames a space status, keeps its id, can change its type and move it. Dry run without `--yes`. Read-back check after the PUT. Refuses a rename that changes nothing.
- The scan claims `to do` + Mode Autonomous at any hour and sets `claimed`. No `off` outcome. One ticket at a time; lock and breaker unchanged; away only marks the time. Manual or empty Mode: skipped, no comment, no event. A missing `claimed` status opens an attention item (`starter-status`, `claimed-status-missing`) and the next clean scan closes it.
- Lock-time repair from `to do`; the claim and status-write keys settle on `claimed` or `in progress`.
- Scheduled starter: both Modes move to `to do`.
- Steward: `claimed` replaces `ready`; `started` from `to do` or `claimed`; `approved --into` is `to do` or `scheduled`.
- Order text: a Builder-start step sets `in progress` and reads it back.
- Texts: the scan and schedule-release help, the two Nexus job descriptions (`registry.ts`, text only), the Oculus top bar label "To do (autonomous) waiting" (24 baselines refreshed), the report's Scans line without the off count, a ticket flow note in `WATCHDOG.md`, the steward README.
- `flow-update.md`: the DGS-488 rows and the runbook line, for the conductor to apply.

## Reviews

Four task reviews: all approved. Task 1 and Task 4 had one small fix each. The ticket review (claude-opus-5-5) was clean with no findings. The table is in `findings.md`. Its fix hashes are from before the rebase.

Notes:
- The off count was dropped from the report on the conductor's instruction from the Task 2 review (the scan has no `off` any more).
- Parked: the `__no-starter-status` note is never cleared (pre-existing); a ticket locked under the old flow in `ready` is not repaired (none exists today, and after the rename it reads `claimed`).

## Gates (after the rebase)

- `pnpm vitest run packages/cli/src/clickup packages/cli/src/autonomous packages/cli/src/steward packages/cli/src/oculus`: 1710/1710.
- `strip-types.smoke.test.ts`: 8/8.
- nexus-web unit: 372/372. Before the rebase: a11y 515 passed (1 skipped), visual 238 passed, e2e 82 passed, build-storybook ok. The rebase did not touch web files.
- nexus-web typecheck: 8 errors, all in untouched `scripts/nexus-api/src/scheduler/{clock,guard,runlog}.ts` (pre-existing).
- Known: the whole `packages/cli` run can fail `strip-types.smoke` from a build race with `index.e2e.test.ts`; the file passes alone.

## Next (the conductor)

Rename (`rename-status`, dry run then `--yes`), then the dist rebuild and the web publish, then the first use. See the Rollout, Rollback and First use sections of `plan.md`.

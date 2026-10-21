# DGS-583 Nightwatch watchdog: report

Written 2026-10-22 (UTC+7). Full report: `report.html`. All review findings: `findings.md`.

## What shipped
A plain-code watchdog reads the DGS-581 run record every 5 minutes. It puts blocked, stalled and lost runs on an attention list and comments once on the ticket. It adds the circuit breaker (two failed releases) and the failure causes (twelve codes, three classes). One job, `nightwatch-watchdog`, runs `dg autonomous watch` every 5 minutes in the Nexus scheduler. New commands: `dg autonomous watch [--dry-run]`, `attention`, `attention resolve <id>`, `resume`, and `release --cause <code>`. The catch-up and the report show an attention block.

## Decisions made during the build
- Maestro option C: no automatic retry and no journal write. Items carry `retryEligible` and `causeClass`. The retry is DGS-588.
- The attention writer of DGS-582 was extended, not forked.
- Breaker items use run `breaker`; failed-release items use the ticket key as run; a corrupt-lock failure uses `corrupt-lock`.
- Only `permission_prompt` counts as blocked. A run is ended only when no `started` follows its last `ended`.

## Follow-ups
- DGS-588: the automatic retry (reads `retryEligible` and `causeClass`).
- Task 3: inline `budgets: {}` flow style and tab indentation in the config are ignored without a problem message.
- One-time reopen at upgrade: an already-resolved item can reopen once, because an older `watch-state.json` has no `since`.
- Second prompt on the same run: a later `since` opens item n+1 after Jack resolved the earlier one; the same `since` stays closed.
- An old lost item is not closed automatically. Jack closes it with `dg autonomous attention resolve`.
- Runs older than 7 days are skipped unless they ended and still hold an open blocked or stalled item. Each run is read once per pass (F4, F11).
- Older type errors in `tracker-clickup.ts` and some older tests remain. None are in files this ticket added.

## After the merge (the Maestro)
Rebuild the CLI dist and run `scripts/nexus-api/install.sh`. First use is in `runbook-text.md` and the plan's "First use" section; step 4 there still mentions a journal retry, which DGS-583 does not do.

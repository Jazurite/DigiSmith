# DGS-588 Nightwatch controller retry: report

Written 2026-10-22 (UTC+7). Full report: `report.html`. All review findings: `findings.md`.

## What shipped
The controller (DGS-582) now sends the existing restart order once per ticket when an open attention item of the ticket is retry-eligible (kind `lost` or `failed`). The order is journaled as a `retry` line and settled `uncertain` when it is delivered. Only a new started builder run proves it: `reconcile` then settles the line `succeeded`, and `act` adopts the new run into the lock. Adopt resolves only the attention item named in its own retry journal line, once per ticket. A second failure stays open for Jack.

New pieces: `restartsOf` and `retrySucceeded` in the journal (ticket wide count), the `controller` resolver in the attention writer, an `attention` observation, and the `retry` and `adopt` actions in `advance`, `act` and `reconcile`. The pane-gone restart waits once a restart was used (`restart-used`). A failed attention read gives the note `obs-attention-failed`. `watchdog.ts`, `watch.ts`, `causes.ts`, `release.ts` and `notify.ts` are unchanged.

## Decisions made during the build
- One restart per ticket: the count reads the journal on every tick, in any phase.
- A delivered prompt is not proof. The check never returns `retryable` for a retry. After 15 minutes without a new run, one `journal-uncertain-retry` note.
- Maestro rule for the final review (F1): adopt resolves only `detail.item` of its own retry line. The `items` field on the adopt action is informational (comment in `advance.ts`).
- Adopt waits for a good attention read. The `obs-attention-failed` note covers the wait.
- Two tick tests use `builderPane: "present"` (the plan had no pane state there): with the pane gone and no eligible item, the old pane-gone restart correctly sends an order.

## Follow-ups
- A released lock gets no retry (phases `merged` and `released` never retry).
- If a ticket has no retry line, or the line names no item, adopt moves the builder to the new run and resolves nothing.
- `reconcile.ts` keeps a `state === null` branch for `adopt-retry` that no path reaches (parked, task 6 F2).
- The conductor runbook text is in `runbook-text.md`. The Maestro applies it.
- After the merge: rebuild `dist` and run `install.sh`.

## Verification
- `pnpm vitest run packages/cli/src/autonomous`: 32 files, 580 tests pass (final fix wave).
- `strip-types.smoke.test.ts`: 4 of 4 pass (after the CLI build).
- `pnpm --filter ./packages/cli build`: exit 0, `dist/index.js` produced.
- Root typecheck: two errors in files these commits touched (`fakes.test-util.ts`, `observe.test.ts`), the same kind the task 1 implementer saw as pre-existing. Not checked against a clean `main`.

## Review
8 tasks. Task reviews: all approved, 12 Minor findings (7 fixed, 5 parked with rulings; three of the parked ones, the import, the DGS-1 vs DGS-10 pin and the `index.ts` mapper test, were fixed in the final wave). Ticket review round 1: ready to merge, 5 Minor, all fixed in one wave. Scoped round 2: clean, one new Minor (F6) parked with a comment.

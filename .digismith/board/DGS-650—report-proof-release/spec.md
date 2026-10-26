# DGS-650: the morning report counts a proof release as a proof

## Why
The 06:00 report of 2026-10-26 listed DGS-642 under "Failed or stopped" AND "Waiting for Jack". DGS-642 was a throwaway proof ticket. It was released on purpose with `--result stopped`. The reader saw a failed night and an open question where there was neither.

## Code facts (read, not run)
- `packages/cli/src/autonomous/report.ts`, `buildReport`: `failed` takes every release with result `failed` or `stopped`. `waiting` takes `awaiting-jack` or `stopped`. So every `stopped` shows twice. That is by design for a real stop (the order tells a Builder to use `stopped` when it needs sudo or a new service, and Jack must act). It is wrong for a proof.
- `ReleaseResult` (`release.ts`) and `RESULTS` (`index.ts`) are `merged | failed | stopped | awaiting-jack`. `recordRelease` (`breaker.ts`) types the same four.
- `built` already prints `commit ${e.commit || "unknown"}`. The commit comes only from the `--commit` flag of `dg autonomous release`. `order.ts` tells the Builder to pass it. If a merged release omits it, the report says `commit unknown` and nobody is told at release time.

## Decision: a new result `proof` (option a), not "skip closed tickets" (option b)
- The report is a pure function over the event ledger. Option (a) records the intent in the ledger when the release is made. The report needs no ClickUp read and cannot fail.
- Option (b) needs a status lookup per ticket at report time. A failed lookup would hide or show a ticket wrongly, and a really stopped ticket that Jack later discards would vanish from the night's record.
- Option (a) also keeps `stopped` meaning one thing: work that needs Jack.

## Behavior
1. `dg autonomous release --result proof [--reason "..."]` is allowed. It behaves like `stopped` for the lock, the journal, the ticket comment (`Autonomous Operation proof (<time>): <reason>`), the late-release line and the run-now kick. It never opens an attention item. It never changes the circuit breaker (like `stopped` and `awaiting-jack`).
2. The report gets its own section after "Failed or stopped" and "Waiting for Jack": `Proofs` with one line per proof release: `DGS-642: <reason>` (reason omitted when empty). `none` when there are none.
3. "Failed or stopped" lists only `failed` and `stopped`. "Waiting for Jack" lists only `awaiting-jack` and `stopped`. A `proof` is in neither.
4. "Built": every merged release prints `commit <sha>`. When the merged release has no commit, the line reads `commit unknown (none given at release)`, and `dg autonomous release` prints a warning on stderr: `release: merged without --commit, the report will show commit unknown`. The release still succeeds (a blocked release would leave the lock stuck at night).
5. The order text (`order.ts`) is NOT changed. `proof` is for a conductor's proof run, not for a Builder.

## Protected paths touched
- `packages/cli/src/autonomous/` (report.ts, release.ts, breaker.ts, index.ts and their tests).
- No other protected path (hooks/, skills/finishing-*, skills/reviewer, packages/cli/src/reviewer/, scripts/nexus-api/src/scheduler/, .digismith/config.yml).

**Merge needs the Maestro** (a protected path is touched).

## Out of scope
Changing old ledger events (DGS-642 stays as written; the report for 2026-10-26 is not rewritten). Hiding a `stopped` ticket that is closed later. Any live ClickUp write.

## First use (the conductor, after the merge)
1. `dg autonomous release --help` lists `proof` in `--result`.
2. Claim a throwaway ticket the normal way, then `dg autonomous release --ticket <KEY> --result proof --reason "first-use proof of DGS-650"`. Then set that throwaway ticket to `discarded` (a status change, never a delete).
3. `dg autonomous report`: the new `Proofs` section shows `<KEY>: first-use proof of DGS-650`. The key is in neither "Failed or stopped" nor "Waiting for Jack".
4. Read the "Built" section of that report: every merged release shows a sha.

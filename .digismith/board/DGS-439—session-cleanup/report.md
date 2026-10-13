# DGS-439 report: `dg sessions cleanup`

## Summary
`dg sessions cleanup [--project <p>] [--yes]` deletes archived closed or lost session cards whose `ended` is strictly older than `CLEANUP_DAYS` (3, one constant in `packages/cli/src/sessions/cleanup.ts`). It is a dry run by default. A real run appends one line per deleted file to `<depot>/sessions/cleanup.log`. 16 new tests pass; the whole suite passes (766 + 16) and `tsc` is clean.

## Allow-list
Only `<depot>/sessions/<project>/archive/*.yml`, regular files (symlinks skipped), status closed or lost, `ended` valid and strictly older than 3 days. Missing or unreadable `ended`, open status, wrong folder: kept and reported. A card that does not parse: kept, reported on stderr, exit code 1. Never: open cards, any `note.md`, orders, identities, conductor state, `workbox.md`, `cleanup.log`, anything outside `sessions/`. Tests pin each one, including exactly 3 days (stays), just under (stays) and just over (goes).

## Known gaps
- No worker-scratch folder exists in the depot, so there is no scratch rule. A named path is a later ticket.
- The conductor log part waits: no separate conductor log exists.
- DGS-443 had no plan.md or worktree when this was built, so its test for the final note path is not added. The allow-list reads only `archive/*.yml`, and tests already cover notes, `orders/` and a conductor folder beside `cards/` and `archive/`. Re-check before merge.
- The nightly trigger is not part of this ticket (DGS-434).
- The log is opened before any delete, so an unwritable log means nothing is deleted.

## First use (after merge)
Dry run on the real depot, list shown to the conductor; real run only on the word to go, then read `cleanup.log` back.

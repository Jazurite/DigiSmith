# DGS-439 report: `dg sessions cleanup`

## Summary
`dg sessions cleanup [--project <p>] [--yes]` deletes archived closed or lost session cards whose `ended` is strictly older than `CLEANUP_DAYS` (3, one constant in `packages/cli/src/sessions/cleanup.ts`). It is a dry run by default. A real run appends one line per deleted file to `<depot>/sessions/cleanup.log`. 19 new tests pass; the whole suite passes (770) and `tsc` is clean.

## Allow-list
Only `<depot>/sessions/<project>/archive/*.yml`, regular files (symlinks skipped), status closed or lost, `ended` valid and strictly older than 3 days. Missing or unreadable `ended`, open status, wrong folder: kept and reported. A card that does not parse: kept, reported on stderr, exit code 1. Never: open cards, any `note.md`, orders, identities, conductor state, `workbox.md`, `cleanup.log`, anything outside `sessions/`. Tests pin each one, including exactly 3 days (stays), just under (stays) and just over (goes).

## Known gaps
- No worker-scratch folder exists in the depot, so there is no scratch rule. A named path is a later ticket.
- The conductor log part waits: no separate conductor log exists.
- The nightly trigger is not part of this ticket (DGS-434).
- The log is opened before any delete, so an unwritable log means nothing is deleted.

## First use (after merge)
Dry run on the real depot, list shown to the conductor; real run only on the word to go, then read `cleanup.log` back.

## Rule confirmations
- Strict rule is in: a card goes only when `ended` is OLDER than 3 days. The test at exactly 3 days (stays), just under (stays) and just over (goes) is in.
- A card with a missing or unreadable `ended` stays (kept, reported). So does an impossible date (Feb 31, 24:00).

## DGS-443 layout test
Read DGS-443's plan.md. A test keeps old `maestros/<title>/note.md` (also a title with a space, and one titled `archive`), `<conductor>/note.md`, `orders/`, `workbox.md` and `workbox-macos.md`, and a real run deletes none of them.

## Review
Independent Claude whole-branch review done (a separate agent, read-only). No path out of the allow-list found (traversal, symlinked dirs, odd names all checked). Two low findings, both fixed with tests:
1. Impossible `ended` dates (Feb 31, `T24:00`) were accepted because `Date.parse` rolls them over. Fixed with a calendar round-trip check.
2. A duplicate field, or a stub card with only `status` and `ended`, was not a parse error. Fixed: duplicates and any missing required card field now count as a parse error (kept, reported, exit 1).
Also done: the file is re-checked as a regular file right before the delete. Accepted, not fixed: a log write failing after a successful unlink leaves that one delete unlogged (negligible; the log is opened first).

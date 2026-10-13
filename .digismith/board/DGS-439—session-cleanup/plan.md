# DGS-439 plan: `dg sessions cleanup`

## Command shape
`dg sessions cleanup [--project <p>] [--yes]` (new group `sessions` in `packages/cli/src/sessions/`).
- Dry run by default: lists what would go, deletes nothing. `--yes` does the delete (same word as `dg clickup add-link`).
- `--project` limits the run to one project folder; default is every folder in `<depot>/sessions/`.
- ONE constant `CLEANUP_DAYS = 3` in `packages/cli/src/sessions/cleanup.ts`; no other file holds a 3 (tests import the constant and build ages from it).
- A card that fails to parse is kept, reported on stderr, and makes the exit code non-zero. `cleanup.log` is append-only and never itself in the allow-list (it is not under archive/).
- Output: one line per file, `would delete <path> (<status>, ended <ts>)` in a dry run, `deleted <path> (...)` in a real run. A real run also appends the same lines to `<depot>/sessions/cleanup.log`.
- `dg` does not import `scripts/` (the package builds with `rootDir: src`), so the command carries its own small reader for two fields (`status`, `ended`).

## Allow-list (the only things that can be deleted)
A file is a candidate only if ALL hold:
1. its real path is `<depot>/sessions/<project>/archive/<name>.yml` (one level deep; `<name>` has no leading dot; symlinks are skipped, never followed);
2. it parses as a session card with `status: closed` or `status: lost`;
3. its `ended` is a valid ISO timestamp and `now - ended > CLEANUP_DAYS` days (STRICTLY older: exactly 3 days stays) (age from `ended`, not file mtime).

A card with a missing or unreadable `ended` stays. Anything unreadable, with no `ended`, or with `status: open` in archive/ is kept and reported as "kept (reason)". Files only; no folder is ever removed.

## Never (tests pin each one)
open cards (`cards/`), any `note.md` (any depth, any folder, also after DGS-443 moves notes into `<depot>/sessions/<project>/`), the conductor's state and note, identity records (`<depot>/identities/`), `orders/`, `workbox.md`, `conductors.json`, anything outside `<depot>/sessions/`. The rule is positive (only archive/*.yml cards), so a new file kind from DGS-443 is safe by default: it is not an archived card.

## Worker or test scratch
The depot holds no worker scratch folder today; the only test scratch is archived cards (e.g. `Dgs418Fake/archive/...yml`, `dgs-418-throwaway`), and those are archived cards, so rule 1-3 already cover them. I add no second scratch rule. If the Scheduling Maestro wants a named scratch path, it needs a name and a ticket; it is not guessed here.

## Conductor log
No separate conductor log exists. Not built; the report says so. (The command's own `cleanup.log` is only its own delete record.)

## Coordination with DGS-443
DGS-443 has no plan.md yet. Its layout (`<conductor>/note.md`, `orders/`, Maestro note path) sits beside `cards/` and `archive/`; the allow-list reads only `archive/*.yml`, so it needs no change. I re-read 443's plan.md before merge and add a test for its final note path.

## TDD order
1. `ageDays/isExpired` with `CLEANUP_DAYS` (4 days goes, 2 days stays, exactly 3 days stays, just under stays, just over goes).
2. Card reader: status + ended, rejects a bad card.
3. `planCleanup(depot, now)`: fixture depot with: 4-day closed (goes), 4-day lost (goes), 2-day closed (stays), open card in `cards/` aged 10 days (stays), old `note.md` in project folder and in `archive/` (stays), old `orders/*.md` (stays), old identity `.yml` in `identities/` (stays), old `.yml` in `cards/` with a closed status (stays: wrong folder), symlink in archive (stays), garbage `.yml` (stays).
4. `runCleanup`: dry run deletes nothing; `--yes` deletes exactly the plan and writes one log line per file; a second run finds nothing.
5. yargs wiring + e2e style test like `index.test.ts`.
pnpm only (`pnpm vitest run`).

## First use (after merge on "go: merge")
Dry run on the real depot; show the list to the conductor (for the Scheduling Maestro). Real run only on the conductor's word; read `cleanup.log` back.

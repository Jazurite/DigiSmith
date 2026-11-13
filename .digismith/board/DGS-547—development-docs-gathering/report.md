# DGS-547 Build record on the ticket: report

Ticket DGS-547, branch DGS-547__build-record-on-the-ticket, base 6bf22dc0 (plugin 1.76.0). DGS-534 is folded in and discarded. Built by hand (Mode Manual, Sign-off Auto), 7 tasks, every task and the whole branch reviewed (two ticket reviews: r1 with fixes, r2 clean).

## What shipped
- `dg clickup attach-record --task <KEY> (--file <path> | --kind reviews|ledger-summary --workspace <dir>)`: attaches a file once per content, never deletes, prints `attached`, `skipped`, `superseded`, `warn`.
- A depot state file per ticket (`<KEY>.attachments.json`, atomic write), a pure decision function, a pure ledger summary renderer.
- One hook per build skill (six skills, seven blocks), each ending in `|| true`.
- A wiring test that pins the hook lines, their order and the failure wording.

## Deviations for the Maestro
1. `--name` was dropped. The attachment name is the file's basename: `<ticket>.tokens.json` outside DigiSmith's own repo, `design.html` for a design spec (not `spec.html`). The skills say so.
2. The ledger summary is narrower than spec section 2: a review count and the last verdict; no fix-round or task-stamp lines (as the plan narrowed it).
3. Two commits carry the scope `skills`, not the key scope: cb5b226d and 14874b3e. No history rewrite.
4. A superseded copy is accepted: a changed file uploads under the same name, the old copy stays, `superseded: <id>` is in the command output only.
5. `readAttached` also gives `[]` for ENOTDIR (a state path under a file), besides ENOENT and a torn file.
6. `findings.md` is attached only in an executing-plans build; SDD builds attach `reviews.md` only. report-implementation Step 4a writes `findings.md` only when a `reviews/` folder exists, so in practice it is attached in role-mode SDD builds only through `reviews.md`.
7. The failure rule: every hook ends in `|| true`; the ledger line `Attach record: failed (<line>)` triggers on a printed `warn:` line, not on an exit code.
8. No README mentions `attach-record`, so no README sentence was added; this report holds the note.
9. Task 1's Maestro relay named a fourth item (F4: test a torn file, then record). The Reviewer raised three; the F4 verdict lines were removed from the ledger and the test is in commit 5c856949.

## PROTECTED files touched (the Maestro approves the merge)
skills/brainstorming/SKILL.md, skills/writing-plans/SKILL.md, skills/subagent-driven-development/SKILL.md, skills/report-implementation/SKILL.md, skills/finishing-a-development-branch/SKILL.md, skills/executing-plans/SKILL.md

## Tests
Full packages/cli suite, fork pool of 2: 188 files, 187 passed, 1 failed; 3077 tests, 3076 passed, 1 failed. The one failure is the known DGS-720 pin: `autonomous/guardrails.test.ts` "sets scan_every_minutes to 15 and reads clean". scripts/check_vendored_skills.test.ts: 20 passed (repo root).

## First use (after the merge, the conductor, DGS-547 only)
`dg clickup attach-record --task DGS-547 --file <board folder>/spec.md`, then `plan.md`, `report.html`, and the tokens.json snapshot; run each twice: the second run prints `skipped <name>: unchanged` and adds nothing. One forced failure (a bad registry dir) shows the `warn:` reaching the ledger.

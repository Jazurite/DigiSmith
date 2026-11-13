# DGS-547 Spec: the build record on the ClickUp ticket

Date: 2026-11-12. Author: refine worker `dgs-547-refine`. Status: spec for Maestro approval (Sign-off Auto).
Builds on: Hallmark DGS-546 (stamps and totals block, done), checklist DGS-631/632/634 (done), `dg clickup upload-attachment`.
Build order: after DGS-551 merges (both edit `subagent-driven-development`, `report-implementation`, `finishing-a-development-branch`). Status moves are SOP DGS-731 and are not touched here.
DGS-534 (the record: report, review verdicts, ledger summary, tokens.json) is part of DGS-547. One ticket, one build.

## 1. Goal

When a build ends, the ticket in ClickUp holds its own story: the spec, the plan, the review verdicts, a ledger summary, the report. Today the SDD workspace is deleted by design and the reviews live only in subagent transcripts (DGS-481 night: no attachment, 43 transcripts). Refine workers attach spec.md and plan.md by hand. This makes it automatic.

## 2. What lands, when (decision 1)

| File (attachment name) | Source | Moment | Hook point |
|---|---|---|---|
| `spec.md` | board folder `spec.md` (or `design.html` when that is the spec) | spec approved | `digismith:brainstorming` end, right after the approval |
| `plan.md` | board folder `plan.md` | plan approved | `digismith:writing-plans` end, after the approval |
| `reviews.md` | `dg reviewer table --workspace W --out` over the ledger and verdict lines: per-task and whole-branch (`Final review`, `Scoped re-review`) | before the workspace is deleted | `subagent-driven-development` Finish, before `snapshot` and `rm -rf` |
| `ledger-summary.md` | rendered from `progress.md`: one line per task (delivered, rounds, parked/deferred lines, task stamp lines) | same moment | same |
| `report.html` | board folder `report.html` | report written and committed | `report-implementation` end; `finishing` Option 1 re-sends if the file exists and changed |
| `tokens.json` | the snapshot (`entry.ts snapshot --write`) | finish | `finishing`, after its snapshot call |

`tokens.json` decision: **attach it.** Hallmark's block holds totals, a per-task table (time, cost, findings, fix rounds) and a review line. It holds no per-step, per-model counts (in, out, cache). `tokens.json` does. So it is not a duplicate. If Hallmark ever shows those counts, drop this row.

Why `reviews.md` and `ledger-summary.md` are two files: the verdicts are the audit trail a reviewer or Jack reads; the ledger summary is the build narrative. `reviews.md` is the existing `dg reviewer table` output (reuse, no new reader). The summary is new, small, and rendered by a pure function.

HTML note from the epic: ClickUp downloads an HTML attachment instead of rendering it. Accepted for v1 (`report.html` stays HTML). DGS-19 (PDF) is a separate ticket and stays out.

## 3. Attachments, not description text (decision 2) and the replace rule

Attachments only. The Hallmark block stays the only machine-written text in the description.

**Fact found in the code:** the ClickUp client has `uploadAttachment` only. GET `/task/{id}` returns an `attachments` array (id, title). The public v2 API has no delete-attachment call. So "replace the file with the same name" cannot delete the old copy today.

**Technical decision (v1):** a new command `dg clickup attach-record --task K --file F [--name N]`:
1. Reads the task's `attachments`. Computes the sha-256 of the file.
2. A state file `~/.digismith-depot/attachments/<KEY>.json` (`{name, sha256, id}` per name) records what this command uploaded.
3. Same name and same hash recorded, and the id still on the task: **skip** ("unchanged"). A re-run never adds a copy.
4. Same name, different hash (the plan was edited): upload the new content under the same name, record the new id, and print `superseded: <old id>`. The old one stays on the ticket. **It never deletes.**
5. A missing state file with a same-named attachment on the task: treat it as unknown, upload, warn once.

So the strict rule "never a second copy" holds for a re-run with no change (the common case: hooks fire twice). It does not hold when the content changed. That needs a delete call. **Resolved (Maestro, checkpoint 1, 2026-11-12):** a superseded copy is accepted in v1. No attachment delete (a delete needs Jack; a ClickUp delete is a later ticket). To keep re-uploads rare, each file is attached ONCE at its final moment (table in 2). `superseded: <id>` is printed in the command output only, never as a ticket comment. The skipped brainstorm is accepted for this ticket (technical choices, spec from the code).

## 4. Never block, profile, writes (decisions 3, 4, 5)

- Every hook is one line `dg clickup attach-record ...`. A non-zero exit prints a warning, appends `Attach record: failed (<first stderr line>)` to the ledger when one exists, and the step goes on. Same wording and rule as Hallmark.
- Key rule is the Hallmark rule (board folder name, else branch `^([A-Za-z]+-[0-9]+)(__|-|$)`, uppercased). No key, or a non-`DGS-` key: the command prints `not a ClickUp key, skipped` and exits 0. Profile without ClickUp: nothing happens (same as `ticket-total`).
- Writes go through `dg` only. The new command is a task in the plan. No script.
- A missing file (no `report.html` yet) is a skip with a note, never an error.

## 5. New pieces

1. `packages/cli/src/clickup/attach-record.ts` (+ test): the command above. Mock client only in tests.
2. `packages/clickup-client`: a `getTaskAttachments(taskId)` reader over the existing GET task (typed, no new endpoint).
3. `packages/cli/src/tokens/ledger-summary.ts` (+ test): `renderLedgerSummary(progressText) -> markdown`. Pure. Reads the grammar `ledger.ts` and `review-data.ts` already parse.
4. `dg clickup attach-record --kind ledger-summary|reviews --workspace W --plan P`: builds `ledger-summary.md` / `reviews.md` into a scratch file, then uploads. This keeps the skill text to one command per file.
5. Skill text edits (hook lines): `brainstorming`, `writing-plans`, `subagent-driven-development` Finish, `report-implementation`, `finishing-a-development-branch` (Options 1 and 2 end blocks), `executing-plans` (inline ledger: summary only, no reviews). Each points at SOP DGS-731 for status, never DGS-488.

## 6. What stays out

DGS-535 (tasks as subtasks), DGS-19 (PDF), DGS-540 (ADRs), DGS-261/260/399 (report-implementation bugs): related, not this build. A ClickUp comment per file: no (attachments only, decision 2).

## 7. Risks

- Two hook points for one file (report: report-implementation and finishing): the hash skip makes the second a no-op.
- The SDD workspace may be gone when finishing runs: that is why `reviews.md` and `ledger-summary.md` go at the SDD Finish, before `rm -rf`, not at finishing.
- Upload size: reviews and summary are text, small. `tokens.json` and `report.html` under 1 MB in the DGS-5xx folders I read.
- Shared edits with DGS-551: the plan says rebase on it, or build after the merge.

## 8. Acceptance

A finished test build on a throwaway DGS ticket (mock-tested in CI; one live run by the conductor) shows `spec.md`, `plan.md`, `reviews.md`, `ledger-summary.md`, `report.html`, `tokens.json` on the ticket, and a second run adds none.

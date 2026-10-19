# DGS-570 Refiner output (checkpoint 3)

Text only. No ClickUp writes. The Maestro sets the Sign-off field and Jack moves the status.

## Build tickets

One build ticket: **DGS-570 itself**. It holds the spec (`design.html`) and the plan (`plan.md`, 2 tasks, one commit each). No subtask is needed.

| # | Title | Plan tasks | Size | Depends on |
|---|---|---|---|---|
| DGS-570 | Role mode writes the Final review ledger lines (report-implementation unchanged) | 1, 2 | XS | none (DGS-529 and DGS-566 are merged) |

Why one ticket and no split:
- Task 1 is one paragraph of skill text plus one test. Task 2 is one sentence in `MEMORY.md`.
- The tasks are tiny and in a line. Two workers would cost more than they save. A split for the ticket count is not the aim.
- The build runs in role mode (`DIGISMITH_REVIEW_MODE=role`): each task goes to a task Reviewer worker, the end goes to a ticket Reviewer worker. The plan says how (section "How the build runs (role mode)").
- After the merge: no `dist` rebuild (only a test changes under `packages/cli/src`). The first use is the next role-mode build: its `report-implementation` run must pass Step 1 with no hand-added `Final review (...)` line.

Not part of this ticket: DGS-568 (may edit other parts of the SDD file), DGS-562, any change to `report-implementation`.

## Ranking

One ticket. It can start as soon as Jack moves it to `to do`. If DGS-568 builds at the same time, both edit `skills/subagent-driven-development/SKILL.md` in different sections; the second to merge rebases.

## Definition of Ready

- [x] Spec approved (checkpoint 1, relayed by the Maestro, option B confirmed): `design.html`
- [x] Plan written and approved by the Maestro (checkpoint 2): `plan.md`
- [x] Decided, not open: option B (role mode writes the line, report-implementation untouched); the line is written at the round 1 ticket result; the model comes from the `model:` line of the ticket pack; a parked ticket finding gets a second `Final review: parked` line
- [x] No open question for a Builder. Each task has its test code, its text, its commands and its expected result
- [x] The old path is protected: hand mode text and the `anchors` tests of `sdd.test.ts` are not edited; the "exactly 4 pack lines" test is named as a constraint
- [x] Files named: SDD `SKILL.md` (Role Mode section only), `sdd.test.ts`, `MEMORY.md`. Not touched: `report-implementation`, `reviewer`
- [x] No ClickUp write by a test or by the build
- [ ] Jack moves DGS-570 to `to do`

## Sign-off (proposal)

- **DGS-570: Auto.** Internal skill text, one test, one convention sentence. No look, no wording for users, no personal data, no public surface. Done at merge and push. The next role-mode build is the first use; the conductor checks that its report-implementation run needs no hand-added line.

Jack confirms the mark when he approves into `to do`.

## Refinement end mark

Refinement ended 2026-10-19 08:05 UTC+7 [2026-10-19T01:05:28Z]. Checkpoint 3 waits for the Maestro. No marks file written (brief rule); the registry holds the session and step lines.

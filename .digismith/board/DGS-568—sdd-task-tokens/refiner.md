# DGS-568 Refiner output (checkpoint 3)

Text only. No ClickUp writes. The Maestro sets the Sign-off field and Jack moves the status.

## Build tickets

One build ticket: **DGS-568 itself**. It holds the spec (`design.html`) and the plan (`plan.md`, 8 tasks, one commit each). No subtask is needed.

| # | Title | Plan tasks | Size | Depends on |
|---|---|---|---|---|
| DGS-568 | Token counter: SDD ledger tags each plan task's tokens | 1 to 8 | M | none to start; merges after DGS-570 |

Why one ticket and no split:
- Tasks 1 to 5 are one chain in `packages/cli/src/tokens/` (the parser, the registry marks, the commands, the window tag, the inferred step). Tasks 2, 3, 4 and 5 each use the one before. Task 1 stands alone but is a few lines.
- Tasks 6 to 8 are skill text. They could run beside the code, since the files differ. But they name the Task 3 commands, they are short, and Task 6 shares a file with DGS-570. Two workers and two merges would cost more than the time they save. A split for parallel work is not worth it here, and a split for the ticket count is not the aim.
- Each task is one commit with its own tests (1 to 5) or its own grep check (6 to 8), so each Reviewer pack is small. The build runs in role mode (`DIGISMITH_REVIEW_MODE=role`): the plan says how, including the `<KEY>` from the `ticket:` line of `pack.md`.
- The build itself writes no task marks. The Builder runs the installed plugin and the depot clone, and both are the old version until the merge. The first build that writes windows is the next one.

Merge order: **DGS-570 first.** It edits the Role Mode section of the SDD skill; DGS-568 edits other sections of the same file. The Builder rebases on main before the final pack and re-runs `pnpm vitest run packages/cli/src/tokens`.

After the merge (in the plan, "After the merge, and first use"):
1. `pnpm --filter @digismith/cli build` in the main checkout.
2. `digismith:depot` update: pull `~/.digismith-depot/repo`, so `entry.ts task-start` exists where the skills call it. Check: `entry.ts task-start --ticket X` prints `missing --task`.
3. Post-finish hooks 01 to 03 as usual. No cache flush.

Not part of this ticket: Reviewer tokens per task, Maestro and conductor windows for a parent ticket (spike DGS-563 Q2), the price table (DGS-545, DGS-546, DGS-567), a backfill of the old `tokens.json` files, ClickUp subtasks per plan task.

## Ranking

One ticket. It can start as soon as Jack moves it to `to do`. It does not wait on DGS-570 to start, only to merge. It needs the Reviewer seats free, as every role-mode build does (Workbox runbook, "Start of a Reviewer").

## Definition of Ready

- [x] Spec approved (checkpoint 1, by the Maestro for Jack): `design.html`
- [x] Plan written and approved by the Maestro (checkpoint 2, with the bootstrap/init change in place of adopt): `plan.md`
- [x] Decided, not open: windows come from registry marks, not the ledger; the ledger tag wins over the window; a record is counted in one task; `schema_version` stays 1; `inferred_steps` is an optional field; no backfill; no new `dg` command; no ClickUp field or write
- [x] No open question for a Builder. Each task has its test code or grep check, its commands and its expected result
- [x] The evidence is in the plan: DGS-560 lines with a note after the id (cause 1), the main thread's share of the output (cause 2), DGS-561's missing steps (cause 3). The Task 1 replay script was run on 2026-10-19: 7 tasks, 14 agents
- [x] Files and overlap named: the plan lists every file per task; DGS-570 touches only the Role Mode section of the SDD skill, and DGS-568 does not touch it
- [x] A change under `packages/cli/src` needs the dist rebuilt in the main checkout after the merge: in the plan
- [x] The depot clone pull after the merge is in the plan (the skills call `entry.ts` from the depot)
- [x] First use named: the next SDD build in role mode after the merge (the Maestro checks it later)
- [x] No ClickUp write by any test; the tests use temp folders and fixtures
- [ ] Jack moves DGS-568 to `to do`

## Sign-off (proposal)

- **DGS-568: Auto.** Internal tooling: a counter, a registry mark and skill text, all with tests. No look, wording for users, personal data or public surface. **Done at merge and push, plus the dist rebuild and the depot-clone pull.** The first use is checked later by the Maestro and does not hold the status.

Jack confirms the mark when he approves into `to do`.

## Refinement end mark

Refinement ended 2026-10-19 08:09 UTC+7 [2026-10-19T01:09:53Z]. Waiting for the Maestro's decision at checkpoint 3.

# DGS-566 Refiner output (checkpoint 3)

Text only. No ClickUp writes. The Maestro sets the Sign-off field and Jack moves the status.

## Build tickets

One build ticket: **DGS-566 itself**. It holds the spec (`design.html`) and the plan (`plan.md`, 3 tasks, one commit each). No subtask is needed.

| # | Title | Plan tasks | Size | Depends on |
|---|---|---|---|---|
| DGS-566 | Reviewer pack: write the ticket key into pack.md | 1, 2, 3 | S | none (DGS-559 and DGS-560 are merged) |

Why one ticket and no split:
- The three tasks are small and in a line: the code (1), the card (2) and the SDD text (3). They touch one folder of code, two skill files and their tests.
- Tasks 2 and 3 could run side by side after Task 1, but each is a few lines. Two workers would cost more than the time they save. A split for the ticket count is not the aim, and a split for parallel work is not worth it here.
- The build is the **first role-mode build**: a Builder with `DIGISMITH_REVIEW_MODE=role`; each task goes to a task Reviewer worker, the end goes to a ticket Reviewer worker. The plan says how (section "Running this plan"), including that the Builder uses its own worktree's CLI (`node packages/cli/dist/index.js reviewer pack ...`) and never the global `dg`.
- After the merge: `pnpm --filter @digismith/cli build` in the main checkout, and the first use is `dg reviewer pack --help` listing `--ticket` (plan, "After the merge").

Not part of this ticket: DGS-551 (Steward events), other pack fields, DGS-129.

## Ranking

One ticket. It can start as soon as Jack moves it to `to do`. It also serves as the first real use of role mode, so the conductor needs the Reviewer seats free when it starts (Workbox runbook, "Start of a Reviewer").

## Definition of Ready

- [x] Spec approved by Jack (checkpoint 1, relayed by the Maestro): `design.html`
- [x] Plan written and approved by the Maestro (checkpoint 2, with the worktree-CLI and post-merge-rebuild changes): `plan.md`
- [x] Decided, not open: the key comes from a `--ticket <KEY|none>` option (the Builder passes it; no branch or file guessing); the line is `ticket: <KEY>` first in the manifest; a missing or bad value fails before any folder is made; `brief.md` is not changed; no plugin version bump in the build
- [x] No open question for a Builder. Each task has its test code, its commands and its expected result
- [x] The old path is protected: hand mode never calls `pack`; the old-path tests of `both-paths.test.ts` and the `anchors` of `sdd.test.ts` are not edited
- [x] The worktree CLI entry was checked on 2026-10-18 (`pnpm install --frozen-lockfile --offline`, `pnpm --filter @digismith/cli build`, `node packages/cli/dist/index.js reviewer pack --help` works; the `--experimental-strip-types` entry does not, without the built `clickup-client`)
- [x] The mode variable reaches a Builder's Bash tool (live check passed, per the brief): no card-mode fallback needed
- [x] Live use is read only: no ClickUp write by a test
- [ ] Jack moves DGS-566 to `to do`

## Sign-off (proposal)

- **DGS-566: Auto.** Internal tooling: one manifest line, one CLI option, card and skill text, all with tests. No look, wording for users, personal data or public surface. Done at merge and push, after the first use is seen (`dg reviewer pack --help` lists `--ticket` after the rebuild).

Jack confirms the mark when he approves into `to do`.

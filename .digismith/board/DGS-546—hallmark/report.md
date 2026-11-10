# DGS-546 Hallmark: merge report

Written 2026-11-10 UTC+7. Branch `DGS-546__hallmark-stamp`, base `b9ccd97f` (origin/main, not moved), head: see the STOP line.

## What shipped
- `dg clickup task-stamp`: one plain-text comment per plan task (tokens per model, per-response list price, agent time, review numbers), dry run by default, three idempotence checks (ledger line, stamps file, marker line in paged comments), `--all` backfill.
- `dg clickup ticket-total`: a Hallmark block in the ticket description (totals and a per-task table), replaced on a re-run, guarded on write.
- Shared code: `tokens/stamp.ts`, `review-data.ts`, `stamps-store.ts`, `hallmark-block.ts`; `getAllTaskComments` in the ClickUp client.
- Skill hooks: `task-stamp` in the SDD skill (task and final), `ticket-total` in the finishing skill (merge, push-and-PR, keep-as-is; not discard). README in `packages/cli/src/tokens/`.

## Protected files touched (Maestro approval needed for the merge)
- `skills/finishing-a-development-branch/SKILL.md` (protected path `skills/finishing-*`): three `ticket-total` blocks.
- `skills/subagent-driven-development/SKILL.md`: two `task-stamp` blocks (task, final). Not on the protected list, named here because the Maestro asked.
- Untouched: `hooks/`, `skills/reviewer`, `packages/cli/src/reviewer/` (import only), `packages/cli/src/autonomous/`, `scripts/nexus-api/src/scheduler/`, `.digismith/config.yml`.

## Suite (whole CLI package, once, forks 2, load under 4)
- 180 files, 2930 tests: 179 files and 2929 tests pass, 1 fails.
- Failing: `src/autonomous/guardrails.test.ts` "this repo's own config.yml > sets scan_every_minutes to 15 and reads clean": expects `limits.reviewer` 1, gets 2.
- Proof it is a base failure: the same file run in a `git archive` copy of `origin/main` `b9ccd97f` (scratchpad, main checkout untouched) fails with the same assertion (51 pass, 1 fail). Cause: main commit `b9ccd97f` (dgs-702 day limits 2/2/1) changed `.digismith/config.yml`, the test still expects 1.
- No other failure. The two other known base failures (`autonomous/index.test.ts` busy hand builder, `run/index.test.ts` idle 7 days) did not fail in this run.
- Changed-file tests after the fix wave: 6 files, 81 tests pass. Client test: 68 pass.

## Probe results (also in the ledger)
- Task 5, Step 4b (live paging beyond 25 comments): NOT observable. No ticket has more than 25 comments (max DGS-548 with 21). Paging is covered by stub tests and defended by the repeated-id stop plus the ledger and stamps-file guards.
- Task 7, Step 3b (description round trip, real write on DGS-546): ClickUp keeps the block and the table but escapes lines that start with `---` to `\---`. Sentinels are now plain words (`Hallmark totals begin (dg clickup ticket-total)` / `Hallmark totals end`); the legacy pair is still found and replaced. Re-probe: 1 begin, 1 end, stable after a second write.
- Task 9 (dry run on DGS-679): task 1 matches the spike proof ($0.4635, Haiku $0.0157, "Reviews: not recorded"); final $0.9825; `ticket-total` $4.0376 over 3 tasks, cost-state check $4.04.

## Observation for the Maestro (out of scope, from the Reviewer)
The stamps file stores `0` for missing review values. `ticket-total` maps them back to "not recorded" in `rowsFor` (source `none`: rounds, findings, fix rounds; source `findings.md`: fix rounds). A ledger-source stamp whose fix rounds were really missing would still show its stored 0. Not changed here: the file format stays as is. Stamps already written on DGS-546 (tasks 1-9) have source `ledger`.

## Open items
- The token calls (`task-end final`, `task-tokens`, `step-end`, snapshot) fail while a dangling symlink sits in `~/.claude/projects` (the empty target directories made by the conductor were removed again). The final stamp, the token snapshot and the `final` window need that fixed first. Nothing was changed in `~/.claude`.
- `findings.md` now holds the spike text and, below it, the review findings table.
- Live comment paging stays unverified until a ticket has more than 25 comments.

## First use (after the merge, by the conductor)
Rebuild first: `pnpm --filter @digismith/clickup-client build && pnpm --filter @digismith/cli build` (then `dg` has `task-stamp` and `ticket-total`).

1. DGS-546 itself, dry run:
   - `dg clickup task-stamp --task DGS-546 --all`
   - `dg clickup ticket-total --task DGS-546`
   Expect "already stamped (stamps file)" for tasks 1-9 and `final` (when stamped), then a block with the totals and one row per task, no row showing 0 where the comment says "not recorded".
2. DGS-546 live (writes to ClickUp): `dg clickup task-stamp --task DGS-546 --all --yes` (posts only a missed task), then `dg clickup ticket-total --task DGS-546 --yes`. Read back with `dg clickup get-task DGS-546` and the comments.
3. DGS-683 (Castle) backfill: `dg clickup task-stamp --task DGS-683 --all` (dry), then `--all --yes`, then `dg clickup ticket-total --task DGS-683` (dry) and `--yes`. Read back one task comment and the total.
4. Never `--yes` on any other ticket without the Maestro's word.

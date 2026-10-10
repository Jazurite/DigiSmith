# Fix order for dgs-214: Sol review of slice 2 (verified by b3-maestro, 2026-10-10 ~18:5x UTC+7 [11:5xZ])

Sol answer: `sol-review-2.md`. Verdict "ready after fixes". I checked each finding in `.worktrees/dgs-214-slice-2/`. Fix 1 and 2 on the branch, test-first, then rerun the gates.

## Fix 1 (verified, `entry.ts:47-49`)
`readLedger` throws when `--ledger` points at a missing or unreadable file. Worse: with `--ledger` given, the `snapshot --write` path skips the carry-forward
(`if (!flags.ledger)`), so even a tolerant read would wipe the task rows. Change: a missing or unreadable ledger prints a warning to stderr and is treated
as if `--ledger` was not given (task rows carry forward from the previous snapshot). Malformed content already parses to whatever rows it has. Tests:
`snapshot --write --ledger <missing>` exits 0, writes the file, and keeps the old task rows; `task-tokens --ledger <missing>` does not crash.

## Fix 2 (verified, `skills/adopt/SKILL.md:346,394` and `skills/subagent-driven-development/SKILL.md:120`)
The adopt path (adopt, then SDD) writes `step-start implementation` twice for one session with no end between them. Counts are not hurt (the last event wins), but the
registry gets a duplicate marker. Change in `entry.ts`: `step-start` writes nothing when the session's latest step event for this ticket is already a
`step_start` of the same step. Test it. Do not touch the skills.

## Rejected (no change)
- **Sol 3, double snapshot.** The two writes are intended: SDD writes with the ledger before it deletes the workspace; finishing writes again for every
  path (executing-plans has no SDD) and carries the task rows forward (cd66d3b, `previousTasks` checks schema and ticket). Not a bug.
- **Sol 4, test gap on `/clear`, resume, fork.** Those rules are Claude Code behavior, proven in `session-id-source.md`. `entry.ts` only reads the
  env var and the flag; its tests already cover that. Nothing to add.

## Then
Rerun all gates (tests, build). Report the new head commit and stop. I send the merge order after.
Rules as in `order-slice-2-build.md`: no push, no merge, counts only, title-only commits, no AI attribution.

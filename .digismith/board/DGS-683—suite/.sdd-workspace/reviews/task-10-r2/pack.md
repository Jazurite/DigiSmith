# Review pack: DGS-683 part 2, task 10, round 2 (scoped re-review of r1 fixes)

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: ab1e3d79 (r1 head)
Head: e7bdc94e
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md
r1 report: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/.sdd-workspace/reviews/task-10-r1/report.md

## Brief
Check only the four r1 fixes:
- F1: the fake herdr logs ${HERDR_SOCKET_PATH-unset} to $FAKE_LOG.env; the test asserts every call saw "unset" with the caller's HERDR_SOCKET_PATH set. Proven: with the env filter deleted the test goes red (1 failed, 17 passed), restored: 18/18.
- F2: merged pane/tab lists keep the first reply's envelope (test asserts the `id` field).
- F3: a repeated --workspace or --pane is refused (new test: tab create --workspace w2 --workspace w9 and the reverse order, agent start with two --pane).
- F4: docstring line about the ^w\d+$ check on HERDR_WS.
Verification: vitest 18/18; old script ALL PASS. No protected path in the diff.

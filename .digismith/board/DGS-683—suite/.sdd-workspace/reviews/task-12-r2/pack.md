# Review pack: DGS-683 part 2, task 12, round 2 (scoped re-review of r1 fixes)

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: 7924f90c (Suite -> Castle rename commit; r1 reviewed 3cad50ca)
Head: fab2cd9c
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md (read Suite as Castle: Maestro/Jack rename, spec and plan on main not edited)
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md
r1 report: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/.sdd-workspace/reviews/task-12-r1/report.md

## Brief
Check only the r1 fixes. The session is now named Castle (rename commit 7924f90c, already on the branch).
- F1/F2: `relocate_check` now PARSES argv instead of scanning it. Real flag lists from `herdr pane move --help` / `pane swap --help` (read-only): move value flags --tab --split --target-pane --ratio --workspace --label --tab-label, bool --new-tab --focus --no-focus; swap value flags --direction --pane --source-pane --target-pane. Refused: any `--flag=value`; any flag not in the list (including --new-workspace, --current, bare --, -x); a flag without its value; more than one positional; any positional for swap. A flag's value is never read as the positional. Swap needs (--source-pane or --pane) AND --target-pane. EVERY named pane and destination (--tab, --workspace) is checked against the scope; in Castle every named pane must belong to a tc-/nw- agent.
- F3: `audit()` takes a list of (target, workspace) items and writes one line per item outside HERDR_WS (a move/swap names several).
- F4: tests: option before the positional (`--target-pane w2:p1 w9:p1`), the = form for six flags on move and swap, unknown flag / second positional / bare -- / missing value, a value that looks like a pane, the Castle checks with options first, and the audit log for move (destination), move (other workspace's pane, ticket key), swap (both), own-workspace move (nothing).
- Ledger note (not a code change): the plan's example for `agent prompt dgs-2` -> _unmapped.log disagrees with its own rule (DGS-2.log); followed the rule, plan on main untouched.
Verification: vitest 51/51; old script ALL PASS. No protected path in the diff.

# Review pack: DGS-683 part 2, task 11, round 2 (scoped re-review of r1 fixes)

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: a508ba47 (r1 head)
Head: e9914eb7
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md
r1 report: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/.sdd-workspace/reviews/task-11-r1/report.md

## Brief
Check only the r1 fixes:
- F1: in Suite, `rename` (tab, agent, pane) is refused unless the CURRENT label/agent name (same read as close, shared `current_label()`) is tc-/nw- AND the new name (first word after the target) keeps a tc-/nw- prefix; a missing new name, `--clear` or an option as target is refused. Tests: the two-call bypass (rename w7:t1 -> tc-x refused, then close refused), tc- to tc- renames pass, default is not restricted. Proven: with the rename branch disabled 3 tests go red; restored 29/29.
- F2: fail-closed tests: fake `tab get` printing non-JSON (close and rename refused); `agent stop` with a pane-id target for a tc- agent (ok) and a non-tc agent (refused).
- F3: comment on the agent stop branch (no such herdr verb today, kept because spec 7.1 item 4 names it).
Real shapes checked read-only with `herdr <tab|agent|pane> rename --help`: tab `<TAB_ID> <LABEL>...`, agent `<TARGET> <NAME>|--clear`, pane `[OPTIONS] <PANE_ID> [LABEL]...` (a pane rename with leading options is refused in Suite: fails closed).
Verification: vitest 29/29; old script ALL PASS. No protected path.

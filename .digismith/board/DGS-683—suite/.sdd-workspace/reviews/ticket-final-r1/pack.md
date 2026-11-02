# Review pack: DGS-683 part 2 (herdr-ws scope), TICKET final review, round 1

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: 91554b768ceaa68c357e2a1edcf4478255fbcf78 (origin/main, up to date)
Head: fab2cd9c
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md (7.1, 6.3; read Suite as Castle: rename by Maestro/Jack, spec and plan on main not edited)
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md (Ticket A3, T10-T12)
Ledger: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/.sdd-workspace/progress.md
Task reports: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/.sdd-workspace/reviews/task-10-r2/report.md, task-11-r2/report.md, task-12-r2/report.md (all clean)

## Brief
Whole-branch review of part 2: only `scripts/opencode-boot/herdr-ws` (Python source, NOT installed) and `scripts/opencode-boot/herdr-ws.test.ts` (51 hermetic tests with a fake herdr). 8 commits: T10 scope parsing and --session; T11 the Castle close rule (label tc-/nw-, rename judged, shared current_label); pane move/swap relocate_check (argv parsed fail-closed); T12 audit log (one line per target outside HERDR_WS); the Suite -> Castle rename.
Look at the whole script as one guardrail: any path where a call reaches a workspace or session outside HERDR_SCOPE, a Castle conductor tab/pane/agent without tc-/nw- is closed, renamed or relocated, or the audit log is skipped/blocks. Remaining groups/verbs that could bypass (e.g. pane split --pane, pane run, pane input, send-keys targets given as flags) are worth a look: T10 checks only the first positional target.
Verification: vitest 51/51 (fork pool of 2); `node scripts/opencode-boot/test-herdr-ws.mjs` ALL PASS (read-only live). `git diff --name-only origin/main...HEAD` = scripts/opencode-boot/herdr-ws and herdr-ws.test.ts only: NO protected path. Deployed copy and live sessions untouched.

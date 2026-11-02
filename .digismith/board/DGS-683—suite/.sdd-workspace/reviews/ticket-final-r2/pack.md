# Review pack: DGS-683 part 2, TICKET final review, round 2 (scoped re-review of r1 findings)

Model: claude-sonnet-5-5 (Builder, seat dev0, run record S3b)
Base: fab2cd9c (r1 head)
Head: 0fd4eaf2
Worktree: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope (branch DGS-683__herdr-scope)
Spec: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/spec.md (read Suite as Castle)
Plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/plan.md
r1 report: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683-scope/.digismith/board/DGS-683—suite/.sdd-workspace/reviews/ticket-final-r1/report.md

## Fixed finding list (one commit, 0fd4eaf2)
- F1 Important: every verb outside list now (a) refuses any `--flag=value` token, (b) refuses `--current`, (c) checks every value of --pane, --tab, --workspace, --source-pane, --target-pane against the scope next to the positional target (same rule as relocate_check, which still handles move/swap). Tests: pane split/focus/zoom/resize/neighbor/input with a second --pane, read with --source-pane, split with --target-pane, tab focus with --tab/--workspace (all refused, nothing forwarded), a second target inside the scope passes, --current refused, the = form refused for tab create (twice and alone), pane split (--pane= and --direction=), agent start, agent prompt. Proven: with the flag-value loop disabled the --pane test goes red.
- F2 Important: audit() always writes. Own = HERDR_WS; when unset every non-read act in the Floor is logged with `own:"unknown"` in drivers/_unmapped.log (never silent; the key file is not used because own is unknown). Tests: HERDR_SCOPE-only case, reads still not logged. The old plan line "unset HERDR_WS (factory) writes nothing" is replaced by this decision (Maestro). Parts 4/5 (start-ticket and the bootstrap) set BOTH HERDR_SCOPE and HERDR_WS, so the normal conductor line carries its real own workspace.
- F3 Minor: each line now records `own`, `agent` and `pane` (a pane id target is resolved to its agent; an agent name target gets its pane id from `agent get` when herdr returns one).
- F4 Minor: accepted as spec 7.1 item 4 says (the Maestro notes it); no code.

Judgement: one audit line per WORKSPACE named by a call (a second pane in the same outside workspace adds no line).
Verification: vitest 58/58 (fork pool of 2); old read-only script ALL PASS. `git diff --name-only origin/main...HEAD` = scripts/opencode-boot/herdr-ws and herdr-ws.test.ts only: no protected path. Deployed copy and live sessions untouched.

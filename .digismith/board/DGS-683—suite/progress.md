# SDD ledger — plan: /Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-683/.digismith/board/DGS-683—suite/plan.md
Review mode: role
Checklist sync: skipped (conductor ticks the Tickets checklist)
Task 1: dispatch implementer agent=abf3e46ae3276e483 (base 123cfe1)
Task 1: implemented
Task 1: review requested
Review task 1 r1: F1 -> fixing (empty kind array)
Review task 1 r1: F2 -> fixing (numeric sort test)
Review task 1 r1: F3 -> fixing (status/floor/key/scopeFor tests)
Review task 1 r1: F4 -> parked (read-modify-write without a lock in putEntry/removeEntry: no code; CLI tasks T17-T21 must read this note and go in the final report)
Task 1: dispatch fix agent=abf3e46ae3276e483 (resumed, round 1)
Review task 1 r1: F1 -> fixed (d47e784)
Review task 1 r1: F2 -> fixed (d47e784)
Review task 1 r1: F3 -> fixed (d47e784)
Task 1: fix round 1/5 (3 addressed, 0 open; commits 76ef584..d47e784; Parent said "then Task 2": no re-review pack)
Task 1: complete (commits 123cfe1..d47e784, review approved, F4 parked)
Vitest flag that works (2 workers): --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
Task 2: dispatch implementer agent=ada2a32a6e3a533e5 (base d47e784)
Task 2: implemented
Task 2: review requested
Review task 2 r1: F1 -> fixing (formatRunsOn must not write a value parseRunsOn rejects)
Review task 2 r1: F2 -> fixing (parseRunsOn null cases)
NOTE for T3, T4, T7 (Reviewer, task 2): other readers of runs_on that expect 'herdr <pane>' must be covered when they start using parseRunsOn.
Task 2: dispatch fix agent=ada2a32a6e3a533e5 (resumed, round 1)
Review task 2 r1: F1 -> fixed (43d59ce)
Review task 2 r1: F2 -> fixed (43d59ce)
Task 2: fix round 1/5 (2 addressed, 0 open; commits a9e0a43..43d59ce)
Task 2: complete (commits d47e784..43d59ce, review approved)
Task 3: dispatch implementer (base 43d59ce)
Task 3: implemented
Task 3: review requested
Review task 3 r1: F1 -> fixing (keep strict empty-list rule, comment + pin test)
Review task 3 r1: F2 -> fixing (readLiveSessions to sweep verdict test)
Review task 3 r1: F3 -> fixing (validate session names from HERDR_SCOPE)
NOTE for T10 and the bootstrap (Maestro/conductor, task 3): every HERDR_SCOPE producer must write <session>:<workspace>.
Task 3: dispatch fix agent=a8f1e2c1332939343 (resumed, round 1)
Review task 3 r1: F1 -> fixed (e7456a5)
Review task 3 r1: F2 -> fixed (e7456a5)
Review task 3 r1: F3 -> fixed (e7456a5)
Task 3: fix round 1/5 (3 addressed, 0 open; commits cfccb36..e7456a5; note: fix tests written together with the fix, no red step seen)
Task 3: complete (commits 43d59ce..e7456a5, review approved)
Task 4: dispatch implementer (base e7456a5)
Task 4: implemented
Task 4: review requested
Rebase: onto origin/main clean (7 commits)
Review task 4 r1: F1..F4 -> fixed
Checklist sync: skipped (conductor ticks the Tickets checklist)
Task 5: implemented (75de9f9)
Task 6: implemented (86a270f1)
Tasks 5+6: review requested (pack reviews/task-5-r1)
Review tasks 5+6 r1: F1..F4 -> fixed (dce58d6b)
Tasks 5+6: review requested r2
Review tasks 5+6 r2: F5, F6 -> fixed
NOTE for T7: promptConductor/conductorCheck MUST use registryProblems(env) to report a clear conductor-config message when the factory conductor entry is invalid
Tasks 5+6: complete (review approved)
Task 7: BLOCKED: plan imports scripts/conductor/registry.ts from packages/cli/src/autonomous/conductor.ts; packages/cli tsconfig.build.json has rootDir "src", so `pnpm --filter cli build` fails with TS6059. vitest passes (968). Work left UNCOMMITTED in the worktree (conductor.ts, conductor.test.ts, registry.ts, registry.test.ts).
Registry moved to packages/cli/src/conductor-registry (94fdf4a7), shim in scripts/conductor/registry.ts; cli build passes
Task 7: implemented (4066e906)
Task 7: review requested
Review task 7 r1: F1..F5 -> fixed (89611c35)
Task 7: review requested r2
Task 7 r2: strip-types fix (parameter property) 08b36267; whole autonomous+scripts/conductor run green
Task 7: complete (review approved r2)
Task 8: implemented (00324d6)
Task 9: implemented (3286fbb8)
Tasks 8+9: review requested (pack reviews/task-8-r1)
Review tasks 8+9 r1: F1 (parallel calls, runOculusAsync), F2 (README), F3 (contract test) -> fixed
REPORT NOTE: part 3 changes scripts/nexus-shared/oculus.ts (live view schema: session, suite): after the merge the conductor runs the nexus-api install + restart and build-www
Tasks 7-9: complete
Rename task: Suite -> Castle done (9994254a), review requested (pack reviews/task-rename-r1)
Rename review r1: F2 -> fixed; rename task complete
Tasks 13-16: implemented (e11243b7): daemon files, bootstrap + fake herdr, conductor-watch, runbook
Tasks 13-16: review requested (pack reviews/task-13-r1)
Review tasks 13-16 r1: F1 F2 F3 F5 -> fixed, F4 -> guarded for working agents only (an idle agent with no STANDBY text in its last 400 lines is still briefed: inherited from the old script, kept)
Tasks 13-16: review requested r2 (baa7f669)
Review tasks 13-16 r2: approved; extra test for the no-sid path added. Tasks 13-16: complete
Task 22: implemented (c8a93d1b); review requested. Two autonomous tests fail on main itself (DGS-702 limits), not mine
Review task 22 r1: F1 F2 F3 + controller a,b -> fixed (531d15f8); review requested r2
Ledger note: defaultDeps() in autonomous/index.ts builds the depot from homedir and ignores DIGISMITH_DEPOT_DIR while driversDir honours it: a KNOWN LIMIT (equal in production where the variable is unset).
Task 22: complete (review approved r2)
Ticket pack ticket-final-r1 built (head 59cf28f7)
Ticket pack: scripts/herdr scripts were committed 100644 (core.fileMode false): fixed with update-index --chmod=+x (6e4d2053). Changed-folder run: 3 known base failures only
Ticket review r1: F1..F7 -> fixed (beb0b565); ticket-final-r2 requested
Ticket review r2: F8, F9 fixed (df71443a, 3ca95ee4). Whole suite at 3ca95ee4: 303 files (300 pass, 3 fail), 5112 tests (5109 pass, 3 fail). The 3 fail on origin/main ee9549d6 too: guardrails scan_every_minutes, autonomous/index busy hand builder, run/index 7-day list. Main checkout run: 3 failed | 120 passed.

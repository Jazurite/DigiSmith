# DGS-546 plan re-review, round 2 (scoped)

Reviewer: ticket type, claude-opus-5-5. Inputs: r1 report, `git diff 6db2f6a2..615fab91 -- .digismith/board`, the revised spec.md and plan.md, the code the revised text names (read only).

### Finding Verdicts

- **F1. Description round trip never checked; no read-back rule** — ADDRESSED. `plan.md:146` adds the read-back rule (both sentinels exactly once, else `warn:`, exit 1, no second write in the run); `plan.md:149` (T7 Step 3b) adds the real probe on DGS-546 with a fix loop for the block form; `spec.md:67` matches and narrows "byte-for-byte" to "in what we send".
- **F2. Absent `markdown_description` can wipe the description** — ADDRESSED. `plan.md:148` calls `getTaskByRef(ref, { include_markdown_description: true })` (the option exists, `packages/cli/src/clickup/get-task.ts:28`); `plan.md:146` refuses to write when the field is missing or empty while `description` is not, tested next to the write guard; `spec.md:67` matches.
- **F3. `final` stamp runs before `task_end final`** — ADDRESSED. `plan.md:156,160` place the call after the `task-end --task final` / `step-end implementation` block (`skills/subagent-driven-development/SKILL.md:663-664`) and before `## Finish` (`SKILL.md:669`, which deletes the workspace at ~678); `plan.md:163` adds an ordered `grep -n` check; `spec.md:80` matches.
- **F4. Ledger rules miss role-mode parking and the final fix wave** — ADDRESSED. `plan.md:56-59` add role-mode, hand-mode, final-review and malformed-line fixtures; latest ruling per finding; `rejected` and open `fixing` are kept apart from `fixed`; final fix rounds = `Scoped re-review` lines (`SKILL.md:606`). `parseVerdictEntries` matches `Review ticket final r<R>` and `-> fixing` (`packages/cli/src/reviewer/verdicts.ts:7`). Hand-mode findings changed from a sum to the highest `K`. `spec.md:35` matches. See N2 for the fallback scope.
- **F5. Missing transcript posts partial numbers as complete** — ADDRESSED. `plan.md:45` returns `missingSessions`; `plan.md:79,129,146` add the `Partial:` line and `partial: true`, and refuse `--yes` when no session was read; `spec.md:43` matches.
- **F6. Real paging call missing; repeated page not detected** — ADDRESSED. `plan.md:106` stops on a repeated id; `plan.md:108` (T5 Step 4b) adds the GET-only probe on a ticket with more than 25 comments with a pass rule; `spec.md:41` matches.
- **F7. Subagent attribution source not named** — ADDRESSED for `task-stamp` (`plan.md:131,133`: `parseTaskAgents` on the `--ledger` text, with a test). NOT ADDRESSED for the second half: neither file says that `ticket-total` on-the-fly rows (`(not stamped)`, run after the ledger is deleted) have no `dispatch ... agent=` rule. Minor, does not block.
- **F8. Agent time and tokens from different windows** — ADDRESSED. `plan.md:44` (sum of closed windows, Source line says so), test at `plan.md:38`; `spec.md:43`.
- **F9. `ticket-total` totals should leave out unattributed responses** — ADDRESSED. `plan.md:39,44,146`; `spec.md:54`.
- **F10. Whole-line marker match; discard path** — ADDRESSED in the plan (`plan.md:130` test for task 10 vs task 1; `plan.md:157,161,163` leave the discard option out) and in `spec.md:44,54`. The spec hook list was not updated: see N1.

### New Problems in the Revised Text

- **N1 (Minor). The spec contradicts itself on the discard option.** `spec.md:54` says `ticket-total` does not run in the "discard the work" option, but `spec.md:81` still lists line ~400 (the discard option, `skills/finishing-a-development-branch/SKILL.md:395-400`) among the hook points. The plan (`plan.md:157`) is right. Fix: drop `400` from `spec.md:81` and say "merge, push-and-PR and keep-as-is options".
- **N2 (Minor). One malformed verdict line drops the role-mode data of every task.** `plan.md:59,64` wrap `parseVerdictEntries` in try/catch over the whole ledger text; that function throws on the first bad line (`verdicts.ts:27`). The hand-mode fallback then reads `Task <N>: parked` lines, which role mode does not write, so every stamp of the build shows `0 parked` and fixed = findings. Fix: feed `parseVerdictEntries` one line at a time (or only the lines for this task) and skip a line that throws, so one bad line costs only itself.
- **N3 (Minor). The T7 probe step names an input the command does not have.** `plan.md:149` says "run `ticket-total --task DGS-546 --yes` once against a sample block with the exact form of `renderBlock`", but `ticket-total` builds its block from real data and has no sample-block option. Fix: say the probe writes the real block of DGS-546 (its tasks 1-6 have `task_end` by then, so the write guard passes), or name the throwaway script that writes a fixed sample.

### Out-of-Scope Observations

None.

### Verdict

**Plan re-review:** All six Important findings (F1-F6) are addressed, and F8-F10 are addressed. Open, all Minor: F7 (second half), N1, N2, N3. No Critical or Important finding is open, and the spec and the plan agree except for N1.

**Ready to merge?** Ready (the Builder may start the build). Fix N1 with the first commit, and fold N2 and N3 into T2 and T7 when the Builder reaches them.

```json findings
[
  {"id": "F7", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 146, "severity": "Minor", "what": "Neither file says that ticket-total on-the-fly rows cannot use the dispatch agent= rule, because the ledger is gone at finish", "scenario": "A (not stamped) task row leaves out a subagent response outside the window, with no note that the rule does not apply"},
  {"id": "N1", "path": ".digismith/board/DGS-546—hallmark/spec.md", "line": 81, "severity": "Minor", "what": "The spec hook list still includes line ~400 (the discard option), which contradicts spec line 54 and plan T8", "scenario": "A reader of the spec adds ticket-total to the discard option and writes totals for thrown-away work"},
  {"id": "N2", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 64, "severity": "Minor", "what": "parseVerdictEntries runs over the whole ledger in one try/catch, so one malformed verdict line sends every task to the hand-mode fallback", "scenario": "One bad Review line in task 5 makes every role-mode stamp show 0 parked and fixed = findings"},
  {"id": "N3", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 149, "severity": "Minor", "what": "The T7 probe says ticket-total runs 'against a sample block', but the command has no sample-block input", "scenario": "The Builder must guess whether to write the real DGS-546 block or build a separate script"}
]
```

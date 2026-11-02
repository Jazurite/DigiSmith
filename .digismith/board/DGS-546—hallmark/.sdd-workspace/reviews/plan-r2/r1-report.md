# DGS-546 plan review, round 1

Reviewer: ticket type, claude-opus-5-5. Inputs: spec.md, plan.md, the worktree (read only). No code exists yet; the plan is reviewed against the spec and against the code it names.

### Strengths
- Every spec command has a task: pricing (T1), review data (T2), text (T3), stamps file (T4), paging (T5), `task-stamp` with the three checks in spec order (T6), `ticket-total` with sentinels and the write guard (T7), the hook points (T8), a read-only smoke (T9).
- Tests come first in every code task, with mocks only (fake `ClickUpClient`, `DIGISMITH_TOKEN_REGISTRY_DIR`, temp projects dir). No test uses `--yes` on a real ticket. T9 is dry run only.
- The names the plan uses exist and fit: `taskForRecord`, the private `ledgerTask` (`packages/cli/src/tokens/snapshot.ts:53`, to be exported), `resolveAnthropicPrice`/`costFromPricing` (`prices/cost.ts:43,62`), `ANTHROPIC_PRICES_VERSION` (`prices/anthropic.ts:10`), `TICKET_PATTERN` (`registry.ts:6`), `getTaskComments` (`clickup-client/src/client.ts:223`), `updateTask` with `markdown_description` (`types.ts:273`).
- The long-prompt test (T1) pins the real Haiku bug of `findings.md` ($0.0785 summed against $0.0157 per response).
- The protected path `skills/finishing-a-development-branch/` is named in the Global Constraints and in T8. No custom field and no status change anywhere.
- Commit titles are title-only conventional commits with scope `dgs-546`. The three plan commits carry no AI attribution.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)

1. **F1. The description round trip is never checked on ClickUp, and the read-back has no rule.** `plan.md:127-140`.
   - What: spec line 64 asks the plan to check that ClickUp keeps the sentinel lines and the table through a write and a read, and to change the sentinels if it does not. T7 tests only `applyBlock` against a fake client. No step writes to a real ticket and reads it back. T7 step 1 says `--yes` "reads the description back to confirm the block", but no step says what happens when the read-back differs.
   - Why: ClickUp converts `markdown_description` to its own rich text and back. Consecutive lines with no blank line between them can merge into one paragraph. A pipe table with no `|---|` separator row is not a table. `---` lines can be rewritten. Then the sentinel search fails on the next run, the block is appended a second time, and the ticket gets two blocks. The text outside the block can also change: the "byte-for-byte" rule can only hold for what we send, not for what ClickUp keeps.
   - Fix: add a probe step to T7 (or to "First use", before the hook goes live): one write and one read-back on DGS-546 with the exact block, then compare. Fix the block form from the result (for example blank lines between the lines, a separator row, or sentinels that survive the round trip). In code: when the read-back does not contain both sentinels exactly once, print `warn:` and exit 1, and never write a second time in the same run.

2. **F2. An absent `markdown_description` can wipe the description.** `plan.md:138`.
   - What: `getTaskByRef` returns `markdown_description` only when `include_markdown_description: true` is passed (`packages/cli/src/clickup/get-task.ts:28`). The plan says "use the Markdown field the client returns", but it does not require the parameter and it has no rule for a missing field.
   - Scenario: the parameter is left out, or the API omits the field. The code treats the description as `""`, appends the block, and `updateTask` replaces the whole description with only the block.
   - Fix: T7 step 3 passes `include_markdown_description: true`. When `markdown_description` is missing or empty while `description` (plain) is not empty, refuse to write (`warn:`, exit 1). Add this case to the T7 tests next to the write guard.

3. **F3. The `final` stamp runs before `task_end final`, so it never posts.** `plan.md:145,149`.
   - What: T8 puts the `final` call "after `Task final: complete`, around line 657". In `skills/subagent-driven-development/SKILL.md`, `Task final: complete` is at line 657 and the `task-end --task final` block comes later, at line 663. The stamp needs `task_end` (spec line 79). Spec line 77 has the same wording, so the plan inherited the defect.
   - Scenario: every build reaches the `final` stamp with no `task_end final` in the registry. `task-stamp` prints "task not ended" and exits 0 (T6 test). So no warning shows, and no final stamp is ever posted.
   - Fix: put the `final` call after the `task-end --task final` / `step-end implementation` block (line ~663) and before the Finish section deletes the workspace (line 678), so `--ledger` still exists. The T8 check should look for that order.

4. **F4. The ledger rules miss how parking and the final fix wave are written today.** `plan.md:52-59` (spec line 35).
   - What: T2 counts parked findings from `Task <N>: parked` lines and fix rounds from `Task <N>: fix round` lines. Those lines are written only at the round-5 breaker (`SKILL.md:460`). In role mode, which is how this build runs, the Maestro's ruling is written only as `Review task <N> r<R>: F<n> -> parked (...)` (`SKILL.md:579`). The final review has no `Task final: parked` or `Task final: fix round` lines. It uses `Final review: parked — F<n> ...` (`SKILL.md:611`), `Review ticket final r<R>: F<n> -> ...` and one `Scoped re-review (...)` line per fix wave. Also, "fixed = findings minus parked" counts a `rejected` finding as fixed, and "findings = sum of K over `reviewed` lines" counts a finding again each time a re-review reports it still open.
   - Scenario: a role-mode task with one finding parked by the Maestro shows `(1 fixed, 0 parked)`. Every final stamp shows `0 parked`, `Fix rounds: 0`.
   - Fix: count fixed, parked and rejected from the verdict lines with the existing `parseVerdictEntries`/`parseVerdictLines` (`packages/cli/src/reviewer/verdicts.ts:19,35`; an import only, the folder stays untouched), latest ruling per finding. Keep the `Task <N>: parked` lines as a fallback for hand mode. For `final`, fix rounds = the number of `Scoped re-review` lines. Add a role-mode ledger fixture and a final-review fixture to the T2 tests.

5. **F5. A missing transcript gives a stamp with wrong numbers that is never corrected.** `plan.md:27-44,104-125`.
   - What: when `findTranscript` finds nothing, `countTicket` prints one line to stderr and goes on (`packages/cli/src/tokens/count.ts:28-31`). `collectRecords` keeps that behavior. The plan has no rule for it. Claude Code prunes old transcripts, and backfill (DGS-683, DGS-679, `--all`) is the main case where this happens.
   - Scenario: a backfill on a ticket whose worker transcript was pruned. The task still has a registry window, so the stamp posts low or `$0` numbers as if they were complete. The ledger line and the stamps line then block a correct stamp later, because there is no re-stamp path.
   - Fix: `collectRecords` returns the sessions it could not read. `task-stamp` and `ticket-total` then either refuse with `--yes` (`warn:`, exit 1), or add one text line `Partial: <n> session(s) without transcript` and store `partial: true` in the stamps line. Add a T6 test with one missing transcript.

6. **F6. The spec's real read-only call for the paging is not in the plan.** `plan.md:92-102`.
   - What: spec line 41 says the first task checks `start`/`start_id` "against the stub and against one read-only call on a real ticket". T5 tests only the stub. T9 runs no paging call.
   - Why: the stub proves only our own assumption (oldest row's `date` as `start`, its `id` as `start_id`). If ClickUp ignores the pair or reads it another way, check 3 can loop over the same 25 rows until `maxPages`. Nothing would show it.
   - Fix: add a T5 step: one read-only `getAllTaskComments` call on a ticket with more than 25 comments, then confirm that page 2 has no ids from page 1 and older dates. Also stop the loop when a page repeats an id already seen.

#### Minor (Nice to Have)

7. **F7. Subagent attribution needs `taskAgents`, and the plan does not say where it comes from.** `plan.md:123`. T1 tests the `dispatch ... agent=<id>` rule, but T6 step 3 does not say that `--ledger` is parsed with `parseTaskAgents` (`tokens/ledger.ts:1`) and passed to `taskUsage`. `ticket-total` runs after the ledger is deleted, so its on-the-fly rows cannot use that rule. Name both points.

8. **F8. Agent time and tokens can come from different windows.** `plan.md:42`. The window is the "latest pair", but `taskForRecord` assigns the responses of every window of the task (a re-opened task, or a window closed by the next `task_start`). Then `agent time` shows only the last window and the token counts cover all of them. Use the sum of the closed windows, or note the rule in the Source line.

9. **F9. `ticket-total` totals should leave out responses from other tickets.** `plan.md:136`. `collectRecords` also returns responses that a resumed transcript replays from sessions outside the ticket. `buildSnapshot` puts them in `unattributed`. The T7 test "every response of the ticket" should say that `unattributed` is excluded, so the totals match the snapshot.

10. **F10. Match the marker by whole line, and leave the discard path out.** `plan.md:114,150`. Check 3 should match the first line exactly (`Hallmark task 1 of DGS-546`), not by prefix. Today's text cannot collide, because the marker ends in `of <Key>`, but a test for task 1 against task 10 costs little. Also, T8 adds `ticket-total` to the "discard the work" block (`finishing-a-development-branch/SKILL.md:400`). Writing totals into the description of discarded work is a choice the Maestro should make. Leave that block out unless the Maestro says otherwise.

### Recommendations
- Change spec lines 35 and 77 together with plan T2 and T8 (F3, F4), so that the spec and the plan stay the same.
- Do the F1 and F6 probes in one read-and-write session on DGS-546 before T8 turns the hooks on. Then the first live stamps run on a form that is known to work.

### Assessment

**Ready to merge?** With fixes

**Reasoning:** The plan covers the spec well and keeps its tests on mocks. Fix six points before the build starts: two missing real checks (the description round trip, the comment paging), one unsafe description write, the `final` hook in the wrong place, review counts that do not match how the ledger is written, and stamps with wrong numbers when a transcript is missing.

```json findings
[
  {"id": "F1", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 134, "severity": "Important", "what": "No task checks the description block round trip on ClickUp (spec line 64), and no rule says what to do when the read-back differs", "scenario": "ClickUp merges the block lines or rewrites the --- sentinels; the next run does not find them and appends a second block"},
  {"id": "F2", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 138, "severity": "Important", "what": "The description read does not require include_markdown_description and has no rule for a missing markdown_description", "scenario": "The field is absent, the code treats it as empty, and updateTask replaces the whole description with only the block"},
  {"id": "F3", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 145, "severity": "Important", "what": "The final task-stamp hook is placed after 'Task final: complete' (SKILL.md:657), before task-end final (SKILL.md:663)", "scenario": "Every build calls the final stamp before task_end final exists; it prints 'task not ended', exits 0, and never posts"},
  {"id": "F4", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 53, "severity": "Important", "what": "The ledger rules count parked findings and fix rounds from lines that role mode and the final review do not write; rejected findings count as fixed", "scenario": "A role-mode task with a Maestro-parked finding shows 1 fixed, 0 parked; every final stamp shows 0 parked and 0 fix rounds"},
  {"id": "F5", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 41, "severity": "Important", "what": "A missing transcript is only logged, so the stamp posts partial numbers as complete and the idempotence guards block a correct stamp later", "scenario": "A backfill on a ticket whose worker transcript was pruned posts $0 or low numbers permanently"},
  {"id": "F6", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 98, "severity": "Important", "what": "The spec's one read-only real call to confirm start/start_id paging is missing; only the stub is tested, and a repeated page is not detected", "scenario": "ClickUp ignores the pair; check 3 reads the same 25 rows up to maxPages and misses an older marker"},
  {"id": "F7", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 123, "severity": "Minor", "what": "T6 does not say that --ledger is parsed with parseTaskAgents for subagent attribution; ticket-total on-the-fly rows cannot use it", "scenario": "A subagent response outside the window is left out of the task stamp"},
  {"id": "F8", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 42, "severity": "Minor", "what": "Agent time uses the latest task_start/task_end pair, but the token counts cover every window of the task", "scenario": "A re-opened task shows the agent time of its last window and the tokens of all its windows"},
  {"id": "F9", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 136, "severity": "Minor", "what": "The ticket-total totals do not say that unattributed (other-ticket) responses are excluded", "scenario": "A resumed transcript replays another ticket's responses and they are added to this ticket's total"},
  {"id": "F10", "path": ".digismith/board/DGS-546—hallmark/plan.md", "line": 150, "severity": "Minor", "what": "The marker match is not stated as a whole-line match, and ticket-total is added to the discard path", "scenario": "Totals are written into the description of work that was discarded"}
]
```

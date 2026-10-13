# DGS-438 plan: desktop card and the idle catch-up

Worktree `.worktrees/dgs-438` (branch `dgs-438`, from origin/main 5932ee3). TDD, pnpm. Touches only `scripts/identity.ts`, `scripts/session-cards/`, `scripts/conductor/idle-check*.ts` (+ one new small stamp file). Not `cli.ts` or the flux files (dgs-435).

## (a) runs_on desktop
Today `cardFromIdentity` (scripts/identity.ts:170) writes `ssh` when `SSH_CONNECTION` is set, else `desktop`. So a Desktop session that inherits `SSH_CONNECTION` (Desktop launched from an ssh login, or a launchd env) is mislabelled `ssh`.
Rule: `CLAUDE_CODE_ENTRYPOINT=claude-desktop` => `desktop` (wins over SSH_CONNECTION); else `SSH_CONNECTION` => `ssh`; else `desktop` (unchanged default).
Tests first (identity.test.ts): entrypoint desktop + SSH_CONNECTION => desktop; SSH only => ssh; neither => desktop.

## (b) header comment
Rewrite the header of `prompt-identity.ts`: Desktop does fire SessionStart; the DGS-437 cause was a stale Desktop plugin copy (no hooks). This handler stays as the fallback (a stale copy, a missed event). Comment only, no test.

## (c) skip harness notices
New pure `isHarnessNotice(prompt)` in `scripts/session-cards/prompt-kind.ts`: true when the trimmed prompt starts with `[SYSTEM NOTIFICATION`, or is a task notification (`<task-notification` / `<system-reminder` wrapper), or is empty. `idleHandler` returns nothing for those, and does NOT count them as a Jack message in (d). `identityPromptHandler` also skips them for the catch-up regex (already narrow).
Tests first: each notice shape => silent even when idle; a normal prompt still triggers.
Open: I only know the two shapes in the ticket. I will grep recent transcripts in `~/.claude/projects/` (read-only, prompt field only) for other shapes before fixing the list.

## (d) idle = Jack's own idleness, no repeats
**Measure.** A per-session stamp file `<depot>/sessions/<project>/.idle/<session>.json` = `{ "last_prompt": ISO, "caught_up_head": "<sha>", "caught_up_at": ISO }`. Written by the idle handler on every REAL user prompt (not harness notices), after it decided. `last_prompt` therefore means "time of Jack's previous message in this session". Not the card's `last_seen` (the heartbeat moves it on every prompt, and other sessions' cards are never read any more).
**Trigger.** Fire when ALL hold: own card is an open maestro (as now); the prompt is a real one; a stamp exists and `now - last_prompt >= IDLE_MIN` (default 30 min, the same number as catch-up `--max-age-min`; env `DIGISMITH_IDLE_MIN` override); something changed (below). First prompt of a session (no stamp): silent, the identity/startup path covers it.
**No repeat of an unchanged catch-up.** "Changed" = the newest commit on origin/main of the repo (`git rev-parse origin/main`, local, no fetch; 2 s timeout) differs from `caught_up_head`. The stamp stores the head at the time the catch-up was asked for. Same head => silent (nothing merged since). Git error => silent. Fewer false triggers, and a merge is exactly what Jack wants to hear about.
Other sessions' activity is no longer read at all: `isIdle` in catch-up-window.ts stays (the catch-up window still uses `newestOtherSeen`), the handler stops calling it.
**Safety.** Stamp path built from `isSafeName` values only; write is atomic (tmp + rename); any error => silent, never throws. Stamp lives in the depot, not the repo.
Tests first (idle-check.test.ts, idle-check-hook.test.ts): idle 40 min + new head => fires and stamps; idle 5 min => silent; idle but same head => silent (no repeat); other session active, Jack not idle => silent (the bug); harness notice does not refresh `last_prompt` nor fire; no stamp => silent and stamp written; unsafe names => silent; the existing "runs before heartbeat" test adapted.

## Order of work
1. tests+code (a); 2. comment (b); 3. tests+code (c); 4. tests+code (d) with injectable clock, head reader and stamp dir; 5. register nothing new (same handler); full suite `pnpm test`; 6. independent Claude whole-branch review, fix verified findings; 7. report.md, report.html, plan.md committed together by path; 8. wait for "go: merge" (after DGS-462), rebase, suite, hooks 01-03, push, remove worktree and branch.

## Questions for the Maestro
1. IDLE_MIN 30 min OK?
2. "Changed" = origin/main head moved. Also count a changed conductor note / new report? I recommend head only (simple, deterministic).
3. Sessions started before the merge have no stamp: silent on their first prompt, then normal. OK?

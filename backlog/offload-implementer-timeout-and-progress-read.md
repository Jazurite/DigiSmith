# offload-implementer: timeout floor too low, undocumented progress-read options

**Status:** Not applied. Two related findings from a real live test, out of scope for the task
that found them.

**Source:** 2026-08-28, during V.1's (Depot OpenCode server management) Task 2 live
end-to-end smoke test. Both findings are about `skills/offload-implementer/SKILL.md`'s existing
Step 4 (dispatch) content, which that task deliberately didn't touch — V.1 only rewired Step 2.

## Finding 1: Step 4's timeout guidance is too conservative in practice

Step 4 currently says to use "an explicit `Bash` tool `timeout` of at least 300000ms
(5+ minutes)." A real dispatch during V.1's own smoke test needed ~11.5 minutes — even a
580000ms attempt (near the Bash tool's own 600000ms/10-minute ceiling) timed out before the
dispatch finished. Nothing in the file is factually wrong (it does say "at least"), so this
wasn't a defect worth blocking that task's merge over, but the practical floor is higher than the
guidance implies, and a foreground timeout can legitimately never be enough — real latency can
exceed the Bash tool's own maximum ceiling entirely.

**Possible fix, not yet decided:** strengthen Step 4 to recommend starting with
`run_in_background: true` for fresh dispatches rather than an ever-larger foreground timeout,
since a foreground call is capped by the tool's own ceiling in a way backgrounding isn't.

## Finding 2: two undocumented but useful mechanisms found live

- An orphaned `opencode run` client process survives the Bash tool's own shell-kill (when a
  foreground call times out) and keeps writing to its redirected `--format json` events file —
  meaning the dispatch itself isn't actually lost when the *tool call* times out, only the
  client's connection to it.
- The OpenCode server's own REST API (`GET /session/<id>/message?directory=...`) can read a
  session's live progress after a timeout, without needing a `--session` resume via `opencode
  run` at all.

Neither is documented anywhere in `offload-implementer`'s Error Handling section currently. Both
could make the existing "Bash tool times out" disposition more concrete — right now it just says
to raise the timeout or wait for backgrounding; these two facts suggest a third option (poll the
still-running dispatch directly) that's never been written down.

## Why not applied yet

Both are real, useful findings about *unchanged* Step 4/5 content, found while working on a
different task (V.1) that had no mandate to touch that section. Worth a future pass at
`offload-implementer`'s Error Handling section specifically, once someone's actually motivated to
touch it again (e.g. alongside K.3-K.7, if that work ends up sharing dispatch mechanics).

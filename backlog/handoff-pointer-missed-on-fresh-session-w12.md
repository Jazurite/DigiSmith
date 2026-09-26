# W.12's SessionStart pointer can silently miss on a freshly-cleared session

**Status:** Not applied — and now moot day-to-day. Single occurrence, root cause narrowed but
never confirmed (see "First theory, ruled out" below). Jack sidestepped recurrence risk directly
rather than chase the harness bug further: this repo's `clear_context` preference is now set to
`no` (2026-09-25, `[[feedback_no-auto-clear-context]]`), so Step 7 no longer auto-clears and this
exact window (clear → idle gap → app relaunch → missed pointer) no longer opens on its own. Also
worth noting: a later session resume (2026-09-26) logged `SessionStart:resume hook success` with
DigiSmith's pointer line present and correct — so the hook *can* fire cleanly on a `resume`
source; whatever happened on 2026-09-25 either doesn't reproduce reliably or needed the specific
clear→(idle)→relaunch sequence this preference change now avoids. Left as a historical record,
not something actively being chased.

**Source:** 2026-09-25, the first real session boundary after W.12 (Handoff on Clear) shipped.
The session that built W.12 wrote its own handoff file as a live exercise of the new mechanism,
then cleared per Step 7. Jack reported "there is no file yet after you clear the session" on
picking the work back up.

## What happened, precisely (from the desktop app's own `main.log`)

This was never a "new session missed it" story — it's a single long-lived desktop session
(`local_67749fc3-...`, alive since 2026-09-19) whose underlying CLI process got torn down and
re-created:

1. `08:41` — Step 7 writes `.digismith/sessions/local_67749fc3-....md` (5 well-formed sections,
   correct content — confirmed by reading it directly).
2. `08:42:11` — the turn ends and `clear_session` fires immediately, exactly as documented:
   `Clearing session local_67749fc3-...` / `clearStaleResumeHandle ... reason=clearSession
   dropping cliSessionId=0af19cf5-...`. Step 7's "only takes effect once the turn ends and the
   session goes idle" logic worked correctly — no delay, nothing queued past this point.
3. No activity for ~86 minutes (app closed or machine slept).
4. `10:08:12`/`10:08:23` — the app relaunches and resumes `local_67749fc3`
   (`resume=app_relaunch/5160s` in the `[CCD start-timing]` line). Because step 2 dropped the old
   `cliSessionId`, this resume spins up a **genuinely fresh underlying CLI session/process** — not
   a reconnect to old state. This fresh CLI session is the one that opened with Jack's "no file"
   message.
5. Running the exact `hooks/hooks.json` `SessionStart` command by hand
   (`node --experimental-strip-types .../scripts/session-init.ts`, cwd = repo root) reproduces the
   correct pointer line every time:
   ```
   DigiSmith: handoff from prior session — "W.12 shipped: Handoff on Clear — ..." — read
   .digismith/sessions/local_....md, then delete it once used
   ```
6. But that pointer never reached the fresh session's actual context — only the unrelated
   `superpowers` plugin's own `SessionStart` hook output (its `using-superpowers` skill dump)
   showed up. Both plugins register `SessionStart` with `matcher: "*"`; only one produced visible
   output for the same event.

## First theory, ruled out

The initial pass (before pulling `main.log`) suspected the plugin-cache lifecycle: the installed
`cache/jazurite/digismith/0.66.0-beta` directory had a dead PID's `.in_use` marker and an
`.orphaned_at` timestamp landing close to the incident. That timestamp (`09:59:03` local) turned
out to be the app's routine 20-minute background plugin-sync tick
(`[RemotePluginManager] Starting periodic sync (interval: 1200000ms)`), unrelated to this
session's own resume path at `10:08`. Coincidental timing, not causal — retracting that theory
rather than leaving it standing.

## Why this matters

W.12 exists so a freshly-resumed session never has to reconstruct context by hand. If its own
`SessionStart` pointer can silently no-show on exactly the kind of event (clear → later resume →
fresh CLI session) it was built to cover, the fallback is a `.digismith/sessions/*.md` file
nobody points to — no worse than before W.12 existed, but short of the guarantee it was built to
provide.

## What's still worth examining

- `main.log` is the Electron/desktop-app log — it records session and plugin *lifecycle* events
  (spawn, clear, resume, sync) but never a hook command's own stdout/stderr/exit code. Confirming
  whether `session-init.ts` ran and produced nothing, ran and threw, or was never invoked at all
  needs the underlying `claude` CLI's own hook-execution/debug output (e.g. `claude --debug`),
  which wasn't captured for this session.
- The log shows this desktop app resolves plugins through at least two different paths: some are
  "passed ... over stdin (initialize request)" while a separate count is "left to the CLI's own
  loader (not passed as `--plugin-dir`)". Whether DigiSmith and `superpowers` consistently take
  the *same* path across a clear→resume cycle (vs. sometimes different ones) wasn't confirmed —
  the one `[CCD start-timing]` line captured for the actual incident shows `plugin_dirs=2
  (initialize)`, which reads as both local plugins being included, so this lead is weaker than it
  first looked, not stronger.
- Whether this reproduces on a second clear→(long gap)→app-relaunch cycle, or was a one-off.

## Why not applied yet

No known change to `session-init.ts`, `hooks/hooks.json`, or Step 7 would address a hook silently
producing no output while a structurally identical hook on another plugin fires correctly — if
there's a real bug here, it most likely lives in the host application's hook-invocation path, not
in anything this repo controls. Recorded with the corrected, log-backed timeline so a second
occurrence starts from real evidence instead of re-deriving it, and doesn't have to re-chase the
already-ruled-out plugin-cache theory.

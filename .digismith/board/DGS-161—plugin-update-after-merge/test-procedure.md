# Live test: does /reload-plugins apply a plugin update without a restart?

Run this from the maestro, using this ticket's own worker pane (`dgs-161`) as the test subject —
not a throwaway pane (memory is tight on this VPS). This pane's session started before this
ticket's own merge bumps the plugin version, so it is a genuine stale-session test with no extra
process needed. Run it after this ticket has merged to `main` and hook 02 has successfully run
`claude plugin update digismith@jazurite`.

**Observable:** invoking any skill prints `Base directory for this skill:
<...>/cache/jazurite/digismith/<version>/skills/<name>` as the first line of that skill's output.
The version number in that path is a direct read of which cache directory this specific session
is actually loading from right now — not what is merely installed on disk.

## Steps

1. **Before.** Confirm `~/.claude/plugins/cache/jazurite/digismith/` has a version directory newer
   than what this pane loaded at its own session start. Then run:

   ```
   herdr --session DigiSmith agent prompt dgs-161 "Invoke any digismith skill (for example digismith:toolchain with a harmless read-only argument) and report only its first line."
   ```

   Read the pane's reply. The version number in `Base directory for this skill:
   .../digismith/<version>/skills/...` should be the *old* version. If it already shows the new
   version, this pane already picked it up some other way — stop, this is not a valid test
   subject.

2. **Reload.** Confirm the pane is idle (not mid-turn — a plugin change only applies once the
   current response finishes), then send:

   ```
   herdr --session DigiSmith agent prompt dgs-161 "/reload-plugins"
   ```

   Read whatever the pane prints in response.

3. **After.** Repeat the exact same prompt from step 1:

   ```
   herdr --session DigiSmith agent prompt dgs-161 "Invoke any digismith skill (for example digismith:toolchain with a harmless read-only argument) and report only its first line."
   ```

   Read the version number again.

4. **Pass / fail / inconclusive.**
   - **Pass** — the "after" version is the new version and the "before" version was the old one.
     `/reload-plugins` genuinely updates a live session without a restart.
   - **Fail** — the "after" version is unchanged. Try
     `herdr --session DigiSmith agent prompt dgs-161 "/reload-plugins --force"` once, then repeat
     step 3. Still unchanged → `/reload-plugins` does not apply a marketplace plugin version bump
     here; a restart (closing and reopening the agent) is the only path, same as before this
     ticket.
   - **Inconclusive** — either command's reply contains wording like "not available over a remote
     connection" or similar refusal text. Record the exact wording — it would mean herdr's own
     pane is treated as a remote connection by the CLI, which changes the assumption that only the
     Desktop maestro is affected.

5. **Report back** (pass/fail/inconclusive, plus the exact wording of anything unusual) so hook
   02's reminder text (`.digismith/hooks/post-finish/02-plugin-reinstall.md`) can be tightened
   from "try, and restart if stale" to a confirmed statement either way, in a follow-up change.

## Maestro variant: does a clear_session reload the plugin?

New evidence (2026-10-04): after the maestro's own `clear_session` at 07:49 UTC+7 [00:49Z],
`digismith:handoff` loaded from `.../cache/jazurite/digismith/0.78.0-beta/skills/handoff` with
its Part B text, while before that clear the maestro still had the old skill text (Jack's
complaint of 2026-10-03 22:24 UTC+7 [15:24Z]). This suggests a clear reloads the plugin for the
maestro — but it is not proven: the session could instead have restarted around the same time.
This variant isolates the question with the same before/after observable as the worker-pane test
above, run on the maestro itself instead of a herdr pane:

1. **Before any merge.** In the maestro's own session, invoke any skill and note the version in
   `Base directory for this skill: .../digismith/<version>/skills/...`.
2. **After the next merge that bumps the version** (this ticket's own merge, or any later one) —
   with no clear in between — invoke a skill again, the same way. Expect the *old* version still
   (confirms the maestro doesn't pick up a bump passively, matching the original "restart
   required" complaint).
3. **Then clear** (`clear_session` on the maestro itself, per the Flux protocol's own M3/M4) and
   invoke a skill again. Expect the *new* version if a clear genuinely reloads the plugin for a
   remote session.

Pass (step 3 shows the new version) is evidence a clear reloads the plugin, though still not
proof against "it also happened to restart" unless that possibility can be ruled out separately.
Fail (step 3 still shows the old version) means neither a clear nor passive time alone reloads
the maestro's plugin, and only a true process restart does.

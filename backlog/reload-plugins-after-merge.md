# Use `/reload-plugins` to refresh running sessions after a plugin update

**Status:** Idea, Jack's call (2026-10-04 10:08 UTC+7 [03:08Z]: "OMG this is great findings. Add the backlog to use this new command
`reload-plugins`"). No design yet. ClickUp: **DGS-162** (list A.3: Lifecycle Hooks, created 2026-10-04 10:12 UTC+7 [03:12Z] with Jack's yes; task id `14zcebruqrw`).
It follows DGS-161.

**Source:** the DGS-161 live test, 2026-10-04. Test steps and the maestro variant:
`.digismith/board/DGS-161—plugin-update-after-merge/test-procedure.md`. It settles point 2 and gives a signal for point 3 of
[auto-update-plugin-after-merge.md](auto-update-plugin-after-merge.md).

## What the test proved

- **A herdr worker pane reloads without a restart.** `herdr --session DigiSmith agent prompt <agent> "/reload-plugins"` prints
  "Reloaded: 1 plugin · 34 skills · 6 agents · 1 hook". A skill in that pane loaded from `.../digismith/0.78.0-beta/` before the
  command and from `.../digismith/0.79.0-beta/` after it (08:49 UTC+7 [01:49Z]).
- **The Desktop maestro does not update on its own.** It kept loading `0.78.0-beta` while the cache already held `0.79.0-beta` and
  later `0.80.0-beta`.
- **The Desktop maestro reloads too, when Jack types the command.** Jack typed `/reload-plugins` in the maestro (about 10:05 UTC+7
  [03:05Z]). It printed "Reloaded: 5 plugins · 64 skills · 6 agents · 1 hook · 0 plugin LSP servers", and the next skill loaded from
  `.../digismith/0.80.0-beta/`. The maestro is a remote session, and the CLI string "isn't available over a remote connection" did not
  stop it.
- **The observable** is the first line of any skill's text: `Base directory for this skill: .../digismith/<version>/skills/<name>`.

So a plugin update needs no restart. Before this, the maestro had no path at all.

## What to build (ideas)

1. **Reload the worker panes after a merge.** When a merge bumps the version and hook 02 succeeds, the maestro sends
   `herdr --session <session> agent prompt <agent> "/reload-plugins"` to every live Claude worker in every herdr session
   (`DigiSmith`, `emma`, `Soveron`). Put the step in the runbook's "Merge order for a worker" now, and into `dg workbox` later
   (DGS-151, for example `dg workbox reload`).
2. **Reload the maestro.** Today Jack types the command in each Desktop maestro (`DigiSmith`, `Emma`, `Soveron`). Find out whether the
   maestro can do it for itself: a `send_message` to its own session (a peer message probably lands as text and not as a command), a
   plugin hook, or a session tool. Until then the maestro asks Jack to type it after every version bump.
3. **Hook 02.** Change its reminder to the confirmed statement (the maestro and the worker panes both reload). It says "untested on
   the Desktop maestro" today. Later hook 02 could print the exact reload steps for the live roster.
4. **A check after the reload.** The maestro invokes any skill and reads the version in "Base directory". A small helper could print
   the version a session loads, so a reload is verified and not assumed.
5. **The cache flush.** Point 3 of the old item says nothing tells us when no session still loads an old version. Once every live
   session has reloaded and each one is verified on the newest version, the old folders are unused. That is the safe signal. The
   folders `0.73.0-beta` to `0.79.0-beta` could then go, by hand and with Jack's ok, not automatically.

## Open questions

- Does a reload sent to a busy pane wait for the current turn to end? The CLI text said so; untested. Reload only idle panes until
  it is known.
- Is a reload safe for a worker in the middle of a task, when a skill's text changes under it? Reload at checkpoints, not mid-turn.
- Emma and Soveron maestros use the same plugin. Does the same typed command work there? Probably, not tested.
- Can the maestro trigger its own reload (idea 2)?
- Does `clear_session` also reload? The 2026-10-04 07:49 sign was not proof. With `/reload-plugins` working, the answer matters less.

## Related

[auto-update-plugin-after-merge.md](auto-update-plugin-after-merge.md) (DGS-161), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151),
[workbox-idle-cleanup.md](workbox-idle-cleanup.md) (DGS-153), the DGS-161 test procedure.

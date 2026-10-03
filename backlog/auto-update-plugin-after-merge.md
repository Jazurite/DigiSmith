# After a merge to main, the plugin update on the VPS should run by itself

**Status:** Idea, Jack's call (2026-10-03 22:24 UTC+7 [15:24Z]): "Update the plugin so my session has the new skill clauses. This
should be done automatically next time, add backlog." No design yet. ClickUp: no ticket yet. Under "no ticket, no work" this item
needs one: ask Jack for the list (candidates: C.1 Workbox, A.3 Lifecycle Hooks).

**Source:** the merge of Flux build 1 (DGS-154, 2026-10-03). The merge changed `skills/handoff` and
`skills/finishing-a-development-branch`, and the maestro session kept the old skill text until someone updated the plugin by hand.

## What's wrong

- The installed plugin (`digismith@jazurite`, marketplace `jazurite`, source `git@github.com:Jazurite/DigiSmith.git`, version
  `0.75.0-beta` on 2026-10-03) stays at its old version after a merge. Nothing updates it. The maestro, the workers and any other
  session keep using the old skill text.
- `claude plugin update <plugin>` exists, but it says "restart required to apply". A running session does not pick up the new
  skills. The Desktop maestro cannot restart itself, and `clear_session` keeps the process (same pid), so a clear may not reload
  the plugin either (not tested).
- A feature that changes a skill cannot be tried live in the session that built it, until the update and the restart happen. This
  is the same gap as [plugin-cache-lag-self-development.md](plugin-cache-lag-self-development.md), seen from the other side: after
  the merge, not before.

## The idea

A step that runs after a merge to main on the VPS: refresh the marketplace, update the plugin, and tell the running sessions what
to do (a restart, or a reload if one exists). Candidates for where it lives:

- A post-finish hook of `finishing-a-development-branch` (Lifecycle Hooks, A.3), after the version bump.
- A maestro duty in the Flux protocol runbook: "after a worker's merge, update the plugin, then restart the sessions that need it".
- A command in `dg workbox` (DGS-151) that does the update and the restarts for every session on the VPS.

## Open questions

- Does `/reload-plugins` or a `clear` apply a plugin update to a running session, or is a process restart the only way?
- How does the maestro learn that a worker merged to main (the worker's report, a git hook, a poll of `origin/main`)?
- The auto version bump on merge (`.digismith/docs/auto-bump-plugin-version-on-merge/`): does the update wait for it, and how
  long does the marketplace take to show the new version?
- Which machines: the VPS only (the Windows machine is retired)? Emma and Soveron sessions use the same plugin: do they restart too?
- The restart of a Desktop session (the maestro) needs Jack or a tool. Is there one?

## Related

[plugin-cache-lag-self-development.md](plugin-cache-lag-self-development.md),
[post-finish-hooks-direct-push-gap.md](post-finish-hooks-direct-push-gap.md), [dg-workbox-package.md](dg-workbox-package.md) (DGS-151),
DGS-154 Flux (the live run waits for this).

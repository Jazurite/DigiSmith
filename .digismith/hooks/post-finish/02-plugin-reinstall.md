---
name: plugin-reinstall
description: Stock post-finish hook — refreshes the installed DigiSmith plugin cache after a self-merge
---

# Plugin Reinstall

**DigiSmith's own repo only.** Check first:

```bash
MAIN_ROOT=$(git rev-parse --show-toplevel)
IS_DIGISMITH=false
if [ -f "$MAIN_ROOT/.claude-plugin/plugin.json" ] && grep -q '"name": "digismith"' "$MAIN_ROOT/.claude-plugin/plugin.json"; then
  IS_DIGISMITH=true
fi
echo "$IS_DIGISMITH"
```

If `IS_DIGISMITH` is not `true`, stop here — this hook does nothing in any other repo.

Otherwise, refresh the installed plugin cache from the just-pushed `main` (fires after
`01-version-bump.md`, so the refreshed cache reflects the bumped version too):

```bash
claude plugin marketplace update jazurite && claude plugin update digismith@jazurite --scope user
```

If either command in that chain fails, say so plainly — the plugin cache was not refreshed.

Cache flush skipped on purpose. Old version directories under
`~/.claude/plugins/cache/jazurite/digismith/` are never deleted by this hook — a running session
may still be loading its skills from one of them, and there is no signal yet for "no session uses
this version anymore." See `backlog/auto-update-plugin-after-merge.md`, point 3. Clear old
versions by hand if disk space becomes a problem.

Then print this reminder plainly:

> "DigiSmith's plugin cache has been refreshed to the latest merge. Any other live session on
> this machine can try `/reload-plugins` to pick this up without restarting — if the skill text
> stays stale after that, restart that session instead. For a herdr worker pane:
> `herdr agent prompt <agent> "/reload-plugins"`. Untested on the Desktop maestro: it is a
> remote session, and the CLI has a separate message, "/reload-plugins isn't available over a
> remote connection in this session," that may apply there. A `clear_session` is a second
> possible reload path for the maestro — seen once (2026-10-04: a skill loaded post-clear with
> text that was stale pre-clear), but not proven, since the session could instead have restarted
> around the same time. Both the maestro's `/reload-plugins` and its `clear_session` path stay
> unverified until tested separately (see the live test procedure in this ticket's board
> folder)."

This session's own tools already reflect the change (files are re-read from disk on each use) —
the reminder is for any *other*, already-running session on this same machine, which loaded its
skill list at its own start and has no built-in guarantee that `/reload-plugins` actually applies
a marketplace plugin's version bump without a restart.

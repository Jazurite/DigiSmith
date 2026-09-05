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
claude plugin marketplace update jazurite && claude plugin install digismith@jazurite --scope user
```

Then print this reminder plainly:

> "DigiSmith's plugin cache has been refreshed to the latest merge. Any other Claude Code
> sessions already running on this machine won't see this update until restarted."

This session's own tools already reflect the change (files are re-read from disk on each use) —
the reminder is for any *other*, already-running session on this same machine, which loaded its
skill list at its own start and has no way to hot-reload a plugin.

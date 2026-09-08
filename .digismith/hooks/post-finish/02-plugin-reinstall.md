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

If either command in that chain fails, say so plainly — the plugin cache was not refreshed.

Then flush superseded cache versions — `claude plugin install` writes the new version alongside
any previous one rather than replacing it in place, and nothing else removes the old directory,
so left alone they accumulate indefinitely:

```bash
CURRENT_VERSION=$(node -e "console.log(require('$MAIN_ROOT/.claude-plugin/plugin.json').version)")
CACHE_DIR="$HOME/.claude/plugins/cache/jazurite/digismith"
if [ -n "$CURRENT_VERSION" ] && [ -d "$CACHE_DIR" ]; then
  for dir in "$CACHE_DIR"/*/; do
    version_dir=$(basename "$dir")
    if [ "$version_dir" != "$CURRENT_VERSION" ]; then
      rm -rf "$dir"
    fi
  done
fi
```

`CURRENT_VERSION` is read from `$MAIN_ROOT`'s own `plugin.json` — already reflecting
`01-version-bump.md`'s bump by the time this hook fires — never hardcoded or guessed. The guard
against an empty `$CURRENT_VERSION` matters: without it, a parse failure would make every
sibling directory look "superseded" and delete the version that was just installed too. This
only ever touches `$CACHE_DIR`'s own immediate subdirectories, never anything outside DigiSmith's
own cache path. If this step fails for any reason, say so plainly — a stale cache directory left
behind is not worth stopping the hook over, but it should not pass silently either.

Then print this reminder plainly:

> "DigiSmith's plugin cache has been refreshed to the latest merge. Any other Claude Code
> sessions already running on this machine won't see this update until restarted."

This session's own tools already reflect the change (files are re-read from disk on each use) —
the reminder is for any *other*, already-running session on this same machine, which loaded its
skill list at its own start and has no way to hot-reload a plugin.

---
name: version-bump
description: Stock post-finish hook — bumps DigiSmith's own plugin version after a self-merge
---

# Version Bump

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

Otherwise, bump the plugin version:

```bash
cd "$(git rev-parse --show-toplevel)"
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — the base pin exists but the head pin does not; pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
BUMP_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base "$BASE_SHA" --head "$HEAD_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and do not continue to any further post-finish hook. Investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git push origin <base-branch>
fi
```

If that push is rejected (the remote moved since Option 1's own push above): stop, report the
rejection plainly, and investigate — do not force-push automatically, the same as every other
push in this skill.

`BASE_SHA`/`HEAD_SHA` are the merge range `finishing-a-development-branch` Option 1 pinned right
after `git merge <feature-branch>` — the branch tip before the merge and the merge commit itself —
stored as `refs/digismith/post-finish/<feature-branch>/{base,head}` and deleted by Option 1 once
every `post-finish` hook has fired. Never substitute `ORIG_HEAD` or the live `HEAD`: on this
shared checkout another session's merge may have moved both by the time this hook runs (a paused
or delayed firing), which is exactly how a false `SKIPPED` was produced once. A missing pin stops
this hook — see `fire-lifecycle-hook.md`'s "Merge-range pins" for firing by hand and for
recovering the branch name after a compaction.

A `BUMPED` result commits both version files in their own commit — separate from the merge
commit — and pushes it: this hook fires after Option 1's own push already happened, so the bump
needs its own, second push rather than riding along in the first one. A `SKIPPED` result means
this merge's own commits (`base..head`) changed `plugin.json` themselves — do nothing further. A
version change that landed on `<base-branch>` *after* the pinned `head` (another session's merge
and bump) never produces a `SKIPPED`: this hook still bumps, once, from whatever version
`<base-branch>` is at now — one bump per merge, regardless of when its hook fires. A non-zero
exit means the bump script itself failed: stop, do not push, and do not continue to any further
`post-finish` hook — investigate instead. The bump is the point of this hook, so a failure here
must not be silently skipped, nor followed by a plugin-cache reinstall that still doesn't reflect
it.

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
BASE_SHA=$(git rev-parse ORIG_HEAD)
BUMP_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base "$BASE_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json
  git push origin "$(git rev-parse --abbrev-ref HEAD)"
fi
```

`ORIG_HEAD` is git's own record of the branch tip immediately before the merge that triggered
this `post-finish` firing — set correctly whether that merge was a fast-forward or a true merge
commit, and still valid here since nothing between the merge and this hook firing changes it.

A `BUMPED` result commits both version files in their own commit — separate from the merge
commit — and pushes it: this hook fires after Option 1's own push already happened, so the bump
needs its own, second push rather than riding along in the first one. A `SKIPPED` result means
the incoming branch's own commits already changed the version — do nothing further. A non-zero
exit means the bump script itself failed: stop, do not push, and investigate — the bump is the
point of this hook, so a failure here must not be silently skipped.

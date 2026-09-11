---
name: history-update
description: Stock post-finish hook — logs the just-shipped feature into .digismith/history.html
---

# History Update

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

Otherwise, update the build history:

```bash
cd "$(git rev-parse --show-toplevel)"
BASE_SHA=$(git rev-parse ORIG_HEAD)
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" && \
  git push origin <base-branch>
fi
```

If that push is rejected (the remote moved since Option 1's own push, or since
`01-version-bump.md`'s own second push): stop, report the rejection plainly, and investigate —
do not force-push automatically, the same as every other push in this skill.

`ORIG_HEAD` is git's own record of the branch tip immediately before the merge that triggered
this `post-finish` firing — the same value `01-version-bump.md` reads, for the same reason: still
valid here since nothing between the merge and this hook firing changes it.

An `APPENDED <n>: <titles>` result commits `.digismith/history.html` in its own commit — separate
from the merge commit and from `01`'s bump commit — and pushes it. A `NOTHING (no report in
range)` result means the merged range contained no `.digismith/docs/<slug>/report.html` — either
a docs-only change, or a merge that didn't go through `report-implementation` (N) — and nothing
further happens. A non-zero exit means the script itself failed (a malformed report, or the
Timeline section couldn't be located): stop, do not commit, and investigate — a bad append would
corrupt `history.html` for everyone.

This hook only ever appends the Timeline entry and bumps "Last updated." It does **not** touch
the Map table, Build Order, or Progress Overview sections — whether this merge closes a letter or
sub-item is judgment, not mechanics. After a real `APPENDED` result, remind whoever is watching:

> "`.digismith/history.html`'s timeline is current, but its Map/Build Order/Progress Overview
> sections were not touched — check whether this merge closes a letter or sub-item and update
> those by hand if so."

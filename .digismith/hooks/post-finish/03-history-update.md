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
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — same as above. Stopping." >&2; exit 1; }
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA" --head "$HEAD_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  git push origin <base-branch>
fi
```

If that push is rejected (the remote moved since Option 1's own push, or since
`01-version-bump.md`'s own second push): stop, report the rejection plainly, and investigate —
do not force-push automatically, the same as every other push in this skill.

`BASE_SHA`/`HEAD_SHA` are the merge range `finishing-a-development-branch` Option 1 pinned right
after `git merge <feature-branch>` — stored as `refs/digismith/post-finish/<feature-branch>/{base,head}`,
the same two refs `01-version-bump.md` reads, deleted by Option 1 once every `post-finish` hook has
fired. Never substitute `ORIG_HEAD` or the live `HEAD`: on this shared checkout another session's
merge may have moved both by the time this hook runs, and a wrong range here means a history entry
appended twice or not at all. A missing pin stops this hook — see `fire-lifecycle-hook.md`'s
"Merge-range pins" for firing by hand and for recovering the branch name after a compaction.

An `APPENDED <n>: <titles>` result commits `.digismith/history.html` in its own commit — separate
from the merge commit and from `01`'s bump commit — and pushes it. A `NOTHING (no report in
range)` result means the pinned range (`base..head`) contained no `.digismith/docs/<slug>/report.html` — either
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

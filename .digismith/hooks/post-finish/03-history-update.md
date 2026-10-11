---
name: history-update
description: Stock post-finish hook — logs the just-shipped feature into the history page in the depot (outside the repo)
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

Otherwise, update the build history. The page is **not** in the repo (it is public): it lives at
`$DIGISMITH_HISTORY_DIR/history.html`, default `~/.digismith-depot/history/history.html`, in its own
local git repo with no remote. The script's `--history-dir` flag overrides the setting (tests use it).

```bash
cd "$(git rev-parse --show-toplevel)"
HISTORY_DIR="${DIGISMITH_HISTORY_DIR:-$HOME/.digismith-depot/history}"
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — the base pin exists but the head pin does not; pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA" --head "$HEAD_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  [ -d "$HISTORY_DIR/.git" ] || git -C "$HISTORY_DIR" init -q
  git -C "$HISTORY_DIR" add history.html && \
  git -C "$HISTORY_DIR" commit -m "docs(history): record shipped features" -- history.html
fi
```

This hook never commits to or pushes the public repo. It commits only in the depot repo.

**Where the push happens.** The new entry's links are GitHub permalinks pinned to `HEAD_SHA`
(`https://github.com/Jazurite/DigiSmith/blob/<HEAD_SHA>/.digismith/...`), so a moved file never breaks
them. A permalink resolves only after that SHA is on GitHub. `finishing-a-development-branch`
Option 1 pushes the merge right after `git merge`, and `01-version-bump.md` pushes its bump commit
before this hook fires, so `HEAD_SHA` is already pushed when this hook runs. The script checks
that an `origin` remote-tracking ref contains `HEAD_SHA` and **stops with "not pushed"** if not; push the
merge first and fire this hook again. `--allow-unpushed true` turns the stop into a warning (tests and
hand fixes only). The depot repo is never pushed.

**Depot page missing.** If `$HISTORY_DIR/history.html` is missing the script stops with
`NO HISTORY HOME <dir>` and never invents a page. If the page exists but has no `.git`, the hook
runs `git init` there. Only the Workbox writes the page for now: the depot repo has no remote, and a
second node reads it with `git clone <workbox>:~/.digismith-depot/history` until "our server"
(DGS-336) takes over as the one home.

`BASE_SHA`/`HEAD_SHA` are the merge range `finishing-a-development-branch` Option 1 pinned right
after `git merge <feature-branch>` — stored as `refs/digismith/post-finish/<feature-branch>/{base,head}`,
the same two refs `01-version-bump.md` reads, deleted by Option 1 once every `post-finish` hook has
fired. Never substitute `ORIG_HEAD` or the live `HEAD`: on this shared checkout another session's
merge may have moved both by the time this hook runs, and a wrong range here means a history entry
appended twice or not at all. A missing pin stops this hook — see `fire-lifecycle-hook.md`'s
"Merge-range pins" for firing by hand and for recovering the branch name after a compaction.

An `APPENDED <n>: <titles>` result commits `history.html` in the depot repo, in its own commit,
and pushes nothing. A `NOTHING (no report in
range)` result means the pinned range (`base..head`) contained no `.digismith/docs/<slug>/report.html`
or `.digismith/board/<key>—<slug>/report.html`
(`<slug>` may itself be a nested `<Letter>/<Letter.N>-<real-slug>` or `_unlettered/<real-slug>`
path, or a lineage `<Clan>/<Lineage>/<real-slug>` path under `docs/`, or a `<part>` subfolder
under a board ticket folder — `parseReport` matches all of them, docs and board alike) — either
a docs-only change, or a merge that didn't go through `report-implementation` (N) — and nothing
further happens. A report's header must carry either a `Ticket: <strong>…</strong>` line (new
convention — a real key, or the literal `n/a` for keyless work) or the legacy `Map item:
<strong>…</strong>` line (old reports, still accepted) — `parseReport` throws, and this hook
stops, if neither is present. A non-zero exit means the script itself failed (a malformed report, or the
Timeline section couldn't be located): stop, do not commit, and investigate — a bad append would
corrupt `history.html` for everyone.

This hook only ever appends the Timeline entry and bumps "Last updated." It does **not** touch
the Map table, Build Order, or Progress Overview sections — whether this merge closes a letter or
sub-item is judgment, not mechanics. After a real `APPENDED` result, remind whoever is watching:

> "The depot `history.html`'s timeline is current, but its Map/Build Order/Progress Overview
> sections were not touched — check whether this merge closes a letter or sub-item and update
> those by hand if so."

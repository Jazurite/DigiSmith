# Move Vendored Skills' .superpowers/ Paths Into .digismith/ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every vendored skill's leftover `.superpowers/` scratch path onto `.digismith/`, folding in the pre-existing SDD-workspace basename-collision bug at the same time.

**Architecture:** `scripts/sdd-workspace` becomes the single place that computes the SDD workspace location — it nests `.sdd-workspace/` directly inside the plan's own docs folder (same folder as `design.html`/`plan.md`/`report.html`), falling back to a `.sdd-workspace-<basename>` sibling only when the plan file lives in a folder shared by other plans. `task-brief`, `review-package`, and the three SKILL.md files that describe this location all read through that one script rather than duplicating the rule. Separately, `start-server.sh` gains an optional `--slug` flag so the brainstorming visual companion's mockup storage nests under `.digismith/brainstorm/<slug>/` when a feature slug is known, falling back to today's flat per-session bucket (just renamed to `.digismith/`) when it isn't.

**Tech Stack:** Bash (all touched files are shell scripts or Markdown skill docs — no packages/*.ts involved, no test framework applies).

## Global Constraints

- Commit messages: `feat(scope):` / `fix(scope):` / `refactor(scope):` / `docs(scope):` — title only, no body, no AI references (per global CLAUDE.md convention).
- No code comment may reference this ticket key or "the current task" inline — a genuine WHY goes in the PR description, not the code (per global CLAUDE.md convention). `vendored/PROVENANCE.md`'s existing map-item-letter citation style (`**W.N**, activated <date>`) is the file's own pre-existing convention, not a ticket-key reference, and stays as-is.
- No automated JS/TS syntax validation step exists in this repo for shell scripts — verification is manual execution, per each task's own steps below.

---

### Task 1: Fix `sdd-workspace`'s core location logic

**Files:**
- Modify: `skills/subagent-driven-development/scripts/sdd-workspace` (all 41 lines — full rewrite of the comment header and the location-resolution logic)

**Interfaces:**
- Consumes: a `PLAN_FILE` path (existing CLI contract, unchanged).
- Produces: prints the workspace directory's absolute path to stdout (existing CLI contract, unchanged) — but the path itself now resolves to `<dirname of PLAN_FILE>/.sdd-workspace` when the file is literally named `plan.md`, or `<dirname of PLAN_FILE>/.sdd-workspace-<basename>` otherwise. `task-brief` (Task 2) and `report-implementation`/`executing-plans`/`subagent-driven-development` SKILL.md prose (Task 2) all rely on this exact rule.

- [ ] **Step 1: Replace the script's full content**

Replace the entire content of `skills/subagent-driven-development/scripts/sdd-workspace` with:

```bash
#!/usr/bin/env bash
# Resolve and ensure the working-tree directory SDD uses for one plan's
# short-lived artifacts: task briefs, implementer reports, review packages,
# and the progress ledger. Print the plan directory's absolute path.
#
# The workspace nests inside the plan's own folder — the same folder that
# holds design.html/plan.md/report.html — so a follow-up plan in a
# different folder can never read or overwrite this one's artifacts. A
# stale ledger misread as current progress makes controllers skip whole
# task sequences — plan-scoping removes that failure structurally.
#
# Every DigiSmith plan file is literally named plan.md (flat
# .digismith/docs/<slug>/plan.md or nested
# .digismith/docs/<Letter>/<Letter>.<N>-<slug>/plan.md), so the plan's own
# parent directory is what's unique — nest as <plan_dir>/.sdd-workspace/.
# For a plan file whose own name already carries the differentiating
# info (e.g. upstream Superpowers' own default
# docs/superpowers/plans/YYYY-MM-DD-<feature>.md, where many plans are
# siblings in one shared folder), fall back to a sibling
# <plan_dir>/.sdd-workspace-<plan-basename>/ instead.
#
# The workspace lives in the working tree (not under .git/) because Claude Code
# treats .git/ as a protected path and denies agent writes there — which blocks
# an implementer subagent from writing its report file. A self-ignoring
# .gitignore inside the workspace directory itself keeps it out of
# `git status` and out of accidental commits without modifying any tracked file.
#
# Single source of truth for the workspace location, so task-brief and
# review-package cannot drift to different directories.
#
# Usage: sdd-workspace PLAN_FILE
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: sdd-workspace PLAN_FILE" >&2
  exit 2
fi

plan=$1
[ -f "$plan" ] || { echo "no such plan file: $plan" >&2; exit 2; }

plan_dir=$(cd "$(dirname "$plan")" && pwd)
basename=$(basename "$plan" .md)
[ -n "$basename" ] && [ "$basename" != "." ] && [ "$basename" != ".." ] \
  || { echo "cannot derive a workspace name from: $plan" >&2; exit 2; }

if [ "$basename" = "plan" ]; then
  dir="$plan_dir/.sdd-workspace"
else
  dir="$plan_dir/.sdd-workspace-$basename"
fi

mkdir -p "$dir"
printf '*\n' > "$dir/.gitignore"
cd "$dir" && pwd
```

- [ ] **Step 2: Verify the nested (lettered) case**

Run:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/.digismith/docs/W/W.3-foo"
touch "$tmp/.digismith/docs/W/W.3-foo/plan.md"
skills/subagent-driven-development/scripts/sdd-workspace "$tmp/.digismith/docs/W/W.3-foo/plan.md"
cat "$tmp/.digismith/docs/W/W.3-foo/.sdd-workspace/.gitignore"
```

Expected: first line prints `<tmp>/.digismith/docs/W/W.3-foo/.sdd-workspace`, second command prints `*`.

- [ ] **Step 3: Verify the flat (old-convention) case**

Run:

```bash
mkdir -p "$tmp/.digismith/docs/bar"
touch "$tmp/.digismith/docs/bar/plan.md"
skills/subagent-driven-development/scripts/sdd-workspace "$tmp/.digismith/docs/bar/plan.md"
```

Expected: prints `<tmp>/.digismith/docs/bar/.sdd-workspace`.

- [ ] **Step 4: Verify the shared-bucket fallback case**

Run:

```bash
mkdir -p "$tmp/docs/superpowers/plans"
touch "$tmp/docs/superpowers/plans/2026-01-01-foo.md"
skills/subagent-driven-development/scripts/sdd-workspace "$tmp/docs/superpowers/plans/2026-01-01-foo.md"
touch "$tmp/docs/superpowers/plans/2026-01-02-other.md"
skills/subagent-driven-development/scripts/sdd-workspace "$tmp/docs/superpowers/plans/2026-01-02-other.md"
rm -rf "$tmp"
```

Expected: first call prints `<tmp>/docs/superpowers/plans/.sdd-workspace-2026-01-01-foo`, second prints `<tmp>/docs/superpowers/plans/.sdd-workspace-2026-01-02-other` — two distinct sibling directories, confirming the collision is gone even for two plans sharing one folder.

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/sdd-workspace
git commit -m "fix(sdd): nest workspace in plan's own folder, fix basename collision"
```

---

### Task 2: Update SDD-side documentation to match

**Files:**
- Modify: `skills/subagent-driven-development/scripts/task-brief:7`
- Modify: `skills/subagent-driven-development/scripts/review-package:8`
- Modify: `skills/subagent-driven-development/SKILL.md:122-133`
- Modify: `skills/executing-plans/SKILL.md:27-31`
- Modify: `skills/report-implementation/SKILL.md:25`, `:47`, `:121`

**Interfaces:**
- Consumes: Task 1's new `sdd-workspace` location rule (described in prose here, not reimplemented — every file below points at `scripts/sdd-workspace` as the single source of truth instead of restating the path).
- Produces: nothing new — this task only brings comments/prose in line with Task 1's already-shipped behavior.

- [ ] **Step 1: Update `task-brief`'s default-OUTFILE comment**

In `skills/subagent-driven-development/scripts/task-brief`, replace line 7:

Old:
```
# Default OUTFILE: <repo-root>/.superpowers/sdd/<plan-basename>/task-<N>-brief.md
```

New:
```
# Default OUTFILE: <plan's own .sdd-workspace dir>/task-<N>-brief.md (see scripts/sdd-workspace)
```

- [ ] **Step 2: Update `review-package`'s default-OUTFILE comment**

In `skills/subagent-driven-development/scripts/review-package`, replace line 8:

Old:
```
# Default OUTFILE: <repo-root>/.superpowers/sdd/<plan-basename>/review-<base7>..<head7>.diff
```

New:
```
# Default OUTFILE: <plan's own .sdd-workspace dir>/review-<base7>..<head7>.diff (see scripts/sdd-workspace)
```

- [ ] **Step 3: Update `subagent-driven-development/SKILL.md`'s workspace description**

In `skills/subagent-driven-development/SKILL.md`, replace lines 122-133:

Old:
```
- Each plan owns a workspace: at skill start, run this skill's
  `scripts/sdd-workspace PLAN_FILE` — it prints the plan's git-ignored
  directory (`<repo-root>/.superpowers/sdd/<plan-basename>/`), home to
  every artifact for THIS plan: ledger, briefs, reports, review packages.
  Another plan's directory is never yours to read or write.
- Check for this plan's ledger at `<workspace>/progress.md`. If its first
  line names your plan file, tasks with a `Task <N>: complete` line are DONE
  — do not re-dispatch them; resume at the first task without one. A task
  whose last line is a fix round is mid-loop: resume the loop at the next
  round. A ledger whose first line names a different plan file — or a stray
  ledger at the old flat path `.superpowers/sdd/progress.md` — is another
  plan's progress: leave it in place and start your own, fresh.
```

New:
```
- Each plan owns a workspace: at skill start, run this skill's
  `scripts/sdd-workspace PLAN_FILE` — it prints the plan's git-ignored
  directory (nested inside the plan's own folder as `.sdd-workspace/`,
  or a `.sdd-workspace-<plan-basename>/` sibling when the plan file lives
  in a folder shared by other plans — see that script), home to
  every artifact for THIS plan: ledger, briefs, reports, review packages.
  Another plan's directory is never yours to read or write.
- Check for this plan's ledger at `<workspace>/progress.md`. If its first
  line names your plan file, tasks with a `Task <N>: complete` line are DONE
  — do not re-dispatch them; resume at the first task without one. A task
  whose last line is a fix round is mid-loop: resume the loop at the next
  round. A ledger whose first line names a different plan file is another
  plan's progress: leave it in place and start your own, fresh.
```

- [ ] **Step 4: Update `executing-plans/SKILL.md`'s ledger location description**

In `skills/executing-plans/SKILL.md`, replace lines 27-31:

Old:
```
If this is the first task, create this plan's ledger with its identity as the first line:
`# Inline-execution ledger — plan: <plan file path>`, at
`.superpowers/sdd/<plan-basename>/progress.md` (the same path convention
`digismith:subagent-driven-development` uses — a given plan only ever runs one way, so there's
no collision). Record the commit at that point as `MERGE_BASE` for the ledger.
```

New:
```
If this is the first task, create this plan's ledger with its identity as the first line:
`# Inline-execution ledger — plan: <plan file path>`, at
`<plan's own workspace>/progress.md` — the same directory
`scripts/sdd-workspace PLAN_FILE` resolves to (the same path convention
`digismith:subagent-driven-development` uses — a given plan only ever runs one way, so there's
no collision). Record the commit at that point as `MERGE_BASE` for the ledger.
```

- [ ] **Step 5: Update `report-implementation/SKILL.md`'s three references**

In `skills/report-implementation/SKILL.md`, replace line 25's sentence:

Old:
```
that skill's own Finish step runs `rm -rf` on the plan's workspace
(`.superpowers/sdd/<plan-basename>/`). This is earlier than "after the
```

New:
```
that skill's own Finish step runs `rm -rf` on the plan's workspace
(the directory `scripts/sdd-workspace PLAN_FILE` resolves to). This is earlier than "after the
```

Replace line 47:

Old:
```
A ledger must exist at `.superpowers/sdd/<plan-basename>/progress.md`. If it doesn't (no
```

New:
```
A ledger must exist at the plan's workspace (the directory `scripts/sdd-workspace PLAN_FILE`
resolves to, plus `/progress.md`). If it doesn't (no
```

Replace line 121:

Old:
```
2. **Ledger** — `.superpowers/sdd/<plan-basename>/progress.md`, in full.
```

New:
```
2. **Ledger** — the plan's workspace (the directory `subagent-driven-development`'s
   `scripts/sdd-workspace PLAN_FILE` resolves to) plus `/progress.md`, in full.
```

- [ ] **Step 6: Verify no stale references remain in these five files**

Run:

```bash
grep -n "\.superpowers" skills/subagent-driven-development/scripts/task-brief skills/subagent-driven-development/scripts/review-package skills/subagent-driven-development/SKILL.md skills/executing-plans/SKILL.md skills/report-implementation/SKILL.md
```

Expected: no output (exit code 1).

- [ ] **Step 7: Commit**

```bash
git add skills/subagent-driven-development/scripts/task-brief skills/subagent-driven-development/scripts/review-package skills/subagent-driven-development/SKILL.md skills/executing-plans/SKILL.md skills/report-implementation/SKILL.md
git commit -m "docs(sdd): describe the new nested workspace location"
```

---

### Task 3: Add `--slug` nesting to the brainstorm server, rename to `.digismith`

**Files:**
- Modify: `skills/brainstorming/scripts/start-server.sh` (usage comment, arg parsing, `SESSION_DIR` construction, retry-message string)

**Interfaces:**
- Consumes: an optional new `--slug <slug>` CLI flag (added by this task).
- Produces: `SESSION_DIR` (and the `BRAINSTORM_PORT_FILE`/`BRAINSTORM_TOKEN_FILE` env vars) now resolve under `${PROJECT_DIR}/.digismith/brainstorm/${SLUG}/${SESSION_ID}` when `--slug` is passed, or `${PROJECT_DIR}/.digismith/brainstorm/${SESSION_ID}` otherwise — consumed by `visual-companion.md`'s instructions (Task 4).

- [ ] **Step 1: Update the usage comment**

In `skills/brainstorming/scripts/start-server.sh`, replace line 3:

Old:
```
# Usage: start-server.sh [--project-dir <path>] [--host <bind-host>] [--url-host <display-host>] [--foreground] [--background]
```

New:
```
# Usage: start-server.sh [--project-dir <path>] [--slug <slug>] [--host <bind-host>] [--url-host <display-host>] [--foreground] [--background]
```

Replace lines 8-10:

Old:
```
#   --project-dir <path>  Store session files under <path>/.superpowers/brainstorm/
#                         instead of /tmp. Files persist after server stops.
```

New:
```
#   --project-dir <path>  Store session files under <path>/.digismith/brainstorm/
#                         instead of /tmp. Files persist after server stops.
#   --slug <slug>         Nest session files under <path>/.digismith/brainstorm/<slug>/
#                         instead of the flat <path>/.digismith/brainstorm/ bucket.
#                         Only meaningful together with --project-dir. Pass the
#                         feature slug once brainstorming has one (the normal case).
```

- [ ] **Step 2: Add the `--slug` flag to argument parsing**

In `skills/brainstorming/scripts/start-server.sh`, add `SLUG=""` alongside the other variable initializations (line 23, right after `PROJECT_DIR=""`):

Old:
```
PROJECT_DIR=""
FOREGROUND="false"
```

New:
```
PROJECT_DIR=""
SLUG=""
FOREGROUND="false"
```

Then add a `--slug)` case to the `while` loop's `case` statement, immediately after the existing `--project-dir)` case:

Old:
```
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
```

New:
```
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --slug)
      SLUG="$2"
      shift 2
      ;;
```

- [ ] **Step 3: Nest `SESSION_DIR` under the slug when one is given**

Replace the session-directory block:

Old:
```
if [[ -n "$PROJECT_DIR" ]]; then
  SESSION_DIR="${PROJECT_DIR}/.superpowers/brainstorm/${SESSION_ID}"
  # Persist the bound port and key per project so a restart reuses them and an
  # already-open browser tab reconnects to the same URL with a valid cookie.
  export BRAINSTORM_PORT_FILE="${PROJECT_DIR}/.superpowers/brainstorm/.last-port"
  export BRAINSTORM_TOKEN_FILE="${PROJECT_DIR}/.superpowers/brainstorm/.last-token"
else
  SESSION_DIR="/tmp/brainstorm-${SESSION_ID}"
fi
```

New:
```
if [[ -n "$PROJECT_DIR" ]]; then
  if [[ -n "$SLUG" ]]; then
    BRAINSTORM_ROOT="${PROJECT_DIR}/.digismith/brainstorm/${SLUG}"
  else
    BRAINSTORM_ROOT="${PROJECT_DIR}/.digismith/brainstorm"
  fi
  SESSION_DIR="${BRAINSTORM_ROOT}/${SESSION_ID}"
  # Persist the bound port and key per project (and per slug, when given) so a
  # restart reuses them and an already-open browser tab reconnects to the same
  # URL with a valid cookie.
  export BRAINSTORM_PORT_FILE="${BRAINSTORM_ROOT}/.last-port"
  export BRAINSTORM_TOKEN_FILE="${BRAINSTORM_ROOT}/.last-token"
else
  SESSION_DIR="/tmp/brainstorm-${SESSION_ID}"
fi
```

- [ ] **Step 4: Propagate `--slug` into the crash-retry message**

Replace:

Old:
```
      echo "{\"error\": \"Server started but was killed. Retry in a persistent terminal with: $SCRIPT_DIR/start-server.sh${PROJECT_DIR:+ --project-dir $PROJECT_DIR} --host $BIND_HOST --url-host $URL_HOST --foreground\"}"
```

New:
```
      echo "{\"error\": \"Server started but was killed. Retry in a persistent terminal with: $SCRIPT_DIR/start-server.sh${PROJECT_DIR:+ --project-dir $PROJECT_DIR}${SLUG:+ --slug $SLUG} --host $BIND_HOST --url-host $URL_HOST --foreground\"}"
```

- [ ] **Step 5: Verify slug nesting**

Run (this platform forces foreground mode internally on Windows/Git-Bash, so background the whole invocation from the outer shell with `&` rather than relying on the script's own backgrounding):

```bash
tmp=$(mktemp -d)
skills/brainstorming/scripts/start-server.sh --project-dir "$tmp" --slug my-feature > "$tmp/out1.json" 2>&1 &
sleep 2
cat "$tmp/out1.json"
find "$tmp/.digismith/brainstorm" -maxdepth 2
```

Expected: a session directory under `$tmp/.digismith/brainstorm/my-feature/<session-id>/`. If `node`/`server.cjs` isn't available in this environment and the server fails to start for that unrelated reason, it's sufficient that `out1.json` (or the directories actually created before failure) show the `my-feature` segment in the path.

Stop it:

```bash
session_dir=$(find "$tmp/.digismith/brainstorm/my-feature" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
[ -n "$session_dir" ] && skills/brainstorming/scripts/stop-server.sh "$session_dir"
```

- [ ] **Step 6: Verify the no-slug fallback**

Run:

```bash
skills/brainstorming/scripts/start-server.sh --project-dir "$tmp" > "$tmp/out2.json" 2>&1 &
sleep 2
find "$tmp/.digismith/brainstorm" -maxdepth 1
```

Expected: a new session directory sibling directly under `$tmp/.digismith/brainstorm/` (not inside `my-feature/`).

Clean up:

```bash
session_dir2=$(find "$tmp/.digismith/brainstorm" -mindepth 1 -maxdepth 1 -type d -not -name my-feature 2>/dev/null | head -1)
[ -n "$session_dir2" ] && skills/brainstorming/scripts/stop-server.sh "$session_dir2"
rm -rf "$tmp"
```

- [ ] **Step 7: Commit**

```bash
git add skills/brainstorming/scripts/start-server.sh
git commit -m "feat(brainstorming): nest mockup storage under .digismith/brainstorm/<slug>"
```

---

### Task 4: Update brainstorming-side documentation to match

**Files:**
- Modify: `skills/brainstorming/scripts/stop-server.sh:6`
- Modify: `skills/brainstorming/visual-companion.md:37-38`, `:42-43`, `:56`, `:58`, `:108`, `:293`

**Interfaces:**
- Consumes: Task 3's new `--slug` flag and `.digismith/brainstorm/` rename.
- Produces: nothing new — prose only.

- [ ] **Step 1: Update `stop-server.sh`'s comment**

In `skills/brainstorming/scripts/stop-server.sh`, replace line 6:

Old:
```
# under /tmp (ephemeral). Persistent directories (.superpowers/) are
```

New:
```
# under /tmp (ephemeral). Persistent directories (.digismith/) are
```

- [ ] **Step 2: Update the "Starting a Session" example and JSON sample**

In `skills/brainstorming/visual-companion.md`, replace lines 36-43:

Old:
```
# Start AFTER the user approves the companion. --open auto-opens their browser on
# the first screen; --project-dir persists mockups and enables same-port restart.
scripts/start-server.sh --project-dir /path/to/project --open

# Returns: {"type":"server-started","port":52341,
#           "url":"http://localhost:52341/?key=ab12…",
#           "screen_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000/content",
#           "state_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000/state"}
```

New:
```
# Start AFTER the user approves the companion. --open auto-opens their browser on
# the first screen; --project-dir persists mockups and enables same-port restart.
# Pass --slug <slug> too when brainstorming already has one (the normal case) so
# mockups nest under that feature instead of a flat per-session bucket.
scripts/start-server.sh --project-dir /path/to/project --slug my-feature-slug --open

# Returns: {"type":"server-started","port":52341,
#           "url":"http://localhost:52341/?key=ab12…",
#           "screen_dir":"/path/to/project/.digismith/brainstorm/my-feature-slug/12345-1706000000/content",
#           "state_dir":"/path/to/project/.digismith/brainstorm/my-feature-slug/12345-1706000000/state"}
```

- [ ] **Step 3: Update the connection-info and gitignore-reminder notes**

Replace line 56:

Old:
```
**Finding connection info:** The server writes its startup JSON to `$STATE_DIR/server-info`. If you launched the server in the background and didn't capture stdout, read that file to get the URL and port. When using `--project-dir`, check `<project>/.superpowers/brainstorm/` for the session directory.
```

New:
```
**Finding connection info:** The server writes its startup JSON to `$STATE_DIR/server-info`. If you launched the server in the background and didn't capture stdout, read that file to get the URL and port. When using `--project-dir`, check `<project>/.digismith/brainstorm/` (or `<project>/.digismith/brainstorm/<slug>/` when `--slug` was passed) for the session directory.
```

Replace line 58:

Old:
```
**Note:** Pass the project root as `--project-dir` so mockups persist in `.superpowers/brainstorm/` and survive server restarts. Without it, files go to `/tmp` and get cleaned up. Remind the user to add `.superpowers/` to `.gitignore` if it's not already there.
```

New:
```
**Note:** Pass the project root as `--project-dir` (and `--slug <slug>` when one is known) so mockups persist in `.digismith/brainstorm/` and survive server restarts. Without it, files go to `/tmp` and get cleaned up. Remind the user to add `.digismith/` to `.gitignore` if it's not already there.
```

- [ ] **Step 4: Update the restart guidance**

Find and replace within line 108 (the rest of that line is unchanged):

Old:
```
If it has shut down, restart it with `start-server.sh` using the **same `--project-dir`** — it reuses the same port,
```

New:
```
If it has shut down, restart it with `start-server.sh` using the **same `--project-dir` (and `--slug`, if you passed one)** — it reuses the same port,
```

- [ ] **Step 5: Update the "Cleaning Up" section's persistence note**

Replace line 293:

Old:
```
If the session used `--project-dir`, mockup files persist in `.superpowers/brainstorm/` for later reference. Only `/tmp` sessions get deleted on stop.
```

New:
```
If the session used `--project-dir`, mockup files persist in `.digismith/brainstorm/` (nested under `<slug>/` if `--slug` was passed) for later reference. Only `/tmp` sessions get deleted on stop.
```

- [ ] **Step 6: Verify no stale references remain**

Run:

```bash
grep -n "\.superpowers" skills/brainstorming/scripts/stop-server.sh skills/brainstorming/visual-companion.md
```

Expected: no output (exit code 1).

- [ ] **Step 7: Commit**

```bash
git add skills/brainstorming/scripts/stop-server.sh skills/brainstorming/visual-companion.md
git commit -m "docs(brainstorming): describe .digismith/brainstorm/ and --slug nesting"
```

---

### Task 5: Update provenance history, clean up `.gitignore`, final repo-wide sweep

**Files:**
- Modify: `vendored/PROVENANCE.md:45-49`
- Modify: `.gitignore:7`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task closes out the ticket with a historical-accuracy note and a repo-wide confirmation that no `.superpowers` path reference survives anywhere.

- [ ] **Step 1: Update the historical ledger-path note**

In `vendored/PROVENANCE.md`, replace lines 45-46:

Old:
```
- **executing-plans** — map item **W.6**, activated 2026-09-04. Gained a lightweight ledger
  (`.superpowers/sdd/<plan-basename>/progress.md`, first line `# Inline-execution ledger`) and
```

New:
```
- **executing-plans** — map item **W.6**, activated 2026-09-04. Gained a lightweight ledger
  (nested inside the plan's own docs folder as `.sdd-workspace/progress.md` as of **W.3**,
  2026-09-26 — originally `.superpowers/sdd/<plan-basename>/progress.md`; first line
  `# Inline-execution ledger`) and
```

- [ ] **Step 2: Remove the dead top-level `.gitignore` line**

In `.gitignore`, remove line 7 (`.superpowers/`) entirely — both scratch roots it covered (`.superpowers/sdd/` and `.superpowers/brainstorm/`) are gone as of Tasks 1 and 3, and each replacement directory writes its own self-ignoring `.gitignore` (`*`) internally, same as before.

- [ ] **Step 3: Repo-wide sweep for any remaining `.superpowers` path reference**

Run:

```bash
grep -rn "\.superpowers" --include="*.*" . 2>/dev/null | grep -v -E "node_modules|\.git/|\.digismith/docs|\.digismith/history\.html|backlog/"
```

Expected: no output. (This pattern requires a literal leading dot, so it does not match unrelated `superpowers:<skill-name>` cross-references or the `docs/superpowers/plans/` upstream-convention mentions in `report-implementation/SKILL.md` and `subagent-driven-development/SKILL.md` — those are intentionally untouched, see Background in the design doc.)

- [ ] **Step 4: Commit**

```bash
git add vendored/PROVENANCE.md .gitignore
git commit -m "docs(vendored): update provenance note and drop dead .superpowers gitignore line"
```

---

## Self-Review

**Spec coverage:** Every section of `design.html` maps to a task — SDD Workspace Relocation → Tasks 1-2, Brainstorm Mockup Storage → Tasks 3-4, File-by-File Touch List → all 11 files are covered across Tasks 1-5 (verified against the design doc's own list line by line), Testing/Verification → each task's own verification steps, Out of Scope/Deferred → no task attempts plugin-cache propagation or migrating existing scratch directories, matching the design's explicit exclusion.

**Placeholder scan:** No TBD/TODO markers; every step shows exact before/after text or a runnable command with an expected result.

**Type consistency:** N/A (bash scripts, no typed interfaces) — the one cross-task contract, `sdd-workspace`'s printed path shape, is used identically in Tasks 1, 2, and referenced consistently by name (`scripts/sdd-workspace PLAN_FILE`) everywhere it's mentioned.

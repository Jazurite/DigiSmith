# Telemetry (P) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `telemetry` — DigiSmith's map item **P** — a profile-gated
capture of the full Claude Code session transcript for a DigiSmith-driven
ticket build (`using-digismith` start → `finishing-a-development-branch`'s
integration decision), committed back into DigiSmith's own repo as a raw
data corpus for future process-improvement analysis.

**Architecture:** A new `logging` boolean in `profiles/*.yml` gates
everything. When on, `using-digismith` writes a small
`.digismith/telemetry-marker` state file (transcript path, start line,
timestamp, repo, slug, ticket key if any) the moment a ticket's slug is
known, and copies it into the worktree alongside `.digismith/profile`. A
new standalone skill, `telemetry`, triggers right after
`superpowers:finishing-a-development-branch`'s Step 4 menu is answered: it
reads the marker, slices the transcript from the recorded line onward,
prepends a metadata header, and commits the result into DigiSmith's own
repo at `.digismith/telemetry/<repo>/<slug>/<timestamp>.jsonl`.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), two
edits to existing YAML profile files, shell (`wc`, `ls -t`, `date`, `git`)
for transcript location/slicing. No application code, no test framework —
verification is dogfooding via dispatched subagents reasoning through (and,
where file operations are involved, actually executing against) constructed
fixtures, consistent with every DigiSmith skill so far.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…"/"Use right after…", third person, states triggering
  conditions only — never a workflow summary.
- **`profiles/<name>.yml` gains one field, `logging` (bool), no others.**
  `emma.yml` → `true`. `personal.yml` → `false`. Every other existing
  field (`name`, `standards`, `ticket`, `ephemeral`, `reporting`) is
  unchanged.
- **No `logging` key at all** (a profile file predating this feature) →
  treat as `false`, same as any other missing boolean field defaulting to
  off. This is the load-bearing non-breaking guarantee — a repo with a
  profile that hasn't adopted `logging` sees zero new behavior.
- **`.digismith/telemetry-marker` schema** (consuming repo, alongside the
  existing `.digismith/profile`): plain `key: value` lines, one per line,
  no YAML nesting —
  ```
  transcript: <absolute path to the session's .jsonl file>
  start_line: <line count of that file at marker-write time>
  started_at: <UTC ISO 8601 timestamp>
  repo: <basename of `git rev-parse --show-toplevel`>
  slug: <the ticket/feature slug using-digismith Step 1 resolved>
  ticket_key: <the ticket's real Key, only present when one was resolved>
  ```
  Same "config, not generated docs output" treatment as
  `.digismith/profile`: never `git add -f`'d, must be physically present
  in whatever working directory the work continues in (worktree included).
- **Transcript location rule** (restated in both consuming skills, not
  cross-referenced at runtime — a freshly dispatched subagent only sees
  the one `SKILL.md` it was told to follow): the directory is
  `~/.claude/projects/<cwd-with-every-/-replaced-by-->/`, computed from
  the working directory at the moment of the check. The file is the
  most-recently-modified `.jsonl` in that directory. This is a
  best-effort heuristic, not a guaranteed session-ID lookup — no tool in
  this environment exposes the current session ID directly.
- **Telemetry file target path** (DigiSmith's own repo):
  `.digismith/telemetry/<repo>/<slug>/<started_at-with-:-replaced-by-->.jsonl`.
  Content is one metadata JSON line, then the sliced transcript lines
  verbatim (unmodified, not re-serialized).
- **Metadata line shape** (single JSON object, first line of the written
  file):
  ```json
  {"digismith_telemetry_meta":{"repo":"<repo>","slug":"<slug>","ticket_key":"<key-or-null>","session_id":"<session_id>","started_at":"<started_at>","ended_at":"<ended_at>"}}
  ```
  `session_id` is the transcript file's own basename with `.jsonl`
  stripped — never stored separately, since the marker's `transcript:`
  line already carries it.
- **DigiSmith's own repo is always git-committed for `.digismith/`**
  (per `MEMORY.md`'s unified docs convention) — unlike a *consumer*
  repo's `.digismith/docs/`, there is no gitignore check before
  committing a telemetry file. `git check-ignore` is not part of this
  feature's write path.
- **Raw and unredacted, by deliberate, recorded decision** — see the
  design spec's Accepted Risk section. Do not add filtering, redaction,
  or a gitignore option as part of this plan; that would contradict an
  explicit choice already made.
- **Locating DigiSmith's own repo** — exact rule `inject-standards`
  already uses for `standards/`, restated inline in every task that needs
  it: (1) is the current working directory itself the DigiSmith repo
  (`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
  directly. (2) Otherwise, ask the user for DigiSmith's repo path this
  session and remember it for the rest of the conversation. Never read
  under a plugin cache path (`~/.claude/plugins/cache/.../digismith/<version>/`)
  — a stale, version-locked snapshot.
- **No manual toggle.** No flag or spoken phrase turns capture on or off
  for a single session — purely gated by `profiles/<name>.yml`'s
  `logging` field, resolved via the existing `.digismith/profile`
  pointer. Do not add a `log:true`-style argument anywhere in this plan.
- Cross-skill references inside `SKILL.md` content must be
  plugin-qualified: `superpowers:finishing-a-development-branch`,
  `digismith:using-digismith`, `digismith:telemetry`.
- **Roadmap update:** `MEMORY.md`'s map table gets a new row — **P —
  Telemetry** — plus a new Open Questions bullet noting shipped-product
  telemetry was scoped out as a separate, undesigned sub-project, per the
  design spec's own Roadmap Update section.
- Task order matters: Task 1 fixes the `logging` field and
  `.digismith/telemetry-marker` schema Task 2 depends on as its
  precondition. Do not reorder.

---

### Task 1: Profile Field + `using-digismith` Marker Write/Copy

**Files:**
- Modify: `profiles/emma.yml`
- Modify: `profiles/personal.yml`
- Modify: `skills/using-digismith/SKILL.md`

**Interfaces:**
- Consumes: nothing from an earlier task (first task).
- Produces: the `logging` field on both profile files, and the
  `.digismith/telemetry-marker` write/copy contract at `using-digismith`'s
  new Step 1.5 and Step 2's new sub-step 7 — Task 2 reads exactly this
  file, written exactly this way.

- [ ] **Step 1: Add `logging` to both profile files**

```yaml
# profiles/emma.yml — add as the last line
logging: true
```

```yaml
# profiles/personal.yml — add as the last line
logging: false
```

- [ ] **Step 2: Insert a new Step 1.5 into `skills/using-digismith/SKILL.md`, between the existing "### Step 1: Get a Real Ticket" and "### Step 2: Create the Branch"**

```markdown
### Step 1.5: Write Telemetry Marker

If the active profile's `logging` field is `true`, write a marker
recording where telemetry capture should resume from once this ticket's
build finishes. If `logging` is `false`, absent, or there is no
`.digismith/profile` at all, skip this step entirely — no marker is
written, and nothing about the rest of this skill changes.

Still in the original checkout, **before Step 2 creates or attaches any
worktree**:

```bash
CWD_ENCODED=$(pwd | sed 's/\//-/g')
TRANSCRIPT_DIR="$HOME/.claude/projects/$CWD_ENCODED"
TRANSCRIPT=$(ls -t "$TRANSCRIPT_DIR"/*.jsonl 2>/dev/null | head -1)
```

If `$TRANSCRIPT` is empty (the directory doesn't exist, or has no
`.jsonl` files — see Error Handling), skip the rest of this step
entirely. Logging silently does nothing rather than blocking the ticket
flow.

Otherwise:

```bash
START_LINE=$(wc -l < "$TRANSCRIPT" | tr -d ' ')
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p .digismith
{
  echo "transcript: $TRANSCRIPT"
  echo "start_line: $START_LINE"
  echo "started_at: $STARTED_AT"
  echo "repo: $REPO_NAME"
  echo "slug: <slug>"
} > .digismith/telemetry-marker
```

`<slug>` is whichever slug Step 1 just produced — the `ticket.md`
folder name when `ticket: true`, or the directly-derived slug when
`ticket: false`. Never re-derive it a third way.

If Step 1 resolved a real ticket key (a `**Key:**` line from
`ticket.md`), append one more line to the same file:

```bash
echo "ticket_key: <Key>" >> .digismith/telemetry-marker
```

Omit that line entirely when there's no real key — a Door 2 draft never
reaches this point at all (Step 1 already stops for those), and
`ticket: false` profiles never derive a key in the first place.

The `digismith:telemetry` skill reads this file later, after the build
finishes, from inside whatever worktree Step 2 produces — that's exactly
what Step 2's new sub-step 7 below makes possible.
```

- [ ] **Step 3: Insert a new sub-step 7 into Step 2 ("Create the Branch"), immediately after the existing sub-step 6 ("Make `.digismith/profile` visible inside the worktree")**

```markdown
7. **Make `.digismith/telemetry-marker` visible inside the worktree, if
   logging is on.** If Step 1.5 wrote `.digismith/telemetry-marker` in
   the original checkout, copy it into
   `<worktree-path>/.digismith/telemetry-marker` the same way sub-step 6
   copies the profile file: a plain file copy, **not** `git add`,
   **not** `git add -f`, **not** a commit. If Step 1.5 didn't run
   (logging off, or no profile at all), there's nothing to copy — skip.
   Same reasoning as sub-step 6: a worktree checks out only committed
   files, so a marker written moments ago in Step 1.5 would otherwise
   simply not exist inside the new worktree, and
   `digismith:telemetry` — which reads it later, from inside this same
   worktree, once the build finishes — would silently find nothing to
   capture.
```

- [ ] **Step 4: Update the Quick Reference table**

Change the Step 1 and Step 2 rows to:

```markdown
| 1 | Get a real ticket if the active profile's `ticket` is `true` (invoke `digismith:jira-intake` if needed, stop if key-less); if `ticket` is `false`, derive the slug directly and skip to Step 1.5; read `.digismith/docs/<slug>/ticket.md`'s full content into context now when it exists — a worktree checks out only committed files, and this one isn't committed yet (and may be gitignored outright), so it won't exist in the worktree |
| 1.5 | If the active profile's `logging` is `true`, locate the live session transcript and write `.digismith/telemetry-marker` (transcript path, start line, timestamp, repo, slug, ticket key if any) in the original checkout; otherwise skip, no marker written |
| 2 | Derive `<Key>__<slug>` (or `<slug>` alone under `ticket: false`) branch name; reuse an existing worktree, or attach one to an existing branch (`git worktree add`, no `-b`), or create both (verify/rename to the exact name if the creation tool altered it); ask on collision with an unrelated ticket; then **2.6** copy `.digismith/profile` and **2.7** copy `.digismith/telemetry-marker` (if it exists) into the worktree — both plain file copies, never `git add -f` |
```

- [ ] **Step 5: Update Error Handling**

Add two new bullets:

```markdown
- **`logging: true` but no transcript directory or `.jsonl` file found**
  (`~/.claude/projects/<encoded-cwd>/` doesn't exist, or is empty) → skip
  Step 1.5 entirely, silently. No marker is written; the rest of
  `using-digismith` proceeds exactly as if `logging` were `false`. Never
  block the ticket flow over this.
- **`.digismith/telemetry-marker` absent inside the worktree Step 2
  produced** → expected when `logging` was off or no marker was written;
  not an error. When a marker *was* written but the worktree copy (2.7)
  didn't happen, `digismith:telemetry` will simply find nothing to
  capture later — same non-blocking disposition as the missing-transcript
  case above.
```

- [ ] **Step 6: Dogfood — marker written for real (Emma profile, logging on)**

```bash
mkdir -p /tmp/telemetry-dogfood/emma-repo
cd /tmp/telemetry-dogfood/emma-repo && git init -q && git commit -q --allow-empty -m "init"
CWD_ENCODED=$(pwd | sed 's/\//-/g')
mkdir -p "$HOME/.claude/projects/$CWD_ENCODED"
printf '{"type":"user","message":"hello"}\n{"type":"assistant","message":"hi"}\n' \
  > "$HOME/.claude/projects/$CWD_ENCODED/fake-session-abc123.jsonl"
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only the new Step 1.5 ("Write Telemetry Marker") of
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/skills/using-digismith/SKILL.md,
executing it for real (not just reasoning about it) against this
scenario: the repo being worked in is /tmp/telemetry-dogfood/emma-repo
(cd there first). The active profile is emma, whose real logging field
you should read from
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/profiles/emma.yml.
Step 1 has already resolved slug "fix-cart-drawer-padding-mobile" and
ticket key "EMKT-9001" — treat those as given, don't re-derive them.
Actually run the commands the step specifies, from inside
/tmp/telemetry-dogfood/emma-repo. Report the exact final content of
.digismith/telemetry-marker.
```

Expected: `.digismith/telemetry-marker` exists in
`/tmp/telemetry-dogfood/emma-repo/.digismith/` with `transcript` pointing
at the real `fake-session-abc123.jsonl` path, `start_line: 2` (the fixture
file has 2 lines), a real UTC `started_at` timestamp, `repo: emma-repo`,
`slug: fix-cart-drawer-padding-mobile`, and `ticket_key: EMKT-9001`.

- [ ] **Step 7: Dogfood — no marker written (Personal profile, logging off)**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only the new Step 1.5 ("Write Telemetry Marker") of
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/skills/using-digismith/SKILL.md,
reasoning through this scenario: the repo being worked in is
/tmp/telemetry-dogfood/emma-repo (same fixture as the previous dogfood).
The active profile is personal, whose real logging field you should read
from
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/profiles/personal.yml.
Report whether this step would write anything, and why.
```

Expected: reports skipping the step entirely — `personal.yml`'s `logging`
is `false` — and that no marker gets written.

- [ ] **Step 8: Dogfood — no transcript directory (edge case, logging on)**

```bash
rm -rf /tmp/telemetry-dogfood/no-transcript-repo
mkdir -p /tmp/telemetry-dogfood/no-transcript-repo
cd /tmp/telemetry-dogfood/no-transcript-repo && git init -q && git commit -q --allow-empty -m "init"
```

(Deliberately do **not** create a matching directory under
`~/.claude/projects/` for this fixture path.)

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only the new Step 1.5 ("Write Telemetry Marker") of
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/skills/using-digismith/SKILL.md,
executing it for real against this scenario: the repo being worked in is
/tmp/telemetry-dogfood/no-transcript-repo (cd there first, it's a real
empty git repo). The active profile has logging: true (assume this,
don't re-derive it). Actually run the commands. Report what happened —
specifically, whether a $HOME/.claude/projects/... directory matching
this repo's encoded path exists, and whether .digismith/telemetry-marker
got created.
```

Expected: reports the `~/.claude/projects/<encoded-path>/` directory
doesn't exist (or is empty), so the step was skipped entirely — no
`.digismith/telemetry-marker` was created, and nothing failed loudly.

```bash
rm -rf /tmp/telemetry-dogfood
CWD_ENCODED=$(echo "/tmp/telemetry-dogfood/emma-repo" | sed 's/\//-/g')
rm -rf "$HOME/.claude/projects/$CWD_ENCODED"
```

- [ ] **Step 9: If any dogfood run in Steps 6-8 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. Otherwise
fix `skills/using-digismith/SKILL.md`'s wording directly, then re-run the
specific dogfood step that failed to confirm the fix.

- [ ] **Step 10: Commit**

```bash
cd /Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry
git add profiles/emma.yml profiles/personal.yml skills/using-digismith/SKILL.md
git commit -m "feat(telemetry): add logging profile field and using-digismith marker write/copy"
```

---

### Task 2: `telemetry` Skill — Capture and Commit

**Files:**
- Create: `skills/telemetry/SKILL.md`

**Interfaces:**
- Consumes: `.digismith/telemetry-marker` from Task 1 (schema: `transcript`,
  `start_line`, `started_at`, `repo`, `slug`, optional `ticket_key`).
- Produces: `.digismith/telemetry/<repo>/<slug>/<timestamp>.jsonl` in
  DigiSmith's own repo, committed — the corpus this whole feature exists
  to build. Nothing downstream consumes it yet (analysis is future work,
  per the design's Non-Goals).

- [ ] **Step 1: Write `skills/telemetry/SKILL.md`**

```markdown
---
name: telemetry
description: Use right after superpowers:finishing-a-development-branch's Step 4 integration-decision menu has been answered (any of its three options) — checks the current working directory for a .digismith/telemetry-marker and, if present, copies that session's transcript back into DigiSmith's own repo for future process-improvement analysis.
---

# Telemetry

## Overview

DigiSmith's map item **P**. Closes the loop on DigiSmith's own process:
when a repo's profile has `logging: true`, `digismith:using-digismith`
marks where a ticket's build began in the live session transcript, and
this skill — triggered once that build's integration decision has been
made — copies everything from that point onward back into DigiSmith's
own repo as a raw, structured record. No analysis ships with this
skill; the goal is building the corpus a future pass can mine for
improvement opportunities.

## When to Use

Right after `superpowers:finishing-a-development-branch`'s Step 4 menu
is answered — merge locally, push and create a PR, or keep as-is, all
three count as "the build is done for now." Check the current working
directory (the same one `finishing-a-development-branch` just acted in)
for `.digismith/telemetry-marker`.

## Process

### Step 1: Check for a Marker

```bash
test -f .digismith/telemetry-marker
```

**Absent** → nothing to capture. Skip this skill entirely and silently
— not an error, this is the normal case whenever `logging` was off or
no profile was ever set. Hand back immediately; see Step 5.

**Present** → read its `key: value` lines into `transcript`,
`start_line`, `started_at`, `repo`, `slug`, and `ticket_key` (present
only when `digismith:using-digismith` Step 1.5 resolved a real ticket
key).

### Step 2: Slice the Transcript

```bash
if [ ! -f "$transcript" ]; then
  # see Error Handling — stale marker, skip capture
  :
else
  NEW_LINE_COUNT=$(($(wc -l < "$transcript" | tr -d ' ') - start_line))
fi
```

If the transcript file no longer exists at the recorded path, or
`NEW_LINE_COUNT` is zero or negative (nothing was appended since the
marker was written), this is a no-op — see Error Handling. Otherwise:

```bash
tail -n "+$((start_line + 1))" "$transcript" > /tmp/telemetry-slice.jsonl
```

This is every line written to the transcript *after* the moment the
marker was recorded — the ticket's actual build, not the conversation
that preceded it in the same session.

### Step 3: Locate DigiSmith's Own Repo

Is the current working directory itself the DigiSmith repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask the user for DigiSmith's repo path this session
and remember it. Never read or write under a plugin cache path
(`~/.claude/plugins/cache/.../digismith/<version>/`) — a stale,
version-locked snapshot.

If this can't be resolved (the user declines to provide a path), skip
capture — see Error Handling. Never block on this.

### Step 4: Compose Metadata and Write

```bash
SESSION_ID=$(basename "$transcript" .jsonl)
ENDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

Build the metadata line as a single-line JSON object:

```json
{"digismith_telemetry_meta":{"repo":"<repo>","slug":"<slug>","ticket_key":"<ticket_key-or-null>","session_id":"<SESSION_ID>","started_at":"<started_at>","ended_at":"<ENDED_AT>"}}
```

`ticket_key` is the literal string from the marker when present, or the
JSON literal `null` (not the string `"null"`) when the marker had no
`ticket_key` line.

Target path, inside DigiSmith's own repo:

```bash
SAFE_TS=$(echo "$started_at" | tr ':' '-')
TARGET=".digismith/telemetry/$repo/$slug/$SAFE_TS.jsonl"
mkdir -p "$(dirname "$TARGET")"
{
  echo "$METADATA_LINE"
  cat /tmp/telemetry-slice.jsonl
} > "$TARGET"
```

### Step 5: Commit and Delete the Marker

DigiSmith's own repo commits `.digismith/` content unconditionally — no
gitignore check here, unlike a *consumer* repo's `.digismith/docs/`.

```bash
git add "$TARGET"
git commit -m "telemetry: capture $repo/$slug session"
```

Then, back in the working directory this skill started from (the
*consumer* repo, not DigiSmith's own repo), delete the marker:

```bash
rm .digismith/telemetry-marker
```

Deleting it — success or skipped-with-a-note — prevents a stale marker
from being replayed if this same worktree is ever reused for unrelated
work later.

Report one line: what was captured (repo, slug, line count) and where
it landed in DigiSmith's own repo.

This skill's job ends here. `superpowers:finishing-a-development-branch`'s
own Step 5/6 (execute the chosen integration option, clean up) continues
exactly as written — do not re-invoke or duplicate any part of it.

## Error Handling

- **No `.digismith/telemetry-marker`** → skip entirely, silently. Normal
  case, not an error.
- **Transcript file from the marker no longer exists** → report one
  line ("telemetry capture skipped — transcript file no longer found")
  and delete the marker anyway, so a later run in the same worktree
  doesn't keep retrying against the same stale pointer. Never block
  `finishing-a-development-branch`'s own flow over this.
- **Zero or negative new lines since `start_line`** → nothing happened
  since the marker was written (e.g. the marker was written but the
  ticket's build never really started in this session). Skip silently,
  delete the marker, no report needed beyond the normal no-op case.
- **DigiSmith's own repo path can't be resolved** (not the cwd, and the
  user declines to provide it this session) → report one line
  ("telemetry capture skipped — couldn't locate DigiSmith's repo") and
  delete the marker anyway, same non-blocking stance as the missing-
  transcript case.
- **Marker file present but missing an expected field** (malformed —
  e.g. no `transcript:` line) → treat the same as "transcript file no
  longer exists": skip with a one-line note, delete the marker.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Check for `.digismith/telemetry-marker` in the current working directory; absent → skip entirely and silently |
| 2 | Slice the transcript from `start_line + 1` to end-of-file; missing file or zero new lines → skip, no capture |
| 3 | Locate DigiSmith's own repo (cwd-is-DigiSmith check, else ask and remember); can't resolve → skip |
| 4 | Compose the metadata JSON line (repo, slug, ticket key or null, session id, start/end timestamps), write metadata + sliced lines to `.digismith/telemetry/<repo>/<slug>/<timestamp>.jsonl` in DigiSmith's own repo |
| 5 | `git add` + commit (no gitignore check — DigiSmith's own `.digismith/` is always committed), delete the marker from the working directory, report one line |
```

- [ ] **Step 2: Dogfood — full capture, real files, real commit**

```bash
rm -rf /tmp/telemetry-skill-dogfood
mkdir -p /tmp/telemetry-skill-dogfood/consumer-repo/.digismith
mkdir -p /tmp/telemetry-skill-dogfood/digismith-repo
cd /tmp/telemetry-skill-dogfood/digismith-repo
git init -q
mkdir -p .claude-plugin
printf '{"name":"digismith"}\n' > .claude-plugin/plugin.json
git add -A && git commit -q -m "init fake digismith repo"

printf '{"type":"user","message":"turn 1"}\n{"type":"assistant","message":"turn 2"}\n{"type":"user","message":"turn 3 - real build starts here"}\n{"type":"assistant","message":"turn 4"}\n{"type":"assistant","message":"turn 5"}\n' \
  > /tmp/telemetry-skill-dogfood/fake-transcript.jsonl

cat > /tmp/telemetry-skill-dogfood/consumer-repo/.digismith/telemetry-marker << EOF
transcript: /tmp/telemetry-skill-dogfood/fake-transcript.jsonl
start_line: 2
started_at: 2026-08-12T09:14:00Z
repo: consumer-repo
slug: fix-cart-drawer-padding-mobile
ticket_key: EMKT-9001
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/skills/telemetry/SKILL.md
for real (not just reasoning about it) against this scenario: you are
working in /tmp/telemetry-skill-dogfood/consumer-repo (cd there first —
it has a real .digismith/telemetry-marker, read it for real).
DigiSmith's own repo is /tmp/telemetry-skill-dogfood/digismith-repo (a
real git repo with a real .claude-plugin/plugin.json naming
"digismith" — you don't need to ask for its path, resolve it directly
per Step 3 if you're actually invoked from a working directory that
already is that repo, otherwise treat this path as the answer to
"where is DigiSmith's repo" without needing to actually ask a human —
there is no human to ask in this dogfood, so just use this path).
Actually run every command. Report: the exact target path you wrote to
inside DigiSmith's own repo, the file's full content, whether it got
committed, and whether .digismith/telemetry-marker was deleted from
the consumer repo afterward.
```

Expected: writes
`/tmp/telemetry-skill-dogfood/digismith-repo/.digismith/telemetry/consumer-repo/fix-cart-drawer-padding-mobile/2026-08-12T09-14-00Z.jsonl`
containing one metadata line (`repo: consumer-repo`, `slug:
fix-cart-drawer-padding-mobile`, `ticket_key: EMKT-9001`, real
`session_id` of `fake-transcript`, `started_at` matching the marker,
a real `ended_at`) followed by exactly 3 lines — turns 3, 4, and 5 from
the fixture transcript (lines after `start_line: 2`), verbatim. The file
is `git add`ed and committed in the fake DigiSmith repo. The consumer
repo's `.digismith/telemetry-marker` no longer exists.

- [ ] **Step 3: Dogfood — no marker, no-op**

```bash
rm -f /tmp/telemetry-skill-dogfood/consumer-repo/.digismith/telemetry-marker
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 1 ("Check for a Marker") of
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/skills/telemetry/SKILL.md,
reasoning through this scenario: you are working in
/tmp/telemetry-skill-dogfood/consumer-repo (verify for real that
.digismith/telemetry-marker does not exist there). Report what happens.
```

Expected: reports skipping the entire skill silently — no capture
attempted, nothing to report beyond the no-op.

- [ ] **Step 4: Dogfood — stale marker (transcript file missing)**

```bash
cat > /tmp/telemetry-skill-dogfood/consumer-repo/.digismith/telemetry-marker << EOF
transcript: /tmp/telemetry-skill-dogfood/this-file-does-not-exist.jsonl
start_line: 0
started_at: 2026-08-12T09:14:00Z
repo: consumer-repo
slug: fix-cart-drawer-padding-mobile
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow Steps 1-2 of
/Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry/skills/telemetry/SKILL.md,
executing for real against this scenario: you are working in
/tmp/telemetry-skill-dogfood/consumer-repo (it has a real
.digismith/telemetry-marker pointing at a transcript file that does not
exist — verify that for real). Report what happens, and whether
.digismith/telemetry-marker still exists afterward.
```

Expected: reports skipping capture with the one-line note about the
missing transcript file, and confirms it deletes the marker anyway (per
Error Handling) rather than leaving it to be retried.

```bash
rm -rf /tmp/telemetry-skill-dogfood
```

- [ ] **Step 5: If any dogfood run in Steps 2-4 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. Otherwise
fix `skills/telemetry/SKILL.md`'s wording directly, then re-run the
specific dogfood step that failed to confirm the fix.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry
git add skills/telemetry/SKILL.md
git commit -m "feat(telemetry): add telemetry skill — capture and commit session transcripts"
```

---

### Task 3: Update `.digismith/history.html` and `MEMORY.md` for Map Item P

**Files:**
- Modify: `.digismith/history.html`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Tasks
  1-2's completed work.
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Add map item P to `.digismith/history.html`'s map table**

Add a new row immediately after the existing **O** row:

```html
    <tr><td><strong>P</strong></td><td>Telemetry</td>
      <td>Captures the full session transcript for a DigiSmith-driven ticket build and commits it back into DigiSmith's own repo, building a corpus for future process-improvement analysis</td>
      <td><span class="status done">Done</span></td></tr>
```

Add a new descriptive paragraph after the existing O paragraph:

```html
  <p style="font-size:.88rem; color:var(--muted);">
    <strong>P — Telemetry:</strong>
    <a href="docs/telemetry/design.html">design spec</a> ·
    <a href="docs/telemetry/plan.md">implementation plan</a> ·
    <a href="docs/telemetry/report.html">implementation report</a>
  </p>
```

- [ ] **Step 2: Update the Progress Overview stats**

Change:

```html
    <div class="stat"><div class="n">5 / 15</div><div class="l">map items shipped</div></div>
```

to:

```html
    <div class="stat"><div class="n">6 / 16</div><div class="l">map items shipped</div></div>
```

(P is a 6th done item alongside A, G, M, N, and O, and a 16th map item.)

- [ ] **Step 3: Add a P line item below the Build Order table**

**P** isn't part of any existing tier — leave every row of the Tier
table exactly as it is, so it stays an accurate reflection of
`MEMORY.md`'s original plan. Instead, insert this paragraph immediately
after the `</table>` that closes the Build Order table, before
`</section>`:

```html
  <p style="font-size:.85rem; color:var(--muted); margin-top:.8rem;">
    <strong>P — Telemetry</strong> <span class="status done">Done</span> —
    pulled forward and built 2026-08-12, outside any tier (a new map letter
    added directly per Jack's request, same as <strong>O</strong>).
  </p>
```

- [ ] **Step 4: Add a timeline entry**

Append to the `.timeline` div, after its existing final entry:

```html
    <div class="event">
      <div class="date">2026-08-12</div>
      <h4>P brainstormed, specced, and built — 2 tasks, subagent-driven-development</h4>
      <p>Jack asked for a feature to fully log and track DigiSmith's own actions
      for data collection, aimed at finding future improvement opportunities —
      originally framed as covering both DigiSmith's own process and the
      shipped product's runtime behavior. Those turned out to be two
      unrelated engineering problems; this feature covers DigiSmith's own
      process only, with shipped-product telemetry deferred as a separate,
      undesigned sub-project. A new <code>logging</code> profile field gates
      capture; <code>using-digismith</code> marks where a ticket's build
      began in the live session transcript, and a new <code>telemetry</code>
      skill — triggered right after
      <code>superpowers:finishing-a-development-branch</code>'s integration
      decision — slices the transcript from that point and commits it into
      DigiSmith's own repo. Raw and unredacted by deliberate choice, recorded
      as an explicit accepted risk given DigiSmith's repo is public. UAT
      planned against a real Emma repository and JIRA ticket.</p>
    </div>
```

- [ ] **Step 5: Update `MEMORY.md`'s map table**

Add a new row after the existing **O** row:

```markdown
| **P** | Telemetry | Captures the full Claude Code session transcript for a DigiSmith-driven ticket build (using-digismith start → finishing-a-development-branch's integration decision) and commits it back into DigiSmith's own repo, building a corpus for future process-improvement analysis. Raw and unredacted by deliberate choice — new letter, added directly per Jack's request during this brainstorm |
```

- [ ] **Step 6: Add a note to `MEMORY.md`'s Open Questions**

Add a new bullet:

```markdown
- **Shipped-product telemetry has no map letter or design.** Originally
  proposed alongside **P** (Telemetry) as "log every action for data
  collection," covering both DigiSmith's own process and the deployed
  theme/app's own runtime behavior (e.g. post-deploy Shopify storefront
  user behavior). Decomposed during **P**'s brainstorm (2026-08-12): the
  two are unrelated engineering problems with no shared infrastructure —
  a client-side instrumentation, collection-endpoint, and data-pipeline
  project, not a DigiSmith-session-transcript one. **P** covers DigiSmith's
  own process only. Undesigned, unscoped, no map letter yet — pick this up
  as its own brainstorm when it's actually wanted, not preemptively.
```

- [ ] **Step 7: Commit**

```bash
cd /Volumes/D/Workspace/Jazurite/DigiSmith/.claude/worktrees/telemetry
git add .digismith/history.html MEMORY.md
git commit -m "docs: update history — telemetry (P) shipped"
```

---

**After Task 3's final review passes:** per `MEMORY.md`'s Conventions
("Every `subagent-driven-development` plan invokes
`digismith:report-implementation`"), invoke `digismith:report-implementation`
before this plan's ledger is deleted. Task 3's own dogfood is
inapplicable to reporting since this feature has no effect on
`report-implementation`'s own logic — this run's report will render with
no regression, same shape as every prior DigiSmith report.

**After this plan merges:** the design's actual acceptance bar is a real
UAT run — start a real ticket in Emma's repository with `logging: true`,
carry it through to `finishing-a-development-branch`, and confirm a
legible, correctly-scoped transcript lands in DigiSmith's own repo. That
run is manual and cannot be scripted into this plan's dogfood steps; it's
the next thing to do once Task 3 merges.

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

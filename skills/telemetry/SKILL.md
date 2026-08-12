---
name: telemetry
description: Use right after superpowers:finishing-a-development-branch's Step 4 integration-decision menu has been answered (any of its three options).
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

**Present** → parse its `key: value` lines into named shell variables.
Run this verbatim rather than reading the file by eye — every later step
depends on these being actually assigned, and an empty variable silently
routes the skill down the wrong branch:

```bash
m=.digismith/telemetry-marker
transcript=$(sed -n 's/^transcript: //p' "$m")
session_id=$(sed -n 's/^session_id: //p' "$m")
start_line=$(sed -n 's/^start_line: //p' "$m")
started_at=$(sed -n 's/^started_at: //p' "$m")
repo=$(sed -n 's/^repo: //p' "$m")
slug=$(sed -n 's/^slug: //p' "$m")
ticket_key=$(sed -n 's/^ticket_key: //p' "$m")
```

Each pattern strips only the leading `<key>: ` prefix, so everything
after the **first** colon survives — `started_at` values like
`2026-08-12T14:07:33Z` contain colons of their own and must not be
truncated. `ticket_key` is empty when the marker has no such line
(`digismith:using-digismith` Step 1.5 omits it unless a real ticket key
was resolved); every other variable should be non-empty — if
`transcript`, `session_id`, `start_line`, `started_at`, `repo`, or `slug`
comes back empty, the marker is malformed, see Error Handling.

`session_id` is the transcript file's basename with `.jsonl` stripped.
It is recorded separately from `transcript` on purpose: the recorded
absolute path is computed in the original checkout, *before*
`using-digismith` Step 2 enters a worktree, and Claude Code re-homes a
session's transcript to the project directory matching its current cwd
— so the recorded path routinely goes stale while the session ID stays
valid. Step 2 uses the ID to find the file again.

Note the current working directory too — this is the *consumer* repo,
and Step 5 needs to come back here to delete the marker after Steps 4-5's
writes happen inside DigiSmith's own repo:

```bash
CONSUMER_REPO_DIR="$(pwd)"
```

### Step 2: Resolve the Transcript, Then Slice It

**Resolve first — do not test the recorded path alone.** The path in the
marker was recorded before `using-digismith` entered a worktree, and the
session's transcript has almost certainly been re-homed since (Claude
Code files a session's transcript under the project directory matching
its *current* cwd). Try three locations in order and take the first that
exists:

```bash
CWD_ENCODED=$(pwd | sed 's/[^a-zA-Z0-9]/-/g')

if [ -f "$transcript" ]; then
  : # (a) recorded path still valid — use it as-is
elif [ -f "$HOME/.claude/projects/$CWD_ENCODED/$session_id.jsonl" ]; then
  # (b) re-homed to the project dir for the current cwd (usually the worktree)
  transcript="$HOME/.claude/projects/$CWD_ENCODED/$session_id.jsonl"
else
  # (c) cwd changed again since (e.g. a merge switched back to the repo root)
  transcript=$(find "$HOME/.claude/projects" -maxdepth 2 -name "$session_id.jsonl" 2>/dev/null | head -1)
fi
```

Claude Code encodes the project directory name by replacing **every**
non-alphanumeric character with `-`, not just `/` — a path containing
`/.claude/worktrees/` becomes `--claude-worktrees-`. Use the character
class above verbatim; a `/`-only substitution silently misses the
directory.

Only if all three miss — `$transcript` is now empty or still doesn't
exist — is this a stale marker; see Error Handling. Otherwise slice from
the resolved path:

```bash
# wc -l counts newlines: if the transcript's final line has no trailing
# newline, this undercounts by one and the capture ends up one line
# short. Accepted — the missing line is the tail of the slice, nothing
# else shifts.
NEW_LINE_COUNT=$(($(wc -l < "$transcript" | tr -d ' ') - start_line))
```

If `NEW_LINE_COUNT` is zero or negative (nothing was appended since the
marker was written), this is a no-op — see Error Handling. Otherwise:

```bash
SLICE=$(mktemp -t telemetry-slice)
tail -n "+$((start_line + 1))" "$transcript" > "$SLICE"
```

This is every line written to the transcript *after* the moment the
marker was recorded — the ticket's actual build, not the conversation
that preceded it in the same session. `$SLICE` is a unique temp file, so
concurrent runs can't collide; Step 4 deletes it once the final output is
written.

### Step 3: Locate DigiSmith's Own Repo

Is the current working directory itself the DigiSmith repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask the user for DigiSmith's repo path this session
and remember it. Never read or write under a plugin cache path
(`~/.claude/plugins/cache/.../digismith/<version>/`) — a stale,
version-locked snapshot.

If this can't be resolved (the user declines to provide a path), skip
capture — see Error Handling. Never block on this.

Store the resolved path as `$DIGISMITH_REPO_PATH` (either the current
directory, absolute-pathed, or the path the user gave you) — Step 4
needs to `cd` there before writing anything.

### Step 4: Compose Metadata and Write

First, move into DigiSmith's own repo — everything in this step and the
`git add`/`commit` in Step 5 operate on paths relative to it:

```bash
cd "$DIGISMITH_REPO_PATH"
```

```bash
SESSION_ID="$session_id"
ENDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

`$session_id` came straight from the marker in Step 1, so it's correct
regardless of which of Step 2's three locations the transcript was
finally found at.

Build the metadata line as a single-line JSON object. `ticket_key` must
be the literal string from the marker, quoted, when present — or the
bare JSON literal `null` (not the string `"null"`) when the marker had
no `ticket_key` line:

```bash
if [ -n "$ticket_key" ]; then
  TICKET_KEY_JSON="\"$ticket_key\""
else
  TICKET_KEY_JSON=null
fi

METADATA_LINE="{\"digismith_telemetry_meta\":{\"repo\":\"$repo\",\"slug\":\"$slug\",\"ticket_key\":$TICKET_KEY_JSON,\"session_id\":\"$SESSION_ID\",\"started_at\":\"$started_at\",\"ended_at\":\"$ENDED_AT\"}}"
```

Resulting shape (illustrative — `<ticket_key-or-null>` here stands for
either `"EMKT-9001"` with quotes, or bare `null` without, per the
conditional above, never the string `"null"`):

```json
{"digismith_telemetry_meta":{"repo":"<repo>","slug":"<slug>","ticket_key":<ticket_key-or-null>,"session_id":"<SESSION_ID>","started_at":"<started_at>","ended_at":"<ENDED_AT>"}}
```

Target path, inside DigiSmith's own repo (you're already `cd`ed there):

```bash
SAFE_TS=$(echo "$started_at" | tr ':' '-')
TARGET=".digismith/telemetry/$repo/$slug/$SAFE_TS.jsonl"
mkdir -p "$(dirname "$TARGET")"
{
  echo "$METADATA_LINE"
  cat "$SLICE"
} > "$TARGET"
rm -f "$SLICE"
```

Delete `$SLICE` whether the write succeeded or not — it's an unredacted
copy of the transcript and shouldn't be left lying in the temp
directory. If any earlier step bailed out to Error Handling after the
slice was created, delete it there too.

### Step 5: Commit and Delete the Marker

DigiSmith's own repo commits `.digismith/` content unconditionally — no
gitignore check here, unlike a *consumer* repo's `.digismith/docs/`.
Still `cd`ed into `$DIGISMITH_REPO_PATH` from Step 4:

```bash
git add "$TARGET"
git commit -m "telemetry: capture $repo/$slug session" -- "$TARGET"
```

The `-- "$TARGET"` pathspec is required, not stylistic: DigiSmith's own
repo may have unrelated content already staged (a concurrent DigiSmith
session mid-flight, say), and a bare `git commit` would sweep it into a
commit labelled "telemetry: capture …". Commit exactly the one file this
skill wrote.

If the commit fails — a hook rejects it, or nothing was actually staged
— see Error Handling. That is the one failure mode where the marker is
**kept**, not deleted.

Then switch back to the working directory this skill started from — the
*consumer* repo recorded in `$CONSUMER_REPO_DIR` back in Step 1, which is
where the marker actually lives, not DigiSmith's own repo you're
currently `cd`ed into — and delete the marker there:

```bash
cd "$CONSUMER_REPO_DIR"
rm -f .digismith/telemetry-marker
```

Deleting it — success, or skipped-with-a-note for any Error Handling case
**except a failed commit** — prevents a stale marker from being replayed
if this same worktree is ever reused for unrelated work later. (The
original checkout's own copy is not this skill's problem:
`digismith:using-digismith` Step 1.5 unconditionally clears it at the
start of every run.)

Report one line: what was captured (repo, slug, line count) and where
it landed in DigiSmith's own repo.

This skill's job ends here. `superpowers:finishing-a-development-branch`'s
own Step 5/6 (execute the chosen integration option, clean up) continues
exactly as written — do not re-invoke or duplicate any part of it.

## Error Handling

- **No `.digismith/telemetry-marker`** → skip entirely, silently. Normal
  case, not an error.
- **Transcript not found at *any* of Step 2's three locations** — not
  the recorded `transcript:` path, not
  `~/.claude/projects/<encoded-cwd>/<session_id>.jsonl`, and not the
  `find` sweep by session ID → report one line ("telemetry capture
  skipped — transcript file no longer found") and delete the marker
  anyway, so a later run in the same worktree doesn't keep retrying
  against the same stale pointer. Never block
  `finishing-a-development-branch`'s own flow over this. A miss on the
  recorded path alone is **not** this case — that's the expected state
  after `using-digismith` entered a worktree, and tiers (b) and (c)
  exist precisely to recover from it.
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
  e.g. Step 1's parse leaves `transcript`, `session_id`, `start_line`,
  `started_at`, `repo`, or `slug` empty) → treat the same as "transcript
  file no longer exists": skip with a one-line note, delete the marker.
  An empty `ticket_key` is not malformed — it's the normal shape for a
  `ticket: false` profile.
- **`git commit` fails** (a hook rejects it, or nothing was actually
  staged) → report one line ("telemetry capture written but not
  committed — <reason>") and **keep the marker**, unlike every other
  case here. This is the one failure that is genuinely retryable: the
  slice is already reconstructible from the same transcript and session
  ID, so leaving the marker in place lets a later run try again. Still
  never block `finishing-a-development-branch`'s own flow over it.
- **Two captures with the same `started_at`** (same consumer repo, same
  slug, same second) → the second `> "$TARGET"` silently overwrites the
  first. Accepted: the filename's granularity is one second, and two
  builds of the same slug starting within the same second isn't a case
  worth extra machinery.
- **Off-by-one on `NEW_LINE_COUNT`** → `wc -l` counts newlines, so a
  transcript whose final line lacks a trailing newline yields a count one
  lower than the real line count and the capture ends one line short.
  Accepted; nothing else in the slice shifts.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Check for `.digismith/telemetry-marker` in the current working directory; absent → skip entirely and silently. Parse its lines into `transcript`, `session_id`, `start_line`, `started_at`, `repo`, `slug`, `ticket_key` with the `sed` block; save `$CONSUMER_REPO_DIR` (current dir) |
| 2 | Resolve the transcript in three tiers — (a) recorded `transcript` path, (b) `~/.claude/projects/<encoded-cwd>/<session_id>.jsonl`, (c) `find ~/.claude/projects -maxdepth 2 -name "<session_id>.jsonl"` — all three miss or zero new lines → skip, no capture; otherwise slice from `start_line + 1` to end-of-file into a `mktemp` file `$SLICE` |
| 3 | Locate DigiSmith's own repo (cwd-is-DigiSmith check, else ask and remember) as `$DIGISMITH_REPO_PATH`; can't resolve → skip |
| 4 | `cd "$DIGISMITH_REPO_PATH"`; compose the metadata JSON line (repo, slug, ticket key as quoted string or bare `null`, session id, start/end timestamps), write metadata + `$SLICE` to `.digismith/telemetry/<repo>/<slug>/<timestamp>.jsonl`, then `rm -f "$SLICE"` |
| 5 | `git add` + `git commit -m "…" -- "$TARGET"` there (pathspec required; no gitignore check — DigiSmith's own `.digismith/` is always committed); `cd "$CONSUMER_REPO_DIR"` and delete the marker — except after a failed commit, where the marker is kept for retry; report one line |

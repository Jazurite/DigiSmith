---
name: adopt
description: Invoked internally by digismith:init when a ticket's spec and plan already exist outside DigiSmith (an external ticket source, vanilla superpowers:brainstorming/superpowers:writing-plans) — never invoke directly.
---

# Adopt (Mid-Stream Path)

## Overview

Resolves the recurring friction Jack captured as
`backlog/mid-development-workflow-injection.md` (retired once this shipped —
see `.digismith/history.html`'s 2026-08-16 entry):
a ticket ID pulled through an external source (e.g. an Atlassian MCP
connector) plus a spec and plan already written by vanilla
`superpowers:brainstorming`/`superpowers:writing-plans`, with none of
DigiSmith's profile-scoped standards injection or docs convention ever having
kicked in. `digismith:adopt` backfills that state retroactively, then hands
off to the same build stage a fresh-start ticket would reach.

Scoped narrowly to one entry point: ticket known, spec written (optionally),
plan written, nothing built yet. Joining before a spec/plan exists, or
mid-build, is out of scope.

## Invoked By

Only `digismith:init`, once its Step 1 detects a feature branch with a plan
file that exists outside `.digismith/docs/`. Not directly matched against
user phrasing.

## Process

### Step 1: Confirm Inputs

Ask for whatever isn't already obvious from the conversation:

- The ticket key.
- Path to the existing plan file. **Required** — stop here if none can be
  found or supplied (see Error Handling).
- Path to the existing spec file, if one exists. **Optional** — some
  tickets go straight from a raw need to a hand-written plan with no formal
  spec step.

Read the full content of the plan file (and the spec file, if supplied) into
your own context now — mirroring `digismith:bootstrap` Step 1's identical
concern for `ticket.md`: a later step may switch into a newly-attached
worktree, and a relative path that was valid in the original directory won't
necessarily still resolve after that switch. Carry the content forward; never
plan on re-reading these files from inside a worktree Step 4 might attach.

### Step 2: Resolve Profile

Run `digismith:bootstrap`'s Step 0 exactly, treating the repo currently
being worked in the same way `digismith:bootstrap` would. This resolves
(or, on first use in this repo, picks via the same `AskUserQuestion` flow)
the active profile and ensures `.digismith/profile` exists with the chosen
name. The resolved profile's `ticket`, `ephemeral`, `standards`,
`publish_artifact`, `reporting`, and `logging` fields are now available for
the rest of this process, exactly as they would be for `digismith:bootstrap`.

### Step 3: Get the Ticket and Resolve the Slug

**If the active profile's `ticket` field is `false`:** skip straight to
deriving the slug directly from a feature description (ask the user for one
if it isn't already obvious), applying `digismith:jira-intake` Step 3.1's
deterministic rule: lowercase, drop filler words (a, an, the, on, to, of,
for, in), replace remaining non-alphanumeric runs with a single hyphen,
truncate to ~40 characters at a word boundary. No `ticket.md` gets written.
Continue to Step 4.

**Otherwise:**

1. Invoke `digismith:jira-intake` Door 1, supplying the ticket key already
   confirmed in Step 1 directly — it does not need to ask for it again.
   `digismith:jira-intake` fetches the ticket (or asks you to paste it, per
   its own JIRA Detection) and writes
   `.digismith/docs/<its-own-derived-slug>/ticket.md` using its own Step 3.1
   algorithm on the fetched title.
2. Check whether the current branch already matches `<Key>__<slug>`. If it
   does, and that slug differs from the slug `digismith:jira-intake` just
   derived, the branch's slug wins — it's already committed to the branch
   name, and `digismith:adopt` never renames a branch. Move
   `.digismith/docs/<its-own-derived-slug>/` to
   `.digismith/docs/<branch's-slug>/` in its entirety (same move-and-correct
   idiom `digismith:enforcer` already uses for a misplaced `design.html`/
   `plan.md` — applied here to a misplaced `ticket.md` folder).
3. If the branch doesn't match `<Key>__<slug>` at all (an off-convention
   name), there's nothing to compare against — use `digismith:jira-intake`'s
   derived slug directly, no correction needed.

Whichever slug results from this step is used for every step below —
never re-derived a third way.

### Step 4: Ensure an Isolated Worktree

Because `digismith:init` only dispatches here from a state where a feature
branch already exists (see its Detection Logic), there is always a branch
to work with — the only open question is whether it's already isolated in
its own worktree.

- **Already inside an isolated worktree for this branch** → nothing to do,
  continue to Step 5 from here.
- **On the branch directly in a non-isolated checkout** → attach a worktree
  to the existing branch: prefer a native worktree tool if this session has
  one; otherwise `git worktree add <path> <branch-name>` — no `-b`, the
  branch already exists. This mirrors `digismith:bootstrap` Step 2.3's
  branch-exists-no-worktree case exactly. Switch into it.

### Step 5: Write Config Into the Worktree

**Profile.** If Step 2 resolved/wrote `.digismith/profile` somewhere other
than the worktree Step 4 left you in (e.g. Step 4 just attached a new
worktree), copy the file in now: a plain file copy, never `git add`, never
`git add -f`, never a commit — mirrors `digismith:bootstrap` Step 2.6
exactly, same reasoning (a worktree checks out only committed files).

**Ticket docs.** If Step 3 wrote (or moved) `.digismith/docs/<slug>/ticket.md`
somewhere other than the worktree Step 4 left you in — i.e. Step 4 attached a
brand-new worktree rather than you already being inside an isolated one — copy
that entire `.digismith/docs/<slug>/` folder into the worktree now: a plain
file copy, never `git add`, never `git add -f`, never a commit. Same reasoning
as the profile copy above — a worktree checks out only committed files, so a
folder written moments ago in a different directory would otherwise simply not
exist here. When Step 4 found you already inside an isolated worktree, there's
nothing to copy — Step 3 already wrote directly into it.

**Telemetry marker.** First, unconditionally clear any marker left over from
a previous ticket in this same checkout, regardless of what the profile
says — same reasoning as `digismith:bootstrap` Step 1.5:

```bash
rm -f .digismith/telemetry-marker
```

Then, if the active profile's `logging` field is `true`, write a fresh
marker recording where telemetry capture should resume from — from this
`adopt` run forward, **not** from whenever the pre-existing spec/plan were
originally written outside DigiSmith (that earlier work happened before
DigiSmith was involved at all, so it's outside this capture's scope by
construction):

```bash
CWD_ENCODED=$(pwd | sed 's/[^a-zA-Z0-9]/-/g')
TRANSCRIPT_DIR="$HOME/.claude/projects/$CWD_ENCODED"
TRANSCRIPT=$(ls -t "$TRANSCRIPT_DIR"/*.jsonl 2>/dev/null | head -1)
```

If `$TRANSCRIPT` is empty, skip the rest of this step entirely — logging
silently does nothing rather than blocking adoption. Otherwise:

```bash
START_LINE=$(wc -l < "$TRANSCRIPT" | tr -d ' ')
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p .digismith
{
  echo "transcript: $TRANSCRIPT"
  echo "session_id: $(basename "$TRANSCRIPT" .jsonl)"
  echo "start_line: $START_LINE"
  echo "started_at: $STARTED_AT"
  echo "repo: $REPO_NAME"
  echo "slug: <slug from Step 3>"
} > .digismith/telemetry-marker
```

If Step 3 resolved a real ticket key, append it:

```bash
echo "ticket_key: <Key>" >> .digismith/telemetry-marker
```

If Step 4 attached a separate worktree after this marker was written, copy
it in the same way the profile file is copied above — mirrors
`digismith:bootstrap` Step 2.7.

### Step 6: Relocate the Docs

Run `digismith:enforcer`'s Step 2/5 "Verified" move-and-correct logic
directly, against the plan (and spec, if one was supplied) from Step 1,
targeting the slug resolved in Step 3:

- **Plan:** write the content you read into context in Step 1 to
  `.digismith/docs/<slug>/plan.md`, creating the folder if needed. Format
  doesn't change — plans are already Markdown.
- **Spec, if supplied:** rewrap the content you read into context in Step 1
  into `digismith:enforcer`'s HTML shell at
  `.digismith/docs/<slug>/design.html` (reuse the shell byte-for-byte from
  `digismith:enforcer`'s Step 1), respecting the same gitignore check
  (`git check-ignore -q .digismith/docs/<slug>/design.html`) and
  `publish_artifact` gate `digismith:enforcer` Step 3 already defines —
  publishing `design.html` via the `Artifact` tool when that gate allows it,
  exactly as `digismith:enforcer` Step 3 does. No spec supplied → skip
  `design.html` entirely, not an error.
- **Relocation target already exists with different content** (e.g. a
  previous partial `digismith:adopt` run, or a genuine naming collision) →
  ask before overwriting, same "never silently overwrite" posture used
  everywhere else in this project.

### Step 7: Hand Off to Build

Invoke `superpowers:subagent-driven-development` directly against
`.digismith/docs/<slug>/plan.md` — `superpowers:brainstorming` and
`superpowers:writing-plans` already ran outside DigiSmith for this ticket,
so they are not invoked here. From this point on,
`digismith:subagent-driven-always` and `digismith:inject-standards`
Scenario 4 apply exactly as they would for any other
`superpowers:subagent-driven-development` dispatch — no special-casing needed, since
both trigger off the dispatch itself, not off which entry point produced it.

## Error Handling

- **No plan file found or supplied** → stop, explain a plan file is required
  for this path; don't fabricate one or silently fall back to
  `digismith:bootstrap`.
- **Active profile has `ticket: false`** → skip
  `digismith:jira-intake`/`ticket.md` entirely (Step 3); `digismith:adopt`
  isn't ticket-mandatory just because the recurring case usually has one.
- **`digismith:jira-intake`'s own stop conditions** (no JIRA tool and the
  user declines to paste, sparse paste, existing-file collision, etc.) →
  `digismith:adopt` doesn't proceed past whatever `digismith:jira-intake`
  itself decided; not a new failure mode to reinvent.
- **No spec supplied, only a plan** → not an error (Step 6) — proceed with
  the plan alone.
- **Relocation target already has different content** → ask before
  overwriting (Step 6), never silently clobber.
- **Logging on but no transcript directory/file found** → skip the marker
  *write* half of Step 5 silently, same disposition as `digismith:bootstrap`
  Step 1.5; never block adoption over this.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Confirm ticket key, plan path (required), spec path (optional); read the plan's (and spec's) full content into context now, before any worktree switch |
| 2 | Resolve profile — run `digismith:bootstrap` Step 0 exactly |
| 3 | Get the ticket via `digismith:jira-intake` (skip if `ticket: false`), resolve the slug — branch's own slug wins over `digismith:jira-intake`'s derived one if they differ, moving the ticket.md folder to match |
| 4 | Ensure an isolated worktree — already in one, or attach one to the existing branch (`digismith:bootstrap` Step 2.3's logic, no `-b`) |
| 5 | Copy `.digismith/profile` and (if Step 4 attached a new worktree) the `.digismith/docs/<slug>/` folder in; unconditionally clear then (if `logging: true`) write and copy in a fresh telemetry marker |
| 6 | Write Step 1's in-hand plan (required) and spec (optional) content into `.digismith/docs/<slug>/` via `digismith:enforcer`'s move-and-correct logic, publishing `design.html` when `publish_artifact` allows |
| 7 | Invoke `superpowers:subagent-driven-development` directly against the relocated `plan.md` |

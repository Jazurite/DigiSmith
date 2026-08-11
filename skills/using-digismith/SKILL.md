---
name: using-digismith
description: Use when the user wants to start real implementation work on a ticket — phrases like "start work on this ticket", "begin implementation", "let's build this now". If they only want the ticket itself, with no branch or pipeline yet, use digismith:jira-intake directly instead.
---

# Using DigiSmith

## Overview

DigiSmith's map item **E**, first slice. Not the full future spine —
just the narrow gap between "I have a ticket" and "I'm building it":
get a real ticket, create its branch, hand off to
`superpowers:brainstorming`. Everything after that
(`superpowers:writing-plans`,
`superpowers:subagent-driven-development`) already chains automatically
through Superpowers' own terminal steps — this skill does not re-invoke
or duplicate that chain.

## When to Use

The user wants to move from having a ticket to actually building it —
"start work on X", "begin implementation", "let's build this". If they
just want the ticket captured with no branch/pipeline yet, use
`digismith:jira-intake` directly instead.

## Process

### Step 0: Resolve Profile

Check for `.digismith/profile` in the repo currently being worked in
(never DigiSmith's own repo).

**Present** → read its one-line content as the active profile name.
Validate it against `profiles/<name>.yml` (see Locating DigiSmith's Repo
below) — no matching file → treat as stale, fall through to the
first-use flow below instead of guessing.

**Missing, or stale** → first use in this repo (or a stale pointer):
1. Locate DigiSmith's own repo — same rule `digismith:inject-standards`
   uses for `standards/`: is the current working directory itself the
   DigiSmith repo (`.claude-plugin/plugin.json` with
   `"name": "digismith"`)? Use it directly. Otherwise ask the user for
   DigiSmith's repo path this session and remember it. Never read
   `profiles/` under a plugin cache path — a stale, version-locked
   snapshot.
2. List `profiles/*.yml` there. If `profiles/` is missing or empty, stop
   and report clearly — this shouldn't happen in a normal install.
3. Present the available profiles via `AskUserQuestion`, one option per
   file, using each file's own `name` field and a one-line summary of
   its toggles (e.g. "emma — ticket, standards, and ephemeral capture
   all on" / "personal — ticket and ephemeral capture off; standards
   empty").
4. If the user declines to pick (see Error Handling), stop here —
   explain a profile is required to proceed. Don't create a branch or
   worktree.
5. Write the chosen profile's `name` field, and only that, as the sole
   line of `.digismith/profile` in the repo being worked in.

**`.digismith/profile` is config, not generated docs output.** It sits
*beside* `.digismith/docs/`, not inside it, and it is deliberately
outside `digismith:jira-intake`'s per-repo commit-vs-gitignore choice —
that choice governs the docs this pipeline *generates* (`ticket.md`,
`design.html`, `plan.md`, `report.html`), while this file is the pointer
every later skill needs in order to know how to behave at all. Two
consequences:

- **Never force-add it.** In a repo whose `.gitignore` carries a bare
  `.digismith/` line — whether `digismith:jira-intake` appended it, or it
  predates this feature entirely — that entry is a prefix match, so it
  covers `.digismith/profile` too, not just `.digismith/docs/`. Plain
  `git add` would hard-fail there and `git add -f` would override a
  choice the user deliberately made. Don't do either. Where `.digismith/`
  is *not* ignored, committing this file along with the rest of the work
  is fine and makes it durable — but it is never required for this
  skill's flow to work.
- **What is required is that the file physically exists in whatever
  working directory the work actually happens in.** Step 2 creates a
  *worktree*, and `git worktree add` checks out only committed files —
  the same hazard Step 1 documents below for `ticket.md`. Untracked or
  gitignored, `.digismith/profile` will not appear inside that new
  worktree on its own, so **Step 2.6 copies it in explicitly**. Skipping
  that copy is not cosmetic: `digismith:inject-standards`,
  `digismith:capture-ephemeral-url`, and `digismith:report-implementation`
  all read this file from the worktree's own working directory, and a
  missing file reads as "no profile" — silently restoring unrestricted,
  pre-profiling behavior for the entire build that follows.

Either way, the resolved profile's `profiles/<name>.yml` content (its
`ticket`, `ephemeral`, `standards`, `reporting` fields) is now available
for Step 1 and Step 2 below.

**Switching profiles mid-session:** if the user's request is "switch
this repo's profile to X" rather than "start work on a ticket", handle
it here instead of proceeding to Step 1: validate `X` against
`profiles/*.yml` (same locate rule as above), state the behavioral delta
(which of ticket/ephemeral/standards/reporting change, and how) via
`AskUserQuestion`, and on confirmation overwrite `.digismith/profile`
with the new name. This is `using-digismith`'s own job done at this
point — don't fall through into Step 1's ticket flow unless the user's
original request was also to start work.

### Step 1: Get a Real Ticket

Check whether this conversation already produced a
`.digismith/docs/<slug>/ticket.md` via `digismith:jira-intake` earlier
this session. If not, invoke `digismith:jira-intake` now.

**If the active profile's `ticket` field is `false`:** skip invoking
`digismith:jira-intake` entirely — no `ticket.md` is written. Derive the
slug directly from the feature description, applying the exact same
deterministic rule `digismith:jira-intake` Step 3.1 already defines:
lowercase, drop filler words (a, an, the, on, to, of, for, in), replace
remaining non-alphanumeric runs with a single hyphen, then truncate to
~40 characters at a word boundary — never leaving a trailing filler word
or hyphen. Restated inline here since `digismith:jira-intake` itself
isn't invoked in this path, not reinvented as a different algorithm. Skip
the rest of Step 1 (no ticket content to read into context) and go
straight to Step 2.

If the result has no `**Key:**` line set — it's a Door 2 draft that was
never upgraded to a real ticket — stop here. See Error Handling. Do not
create a branch or worktree for a key-less ticket.

Then, still in the original checkout and **before any worktree exists**,
read the full content of the `.digismith/docs/<slug>/ticket.md` that
`digismith:jira-intake` just wrote (or that this session already had)
into your own context now — title, description, acceptance criteria,
key. A freshly created worktree checks out only what's already committed,
and `digismith:jira-intake` has just written `ticket.md` — it is not yet
committed at this point, and in a repo that chose the gitignored option
it never will be. Either way the effect is the same: `ticket.md` will
**not** be present inside the worktree Step 2 creates. Carry the content
you read here forward to Step 3; never plan on re-reading the file from
inside the new worktree.

### Step 2: Create the Branch

1. Derive the slug: reuse the folder name `ticket.md` is already
   sitting in (`.digismith/docs/<slug>/ticket.md`) — that folder name
   already is the correct slug, produced by `digismith:jira-intake`'s
   own deterministic slug algorithm. Never re-derive the slug
   independently from the title.
2. Branch name: if the active profile's `ticket` field is `true`,
   `<Key>__<slug>` — e.g.
   `EMKT-9001__fix-cart-drawer-padding-mobile`, using the ticket's actual
   `**Key:**` value verbatim (not a hardcoded `EMKT-` prefix). If `ticket`
   is `false`, `<slug>` alone, with no key prefix at all — e.g.
   `fix-cart-drawer-padding-mobile`. Everywhere else in this step and
   Step 3 that says `<Key>__<slug>`, read it as whichever of the two
   forms this profile produced.
3. Check whether a **branch** named exactly `<Key>__<slug>` already
   exists — not just a worktree. Run `git worktree prune` first, so a
   worktree directory that was deleted outside git doesn't still show as
   attached. Then `git branch --list <Key>__<slug>` finds the branch
   whether or not a worktree is attached, and `git worktree list` shows
   which worktree, if any, has it checked out. Because the branch name
   embeds the ticket key verbatim, treat a name match as *this* ticket's
   own branch — the resume case — unless there's positive evidence it's
   unrelated work, in which case go to 2.4 instead. For the resume case:
   - **A worktree is already attached** (e.g. you're resuming a ticket
     started in an earlier session) → switch into it. Continue to 2.6.
   - **The branch exists but no worktree is attached** (e.g. an earlier
     session exited with the branch kept and its worktree removed) →
     attach a worktree to the branch that already exists rather than
     creating a new branch: run
     `git worktree add <worktree-path> <Key>__<slug>` — note **no `-b`**,
     since the branch already exists — placing it where
     `superpowers:using-git-worktrees` would. Use a native worktree tool
     here only if it explicitly supports attaching to an already-existing
     branch; if unsure, use the git command, it's unambiguous. Continue
     to 2.6.

   Either way, do **not** fall through to 2.5. 2.5 creates a *new* branch
   of this name, which hard-fails when the name is already taken — and so
   does its rename fallback, for the same reason.
4. If 2.3 found a branch of this exact name but with positive evidence it
   belongs to a different, unrelated ticket (a collision at the
   git-branch level, distinct from `digismith:jira-intake`'s own
   docs-folder collision check), ask via `AskUserQuestion` before
   proceeding — never silently reuse a stranger's branch.
5. Otherwise — no branch of this name exists at all — create the isolated
   worktree with this branch name: prefer a native worktree tool if this
   session has one (it owns placement, branching, and cleanup); fall back
   to `superpowers:using-git-worktrees` otherwise. Immediately after
   creation, verify the resulting branch is named exactly `<Key>__<slug>`
   — some native tools alter the name you asked for (e.g. adding their own
   prefix). If it doesn't match, rename it from inside the new worktree
   (`git branch -m <actual-name> <Key>__<slug>`) before continuing to 2.6.
   Steps 2.3 and 2.4 key off this exact name on future runs, so a
   silently-altered name breaks reuse and collision detection.
6. **Make `.digismith/profile` visible inside the worktree.** Whichever
   of 2.3 or 2.5 produced the worktree you're now in — reused, freshly
   attached, or freshly created — check whether
   `<worktree-path>/.digismith/profile` exists and names the profile Step
   0 resolved. If it's missing or names something else, copy the file
   there from the checkout Step 0 read or wrote it in: a plain file copy
   (creating `<worktree-path>/.digismith/` first if it isn't there),
   **not** `git add`, **not** `git add -f`, **not** a commit. If the
   source file isn't reachable for any reason, just write a fresh
   one-line `.digismith/profile` in the worktree containing the resolved
   profile name — that name is a single word you're already carrying from
   Step 0. This is required in
   every repo, not just gitignored ones: a worktree checks out only
   committed files, so a `.digismith/profile` that was written moments
   ago in Step 0 and never committed is simply absent there — and in a
   repo whose `.gitignore` carries a bare `.digismith/` line it could
   never arrive by git at all, in this session or any future one. Do this
   **before** Step 3 hands off; see Step 0's "config, not generated docs
   output" note for why a missing file here silently unwinds profiling
   for the whole build.

### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `superpowers:brainstorming`, passing
the ticket content **you already read in Step 1** — title, description,
acceptance criteria — as seed context so it doesn't start
cold. Pass the content you're carrying; do not try to re-read
`ticket.md` from inside the worktree, it isn't there (see Step 1). Once
invoked, `using-digismith`'s own job is done.
`superpowers:brainstorming`'s own process (including its own
user-approval gates) and its terminal-step chain into
`superpowers:writing-plans` and
`superpowers:subagent-driven-development`/`superpowers:executing-plans`
take over unmodified — do not re-invoke or duplicate any part of that
chain yourself.

## Error Handling

- **No real key** (a Door 2 draft, never upgraded to a real ticket) →
  stop after intake. Explain that `using-digismith` needs a real ticket
  key to name a branch; the user can continue manually, or run Door 1
  later once the ticket is real. Don't create a branch or worktree.
- **Existing worktree _or branch_ for this ticket** → never create a
  duplicate. Worktree already attached → switch into it. Branch exists
  with no worktree attached → attach one to that existing branch
  (`git worktree add <worktree-path> <Key>__<slug>`, no `-b`) and switch
  into it; creating a new branch of the same name would hard-fail.
- **`digismith:jira-intake`'s own stop conditions** (no JIRA tool and the
  user declines to paste, pasted content too sparse, etc.) → don't
  proceed past whatever `digismith:jira-intake` itself decided; this
  isn't a new failure mode to reinvent.
- **Branch name collision with an unrelated ticket** → ask before
  proceeding via `AskUserQuestion`, never silently reuse.
- **User declines to pick a profile on first use** → stop after
  explaining a profile is required to proceed. Don't create a branch or
  worktree.
- **`.digismith/profile` names a profile with no matching
  `profiles/<name>.yml`** → treat as stale, re-run the first-use picker
  rather than guessing.
- **`.digismith/profile` absent inside the worktree Step 2 produced** →
  expected, not an error: a worktree checks out only committed files.
  Copy it in from the original checkout (Step 2.6). Never resolve this
  with `git add -f` — the repo's `.digismith/` gitignore choice, if it
  has one, stands.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Resolve `.digismith/profile` (or run first-use picker / handle an explicit profile switch) — it's config, not generated docs output: never `git add -f` it, and it must be physically present wherever work happens (Step 2.6 copies it into the worktree) |
| 1 | Get a real ticket if the active profile's `ticket` is `true` (invoke `digismith:jira-intake` if needed, stop if key-less); if `ticket` is `false`, derive the slug directly and skip to Step 2; read `.digismith/docs/<slug>/ticket.md`'s full content into context now when it exists — a worktree checks out only committed files, and this one isn't committed yet (and may be gitignored outright), so it won't exist in the worktree |
| 2 | Derive `<Key>__<slug>` (or `<slug>` alone under `ticket: false`) branch name; reuse an existing worktree, or attach one to an existing branch (`git worktree add`, no `-b`), or create both (verify/rename to the exact name if the creation tool altered it); ask on collision with an unrelated ticket; then **2.6 — copy `.digismith/profile` into the worktree** (plain file copy, never `git add -f`), since a worktree checks out only committed files |
| 3 | Invoke `superpowers:brainstorming` with the Step 1 ticket content as seed context (when there is any); Superpowers' own chain takes over from there |

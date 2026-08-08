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

### Step 1: Get a Real Ticket

Check whether this conversation already produced a
`.digismith/docs/<slug>/ticket.md` via `digismith:jira-intake` earlier
this session. If not, invoke `digismith:jira-intake` now.

If the result has no `**Key:**` line set — it's a Door 2 draft that was
never upgraded to a real ticket — stop here. See Error Handling. Do not
create a branch or worktree for a key-less ticket.

Then, still in the original checkout and **before any worktree exists**,
read the full content of the `.digismith/docs/<slug>/ticket.md` that
`digismith:jira-intake` just wrote (or that this session already had)
into your own context now — title, description, acceptance criteria,
key. `digismith:jira-intake` writes that file gitignored, and a freshly
created worktree checks out tracked files only, so `ticket.md` will
**not** be present inside the worktree Step 2 creates. Carry the content
you read here forward to Step 3; never plan on re-reading the file from
inside the new worktree.

### Step 2: Create the Branch

1. Derive the slug: reuse the folder name `ticket.md` is already
   sitting in (`.digismith/docs/<slug>/ticket.md`) — that folder name
   already is the correct slug, produced by `digismith:jira-intake`'s
   own deterministic slug algorithm. Never re-derive the slug
   independently from the title.
2. Branch name: `<Key>__<slug>` — e.g.
   `EMKT-9001__fix-cart-drawer-padding-mobile`, using the ticket's actual
   `**Key:**` value verbatim (not a hardcoded `EMKT-` prefix).
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
     started in an earlier session) → switch into it. Continue to Step 3.
   - **The branch exists but no worktree is attached** (e.g. an earlier
     session exited with the branch kept and its worktree removed) →
     attach a worktree to the branch that already exists rather than
     creating a new branch: run
     `git worktree add <worktree-path> <Key>__<slug>` — note **no `-b`**,
     since the branch already exists — placing it where
     `superpowers:using-git-worktrees` would. Use a native worktree tool
     here only if it explicitly supports attaching to an already-existing
     branch; if unsure, use the git command, it's unambiguous. Continue
     to Step 3.

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
   (`git branch -m <actual-name> <Key>__<slug>`) before continuing to Step
   3. Steps 2.3 and 2.4 key off this exact name on future runs, so a
   silently-altered name breaks reuse and collision detection.

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

## Quick Reference

| Step | Action |
|---|---|
| 1 | Get a real ticket (invoke `digismith:jira-intake` if needed); stop if key-less; read `.digismith/docs/<slug>/ticket.md`'s full content into context now — it's gitignored and won't exist in the worktree |
| 2 | Derive `<Key>__<slug>` branch name; reuse an existing worktree, or attach one to an existing branch (`git worktree add`, no `-b`), or create both (verify/rename to the exact name if the creation tool altered it); ask on collision with an unrelated ticket |
| 3 | Invoke `superpowers:brainstorming` with the Step 1 ticket content as seed context; Superpowers' own chain takes over from there |

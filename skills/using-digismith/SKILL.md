---
name: using-digismith
description: Use when the user wants to start real implementation work on a ticket — phrases like "start work on this ticket", "begin implementation", "let's build this now". If they only want the ticket itself, with no branch or pipeline yet, use digismith:jira-intake directly instead.
---

# Using DigiSmith

## Overview

DigiSmith's map item **E**, first slice. Not the full future spine —
just the narrow gap between "I have a ticket" and "I'm building it":
get a real ticket, create its branch, hand off to
`superpowers:brainstorming`. Everything after that (writing-plans,
subagent-driven-development) already chains automatically through
Superpowers' own terminal steps — this skill does not re-invoke or
duplicate that chain.

## When to Use

The user wants to move from having a ticket to actually building it —
"start work on X", "begin implementation", "let's build this". If they
just want the ticket captured with no branch/pipeline yet, use
`digismith:jira-intake` directly instead.

## Process

### Step 1: Get a Real Ticket

Check whether this conversation already produced a `docs/<slug>/ticket.md`
via `digismith:jira-intake` earlier this session. If not, invoke
`digismith:jira-intake` now.

If the result has no `**Key:**` line set — it's a Door 2 draft that was
never upgraded to a real ticket — stop here. See Error Handling. Do not
create a branch or worktree for a key-less ticket.

### Step 2: Create the Branch

1. Derive the slug: reuse the folder name `ticket.md` is already sitting
   in (`docs/<slug>/ticket.md`) — that folder name already is the correct
   slug, produced by `jira-intake`'s own deterministic slug algorithm.
   Never re-derive the slug independently from the title.
2. Branch name: `<Key>__<slug>` — e.g.
   `EMKT-9001__fix-cart-drawer-padding-mobile`, using the ticket's actual
   `**Key:**` value verbatim (not a hardcoded `EMKT-` prefix).
3. Check whether a worktree already exists for this exact branch name
   (e.g. you're resuming a ticket started in an earlier session). If so,
   switch into it — do not create a duplicate. Continue to Step 3.
4. Check whether this exact branch name exists but belongs to a
   different, unrelated ticket (a collision at the git-branch level,
   distinct from `jira-intake`'s own docs-folder collision check). If so,
   ask via `AskUserQuestion` before proceeding — never silently reuse a
   stranger's branch.
5. Otherwise, create the isolated worktree with this branch name: prefer
   a native worktree tool if this session has one (it owns placement,
   branching, and cleanup); fall back to
   `superpowers:using-git-worktrees` otherwise. Immediately after
   creation, verify the resulting branch is named exactly `<Key>__<slug>`
   — some native tools alter the name you asked for (e.g. adding their own
   prefix). If it doesn't match, rename it from inside the new worktree
   (`git branch -m <actual-name> <Key>__<slug>`) before continuing to Step
   3. Steps 2.3 and 2.4 key off this exact name on future runs, so a
   silently-altered name breaks reuse and collision detection.

### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `superpowers:brainstorming`, passing
`ticket.md`'s full content — title, description, acceptance criteria —
as seed context so brainstorming doesn't start cold. Once invoked,
`using-digismith`'s own job is done. Brainstorming's own process
(including its own user-approval gates) and its terminal-step chain into
`writing-plans` and `subagent-driven-development`/`executing-plans` take
over unmodified — do not re-invoke or duplicate any part of that chain
yourself.

## Error Handling

- **No real key** (a Door 2 draft, never upgraded to a real ticket) →
  stop after intake. Explain that `using-digismith` needs a real ticket
  key to name a branch; the user can continue manually, or run Door 1
  later once the ticket is real. Don't create a branch or worktree.
- **Existing worktree for this ticket** → switch into it, don't create a
  duplicate.
- **`jira-intake`'s own stop conditions** (no JIRA tool and the user
  declines to paste, pasted content too sparse, etc.) → don't proceed
  past whatever `jira-intake` itself decided; this isn't a new failure
  mode to reinvent.
- **Branch name collision with an unrelated ticket** → ask before
  proceeding via `AskUserQuestion`, never silently reuse.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Get a real ticket (invoke `digismith:jira-intake` if needed); stop if key-less |
| 2 | Derive `<Key>__<slug>` branch name, reuse existing worktree or create one (verify/rename to the exact name if the creation tool altered it), ask on collision |
| 3 | Invoke `superpowers:brainstorming` with the ticket's content as seed context; Superpowers' own chain takes over from there |

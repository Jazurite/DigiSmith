---
name: init
description: Use when the user wants to start or resume real implementation work on a ticket — phrases like "start work on this ticket", "begin implementation", "let's build this now", or mid-stream phrasing like "pick this up in DigiSmith" for work already begun outside DigiSmith. If the user only wants a ticket captured, no branch or build yet, use digismith:jira-intake directly instead.
---

# Init

## Overview

DigiSmith's single front door for starting or resuming ticket work — map
item **E**, amended. Dispatches to one of two internal-only workers
depending on state:

- `digismith:bootstrap` — fresh start: profile → ticket → branch → hand off
  to `superpowers:brainstorming`. The original `using-digismith` process,
  renamed and no longer directly invoked.
- `digismith:adopt` — mid-stream: a ticket's spec and plan already exist
  outside DigiSmith. Backfills profile/ticket/branch state, relocates the
  existing docs into DigiSmith's convention, then hands off straight to the
  build stage.

Neither worker is directly user-invoked; `init` is the only thing either Jack
or a future session reaches for by name to start or resume ticket work.

## When to Use

"Start work on this ticket", "begin implementation", "let's build this now —
[paste ticket or describe the need]", or mid-stream phrasing like "pick this
up in DigiSmith" / "catch this ticket up to DigiSmith". If the user only
wants a ticket captured with no branch/build yet, use `digismith:jira-intake`
directly instead.

## Process

### Step 0: Already-Initialized Check

Check for `.digismith/profile` in the current working directory — the repo
or worktree currently being worked in, never DigiSmith's own repo unless
that is genuinely the repo being worked in.

**Present** → this worktree was already fully set up by DigiSmith, via
either `digismith:bootstrap` or `digismith:adopt`. Read its one-line
content as `<name>`. Derive `<slug>` from the current branch name alone —
strip a leading `<Key>__` prefix if the branch matches that pattern (regex
`^([A-Z]+-\d+)__`), otherwise use the branch name as-is; this is a plain
string operation on the branch name already in hand, not a re-run of
Step 1's detection. Report plainly:

```
Already initialized for DigiSmith (profile: <name>, docs at
.digismith/docs/<slug>/).
```

Stop here — no re-running detection, no re-relocating docs, no further
questions. Same posture as `git init` on an existing repo: a notice, not a
cascade. (If the user's actual request was "switch this repo's profile to
X" rather than "start/resume work," that still routes to `digismith:bootstrap`'s
existing profile-switch handling — invoke `digismith:bootstrap` directly
for that specific request only, bypassing Step 1 below.)

**Absent** → continue to Step 1.

### Step 1: Detect Fresh-Start vs. Mid-Stream

Checked in order — stop and dispatch at the first match:

1. **Current branch is the repo's base branch.** Resolve it with
   `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@'`;
   if that fails (no remote configured), fall back to checking whether the
   current branch is literally named `main` or `master`. Match → fresh
   start. Invoke `digismith:bootstrap`.
2. **Already on a feature branch, and `.digismith/docs/<slug>/plan.md`
   already exists** for the slug implied by the branch name (`<Key>__<slug>`
   or `<slug>` alone) → normal resume, already covered by `digismith:bootstrap`'s
   own branch/worktree reuse logic (its Step 2.3). Invoke `digismith:bootstrap`.
3. **Already on a feature branch, no `.digismith/docs/` for it, but a plan
   file exists somewhere** — check whether the conversation already named a
   plan path; if not, ask directly: "Is there a plan already written for
   this, and if so where?" before concluding none exists. A real answer here
   → mid-stream. Invoke `digismith:adopt`.
4. **On a feature branch, no plan found anywhere** (Step 3's question came
   back negative, or the named path doesn't exist) → ambiguous. Ask via
   `AskUserQuestion`:

```
I don't see any DigiSmith docs or plan file for this branch. Should I start
fresh (new spec/plan from here), or is there work already in progress I
should pick up?
```

Never guess between `digismith:bootstrap` and `digismith:adopt` when detection is ambiguous.

## Error Handling

- **`.digismith/profile` present** → see Step 0; always stops there except
  for an explicit profile-switch request, which routes straight to
  `digismith:bootstrap`.
- **Detection ambiguous** (Step 1, row 4) → ask via `AskUserQuestion`, never
  guess.
- **Past dispatch** → whichever of `digismith:bootstrap`/`digismith:adopt` was
  invoked owns its own error handling from that point on; `init`'s job is
  done once it dispatches.

## Quick Reference

| Step | Action |
|---|---|
| 0 | `.digismith/profile` present in cwd → report "already initialized" and stop (profile-switch request → `digismith:bootstrap` directly) |
| 1 | Base branch → `digismith:bootstrap`. Feature branch + `.digismith/docs/<slug>/plan.md` exists → `digismith:bootstrap`. Feature branch + plan exists elsewhere → `digismith:adopt`. Feature branch + no plan anywhere → ask, don't guess |

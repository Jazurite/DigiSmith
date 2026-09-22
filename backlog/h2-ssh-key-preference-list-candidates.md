# H.2 SSH key preference: list candidate keys instead of a blind text prompt

**Status:** Not applied. Raw idea only, no design spec yet — single live occurrence, not yet brainstormed.

## What prompted it

Surfaced 2026-09-22, live, during `digismith:adopt`'s Step 2 (which runs `digismith:bootstrap`
Step 0.6 exactly) for the T.7 voice-selection feature. `bootstrap`'s Step 0.6 currently asks a
plain open-ended question:

> "Which SSH key file should I use on this computer for this repo? (absolute path; on Windows,
> forward slashes are safest)"

Jack's first response wasn't an answer — it was "list down all the ssh keys." He expected the
prompt to already show candidates from `~/.ssh/` (excluding `known_hosts`, `config`, and `*.pub`
public-key files) as picker options, falling back to the current free-text prompt only if none
are found — rather than asking him to recall and type an exact path from memory.

Reported here via a cross-session pointer message from the T.7 session (same repo, a different
worktree/branch, not yet merged at the time) to this lineage's own session, per the standing
"notify the owning lineage's session" convention — not because it couldn't write into the backlog
directly, it did, in its own branch; the pointer let this session land the durable record on
`main` right away instead of waiting on that branch's eventual merge.

## Why this is worth fixing

Asking someone to recall and type an exact key filename/path from memory, when the answer is
just sitting in a directory DigiSmith could list itself, is unnecessary friction — especially
since this preference (`ssh_key`, stored via `digismith:preferences`) is asked at most once per
repo and needs to be right the first time.

## What this covers

Before asking Step 0.6's question, list the private key files actually present in `~/.ssh/`
(exclude `known_hosts`, `config`, and `*.pub`) and present them via `AskUserQuestion` as named
options with full absolute forward-slash paths, plus a "skip for now" option — falling back to
the current free-text prompt only when `~/.ssh/` has zero candidate files. A one-line description
per option (which context that key is normally used for, if inferable) would help but isn't
required for the core fix.

## Call sites

Both already documented in the shipped `.digismith/docs/git-ssh-key-preference/`:
- `skills/bootstrap/SKILL.md` Step 0.6 (the prompt quoted above).
- `skills/adopt/SKILL.md` Step 2, which runs `bootstrap`'s Step 0.6 verbatim as part of its own
  profile/credential resolution sequence.

## Why not applied yet

No design yet — single live occurrence, captured verbatim per the same "write it down, don't
build mid-flight" pattern used for other backlog ideas raised mid-session. Open questions not yet
scoped: how to present the picker in a terminal-driven conversation (numbered list the user
replies to by number, vs. some richer selection), and whether `.pub`-paired private keys with
unusual naming (no matching `.pub` at all, or a custom name) need special handling in the
candidate filter.

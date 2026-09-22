# H.2 SSH key preference: list candidate keys instead of a blind text prompt

**Status:** Not applied. Idea only, not brainstormed — single live occurrence.

**Source:** 2026-09-22, raised live during `digismith:adopt`'s Step 2 (mirroring `bootstrap`'s
Step 0.6) for the T.7 voice-selection feature. Reported here via a cross-session message from
that session, since it's working in a different repo and can't write into DigiSmith's own
backlog directly.

## What happened

`bootstrap`/`adopt` Step 0.6 currently asks an open-ended question with no listing of what's
actually on disk (`skills/bootstrap/SKILL.md`):

> "Which SSH key file should I use on this computer for this repo? (absolute path; on Windows,
> forward slashes are safest)"

Jack's first response wasn't an answer — it was "list down all the ssh keys." He expected the
prompt to already show candidates from `~/.ssh/` (excluding `known_hosts`, `config`, and `*.pub`
public-key files) as picker options, falling back to the current free-text prompt only if none
are found.

## Why this is worth fixing

Asking someone to recall and type an exact key filename/path from memory, when the answer is
just sitting in a directory DigiSmith could list itself, is unnecessary friction — especially
since this preference (`ssh_key`, stored via `digismith:preferences`) is asked at most once per
repo and needs to be right the first time.

## Call sites

Both already documented in the shipped `.digismith/docs/git-ssh-key-preference/`:
- `skills/bootstrap/SKILL.md` Step 0.6 (the prompt quoted above).
- `skills/adopt/SKILL.md` Step 2, which runs `bootstrap`'s Step 0.6 verbatim as part of its own
  profile/credential resolution sequence.

## Why not applied yet

No design yet — single live occurrence, captured verbatim per the same "write it down, don't
build mid-flight" pattern used for other backlog ideas raised mid-session. Open questions not
yet scoped: how to present the picker in a terminal-driven conversation (numbered list the user
replies to by number, vs. some richer selection), and whether `.pub`-paired private keys with
unusual naming (no matching `.pub` at all, or a custom name) need special handling in the
candidate filter.

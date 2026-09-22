# H.2 SSH key preference: list candidate keys instead of a blind text prompt

**Status:** Not applied. Raw idea only, no design spec yet.

## What prompted it

Surfaced 2026-09-22, live, during `digismith:adopt`'s Step 2 (which runs `digismith:bootstrap`
Step 0.6 exactly) for the T.7 voice-selection feature. `bootstrap`'s Step 0.6 currently asks a
plain open-ended question:

> "Which SSH key file should I use on this computer for this repo? (absolute path; on Windows,
> forward slashes are safest)"

Jack's first response wasn't an answer — it was "list down all the ssh keys." He expected the
prompt to already show what's actually on disk rather than asking him to recall and type a path
from memory.

## What this covers

Before asking Step 0.6's question, list the private key files actually present in `~/.ssh/`
(exclude `known_hosts`, `config`, and `*.pub`) and present them via `AskUserQuestion` as named
options with full absolute forward-slash paths, plus a "skip for now" option — falling back to
the current free-text prompt only when `~/.ssh/` has zero candidate files.

A one-line description per option (which context that key is normally used for, if inferable —
e.g. a name matching a known client/profile) would help but isn't required for the core fix.

## Why not applied yet

Raw idea, single live occurrence, no design brainstorm yet. `digismith:bootstrap` Step 0.6 and
its `digismith:adopt` Step 2 mirror are the two call sites that would need the change — both
already documented in the H.2 shipped feature (`.digismith/docs/git-ssh-key-preference/`).

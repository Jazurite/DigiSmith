---
name: preferences
description: Read, write, or clear a small per-repo setting persisted in `.digismith/preferences.yml` — general infrastructure any DigiSmith skill can call into (starting with `finishing-a-development-branch`'s saved finish-option check, map item W.8) or that Jack can invoke directly ("what's my preference for X in this repo", "set my preference for X to Y", "clear my preference for X in this repo"). Not for enumerating/listing every preference set for a repo — no known use case yet.
---

# Preferences

## Overview

DigiSmith's map item **H** (reusing the letter freed when W.6 retired the old
`digismith:subagent-driven-always`). A general per-repo settings store for any
small setting decided through live interaction rather than hand-authored —
first consumer: `finishing-a-development-branch`'s saved finish-option check
(map item W.8, not yet built).

## Invoked By

- **Automatically**, by any consuming skill that needs to read or write a
  preference for the repo currently being worked in. A consuming skill never
  parses `.digismith/preferences.yml` itself; it always goes through this
  skill's operations below.
- **Directly**, on explicit user request: "what's my preference for `<key>`
  in this repo", "set my preference for `<key>` to `<value>`", "clear my
  preference for `<key>` in this repo". This is the only path that changes a
  preference outside of a consuming skill's own first-time "remember this?"
  flow (a mechanism each consumer defines for itself — not something this
  skill invents).

## Storage

`.digismith/preferences.yml`, sibling to `.digismith/profile`, one per
consumer repo (DigiSmith's own repo included, no special-casing). Flat
key/value pairs, plain-text, no YAML library:

```
# DigiSmith-managed. Settings decided through live interaction, not hand-authored.
finish_option: merge_locally
```

Per-repo scope only — no separate global-to-you tier, no per-profile tier.
Same commit disposition as `.digismith/profile`: where a repo's `.digismith/`
isn't gitignored, committing this file along with the rest of the work is
fine; where it is, it's written but never force-added. This skill never runs
`git add`/`git commit`/`git add -f` itself — committing (or not) is left
entirely to whatever flow eventually commits the surrounding work.

## Operations

All three run `scripts/preferences.ts` from the repo root of whichever repo
is currently being worked in:

### `get`

```bash
node --experimental-strip-types scripts/preferences.ts --key <key> --action get
```

Prints the value on stdout, or the literal `unset` if the key was never set,
the file doesn't exist, or the file couldn't be parsed. Never errors over a
missing or malformed file.

### `set`

```bash
node --experimental-strip-types scripts/preferences.ts --key <key> --action set --value <value>
```

Writes `<key>: <value>` into `.digismith/preferences.yml`, creating the file
(with the header comment) and its parent directory if either doesn't exist
yet, and preserving every other key already set. Prints
`preferences: set <key>=<value>` on success.

### `clear`

```bash
node --experimental-strip-types scripts/preferences.ts --key <key> --action clear
```

Removes `<key>` if present; a no-op (not an error) if the key was never set
or the file doesn't exist. Prints `preferences: cleared <key>` either way.

`--path <path>` overrides the default `.digismith/preferences.yml` on any of
the three operations — only needed by this skill's own test suite and by
callers working outside the current directory; a normal invocation from
inside the repo being worked in never needs it.

## Worktree Propagation

Copying `.digismith/preferences.yml` into a freshly created worktree is
`digismith:bootstrap` Step 2 (sub-step 8) and `digismith:adopt` Step 5's job
(alongside their existing `.digismith/profile` copy) — this skill has no
worktree-creation logic of its own and is never invoked as part of that
copy.

## Error Handling

| Case | Disposition |
|---|---|
| `.digismith/preferences.yml` missing | Every key reads as `unset`; not an error. |
| File present but malformed/unparseable (e.g. non-UTF-8) | Treated as `unset`, same as missing. Never crashes the caller. |
| `get`/`clear` on a key that was never set | Returns/reports `unset`, not an error. |
| `set` invoked without `--value` | Fails clearly (`preferences: failed (missing required flag: --value)`), exit 1. Never silently sets an empty string. |
| Target path gitignored in this repo | Write still succeeds; committing is simply skipped by whatever flow would otherwise commit it. Never force-added. |

## Out of Scope

- A global-to-you preference tier spanning all repos — considered,
  explicitly declined in favor of per-repo-only.
- Enumerating/listing all preferences set for a repo — no concrete need yet
  (YAGNI); add only when one shows up.
- Any git add/commit logic — this skill only ever reads and writes the file;
  committing (or not) is left entirely to the surrounding flow, same as
  `.digismith/profile`.
- Migrating any `profiles/*.yml` field into this store — those remain
  DigiSmith-repo-side, hand-authored, per-profile-class config; this store
  is per-individual-repo, dynamically written through live interaction.

## Quick Reference

| Operation | Command | Effect |
|---|---|---|
| `get` | `node --experimental-strip-types scripts/preferences.ts --key <key> --action get` | Prints the value, or `unset` |
| `set` | `node --experimental-strip-types scripts/preferences.ts --key <key> --action set --value <value>` | Writes the key, creating the file/parent dir if needed; prints confirmation |
| `clear` | `node --experimental-strip-types scripts/preferences.ts --key <key> --action clear` | Removes the key if present (no-op otherwise); prints confirmation |

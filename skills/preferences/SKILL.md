---
name: preferences
description: Read, write, or clear a small per-repo setting persisted under the `preferences:` heading of `.digismith/config.yml` — general infrastructure any DigiSmith skill can call into (starting with `finishing-a-development-branch`'s saved finish-option check, map item H.1) or that Jack can invoke directly ("what's my preference for X in this repo", "set my preference for X to Y", "clear my preference for X in this repo"). Not for enumerating/listing every preference set for a repo — no known use case yet.
---

# Preferences

## Overview

DigiSmith's map item **H** (reusing the letter freed when W.6 retired the old
`digismith:subagent-driven-always`). A general per-repo settings store for any
small setting decided through live interaction rather than hand-authored —
first consumer: `finishing-a-development-branch`'s saved finish-option check
(map item H.1).

## Invoked By

- **Automatically**, by any consuming skill that needs to read or write a
  preference for the repo currently being worked in. A consuming skill never
  parses `.digismith/config.yml` (or its old `.digismith/preferences.yml` fallback) itself; it always goes through this
  skill's operations below.
- **Directly**, on explicit user request: "what's my preference for `<key>`
  in this repo", "set my preference for `<key>` to `<value>`", "clear my
  preference for `<key>` in this repo". This is the only path that changes a
  preference outside of a consuming skill's own first-time "remember this?"
  flow (a mechanism each consumer defines for itself — not something this
  skill invents).

## Storage

`.digismith/config.yml`, one per checkout (DigiSmith's own repo included,
no special-casing). Preference keys live under the `preferences:` heading.
The top level holds only the identity keys `profile` and `role`, which
belong to other skills:

```
# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.
profile: digismith

preferences:
  finish_option: merge_locally
  ssh_key: /root/.ssh/jazurite_github
```

This skill's operations keep the bare key names: `--key finish_option`
reads and writes `preferences.finish_option`.

The file is a YAML subset read by a hand-written parser with no library:
top-level `key: value` lines, one level of headings with keys indented
exactly 2 spaces, string arrays as `- item` lines, and `#` comments. Every
value is a string. Anything outside the subset fails with
`<file> line <n>: <reason>`.

**Old files (A.2).** A checkout that is not migrated yet still has
`.digismith/preferences.yml` (flat `key: value`) and `.digismith/profile`.
Reads fall back to them one key at a time. A write in such a checkout
migrates it first when git does not track the old files, and stops with
the migrate and commit commands when git does. In a linked worktree that
still has an old file, a write stops and asks you to migrate the main
checkout.

Per-checkout scope only — no global tier yet. Where a repo's `.digismith/`
isn't gitignored, committing this file along with the rest of the work is
fine; where it is, it's written but never force-added. This skill never
runs `git add`/`git commit`/`git add -f` itself.

## Operations

`scripts/preferences.ts` lives in DigiSmith's own repo, not the repo this
invocation is about — a bare relative path only happens to work when the
caller's cwd is already DigiSmith's own repo, and fails with
`MODULE_NOT_FOUND` in every consumer repo (a client theme repo, etc.), which
is the common case. Locate DigiSmith's own repo the same way
`digismith:inject-standards` does under "Locating the Standards Library" and
`digismith:offload-implementer` does under its `MODULE_NOT_FOUND` handling:

1. Is the current working directory itself the DigiSmith repo (has
   `.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
   directly.
2. Otherwise, ask the user for DigiSmith's repo path this session and
   remember it for the rest of the conversation.

Then invoke all three operations using that resolved path (absolute, or the
cwd-relative path if step 1 above applied) — never a bare relative path
assumed to work from any cwd. The `.digismith/config.yml` file itself (or
its old `.digismith/preferences.yml` fallback) lives in the repo the
preference belongs to, not necessarily the caller's own cwd: pass
`--dir <target-repo>/.digismith` explicitly whenever the caller's own cwd
isn't already that repo. `preferences.ts` reads only `--dir`, so omitting
it defaults to `.digismith` relative to the caller's own cwd, silently
targeting the wrong repo.

### `get`

```bash
node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --key <key> --action get
```

Prints the value on stdout, or the literal `unset` if the key was never set or no file exists. If `.digismith/config.yml` does not parse, it fails with `preferences: failed (<file> line <n>: <reason>)` and exit 1.

### `set`

```bash
node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --key <key> --action set --value <value>
```

Writes `<value>` to `preferences.<key>` in `.digismith/config.yml`, creating the file (with the header comment), its folder and the `preferences:` heading when needed. It edits in place, so other keys, comments and order stay. If a migration ran first, its report lines print before the confirmation. Prints `preferences: set <key>=<value>` on success.

### `clear`

```bash
node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --key <key> --action clear
```

Removes `<key>` if present; a no-op (not an error) if the key was never set
or the file doesn't exist. Prints `preferences: cleared <key>` either way.

`--dir <folder>` points every operation at a specific `.digismith` folder
when the caller's own cwd isn't the repo being worked in. A normal
invocation from inside that repo never needs it.

### `migrate`

```bash
node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --action migrate
```

Merges `.digismith/profile` and `.digismith/preferences.yml` into
`.digismith/config.yml` and moves them aside to `*.migrated`. Run it in the
main checkout, never a linked worktree. It never commits. Where git tracks
the old files, it prints the exact `git add` and `git commit` commands.

## Worktree Propagation

Copying `.digismith/config.yml` (and any old `.digismith/profile` or `.digismith/preferences.yml`) into a freshly created worktree is `digismith:bootstrap` Step 2 (sub-step 6) and `digismith:adopt` Step 5's job — this skill has no worktree-creation logic of its own.

## Error Handling

| Case | Disposition |
|---|---|
| `.digismith/config.yml` and the old files missing | Every key reads as `unset`; not an error. |
| `.digismith/config.yml` does not parse, or is not UTF-8 | Fails with `preferences: failed (<file> line <n>: <reason>)` or `(<file>: not valid UTF-8)`, exit 1. Relay the message; don't guess a fix. |
| Write in a linked worktree that still has an old file | Fails and names the main checkout to migrate. Nothing changes. |
| Write where git tracks an old file | Fails and prints the migrate and commit commands. Nothing changes. |
| `get` on a key that was never set | Returns `unset`, not an error. |
| `clear` on a key that was never set | Silent no-op; still reports `preferences: cleared <key>` (never `unset`, never an error). |
| `set` invoked without `--value` | Fails clearly (`preferences: failed (missing required flag: --value)`), exit 1. Never silently sets an empty string. |
| Target path gitignored in this repo | Write still succeeds; committing is simply skipped by whatever flow would otherwise commit it. Never force-added. |

## Out of Scope

- A global-to-you tier spanning all repos — deferred. `scripts/config.ts` keeps an ordered layer list so one can be added later.
- Enumerating/listing all preferences set for a repo — no concrete need yet
  (YAGNI); add only when one shows up.
- Any git add/commit logic — this skill only ever reads and writes the file;
  committing (or not) is left entirely to the surrounding flow, same as the rest of
  `.digismith/config.yml`.
- Migrating any `profiles/*.yml` field into this store — those remain
  DigiSmith-repo-side, hand-authored, per-profile-class config; this store
  is per-individual-repo, dynamically written through live interaction.

## Quick Reference

| Operation | Command | Effect |
|---|---|---|
| `get` | `node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --key <key> --action get` | Prints the value, or `unset` |
| `set` | `node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --key <key> --action set --value <value>` | Writes the key, creating the file/parent dir if needed; prints confirmation |
| `clear` | `node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --key <key> --action clear` | Removes the key if present (no-op otherwise); prints confirmation |
| `migrate` | `node --experimental-strip-types <digismith-repo>/scripts/preferences.ts --action migrate` | Merges the old files into `config.yml` and moves them aside; prints commit commands where git tracks them |

`<digismith-repo>` is the path resolved under Operations above — never a
bare relative path.

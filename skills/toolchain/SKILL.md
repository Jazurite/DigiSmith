---
name: toolchain
description: Read or dictate Jack's standing toolchain defaults (test runner, styling, E2E framework, script language, package manager, Node install method) stored in `toolchain.yml` at DigiSmith's own repo root — general infrastructure `digismith:brainstorming` consults before asking a tooling/stack question, or that Jack can invoke directly ("what are my toolchain defaults", "set my default styling to X", "clear my default for Y").
---

# Toolchain

## Overview

DigiSmith's map item **G.2**, part of map item **G** ("Structure") — formerly its
own letter, **U**, until the 2026-09-11 merge. A standing, dictatable list of
Jack's tool/technology defaults for common greenfield decisions — test runner,
styling approach, E2E framework, script language, package manager, Node install
method. First (and so far only) consumer: `digismith:brainstorming`'s
clarifying-questions step, so it stops re-asking questions Jack has already
decided.

## Invoked By

- **Automatically**, by `digismith:brainstorming` before asking a clarifying
  question about a tooling/stack choice. A consuming skill never parses
  `toolchain.yml` itself; it always goes through this skill's operations below.
- **Directly**, on explicit request: "what are my toolchain defaults", "set my
  default styling to X", "clear my default for Y".

## Storage

`toolchain.yml` at DigiSmith's own repo root — global to Jack, not per
consuming repo (unlike `.digismith/preferences.yml`, map item H, which is
per-repo project config; these are Jack's own standing choices). Flat
domain/value pairs, plain-text, no YAML library:

```
# DigiSmith-managed. Standing toolchain defaults, dictated by Jack.
test_runner: Vitest
styling: SCSS
```

## Operations

All three run `scripts/toolchain.ts` from DigiSmith's own repo root. Locate it
the same way `digismith:preferences` and `digismith:inject-standards` already
do: current working directory is the DigiSmith repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`) → use directly;
otherwise ask once for DigiSmith's repo path and remember it for the session.

When the resolved DigiSmith repo path is NOT the current working directory,
every command below must include `--path <digismith-repo>/toolchain.yml`
explicitly. The data file has exactly one real location and must always resolve
there, never relative to whatever repo happens to be the current working
directory.

### `list`

```bash
node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action list
```

Prints every domain/value pair, one per line (`<domain>: <value>`). Prints
nothing for a missing or malformed file — not an error.

### `set`

```bash
node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action set --domain <domain> --value <value>
```

Writes `<domain>: <value>`, creating the file (with the header comment) if it
doesn't exist yet, and preserving every other domain already set. Prints
`toolchain: set <domain>=<value>` on success.

### `clear`

```bash
node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action clear --domain <domain>
```

Removes `<domain>` if present; a no-op (not an error) if it was never set or
the file doesn't exist. Prints `toolchain: cleared <domain>` either way.

`--path <path>` overrides the default `toolchain.yml` location. Required
whenever the current working directory is NOT the DigiSmith repo — it points
at the one real `toolchain.yml` location, exactly the same way
`<digismith-repo>` in the script path itself is required in that case. Also
used by this skill's own test suite, but it's not the only purpose.

## Error Handling

| Case | Disposition |
|---|---|
| `toolchain.yml` missing | `list` prints nothing; every domain reads as unset. Not an error. |
| File present but malformed/unparseable (e.g. non-UTF-8) | Treated as empty, same as missing. Never crashes the caller. |
| `set` invoked without `--domain` | Fails clearly (`toolchain: failed (missing required flag: --domain)`), exit 1. Never silently sets an empty string. |
| `set` invoked without `--value` | Fails clearly (`toolchain: failed (missing required flag: --value)`), exit 1. Never silently sets an empty string. |
| `clear` on a domain that was never set | Silent no-op; still reports `toolchain: cleared <domain>` (never an error). |

## Out of Scope

- A per-repo override tier — these are Jack's own defaults, not project
  config, unlike map item H's `.digismith/preferences.yml`.
- A single-key `get` operation — the store stays small and is always read as
  a unit via `list`; add one only if a real need for it shows up.
- Any trigger point beyond `digismith:brainstorming` — deferred, see
  `backlog/toolchain-general-trigger-scope.md`.
- Auto-persisting an override back to the file when Jack overrides a stated
  assumption in the moment — that turn's choice is used as-is, not written
  back without a separate explicit confirmation.

## Quick Reference

| Operation | Command | Effect |
|---|---|---|
| `list` | `node --experimental-strip-types <digismith-repo>/scripts/toolchain.ts --action list` | Prints every domain/value pair, or nothing |
| `set` | `... --action set --domain <domain> --value <value>` | Writes the domain, creating the file if needed; prints confirmation |
| `clear` | `... --action clear --domain <domain>` | Removes the domain if present (no-op otherwise); prints confirmation |

---
name: depot
description: Provisions and refreshes a local, sparse clone of DigiSmith's shared packages/ code at a fixed machine-wide location (~/.digismith/repo). Invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work (ensure); invoke directly any time to pull the latest changes (refresh) — e.g. "update my DigiSmith clone".
---

# Depot

## Overview

DigiSmith's map item **V**. A small utility skill maintaining a local,
minimal, refreshable clone of DigiSmith's shared `packages/` code at
`~/.digismith/repo` — a fixed, machine-wide location, independent of any
consumer repo and independent of Jack's own DigiSmith development
checkout. Any consumer repo can run a shared package (e.g. a future
`jira-client`) through this clone without needing to know or maintain a
path to one.

This skill has no awareness of what's inside `packages/` — it clones the
whole directory as one sparse scope. A consumer package names its own
path underneath (e.g. `packages/jira-client/`); adding a new package
later needs no change here.

## Which Operation

- **Invoked by `digismith:bootstrap`/`digismith:adopt`** (by name, as
  part of their own process) → always `ensure`. Neither skill ever asks
  for `refresh`.
- **Invoked directly by the user, not through those two skills** →
  always `refresh`. `ensure` is not something a person would ever ask
  for by hand — it already runs automatically at the start of every
  ticket's work. A direct request ("update my DigiSmith clone", "pull
  the latest depot", "refresh depot") only ever means bringing an
  existing clone up to date.

## Process

### Operation: `ensure` — idempotent, clone-if-missing

```bash
if [ ! -d ~/.digismith/repo/.git ]; then
  mkdir -p ~/.digismith
  git clone --filter=blob:none --no-checkout --sparse \
    git@github.com:Jazurite/DigiSmith.git ~/.digismith/repo
  git -C ~/.digismith/repo sparse-checkout set packages
  git -C ~/.digismith/repo checkout main
fi
```

`~/.digismith/repo/.git` already present → this is a no-op. Nothing
below the existence check runs; no fetch, no reset, no network call at
all.

### Operation: `refresh` — explicit, on demand

If `~/.digismith/repo` doesn't exist yet when `refresh` is invoked
directly, run `ensure`'s sequence above instead of failing — refreshing
something that was never provisioned isn't a real error case, just an
ordering one.

Otherwise:

```bash
git -C ~/.digismith/repo fetch --all --prune --tags -q
git -C ~/.digismith/repo checkout main
git -C ~/.digismith/repo reset --hard origin/main
```

The sparse-checkout pattern set during `ensure`'s initial clone persists
across this `reset --hard` — never reapply it.

## Error Handling

| Case | Disposition |
|---|---|
| No SSH access / key not authorized for `git@github.com:Jazurite/DigiSmith.git` | Report the actual git error plainly. No retry, no fallback to an unauthenticated clone attempt. |
| Network unreachable / GitHub unreachable | Report the actual git error plainly. |
| `ensure` fails when called from `digismith:bootstrap`/`digismith:adopt` | Fail the whole ticket-start flow — report the error, do not proceed to the next step of whichever skill called it. |
| `refresh` invoked directly and it fails | Report the error; leave the existing clone exactly as it was — a failed `fetch` never reaches `reset --hard`, so nothing is left half-updated. |

## Out of Scope

- **Credential management** — entirely outside this skill.
  `~/.digismith/.env` may live in the same parent folder, but this skill
  never creates, reads, or references it. That belongs only to
  Jira-specific skills.
- **Auto-refresh on every `ensure` call** — deliberately not done, to
  avoid a network round-trip at the start of every single ticket.
- **Per-package logic** — this skill has no knowledge of what's inside
  `packages/`, and never will; a consumer's own path underneath is its
  own concern.

## Quick Reference

| Operation | When | Effect |
|---|---|---|
| `ensure` | Called by `digismith:bootstrap`/`digismith:adopt` | Clone if missing, else no-op |
| `refresh` | User asks directly, any time | Fetch + hard reset to `origin/main` (runs `ensure` first if the clone doesn't exist yet) |

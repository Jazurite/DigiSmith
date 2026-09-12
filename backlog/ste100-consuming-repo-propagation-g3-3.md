# Propagate the ASD-STE100 standard into consuming repos' own `CLAUDE.md` (G.3.3)

**Status:** Not applied. Deferred child of **G.3**. Depends on **G.3.1** (the standard content)
existing first. The most novel and most consequential of G.3's children — writes into a file
other engineers on a consuming repo will see and that changes their own Claude Code sessions too,
not just Jack's.

## What this covers

Jack's explicit call: this should bind the whole team on a consuming repo (Emma's shopify-hub,
per-market theme repos, etc.), not just be a personal preference — which rules out Jack's own
global `~/.claude/CLAUDE.md` as the delivery mechanism (that's personal to him alone) and means
the target has to be the consuming repo's own **committed, team-shared** `CLAUDE.md`.

No DigiSmith mechanism does this today. The closest precedent: `bootstrap`/`adopt` already copy
`.digismith/profile` and `.digismith/preferences.yml` into a freshly created/attached worktree —
but those are per-worktree, DigiSmith-local config, copied fresh every time, never intended to be
team-visible or committed. This is different in kind: a one-time, per-repo, committed addition to
a file the repo's own engineers already read natively (Claude Code reads any repo's root
`CLAUDE.md` automatically — no DigiSmith installation required on their end for it to take
effect).

## Proposed shape (raised live, not yet a real brainstorm)

- New check in `bootstrap`/`adopt` at ticket start: does the current consuming repo's root
  `CLAUDE.md` already have a clearly-marked STE100 section (same "DigiSmith-managed" marker
  convention `.digismith/preferences.yml` already uses)? If yes, no-op — this is a one-time
  setup per repo, not a per-ticket action, since once committed to the repo's default branch it's
  just an ordinary file every future session already reads.
- If missing: create or append the section — but let it go through the **same commit/PR flow as
  any other change to that repo**. Never silently auto-commit a change to a shared, team-visible
  file without it being reviewable the normal way.
- Enforcement, once merged: entirely native Claude Code behavior. DigiSmith's only job is
  noticing the gap and proposing the fix, once per repo.

## Open questions for the real brainstorm

- Bundled into every `bootstrap`/`adopt` ticket-start check, or a separate standalone command
  Jack runs deliberately per repo? Raised live, not resolved.
- Exact merge behavior if the repo's `CLAUDE.md` already has unrelated content — append with a
  clear marker (matching `preferences.yml`'s own convention), never overwrite existing sections.
- Whether this needs its own confirmation/preview step before committing, given it's a
  team-visible change — likely yes, but not designed here.

## Why not applied yet

Depends on G.3.1. Also genuinely the biggest of the three children — deserves its own full
brainstorm rather than being squeezed into G.3.1's build.

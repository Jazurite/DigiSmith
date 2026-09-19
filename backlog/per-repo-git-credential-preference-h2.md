# Per-repo/per-package git & GitHub CLI credential preference (tentatively H.2)

**Status:** Not applied. Idea only, not yet brainstormed or designed.

**Source:** Live friction hit 2026-09-19 in `D:\Workspace\Jazurite\Sofle-oled_wireless`
(later merged into `devkit/keyboards/sofle-oled-wireless/`) while moving that
project into Jack's `devkit` monorepo and standing up a scoped GitHub Actions
workflow for it.

## What happened

`devkit`'s `git` remote (`git@github.com:Jazurite/devkit.git`) pushes fine
over SSH, but the `gh` CLI in the same shell was authenticated as a
different GitHub account (`hieu-huynh-emma`) with no access to that repo.
`gh run list --repo Jazurite/devkit` and `gh repo view Jazurite/devkit` both
404'd, and `gh auth status` / `gh auth switch` were then blocked outright by
the Claude Code auto-mode credential-materialization classifier — so the
mismatch couldn't even be inspected, let alone fixed, from inside the
session.

## The idea

A pre-configured, per-repo (or per-package, for a monorepo like `devkit`)
preference declaring which credential identity — SSH key/host-alias and/or
`gh` CLI account — owns that path, so tooling (Claude Code sessions
included) can pick the right one automatically instead of discovering a
mismatch mid-task. Two different mechanisms for the two credential types,
not one:

- **git/SSH:** enforceable automatically via git's own `includeIf
  "gitdir:..."` config blocks — point each repo/subfolder at its own
  `core.sshCommand` and commit identity. No custom tooling needed; git
  already supports this natively.
- **`gh` CLI account:** no per-directory auto-switch exists upstream: `gh
  auth switch --user <x>` is a global, manual step. At best this becomes a
  documented mapping (which account owns which repo/package) plus maybe a
  small wrapper script that switches before running a `gh` command against
  a given path — not something that can be made to "just work" the way SSH
  can.

## Why this might be H-lineage

Feels like the same shape as [[preferences]] (map item **H**, "Preferences
store") — a small per-repo setting read/written outside of hand-authored
config — but scoped to *credentials* rather than a workflow choice like
`finish_option` (H.1). Whether it actually belongs inside the existing
`.digismith/preferences.yml` mechanism, or needs its own store (since it's
security/identity-adjacent, not a workflow preference, and needs to also be
readable by plain git/gh outside of any DigiSmith skill invocation) is an
open question for whoever brainstorms this.

## Not yet answered

- Does this belong in DigiSmith at all, or is it a `devkit`-local /
  general git-config concern unrelated to DigiSmith's own repo-preference
  system? (This was found in `devkit`, not in an Emma theme repo DigiSmith
  normally operates on.)
- Exact schema: per-repo-root only, or per-subfolder within a monorepo
  (`devkit/keyboards/*`, `devkit/scripts/*`, etc. potentially needing
  different owners)?
- Whether the `gh` CLI account mismatch is worth solving at all given it
  can't be automatic — might just end up as a documented table, not a
  built mechanism.

## Also flagged in passing, likely a separate item

The `gh auth status`/`gh auth switch` block by Claude Code's auto-mode
credential-materialization classifier is itself possibly worth its own
backlog entry — it prevented even read-only inspection (`gh auth status`
with no `--show-token`) of which accounts were logged in, which is what
made this friction impossible to resolve from inside the session at all.
`backlog/offload-blocked-by-permission-classifier-k.md` (K-lineage) is a
related-but-distinct classifier complaint from a different context
(mechanical-tier offload) — worth checking whether these are the same
underlying classifier behavior or coincidentally similar before deciding
if this needs its own file.

## Resume point, once brainstormed

1. Does this belong inside `.digismith/preferences.yml` at all, or is it
   out of DigiSmith's scope entirely (found in a non-DigiSmith repo)?
2. Per-repo-root only, or does a monorepo like `devkit` need per-subfolder
   granularity?
3. Is the `gh` CLI half worth building anything for, given it can't be
   automatic — or does it stay a documented table?

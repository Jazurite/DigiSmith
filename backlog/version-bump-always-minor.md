# `bump-plugin-version.ts` always bumps minor — should bump patch for fix-only ranges

**Status:** Not applied. Deferred deliberately — surfaced live, chose to record it rather than
implement it under time pressure.

**Source:** 2026-09-08, while manually running `01-version-bump.md`'s script after pushing three
fix commits (jira-progress-write-back credential-path fixes) directly to `main`.

## What's confirmed

`computeNextVersion` in
`.digismith/hooks/post-finish/scripts/bump-plugin-version.ts` has no patch/minor/major
distinction at all:

```ts
export function computeNextVersion(current: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(current);
  if (!match) throw new Error(`Cannot parse version: ${current}`);
  const [, major, minor, , prerelease] = match;
  return `${major}.${Number(minor) + 1}.0${prerelease ?? ""}`;
}
```

It always increments the minor slot and resets patch to `0`, regardless of what changed. Checked
the full git history of `.claude-plugin/plugin.json`'s version bumps — every single one, back to
`0.1.0`, is `X.Y.0` → `X.(Y+1).0`. There has never been a patch-level bump in this repo. This
session's three commits were all `fix(...)` — conventionally patch-level — but the script bumped
`0.29.0-beta` → `0.30.0-beta` anyway. Caught before pushing further; corrected by hand to
`0.29.1-beta`.

## Why this is worth doing, not just noting

DigiSmith's own commits already follow conventional-commit prefixes (`fix:`, `feat:`, `chore:`,
`docs:`) fairly consistently — the raw material for a real fix→patch / feat→minor decision already
exists in commit history, `bump-plugin-version.ts` just doesn't look at it. A minor-only scheme
means every release looks the same size regardless of whether it shipped one credential-path typo
fix or a whole new map item, which is exactly the kind of signal semver exists to carry.

## Suggested shape (not yet implemented)

- A new `bumpTypeSince(baseSha, cwd)` that inspects `git log <base>..HEAD --format=%s` (or
  equivalent) and returns `"patch"` when every commit subject matches conventional `fix(...)`
  (including scoped, e.g. `fix(bootstrap): ...`), `"minor"` otherwise (any `feat`, mixed, or
  unrecognized prefix) — `"minor"` as the safe default preserves today's behavior for anything
  ambiguous.
- Extend `computeNextVersion(current, bumpType: "patch" | "minor" = "minor")` to branch on that
  type — `"patch"` increments the patch slot and leaves minor alone; `"minor"` keeps the existing
  behavior exactly (default parameter keeps every existing call site and test passing unchanged).
- `main()` only computes `bumpType` when `args.base` is provided (there's no commit range to
  inspect without one) — the no-`--base` manual-invocation path (used this session, see
  [[post-finish-hooks-direct-push-gap]]) keeps defaulting to `"minor"`.
- Needs its own TDD pass per `superpowers:test-driven-development` — started, then explicitly
  deferred here instead ("put it in the backlog and manually bump patch version now").

## Why not applied yet

Discovered and corrected by hand mid-session rather than mid-implementation; the user chose to
defer the actual script change to a dedicated pass rather than build it live under an unrelated
task's momentum.

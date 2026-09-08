# Post-finish hooks assume the Option-1 merge flow — a direct-to-main push leaves them stranded

**Status:** Not applied. Observational — surfaced by a real occurrence, not yet patched.

**Source:** 2026-09-08, DigiSmith self-development session applying jira-progress-write-back
credential-path fixes found via a live feedback report. Work was committed directly on `main`
(no ticket, no worktree, no branch) and pushed straight to `origin/main` — no `git merge` ever
ran.

## What happened

`.digismith/hooks/post-finish/01-version-bump.md` and `02-plugin-reinstall.md` are documented as
firing automatically "after a self-merge." `01-version-bump.md` explicitly reads `ORIG_HEAD` to
decide (via `versionChangedSince`) whether the incoming branch already bumped the version itself,
and both hooks assume `finishing-a-development-branch`'s Option 1 (merge locally, then push) just
ran.

This session's three fix commits never went through that flow — edited, committed, and pushed
directly against `main` in the primary checkout. Two consequences:

1. **The hooks never fired on their own.** Nothing in a direct-commit path invokes `post-finish` —
   it's wired only to trigger after `finishing-a-development-branch`'s merge option.
2. **`ORIG_HEAD` was stale and would have been actively misleading if trusted.** It still pointed
   at `07ea1e9` — the tip of a `git pull --ff-only` performed earlier in the same session, itself
   205 commits behind `origin/main` by the time the pull ran. Passing that as `--base` to
   `bump-plugin-version.ts` would have compared `plugin.json`'s version across 205+ unrelated
   commits, an unpredictable result — anything from a false "already bumped, skip" to comparing
   against a version from a completely different line of work.

Worked around by running `bump-plugin-version.ts` with no `--base` at all — which skips the
`versionChangedSince` check entirely and always bumps. Correct by luck (this session hadn't
touched `plugin.json`), not because the tool made a principled decision.

## Why this is a real, recurring gap, not a one-off

Any direct-to-main fix in DigiSmith's own repo — a quick doc correction, a one-off credential-path
fix like this one, anything that doesn't go through a full worktree+ticket+merge cycle — hits the
same two problems: hooks that don't fire on their own, and a stale/wrong `ORIG_HEAD` if invoked by
hand afterward. Distinct from [[no-push-after-local-merge]] (which is about Option 1 merging but
never pushing) — this is about work that never merges at all.

## What's still worth examining

- Whether `post-finish` hooks need an explicit "direct commit, no merge" invocation path — e.g.
  accepting a caller-supplied base SHA instead of trusting `ORIG_HEAD`, or documenting "no
  `--base` → always bump" as the sanctioned manual fallback rather than an accident.
- Whether DigiSmith's own contribution convention should discourage direct-to-main commits
  entirely — routing every self-fix through a worktree + `finishing-a-development-branch`, even
  small ones — which would make this moot rather than needing a hook-side fix.
- Whether `01-version-bump.md`/`02-plugin-reinstall.md` should at least name this failure mode
  explicitly ("invoking by hand outside the merge flow? don't trust `ORIG_HEAD`") so a future
  session doesn't have to rediscover it the way this one did.
- Also surfaced same session: [[version-bump-always-minor]] — a related but separate gap in the
  same script (no patch/minor distinction at all, independent of the `--base`/`ORIG_HEAD`
  problem here).

## Why not applied yet

Surfaced live, mid-session — writing it down rather than deciding the fix direction under time
pressure. Same holding-pen disposition as the rest of `backlog/`.

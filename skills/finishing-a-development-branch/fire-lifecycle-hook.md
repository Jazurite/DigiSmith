# Fire Lifecycle Hook

Shared procedure for firing a DigiSmith lifecycle hook at a given point. Any skill that wants
to fire hooks at a point in its own flow follows this procedure, passing the point's name
(e.g. `post-finish`) and — for a point whose hooks reason about a merge range — writing the
merge-range pins described below before firing. This doc is the only place the
enumerate-and-follow logic and the pin contract are written, so a future second lifecycle point
in another skill can reuse both without duplicating the steps.

## Procedure

Given a point name `<point>`:

1. Check whether `.digismith/hooks/<point>/` exists in the current project (the repo root —
   the same one `.claude-plugin/plugin.json`, if present, and `.digismith/` itself live in). If
   it doesn't exist, or exists but has no `.md` files directly inside it, there is nothing to
   fire — stop here, silently. This is the normal case for most repos.
2. If it has `.md` files, list them (only the files directly inside `.digismith/hooks/<point>/`,
   not its `scripts/` subfolder or any other nested directory), sorted by filename.
3. For each file, in that sorted order: read it in full, then follow its instructions exactly
   as if invoking it as a skill. Its frontmatter (`name:`, `description:`) is documentation
   only at this point — nothing matches against it, so just execute the body.
4. If a hook's own instructions fail partway (a command exits non-zero, a gate condition it
   names isn't met), that hook's own instructions define what "failure" means and how to
   report it — this procedure doesn't impose a uniform failure contract across hooks. Continue
   to the next hook file in sorted order regardless, unless the failed hook's own instructions
   say otherwise.

## Merge-range pins

A hook often needs to reason about "what did this merge bring in" — which commits, which files
changed. That range must never come from `ORIG_HEAD` or the live `HEAD`: on a shared checkout,
another session's merge can move both between the merge that fired this point and the moment a
hook actually runs (hooks get paused to avoid colliding with another session, contexts get
compacted). So the firing skill pins the range **before** firing, keyed by the branch being
integrated:

```
refs/digismith/<point>/<feature-branch>/base   — the branch tip immediately before the merge
refs/digismith/<point>/<feature-branch>/head   — the merge commit itself
```

For `<point>` = `post-finish`, `finishing-a-development-branch` Option 1 writes these right after
`git merge <feature-branch>` (`git update-ref ... ORIG_HEAD` / `... HEAD`) and deletes both with
`git update-ref -d` once every hook has fired. A hook that reads a range resolves it from those
two refs and nothing else:

```bash
PIN="refs/digismith/<point>/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base" >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head" >&2; exit 1; }
```

`<feature-branch>` is substituted by the firing skill from its own context, the same way hooks
already receive `<base-branch>`. The two reads and every command that uses their values must sit
in the **same** bash block — shell variables do not survive from one block to the next.

**Missing pin → fail loud.** If either ref does not exist, the hook stops with a message naming
the missing ref. It never falls back to `ORIG_HEAD` — a wrong range silently applied is the exact
failure the pins exist to prevent. Hooks fire from the skill that pins them; running one by hand
means pinning by hand first: the two `git update-ref` lines above, with the real pre-merge and
merge-commit SHAs in place of `ORIG_HEAD` and `HEAD`.

**Branch name not in context** (a hook resumed after compaction, or run by hand): list the
pending pins with `git for-each-ref refs/digismith/<point>/`. Exactly one branch pinned → that is
the one being finished. Several → several delayed finishes are pending; ask which branch is being
finished rather than guess. None → see "Missing pin" above.

**Leftover pins are inert.** A finish that stopped partway (failed merged-result tests, a hook
that failed before the unpin step) leaves its two refs in place. Nothing reads them until a hook
for that same branch fires, and the next Option 1 run for that branch overwrites them.
`git for-each-ref refs/digismith/` shows anything left to tidy by hand.

## Notes

- This procedure is point-agnostic — it works identically for `post-finish` today and for any
  future point some other skill adds later. Only the point name changes.
- A hook file that needs backing scripts keeps them in a `scripts/` subfolder next to that
  point's own folder (e.g. `.digismith/hooks/post-finish/scripts/`), matching the convention
  already used by skills like `subagent-driven-development`.
- Hook files execute with the agent's full tool authority, the same as any skill — only follow
  them in repos the user controls. If a hook file shows up somewhere unexpected, surface it
  rather than running it.

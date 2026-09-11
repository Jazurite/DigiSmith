# `check-attribution` / `[CHECK_ATTRIBUTION_PATH]` hardening (map item W.8)

**Status:** Not applied. Deferred deliberately — surfaced during W.8's final whole-branch review,
none currently reachable under real conditions.

**Source:** Final review (opus) of the W.8 branch (`review-template-ai-attribution-guard`),
2026-09-11.

## Items

- **Reversed BASE/HEAD silently reports clean.** `check-attribution` validates both SHAs exist
  but never checks their ordering. A call with BASE and HEAD swapped produces an empty `git log`
  result (`$head..$base`-shaped internally), so `found` stays `0` and the script exits `0` —
  a false clean, the one failure class this script must not have. Low probability given
  `SKILL.md`'s own explicit BASE-recording discipline (BASE is always captured before dispatching
  an implementer, never guessed), but worth an explicit ordering check
  (`git merge-base --is-ancestor "$base" "$head"` or equivalent) if this file is touched again.
- **`[CHECK_ATTRIBUTION_PATH]` has no quoting guidance and no cross-repo answer.**
  `code-reviewer.md`'s bash block renders the placeholder unquoted — fine for this repo's own
  install path, breaks on any path containing a space. More substantially:
  `requesting-code-review` is a general-purpose plugin skill usable in non-DigiSmith repos (the
  Emma theme repos, for instance), and the instruction to resolve
  `skills/subagent-driven-development/scripts/check-attribution` has no defined answer when that
  relative path doesn't exist in the target repo at all — it needs to resolve to wherever the
  DigiSmith plugin itself is installed (`~/.claude/plugins/cache/jazurite/digismith/<version>/...`),
  not the target repo's own tree. Needs a real design decision (a documented resolution rule,
  not just quoting the placeholder) before this bites a real non-DigiSmith dispatch.

## Why not applied yet

Both are Minor per the final review, and neither is reachable today: DigiSmith's own SKILL.md
discipline already prevents the ordering bug in practice, and no non-DigiSmith dispatch of
`requesting-code-review`'s attribution check has happened yet to expose the path-resolution gap.
Worth fixing opportunistically the next time either file is touched, not on its own.

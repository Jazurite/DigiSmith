# `check-attribution` has no escape hatch — a future branch spanning pre-policy history could become permanently unreviewable

**Status:** Not applied. Confirmed live during W.8's own final whole-branch review (2026-09-11).

**Source:** Final review (opus) of the W.8 branch (`review-template-ai-attribution-guard`).

## What's confirmed

39 commits already in this repo's real history carry `Co-Authored-By: Claude ...` trailers,
going back to `673cc65` — including `624f96c`, W.8's own merge-base, dated the same day W.8
shipped. This isn't one incident; it was the *default* behavior for a meaningful stretch of this
repo's life, from other concurrent Claude Code sessions on this same machine complying with a
generic harness attribution instruction that this repo's own standing rule explicitly overrides
(see `feedback_no-ai-attribution-anywhere.md`).

W.8's `check-attribution` correctly excludes W.8's own branch range (`BASE..HEAD` never includes
`BASE`), so nothing is broken today — confirmed live, the currently-active sibling worktree's own
merge-base is clean. But the mechanism has no flag, env var, or allowlist for a range that *does*
span one of these 39 commits, and `check-attribution`'s own advice ("fix the commit") is
impossible for already-published history. The realistic trigger: any future long-lived worktree
that runs `git merge main` partway through its own life brings main-side commits into its own
`merge-base..HEAD` range from that point on — and every subsequent `review-package` call (task
review, fix-round re-review, final review) would then refuse to write anything, with no
documented way out except editing the script by hand.

## Why this matters

`review-package` failing closed is the right direction for a false positive — better to block a
clean range than let a dirty one through. But "permanently blocks a legitimate branch with no
recourse" is a different failure mode than "correctly blocks a dirty range," and this repo's own
heavy concurrent-worktree usage (3+ active worktrees observed same-day) makes a `git merge main`
mid-branch a realistic, not theoretical, event.

## Candidate shapes, not yet decided

- A `CHECK_ATTRIBUTION_ALLOW` file or env var naming known pre-policy SHAs (or a single cutoff
  SHA/date) that `check-attribution` treats as pre-existing and skips.
- Scope the `git log` call with `--first-parent`, so a merge commit's own second-parent history
  (main's prior commits, already reviewed under whatever process applied at the time) never
  enters the range at all — only the feature branch's own first-parent lineage would be checked.
  Needs checking whether this changes behavior for anything else `check-attribution`/
  `review-package` currently relies on.
- Something keyed off `vendored/PROVENANCE.md`'s own baseline-commit convention (`W.2`'s
  `BASELINE_SHA` already establishes precedent for a fixed, recorded cutoff commit elsewhere in
  this repo) — a single "attribution policy took effect at commit X" marker, everything at or
  before X exempted, everything after held to the rule with no exceptions.

## Also worth recording

The 39-commit count itself is worth keeping somewhere durable independent of whichever fix ships
here — it's the strongest evidence for why W.8 was worth building at all (this wasn't a one-off
mistake, it was the default outcome for most of this repo's recent life), and it's exactly the
context a future session needs before it trips over this gap for real.

## Why not applied yet

Flagged as Important, not Critical, by W.8's own final review — confirmed not live today (every
currently-active worktree's own merge-base is clean), and the safe-direction failure mode (blocks
instead of missing something) buys time to design the right fix rather than rush one. Needs its
own brainstorm to pick between the candidate shapes above, not a same-fix-wave patch.

# Portable output-style packaging + mechanical linter for ASD-STE100 (G.3.4)

**Status:** Not applied. Deferred child of **G.3**. Depends on **G.3.1** (the standard content)
existing first. Smallest and least urgent of the three children.

## What this covers

Two independent, smaller pieces, bundled here because both are packaging/tooling rather than new
policy:

1. **Portable output-style file** — package G.3.1's same rule content as a real Claude Code output
   style (`~/.claude/output-styles/asd-ste100.md` or similar), reusing the mechanism proven by
   `toppa`'s gist (https://gist.github.com/toppa/bf7ff49d6fc44fd4fc3337248f8f2a7e) — not its rule
   content, which G.3.1 already supersedes with `danyuchn/asd-ste100-skill`'s more carefully
   engineered version. Gives Jack a manually-toggleable, portable version usable in any repo/session,
   independent of DigiSmith being installed.
2. **Mechanical linter** — adapt `danyuchn/asd-ste100-skill`'s `scripts/ste-lint.py`
   (structural-only, stdlib-only, explicitly hedge-safe — never flags hedges/modality, self-tested)
   as a DigiSmith-owned linter, mirroring the **W.8** `check-attribution` precedent (a scripted,
   mechanical check wired into review templates rather than relying on subagent judgment alone).

## Sources (cloned for reference, not yet vendored into DigiSmith's own repo)

- `D:/Workspace/Library/asd-ste100-skill` (danyuchn/asd-ste100-skill, MIT, 1,988 stars as of
  2026-09-12) — the actual backbone content and the linter to adapt.
- `D:/Workspace/Library/SimpleEnglish` (AminBlg/SimpleEnglish, MIT, 3,343 stars) — source of the
  word-swap table and use-cases pattern guide already folded into G.3.1; also the source of the
  cautionary self-evaluation (`evals/results/WHY-USELESS-2026-09-02.md`) showing a bloated ruleset
  underperforms a minimal one on the reply register — the reason G.3.1 kept the ruleset tight.
- toppa's gist (link above) — mechanism reference only for this item's first piece.

## Why not applied yet

Depends on G.3.1. Neither piece is urgent — the output style is a nice-to-have delivery format
already covered for DigiSmith's own use by G.3.1/G.3.3, and the linter is an enforcement upgrade
over prompt-level injection, not a blocker for G.3.1 shipping.

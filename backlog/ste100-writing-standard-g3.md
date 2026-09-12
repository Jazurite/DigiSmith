# Simplified Technical English writing standard (tentative G.3)

## Status
Brainstormed 2026-09-12. Grew into a multi-part feature and was split into four children:
**G.3.1** (the standard content itself — being designed now, see
`.digismith/docs/asd-ste100-writing-standard/` once it exists), **G.3.2**
(`backlog/ste100-artifact-integration-g3-2.md`, wiring generated artifacts), **G.3.3**
(`backlog/ste100-consuming-repo-propagation-g3-3.md`, team-shared consuming-repo `CLAUDE.md`
propagation), and **G.3.4** (`backlog/ste100-portable-packaging-g3-4.md`, output-style + linter).
Don't re-brainstorm from this file directly — pick up whichever child is next instead. This file's
own raw material (the source comparison, the scoping decision, the placement reasoning) still
holds and isn't repeated in the four child files.

Source repos cloned to `D:/Workspace/Library/` for reference during this brainstorm:
`asd-ste100-skill` (danyuchn, MIT, 1,988 stars — the actual content backbone) and `SimpleEnglish`
(AminBlg, MIT, 3,343 stars — source of the word-swap table, use-cases guide, and the cautionary
self-eval showing a bloated ruleset underperforms a minimal one on the reply register). Toppa's
gist (https://gist.github.com/toppa/bf7ff49d6fc44fd4fc3337248f8f2a7e) contributed the output-style
*mechanism* only (G.3.4), not its rule content — superseded by danyuchn's more carefully engineered
version.

## What prompted it
Two external sources compared:

- **SimpleEnglish** (https://explainx.ai/blog/asd-ste100-simplified-technical-english-ai-skill-2026)
  — a packaged agent skill (Claude Code/Cursor/~25 harnesses) enforcing ASD-STE100 via 53
  controlled-English rules, plus a regex-based linter to measure compliance. Claimed 72.9% fewer
  style violations per 100 words across six Claude models, reduced output tokens.
- **ASD-STE100 output style gist** (https://gist.github.com/toppa/bf7ff49d6fc44fd4fc3337248f8f2a7e)
  — a Claude Code *output style* (global, session-wide, selected via `/config` →
  `~/.claude/output-styles`), same underlying standard, simpler rule list (≤20/25-word sentences,
  noun clusters ≤3 words, active voice, simple tenses, one-word-one-meaning, no modal stacking).

## Decision so far (not yet built)
- **Assimilate SimpleEnglish's rule *content* (and borrow the gist's crisper wording for a few
  rules), not either source's packaging.** An "output style" is a Claude Code app-level global
  toggle — it would flatten *all* session output, including live brainstorming/design
  conversation, which is the opposite of what's wanted.
- **Scope is narrow, deliberately:** applies only to text DigiSmith generates *for a reader other
  than Jack in the moment* — PR descriptions, JIRA/Teams comments (Q's `generate-comment`
  templates), and `report-implementation`'s (N) report prose. Does **not** apply to live
  conversation with Jack — no reason to flatten normal back-and-forth into controlled English.
- **Reframed motivation:** not "accessibility for non-native speakers" (STE100's original
  aerospace framing) — it's "AI-generated artifacts should be short and unambiguous for whoever
  reads them next, human or agent." Confirmed live: PR descriptions specifically matter because
  they're read by another engineer or another reviewing agent, both of whom want it simple/short.
- **PR descriptions specifically should inherit their shape from `report-implementation`'s own
  report template, not get a second, competing ruleset bolted on.** This is also already partly
  true today for a different reason — see the global `CLAUDE.md` convention (title-only commits,
  short plain PR descriptions, no `## Summary`/`## Test plan` headers) adopted after
  `emma-sleep/shopify-hub#63` was closed for reading as AI-generated. STE100 would tighten the
  same surface for a second, compounding reason (reader clarity), not contradict the existing rule.

## Where it fits
**G (Methodology)**, as a new sub-item, **G.3** — sibling to **G.1** (Standards injection,
already explicitly "coding standards + style guide") and **G.2** (Toolchain). Same injection
shape as G.1: fold a curated rule subset into the standards library, inject it specifically into
whatever generates PR descriptions / JIRA-Teams comments / report prose — not into `G.1`'s
general subagent brief, which would over-apply it to code and conversation.

## Open questions for a real brainstorm
- Which exact rule subset from SimpleEnglish's 53 is worth keeping vs. too aerospace-specific to
  matter for PR/JIRA/Teams prose.
- Whether a mechanical linter (same pattern as W.8's `check-attribution`) is worth building to
  actually enforce this, or whether prompt-level injection alone is enough.
- Whether this ever needs to touch code comments (G.1's territory) — current lean is no, this is
  about generated-artifact prose, not code.

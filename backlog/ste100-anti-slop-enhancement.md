# T.1 enhancement: cluster-counting restraint, preserve-list, and expanded tell catalog

**Status:** Not applied. Started as "expand the word-swaps table" (raised 2026-09-12 during T.1's
own brainstorm), broadened 2026-09-14 after exploring `Deupaxx/EveryDay-Writer` (MIT, cloned to
`D:/Workspace/Library/EveryDay-Writer`) — a much more mature anti-AI-slop system than either of
T.1's own sources (danyuchn/AminBlg). Still a deferred T.1 follow-up, not a new T.x child.

## What this covers

Three concrete gaps found in T.1's current content (`standards/global/ste100-*.md`), all sourced
from EveryDay-Writer's `core/anti-ai-rules.md`:

1. **Cluster-counting restraint** (their §9 "What Not to Flag" / §10 "Signs of Human Writing").
   T.1's word-swap table is a flat always-replace list — one em-dash, one "however," one slop word
   gets flagged the same as ten. EveryDay-Writer's rule: flag only when tells *cluster* ("one
   em-dash means nothing; em-dashes plus a tricolon plus 'vibrant tapestry' plus a 'Challenges'
   section is a confession"), and explicitly protects specific signals of genuine human writing
   (specific odd details, unresolved tension, uneven sentence rhythm, deliberate quirks) from being
   sanded off by an over-eager edit. This is the same lesson AminBlg's own self-eval already taught
   (a bloated ruleset that flags everything underperforms a minimal one) — EveryDay-Writer gives it
   a concrete mechanism T.1 doesn't have yet.
2. **Expanded tell catalog** (their §1-5). Dozens of specific AI-writing patterns beyond T.1's
   current word-swap table: negative parallelism, rhetorical self-Q&A, "serves as" dodges, aphorism
   formulas, uniform hyphenation of compound pairs, title-case headings, bold-first bullets. Good
   raw material for growing `ste100-word-swaps.md` beyond AminBlg's original 52 rows — the original
   ask this backlog item started as.
3. **Two-pass interrogation loop** (their §7). T.1 is currently static rules with no revision
   process. EveryDay-Writer's flow: draft, then answer three fixed questions cold (would a reader
   spot this as AI-generated — name the sentence, not a category; does this state any fact the
   writer didn't supply; what's the weakest sentence and is it load-bearing), then revise, then run
   a checklist. Worth considering as a companion process for T.1's own consumers (T.2's eventual
   wiring into `generate-comment`/`report-implementation`) rather than a one-shot rule application.

Also noted, not part of this item: EveryDay-Writer does per-person voice fingerprinting (calibrate
generated writing to match a specific person's real samples, multi-profile for ghostwriting
clients) with a clean precedence ladder (structural rules → voice profile → a pasted sample
overrides even the profile). No current DigiSmith need for this, but worth remembering as a
pattern if T ever grows a "sound like Jack specifically" child.

## Open questions for a real brainstorm

- Does cluster-counting need actual tooling (a script counting tell density per paragraph), or is
  it purely a judgment instruction added to `ste100-writing.md`'s prose?
- Which of EveryDay-Writer's tell-catalog entries are worth porting into `ste100-word-swaps.md`
  vs. too specific to their target genres (LinkedIn posts, sales copy) to matter for DigiSmith's
  own artifacts (PR descriptions, JIRA/Teams comments, reports)?
- Does the two-pass interrogation loop belong in T.1's own content, or is it really T.2's concern
  (the wiring/consumption layer, since T.1 itself is content-only by design)?
- Original question, still open: where do new word-swap candidates come from — manual notice,
  periodic scan of DigiSmith's own artifacts, or something else?

## Why not applied yet

Still a deferred T.1 follow-up, not urgent — T.1 ships and works today without any of this.
Bundling the original word-swap-expansion ask with the two new EveryDay-Writer findings since
all three serve the same goal (making T.1's anti-slop content meaningfully more mature) and would
naturally get brainstormed together.

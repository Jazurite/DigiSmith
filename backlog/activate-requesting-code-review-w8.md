# Activate `requesting-code-review` with DigiSmith standards injection (new letter/number, tentatively W.8)

**Status:** Not applied. Idea only, brainstormed 2026-09-11 up through a proposed design, then
explicitly deferred — captured here rather than decided in the moment.

**Source:** Raised live by Jack while reviewing what's next on the map: `digismith:requesting-code-review`
is one of the 14 Superpowers primitives vendored under map item **W** (Primitive ownership) — cloned
verbatim by W.1, no fork-provenance tag, still dormant — and it uses Superpowers' own generic review
rubric rather than DigiSmith's own `standards/` library. Jack's framing: this should land as a
**W-lineage primitive activation** (activating `requesting-code-review` the way W.5/W.6/W.7 each
activated a different dormant primitive before it), not primarily as a G.1 change.

## Relationship to the existing G.1 gap

This absorbs and extends `backlog/review-time-standards-injection-gap.md` (filed 2026-08-14, G.1-only
framing: "`inject-standards` has no scenario for review-time dispatch"). That file's gap is real and
becomes this item's dependency — `digismith:inject-standards` needs a new Scenario 5 before
`requesting-code-review` can be activated with it — but the primary letter/number this idea should be
filed under is **W** (this is a primitive activation, following W's own established pattern), with
the G.1 Scenario 5 addition riding along as what W.8 needs, not a G-first change with W as a side
effect. That older file is left in place, not deleted (nothing's applied yet), but should be treated
as folded into this one going forward — don't brainstorm it separately.

## What this covers

Two review dispatch paths in DigiSmith currently use Superpowers' own generic review rubric with no
DigiSmith house-standards awareness at all:

1. **`digismith:requesting-code-review`** — the standalone skill, invoked when Jack explicitly asks
   for a review or a major feature just completed. Still fully dormant (no fork-provenance tag),
   using its cloned-verbatim `code-reviewer.md` template unchanged.
2. **`digismith:subagent-driven-development`'s own review dispatches** — the per-task reviewer
   (`task-reviewer-prompt.md`) and the whole-branch final reviewer, which (per its own SKILL.md)
   already dispatches using `requesting-code-review`'s `code-reviewer.md` template directly — so
   fixing that one template's placeholder covers both the standalone skill's ad-hoc reviews *and*
   `subagent-driven-development`'s final review in one place. Only the per-task template is a
   separate file needing its own copy of the same addition.

Confirmed live (2026-08-14, prompted by writing `standards/global/surgical-changes.md`): the
diff-hygiene standards (`surgical-changes`, `branch-scope-discipline`, `fixing-blockers-mid-task`)
shape what an *implementer* subagent writes if matched at dispatch time, but nothing systematically
hands them to whoever reviews the branch afterward — the exact place these rules are meant to be
checked against, not just followed while writing.

## Proposed shape (brainstormed 2026-09-11, not yet approved for implementation)

Presented to Jack as approach **A** of three considered, recommended and tentatively agreed before
he stopped to defer the whole thing:

- **A (tentatively preferred): new Scenario 5 in `inject-standards`**, "Dispatching a Review
  Subagent" — reuses Scenario 4's exact matching (index.yml relevance + Shopify-repo-layer
  auto-include gate) and its full-content-no-question behavior (a reviewer subagent can't be asked
  interactively either), but framed as review criteria ("check the diff against these") rather than
  implementation guidance ("follow these while writing") — same underlying files, different reader.
- **B (considered, not preferred):** extend Scenario 4 itself to also cover review dispatches instead
  of adding a new scenario. Less new surface area, but conflates two different consumers and would
  still need an internal branch for the different wording — ends up close to a second scenario
  anyway.
- **C (rejected):** hardcode a standards mention directly into the two review skills instead of
  going through `inject-standards` at all. Fastest, but duplicates content instead of referencing
  `standards/` live and drifts the moment a standard changes — breaks the pattern every other
  consumer uses.

**Sketched components (approach A), not committed:**
- `skills/inject-standards/SKILL.md` — new Scenario 5.
- `skills/requesting-code-review/code-reviewer.md` — gains a `{{STANDARDS_BLOCK}}` placeholder
  (shared by both the standalone skill and `subagent-driven-development`'s Final Review, since both
  dispatch with this same template file).
- `skills/requesting-code-review/SKILL.md` — activated (fork-provenance tag per W.2's convention);
  new pre-dispatch step calls Scenario 5 and fills the placeholder.
- `skills/subagent-driven-development/SKILL.md` — its Final Review step gets the same Scenario-5
  call (reusing the `code-reviewer.md` placeholder above); its per-task review step gets the same
  addition against `task-reviewer-prompt.md`.
- `skills/subagent-driven-development/task-reviewer-prompt.md` — gains its own `{{STANDARDS_BLOCK}}`
  placeholder.

**Sketched error handling:** matches Scenario 4's existing disposition — zero matching standards, or
no `index.yml` at all, means proceed without a standards section rather than blocking any review
dispatch (a reviewer subagent can't be asked interactively, so this can never stall).

**Sketched testing:** prose-only change, no code — verified live (a real dispatch showing the block
actually appears), same as G.2/U's own brainstorming-integration precedent had.

## Why not applied yet

Jack's own call, mid-brainstorm: don't decide the map-item framing or proceed to a design doc right
now — capture the idea (including the tentative approach and rejected alternatives, so a future
session doesn't have to re-derive them) and revisit later as its own W-lineage brainstorm.

## Open questions

- Final letter/number: tentatively **W.8** (the next available activation slot — the original W.8
  working name for Saved Finish Option was renumbered to **H.1** on 2026-09-06, freeing W.8 for
  reuse the same way retired map letters get freed). Not confirmed — could land differently once
  actually brainstormed.
- Whether activating `requesting-code-review` this way also warrants updating
  `skills/subagent-driven-development`'s own row/activation history (it's already been activated
  twice before, W.6 and W.7, for unrelated reasons) — i.e. does this get its own W-sub-number
  distinct from the `requesting-code-review` activation, or is it one combined W.8 covering both
  call sites? Not decided.

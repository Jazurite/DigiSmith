# `inject-standards` needs a real scope gate for prose-only standards, and companion-file awareness

**Status:** Applied 2026-09-13. See `.digismith/docs/inject-standards-prose-scope-gate/design.html`
and `plan.md`. Both open questions below resolved: a `kind: prose` field (not a dedicated folder)
excludes prose standards from Scenario 4, and a `companions:` list (not Markdown-reference parsing)
keeps a multi-file standard's siblings attached whenever the primary entry is matched.

## What this covers

Two related gaps in `standards/` + `digismith:inject-standards`, both first exposed by G.3.1
being the first prose-only, multi-file standard in `global/`:

1. **No mechanical exclusion from Scenario 4 (subagent code dispatch).** `global/` has no
   repo-type gate at all (unlike `shopify/`/`team/`, which Scenario 4 auto-includes only for
   qualifying repos) — every profile includes `global/`, and `offload-implementer` invokes
   Scenario 4 automatically for every dispatch. The only thing stopping a pure code-writing task
   from getting the ASD-STE100 prose standards injected is the matcher's own judgment reading an
   index description that says "not for code." A mechanical gate would be more robust: either a
   `kind: prose` (or similar) field in `index.yml` that Scenario 4 skips outright, or a dedicated
   folder (e.g. `writing/`) that gets the same auto-exclusion treatment `shopify/`/`team/` already
   have, just inverted.
2. **No companion/bundle concept for multi-file standards.** `ste100-writing.md` references
   `global/ste100-word-swaps.md` and `global/ste100-use-cases.md` by path. Scenario 4 pastes only
   the matched file's own full content into the subagent prompt (a subagent has no visibility into
   DigiSmith's plugin path to follow a reference itself), so a dispatch that matches only one of
   the three files gets a dangling pointer to content it can never actually read. A `companions:`
   list in `index.yml` that `inject-standards` always pulls in alongside a match would fix this
   for G.3.1 and for any future multi-file standard.

G.3.1's own fix (as a stopgap, applied 2026-09-12): strengthened the three ste100 index
descriptions to explicitly say "skip for code-writing tasks," and made `ste100-writing.md`
explicitly self-sufficient on its own (its core rules stand without the two companions). Neither
change touches `inject-standards` itself — this backlog item is for the real mechanical fix.

## Open questions for a real brainstorm

- `kind:` field vs. a dedicated folder — the folder approach reuses an existing primitive (Step 3's
  repo-qualification gate) but touches every profile's `standards:` list and the folder
  enumerations hardcoded in `add-standards`/`discover-standards`; the field approach is more
  surgical but needs new logic in `inject-standards` and `index-standards`' schema. Neither is
  free.
- Does the companion-list concept belong in `index.yml` (declarative, matches how the rest of the
  index already works) or should `inject-standards` parse the referenced-file syntax already
  present in a standard's own Markdown (fragile, couples the mechanism to prose wording)?
- Whether this is G-lineage (it's `inject-standards`, which is G.1's own mechanism) or deserves its
  own consideration alongside G.3.3/G.3.4, since both of those also touch how this content gets
  delivered.

## Why not applied yet

Found live during review, not during G.3.1's own design — a real gap in shared infrastructure,
not scoped into G.3.1's build. The stopgap (tighter descriptions, self-sufficient core file) ships
with G.3.1; the mechanical fix needs its own brainstorm.

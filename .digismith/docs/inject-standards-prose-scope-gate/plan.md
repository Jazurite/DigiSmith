# inject-standards Prose Scope Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two optional `standards/index.yml` fields — `kind: prose` and `companions: [...]` —
and wire `digismith:inject-standards`/`digismith:index-standards` to honor them, so a prose-only
standard is never injected into a code-writing subagent's dispatch prompt, and a matched
multi-file standard always brings its companion files along.

**Architecture:** Pure documentation/schema change — two new optional fields, one new exclusion
rule in `inject-standards`' Step 3, one new injection rule in its Step 6, and matching schema docs
in `index-standards`. No code, no new skill. Backward-compatible: absent fields on all 11
pre-existing entries mean zero behavior change for them.

## Global Constraints

- Every edit is prose/YAML — no executable code, no new dependency
- All 11 pre-existing `standards/index.yml` entries must remain valid and unaffected — the new
  fields are additive and optional
- No AI/Claude/assistant attribution in any commit message (standing DigiSmith-wide rule)

---

### Task 1: Add the schema fields and wire both skills to honor them

**Files:**
- Modify: `standards/index.yml` (add `kind: prose` to all three `ste100-*` entries, and
  `companions: [ste100-word-swaps, ste100-use-cases]` to `ste100-writing` only)
- Modify: `skills/inject-standards/SKILL.md` (Step 3 gets the Scenario-4 prose exclusion rule;
  Step 6 gets the companion-injection rule; Quick Reference table's Step 3/6 rows updated to match)
- Modify: `skills/index-standards/SKILL.md` (Step 4 proposes the two new fields when relevant;
  Step 6's schema/example documents them)
- Modify: `backlog/inject-standards-prose-scope-gate.md` (Status line updated to "Applied")

**Interfaces:**
- Consumes: nothing — first and only task
- Produces: the two new `index.yml` fields and the two skills' updated instructions; no other
  task or file depends on this one

- [ ] **Step 1: Update `standards/index.yml`**

In the `global:` block, change the three `ste100-*` entries to:

```yaml
  ste100-use-cases:
    kind: prose
    description: Per-genre prose patterns (error messages, PR/commit descriptions, changelogs, agent instructions) for the ASD-STE100 writing standard. Prose only, not code — skip for code-writing tasks
  ste100-word-swaps:
    kind: prose
    description: Slop-word to plain-word substitution table for AI-generated prose. Prose only, not code — skip for code-writing tasks
  ste100-writing:
    kind: prose
    companions: [ste100-word-swaps, ste100-use-cases]
    description: Writing style for AI-generated prose (PR descriptions, comments, reports, SKILL.md). Not for code, code comments, or live conversation — skip entirely for a code-writing task
```

(Field order: `kind`, then `companions` where present, then `description` last — keeps every
entry's required field, `description`, in the same relative position across the file.)

- [ ] **Step 2: Verify Step 1's YAML**

Run: `grep -c "kind: prose" standards/index.yml`
Expected: `3`

Run: `grep -c "companions:" standards/index.yml`
Expected: `1`

Run: `grep -n "^  [a-z]" standards/index.yml | head -9`
Expected: same 9 alphabetically-ordered `global:` keys as before (`branch-scope-discipline`,
`code-comments`, `commit-style`, `fixing-blockers-mid-task`, `pr-descriptions`, `ste100-use-cases`,
`ste100-word-swaps`, `ste100-writing`, `surgical-changes`) — confirms the new fields didn't
disturb key ordering or add a stray top-level key.

- [ ] **Step 3: Update `skills/inject-standards/SKILL.md` Step 3 — add the prose exclusion rule**

Find this paragraph (currently the last paragraph of Step 3, right before "### Step 4"):

```
If the repo qualifies but `standards/shopify/` or `standards/team/` is
empty or doesn't exist, silently skip whichever is empty — there's
nothing to inject, and this is not an error. The same goes for
`standards/global/`: it has no repo-type gate, so if it's empty or
doesn't exist there's simply nothing indexed to match against — also not
an error.
```

Add this new paragraph immediately after it, still inside Step 3, before the `### Step 4` heading:

```

**Prose exclusion (independent of the repo-type gate above).** Any `index.yml` entry with
`kind: prose` is excluded from Scenario 4 entirely — never suggested, never matched, never
auto-included — regardless of how well its `description` fits the dispatch's context. This applies
in every folder, not just `global/`, and is unconditional: it doesn't depend on repo qualification.
Scenario 4 dispatches are always code-implementer subagents (via `offload-implementer`); a
prose-only standard has no Scenario-4 use case to weigh against the risk of polluting a code task's
prompt with writing-style rules. Scenarios 1-3 are unaffected — `kind: prose` entries are matched
normally there, same as any other standard.
```

- [ ] **Step 4: Update `skills/inject-standards/SKILL.md` Step 6 — add the companion-injection rule**

Find the start of Step 6 (currently reads):

```
### Step 6: Inject, Formatted for the Scenario

**Scenario 1 — Conversation.** Read the standards and announce them
inline:
```

Insert a new paragraph between the `### Step 6` heading and the `**Scenario 1**` line, so it reads:

```
### Step 6: Inject, Formatted for the Scenario

**Companions.** Before formatting for any scenario below: if a matched entry has a `companions:`
list in `index.yml`, read and inject each listed file immediately alongside it, in the same
scenario-specific format as the primary match — a companion is never optional once its owning
entry is matched. This applies in all four scenarios.

**Scenario 1 — Conversation.** Read the standards and announce them
inline:
```

- [ ] **Step 5: Update `skills/inject-standards/SKILL.md`'s Quick Reference table**

Find these two rows:

```
| 3 | Detect Shopify-repo layers (2 signals) — gates `shopify/` + `team/` for Scenario 4's auto-include only, never a filter in Scenarios 1-3; `global/` is never gated by this specific check |
```
and
```
| 6 | Inject formatted for the scenario |
```

Replace them with:

```
| 3 | Detect Shopify-repo layers (2 signals) — gates `shopify/` + `team/` for Scenario 4's auto-include only, never a filter in Scenarios 1-3; `global/` is never gated by this specific check. Separately, `kind: prose` entries are excluded from Scenario 4 entirely, in any folder |
```
and
```
| 6 | Inject formatted for the scenario, always including a matched entry's `companions:` alongside it |
```

- [ ] **Step 6: Verify Steps 3-5's edits landed correctly**

Run: `grep -c "kind: prose" skills/inject-standards/SKILL.md`
Expected: `2` or more (the new Step 3 paragraph and the Quick Reference row both mention it)

Run: `grep -c "companions" skills/inject-standards/SKILL.md`
Expected: `2` or more (the new Step 6 paragraph and the Quick Reference row)

Run: `grep -c "^### Step" skills/inject-standards/SKILL.md`
Expected: `6` (still exactly six numbered steps — confirms no step was accidentally duplicated or renumbered)

- [ ] **Step 7: Update `skills/index-standards/SKILL.md` Step 4 — propose the new fields**

Find this paragraph (the last paragraph of Step 4, right before "### Step 5"):

```
Keep descriptions to one short sentence — they're for matching, not
documentation.
```

Add this new paragraph immediately after it, still inside Step 4:

```

For a new file, also check whether it needs either new optional field before moving on: propose
`kind: prose` when the file is prose style/writing guidance rather than a code pattern or process
convention, and propose a `companions:` list when the file's own content references sibling files
in the same folder by path. Both are proposals the user confirms alongside the description, not
automatic — same disposition as the description suggestion itself.
```

- [ ] **Step 8: Update `skills/index-standards/SKILL.md` Step 6 — document the schema**

Find this text (inside Step 6's "Rules" list):

```
Rules:
- `root:` sorts first if present, then folders alphabetically
- Files alphabetically within each folder
- File names without the `.md` extension
- One-line descriptions only
```

Replace it with:

```
Rules:
- `root:` sorts first if present, then folders alphabetically
- Files alphabetically within each folder
- File names without the `.md` extension
- One-line descriptions only
- Two optional fields, in this order when present: `kind: prose` (marks writing-style guidance,
  excluded from `inject-standards`' Scenario 4 entirely) and `companions: [name, ...]` (sibling
  files always injected alongside this one). Both omitted entirely for an entry that doesn't need
  them — never write `kind:` or `companions:` as an empty value.
```

Then find the schema Example block (starts with `` ```yaml `` right after "Example:") and add one
line inside the existing `global:` block to demonstrate the new fields without disturbing the
existing `error-handling` example entry:

```yaml
global:
  error-handling:
    description: Error handling conventions across any language
  writing-style-example:
    kind: prose
    companions: [writing-style-example-glossary]
    description: Example entry showing the optional kind/companions fields (not a real standard)
```

- [ ] **Step 9: Verify Steps 7-8's edits landed correctly**

Run: `grep -c "kind: prose" skills/index-standards/SKILL.md`
Expected: `2` or more

Run: `grep -c "companions" skills/index-standards/SKILL.md`
Expected: `2` or more

- [ ] **Step 10: Update the backlog item's status**

In `backlog/inject-standards-prose-scope-gate.md`, change the `**Status:**` line from:

```
**Status:** Not applied. Surfaced during G.3.1's post-merge review (2026-09-12, Fable-model
re-review), not a G.3.1 defect itself — a gap in `digismith:inject-standards`' own mechanism that
G.3.1's shipped content exposed for the first time.
```

to:

```
**Status:** Applied 2026-09-13. See `.digismith/docs/inject-standards-prose-scope-gate/design.html`
and `plan.md`. Both open questions below resolved: a `kind: prose` field (not a dedicated folder)
excludes prose standards from Scenario 4, and a `companions:` list (not Markdown-reference parsing)
keeps a multi-file standard's siblings attached whenever the primary entry is matched.
```

- [ ] **Step 11: Remove this item from `backlog/README.md`'s index**

Delete the line:

```
- [`inject-standards` needs a prose scope gate + companion-file awareness](inject-standards-prose-scope-gate.md) — found during G.3.1's post-merge review; a `global/` standard has no mechanical exclusion from code-dispatch matching, and multi-file standards have no companion concept
```

(Applied backlog items are removed from the index per this repo's own convention: "Delete an
item's file once it's been applied" — the file itself stays as a historical record since it's
referenced by the design doc, only the README's pointer to it as an open item is removed.)

- [ ] **Step 12: Final read-through**

Read `skills/inject-standards/SKILL.md` and `skills/index-standards/SKILL.md` in full. Confirm:
the new Step 3 paragraph in `inject-standards` doesn't contradict the existing Shopify-gate
paragraph right above it (both should coexist as independent, additive rules); the new Step 6
paragraph reads naturally before "Scenario 1"; the Quick Reference table's two edited rows still
fit the table's existing terse style; `index-standards`' new Step 4 paragraph and Step 6 schema
addition read as natural extensions, not bolted-on afterthoughts.

- [ ] **Step 13: Commit**

```bash
git add standards/index.yml skills/inject-standards/SKILL.md skills/index-standards/SKILL.md backlog/inject-standards-prose-scope-gate.md backlog/README.md
git commit -m "feat(standards): add kind/companions fields, gate Scenario 4 on kind: prose"
```

# Narrow brainstorming to solution design and un-vendor it Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `digismith:brainstorming` the architecture and solution-design skill for a ticket in refinement, and take it out of the vendored-skills drift check.

**Architecture:** Three prose and config edits. Task 1 rewrites the parts of `skills/brainstorming/SKILL.md` that make it an umbrella skill (description, intro, checklist, flow graph, "Understanding the idea"). Task 2 adds the new sections (Input, finding the elements, addressing rabbit holes, back to shaping). Task 3 removes `brainstorming` from `VENDORED_SKILLS` (test first) and records it in `vendored/PROVENANCE.md`.

**Tech Stack:** Markdown skill prose, TypeScript (`scripts/check_vendored_skills.ts`), vitest. Package manager: pnpm only.

## Global Constraints

- Design: `.digismith/board/DGS-676—narrow-brainstorming/design.html` (approved by Jack 2026-10-27). Parent design: `.digismith/board/DGS-671—shaping-skill/design.html`.
- Never reference `digismith:shaping` inside `skills/brainstorming/SKILL.md` (Jack: no cross-reference between the two skills). Say "the ticket is not shaped yet" and leave who shapes it to the Maestro. A Jira ticket may name `digismith:jira-intake` (Door 2).
- Keep unchanged: 2-3 approaches, presenting the design, the `design.html` shell and path rules, the toolchain check, the visual companion, spec self-review, the user review gate, the `step-end` command, the hand-off to `digismith:writing-plans`.
- Commit messages: title-only conventional commits, scope `dgs-676`, no AI attribution lines.
- Never commit to `main`. Work on the branch `claude/shaping-skill-9af8b5` (or the worker branch made for this ticket).
- pnpm only. Run tests with `pnpm vitest run <file>`.

---

### Task 1: Rewrite the umbrella parts of brainstorming

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (frontmatter lines 1-4, intro lines 6-10, Checklist lines 20-32, Process Flow dot graph lines 34-60, "Understanding the idea" lines 65-73)

**Interfaces:**
- Consumes: nothing.
- Produces: checklist item names and a `## Input` section reference ("see Input"), "Find the elements" and "Address rabbit holes" headings that Task 2 adds. Task 2 relies on the exact names `**Finding the elements:**`, `**Addressing rabbit holes:**` and `## Input`.

- [ ] **Step 1: Replace the frontmatter description**

Replace line 3 (the whole `description:` line) with:

```markdown
description: "Use for a ticket in refinement: architecture and solution design (elements, rabbit holes, approaches, spec) from a shaped input — the ticket's ## Pitch or a jira-intake ticket.md. (DigiSmith-owned, forked from Superpowers' brainstorming)"
```

- [ ] **Step 2: Replace the title line and intro (lines 6-10)**

Old:

```markdown
# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.
```

New:

```markdown
# Solution Design From a Shaped Ticket

Help turn a shaped ticket into a solution design and spec through natural collaborative dialogue.

Start from the shaped input (see Input), then explore the code and ask technical questions one at a time. Once you understand how to build it, present the design and get user approval.
```

- [ ] **Step 3: Replace the checklist items 1-9 (lines 22-31)**

Old: the numbered list from `1. **Explore project context**` through `9. **Transition to implementation**`.

New:

```markdown
1. **Read the input** — the ticket's `## Pitch` or `ticket.md`; stop if it is not shaped (see Input)
2. **Explore project context** — check files, docs, recent commits
3. **Offer the visual companion just-in-time** — NOT upfront. The first time a question would genuinely be clearer shown than described, offer it then (its own message); on approval its browser tab opens for you. If no visual question ever arises, never offer it. See the Visual Companion section below.
4. **Ask technical questions** — one at a time, only what the input leaves open
5. **Find the elements** — a short, specific element list (see Finding the elements)
6. **Address rabbit holes** — start from the pitch's Risks (see Addressing rabbit holes)
7. **Propose 2-3 approaches** — with trade-offs and your recommendation
8. **Present design** — in sections scaled to their complexity, get user approval after each section
9. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
10. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
11. **User reviews written spec** — ask user to review the spec file before proceeding
12. **Transition to implementation** — invoke digismith:writing-plans skill to create implementation plan
```

- [ ] **Step 4: Replace the dot graph (inside the ```dot block)**

Old: the node declarations and edges from `"Explore project context" [shape=box];` down to the edge `"Explore project context" -> "Ask clarifying questions";` plus `"Ask clarifying questions" -> "Propose 2-3 approaches";`.

Change only these lines (leave every other node and edge as they are):

```
    "Read the input" [shape=box];
    "Explore project context" [shape=box];
    "Ask technical questions" [shape=box];
    "Find the elements" [shape=box];
    "Address rabbit holes" [shape=box];
```

replacing the two declarations `"Explore project context" [shape=box];` and `"Ask clarifying questions" [shape=box];`, and

```
    "Read the input" -> "Explore project context";
    "Explore project context" -> "Ask technical questions";
    "Ask technical questions" -> "Find the elements";
    "Find the elements" -> "Address rabbit holes";
    "Address rabbit holes" -> "Propose 2-3 approaches";
```

replacing the two edges `"Explore project context" -> "Ask clarifying questions";` and `"Ask clarifying questions" -> "Propose 2-3 approaches";`.

- [ ] **Step 5: Replace "Understanding the idea" (lines 65-73)**

Old: the heading `**Understanding the idea:**` and its seven bullets.

New:

```markdown
**Understanding the ticket:**

- Read the input first (see Input). It already answers purpose, scope, appetite and success criteria: do not ask them again
- Check out the current project state (files, docs, recent commits)
- Ask technical questions one at a time, only about what the input leaves open
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: constraints, existing code, how the parts fit together
```

- [ ] **Step 6: Verify**

Run:

```bash
grep -c "purpose, constraints, success criteria" skills/brainstorming/SKILL.md
grep -c "Ask clarifying questions" skills/brainstorming/SKILL.md
grep -c "You MUST use this before any creative work" skills/brainstorming/SKILL.md
grep -c "assess scope" skills/brainstorming/SKILL.md
grep -c "Ask technical questions" skills/brainstorming/SKILL.md
```

Expected: `0`, `0`, `0`, `0`, and `5` (checklist item, graph node declaration, two graph edges, and the "Understanding the ticket" bullet).

- [ ] **Step 7: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat(dgs-676): narrow brainstorming to solution design"
```

---

### Task 2: Add the Input, elements, rabbit-hole and back-to-shaping sections

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (insert `## Input` before `## Checklist`; insert three bold sections after `**Understanding the ticket:**` block and before `**Toolchain defaults (map item G.2):**`)

**Interfaces:**
- Consumes: Task 1's checklist wording ("see Input", "see Finding the elements", "see Addressing rabbit holes").
- Produces: the sections the checklist points to.

- [ ] **Step 1: Insert `## Input` directly before the line `## Checklist`**

```markdown
## Input

This skill designs the solution for a ticket in refinement. It starts from shaped input, not a raw idea:

- a ClickUp ticket whose description has a `## Pitch` (problem, appetite, idea, scope in and out, risks, roadmap fit, sign-off, mode, open questions), or
- a `ticket.md` from `digismith:jira-intake` (title, description, acceptance criteria).

Read it first. If it has no problem and no scope, stop and tell the user the ticket is not shaped yet. A Jira ticket goes back to `digismith:jira-intake` (Door 2). Do not shape it here.

```

- [ ] **Step 2: Insert the three sections after the `**Understanding the ticket:**` bullets and before `**Toolchain defaults (map item G.2):**`**

```markdown
**Finding the elements:**

- Write a short list of narrow, specific elements: what exists after the work, in a few words each. A vague phrase ("a status view") is not an element
- For flows, sketch a breadboard in words: places (a command, a status, a file), affordances (what can be done there) and connections (what leads where)
- Use a fat marker sketch only when layout is the core problem
- Stay rough: boundaries and rules, not a spec, so the builder keeps room to decide
- Elements marked `~` in the pitch are nice-to-haves: list them last and cut them first

**Addressing rabbit holes:**

- Start from the pitch's Risks: they are the first list of unknowns
- Walk the use case in slow motion, start to end, and write down every step that is missing from the elements
- Question each part that looks solved: does it need new technical work, does it assume how parts fit together, does it assume a design answer exists?
- Fix each hole with one of three moves: patch (dictate a simpler answer, written into the spec), declare out of bounds (a no-go), or cut back (drop a nice-to-have)
- A hole with no answer goes to the user as a question

**Back to shaping:**

- If the design cannot fit the pitch's appetite after cutting, stop. Tell the user the ticket goes back to shaping: never stretch the appetite to fit
- No status event exists for that move yet, so it is done by hand

```

- [ ] **Step 3: Verify**

```bash
grep -c "^## Input" skills/brainstorming/SKILL.md
grep -c "^\*\*Finding the elements:\*\*" skills/brainstorming/SKILL.md
grep -c "^\*\*Addressing rabbit holes:\*\*" skills/brainstorming/SKILL.md
grep -c "^\*\*Back to shaping:\*\*" skills/brainstorming/SKILL.md
grep -ci "digismith:shaping" skills/brainstorming/SKILL.md
grep -c "digismith:writing-plans" skills/brainstorming/SKILL.md
```

Expected: `1`, `1`, `1`, `1`, `0` (no reference to the shaping skill), and a count of at least `3` (the hand-off still present).

- [ ] **Step 4: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat(dgs-676): add input, elements and rabbit-hole steps to brainstorming"
```

---

### Task 3: Un-vendor brainstorming

**Files:**
- Modify: `scripts/check_vendored_skills.test.ts` (import line 7, add a `describe` at the end)
- Modify: `scripts/check_vendored_skills.ts:164-179` (`VENDORED_SKILLS`)
- Modify: `vendored/PROVENANCE.md` (brainstorming entry, after the line ending `from \`.superpowers/brainstorm/\`).`)

**Interfaces:**
- Consumes: `VENDORED_SKILLS` (already exported from `scripts/check_vendored_skills.ts` as `string[]`).
- Produces: `VENDORED_SKILLS` without `"brainstorming"`.

- [ ] **Step 1: Write the failing test**

In `scripts/check_vendored_skills.test.ts` change the import on line 7 to:

```typescript
import { cloneUpstreamSkillsDir, readGitBlob, readFileIfExists, listBaselineFiles, diffContent, VENDORED_SKILLS } from "./check_vendored_skills.ts";
```

and append at the end of the file:

```typescript
describe("VENDORED_SKILLS", () => {
  it("does not list brainstorming: it is DigiSmith-owned since DGS-676", () => {
    expect(VENDORED_SKILLS).not.toContain("brainstorming");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/check_vendored_skills.test.ts -t "VENDORED_SKILLS"`
Expected: FAIL (`brainstorming` is still in the list).

- [ ] **Step 3: Remove `"brainstorming"` from the list**

In `scripts/check_vendored_skills.ts` delete the line `  "brainstorming",` inside `VENDORED_SKILLS` (the first entry, line 165). Leave every other entry.

- [ ] **Step 4: Run the whole test file to verify it passes**

Run: `pnpm vitest run scripts/check_vendored_skills.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Record it in PROVENANCE**

In `vendored/PROVENANCE.md`, in the **brainstorming** entry, after the sentence ending `from \`.superpowers/brainstorm/\`).` add on the same paragraph:

```markdown
  **Un-vendored by DGS-676** (2026-10-27): now DigiSmith-owned. It is no longer in
  `VENDORED_SKILLS` and is not checked for upstream drift. Its role is architecture and solution
  design for a ticket in refinement; product-level shaping lives in `digismith:shaping`.
```

- [ ] **Step 6: Verify and commit**

```bash
grep -c '"brainstorming"' scripts/check_vendored_skills.ts
grep -c "Un-vendored by DGS-676" vendored/PROVENANCE.md
git add scripts/check_vendored_skills.ts scripts/check_vendored_skills.test.ts vendored/PROVENANCE.md
git commit -m "chore(dgs-676): un-vendor brainstorming"
```

Expected: `0` and `1`.

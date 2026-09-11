# Rename G to Methodology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename map item G's title from "Structure" to "Methodology" — G.1 (Standards) and G.2 (Toolchain) are both about Jack's established methodology for doing work, not the other way around — updating every live doc that names G by its old title.

**Architecture:** Pure documentation relabeling, no code changes. Three one-line edits: `MEMORY.md`'s G row, `skills/toolchain/SKILL.md`'s Overview line, and `backlog/toolchain-general-trigger-scope.md`'s Status line.

**Tech Stack:** Markdown/HTML docs only — no code, no build step, no automated tests.

## Global Constraints

- **Map item:** no map letter — this plan renames existing map item G's title only, per `.digismith/docs/rename-g-methodology/design.html`.
- **Scope:** title-only. G.1 and G.2's own numbering, content, and mechanisms are untouched.
- **Left alone (do not edit):** `.digismith/docs/toolchain/{design.html,plan.md,report.html}` and `.digismith/docs/structure-merge-g-and-u/{design.html,plan.md,report.html}` — frozen historical build record, correctly keep saying "Structure"/"U". Also leave `backlog/standard-handoff-format.md`'s mention of `MEMORY.md`'s own "Structure" — that's the document's unrelated, pre-existing `## Structure` section (repo/plugin layout notes), not map item G.

---

## File Structure

- `MEMORY.md` — **modified.** G's row: title cell "Structure" → "Methodology".
- `skills/toolchain/SKILL.md` — **modified.** Overview's parenthetical "(\"Structure\")" → "(\"Methodology\")".
- `backlog/toolchain-general-trigger-scope.md` — **modified.** Status line's `"Structure"` → `"Methodology"`.

---

### Task 1: Rename G's title across live docs

**Files:**
- Modify: `MEMORY.md`
- Modify: `skills/toolchain/SKILL.md`
- Modify: `backlog/toolchain-general-trigger-scope.md`

**Interfaces:** None — this task has no code, no exported functions. Every step is a text edit. There is only one task in this plan.

This task has no automated test harness — it's documentation. Steps are edit-then-self-check rather than write-test-implement.

- [ ] **Step 1: Edit `MEMORY.md` — rename G's title**

Find this exact line (the start of the table row for map item G — it's a single very long line; only the title cell, right after `**G**`, needs to change):

```
| **G** | Structure | **G.1** Standards injection —
```

Replace just that opening fragment with:

```
| **G** | Methodology | **G.1** Standards injection —
```

(The rest of the row — everything after "injection —" — is unchanged; do not touch it. This is a targeted find-and-replace of the title cell only, not a rewrite of the whole row.)

- [ ] **Step 2: Edit `skills/toolchain/SKILL.md` — update the parenthetical**

Find this exact text (in the `## Overview` section):

```
DigiSmith's map item **G.2**, part of map item **G** ("Structure") — formerly its
own letter, **U**, until the 2026-09-11 merge.
```

Replace it with:

```
DigiSmith's map item **G.2**, part of map item **G** ("Methodology") — formerly its
own letter, **U**, until the 2026-09-11 merge.
```

- [ ] **Step 3: Edit `backlog/toolchain-general-trigger-scope.md` — update the Status line**

Find this exact text:

```
**Status:** Deferred. Map item **G.2** (Toolchain, part of **G** "Structure" — formerly its own
letter, **U**, until the 2026-09-11 merge) ships with its consult mechanism scoped
```

Replace it with:

```
**Status:** Deferred. Map item **G.2** (Toolchain, part of **G** "Methodology" — formerly its own
letter, **U**, until the 2026-09-11 merge) ships with its consult mechanism scoped
```

- [ ] **Step 4: Self-check — confirm no stray "Structure" references remain naming map item G**

Run: `grep -rn '"Structure"' MEMORY.md skills/ backlog/`

Expected: exactly one match — `backlog/standard-handoff-format.md`, the line mentioning `MEMORY.md`'s
own "Structure" *section* (repo/plugin layout notes, unrelated to map item G, deliberately left
unedited per this plan's Global Constraints). Confirm that's the only file in the output.

If any other file matches, it's a missed reference from Steps 1-3 — fix it before committing.

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md skills/toolchain/SKILL.md backlog/toolchain-general-trigger-scope.md
git commit -m "docs(rename-g): rename map item G's title to Methodology"
```

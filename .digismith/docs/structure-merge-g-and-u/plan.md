# Structure (G/U Merge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename map item G from "Standards injection" to "Structure" with two sub-items — G.1 (Standards, unchanged) and G.2 (Toolchain, folded in from the now-retired standalone letter U) — updating every live doc that still refers to U, and retiring the backlog item that proposed this merge.

**Architecture:** Pure documentation relabeling, no code changes. Edit `MEMORY.md`'s map table, two skill files' map-letter references, three backlog files' U-identifier references, then delete the now-resolved backlog item.

**Tech Stack:** Markdown/HTML docs only — no code, no build step, no automated tests.

## Global Constraints

- **Map item:** no map letter — this plan itself restructures existing map items G and U, per `.digismith/docs/structure-merge-g-and-u/design.html`.
- **Scope:** label-only. No edits to `digismith:toolchain`'s or `digismith:inject-standards`' actual code, skill logic, storage format, or invocation — `toolchain.yml`, `scripts/toolchain.ts`, and `standards/` are untouched.
- **Left alone (do not edit):** `.digismith/docs/toolchain/design.html`, `plan.md`, `report.html` — frozen historical build record, correctly keep saying "U". Also leave `skills/report-implementation/SKILL.md`'s historical "map item G" reference and any other already-shipped plan/report docs that mention map item G in passing — G the letter is unchanged, only its row's internal structure changes.
- **Backlog convention:** `backlog/structure-merge-g-and-u.md` gets marked resolved, then deleted, per `backlog/README.md`'s own "delete an item's file once it's been applied" rule.

---

## File Structure

- `MEMORY.md` — **modified.** G's row renamed to "Structure" and split into G.1/G.2; U's row removed entirely.
- `skills/toolchain/SKILL.md` — **modified.** Overview's map-item reference updated.
- `skills/brainstorming/SKILL.md` — **modified.** The "Toolchain defaults" subsection's heading updated.
- `backlog/README.md` — **modified.** The structure-merge index line removed (file it points to is being deleted); the two U-referencing index lines updated.
- `backlog/opinionated-tech-stack-defaults.md` — **modified.** Title and Status paragraph updated to reflect the shipped-then-merged state.
- `backlog/toolchain-general-trigger-scope.md` — **modified.** Every "U" identifier reference updated to G.2.
- `backlog/structure-merge-g-and-u.md` — **deleted**, after marking it resolved.

---

### Task 1: Apply the G/U structure merge across live docs

**Files:**
- Modify: `MEMORY.md`
- Modify: `skills/toolchain/SKILL.md`
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `backlog/README.md`
- Modify: `backlog/opinionated-tech-stack-defaults.md`
- Modify: `backlog/toolchain-general-trigger-scope.md`
- Delete: `backlog/structure-merge-g-and-u.md`

**Interfaces:** None — this task has no code, no exported functions, no CLI. Every step is a text edit or a file deletion. There is only one task in this plan, so no cross-task interface concerns apply.

This task has no automated test harness — it's documentation, same as Task 3 of the Toolchain (U) plan (`.digismith/docs/toolchain/plan.md`). Steps are edit-then-self-check rather than write-test-implement.

- [ ] **Step 1: Edit `MEMORY.md` — rename and split G's row**

Find this exact line (currently the table row for map item G):

```
| **G** | Standards injection | Jack's coding standards + style guide carried into every implementer subagent's brief |
```

Replace it with:

```
| **G** | Structure | **G.1** Standards injection — Jack's coding standards + style guide carried into every implementer subagent's brief · **G.2** Toolchain — A durable, dictatable list of Jack's standing tool/technology defaults (test runner, styling, E2E framework, script language, package manager, Node install method) so `digismith:brainstorming` stops re-asking questions already decided. Surfaced 2026-08-27 mid-brainstorm on the Jira REST-migration spec (Vitest/SCSS/Playwright volunteered unprompted after a fresh test-runner question); two more confirmed 2026-09-08/09 during live Hetzner VPS setup for map item **X** (pnpm for global CLI installs, nvm over a distro-packaged Node) — on a task with no connection to brainstorming at all, which is why the shipped design's consult mechanism is deliberately scoped to `digismith:brainstorming` only, with the broader "any session, any tooling choice" version deferred to `backlog/toolchain-general-trigger-scope.md` rather than folded in. Storage: `toolchain.yml` at DigiSmith's own repo root (global to Jack, like `standards/` — not per-consuming-repo like map item **H**'s `preferences.yml`, since these aren't project config), flat `domain: choice` pairs, no YAML library. Skill: `digismith:toolchain` (`list`/`set`/`clear`, no per-key `get` — the store is small and always read as a unit). One new paragraph in `digismith:brainstorming`'s "Ask clarifying questions" step checks the list before posing a tooling-choice question, states the assumption and skips it on a match (override still honored), and offers to `set` a new entry when Jack volunteers a preference unprompted. Not itself a map item **W** primitive-replacement activation — an ordinary cross-cutting hook into the vendored skill, same as **G.1**'s standards. Shipped 2026-09-11 via `digismith:subagent-driven-development` (3 tasks, 1 task-level fix round, 1 final-review fix round — a global-store path-resolution doc gap, a dropped ambiguous-match rule, and a broken Markdown table row, all fixed before merge). See `.digismith/docs/toolchain/design.html`/`plan.md`/`report.html` (still say "U" — frozen historical build record, that name never updated). Renamed from a standalone map item, **U**, into this sub-item on 2026-09-11 once shipped — see `backlog/structure-merge-g-and-u.md`'s own resolution note for the rationale (file deleted once this merge applied). Letter **U** freed for future reuse, same precedent as **R**, **Q**, and **H** before it. |
```

- [ ] **Step 2: Edit `MEMORY.md` — remove U's row entirely**

Find this exact line (currently the table row for map item U, sitting between S's row and V's row):

```
| **U** | Toolchain defaults | A durable, dictatable list of Jack's standing tool/technology defaults (test runner, styling, E2E framework, script language, package manager, Node install method) so `digismith:brainstorming` stops re-asking questions already decided. Surfaced 2026-08-27 mid-brainstorm on the Jira REST-migration spec (Vitest/SCSS/Playwright volunteered unprompted after a fresh test-runner question); two more confirmed 2026-09-08/09 during live Hetzner VPS setup for map item **X** (pnpm for global CLI installs, nvm over a distro-packaged Node) — on a task with no connection to brainstorming at all, which is why the shipped design's consult mechanism is deliberately scoped to `digismith:brainstorming` only, with the broader "any session, any tooling choice" version deferred to `backlog/toolchain-general-trigger-scope.md` rather than folded in. Storage: `toolchain.yml` at DigiSmith's own repo root (global to Jack, like `standards/` — not per-consuming-repo like map item **H**'s `preferences.yml`, since these aren't project config), flat `domain: choice` pairs, no YAML library. Skill: `digismith:toolchain` (`list`/`set`/`clear`, no per-key `get` — the store is small and always read as a unit). One new paragraph in `digismith:brainstorming`'s "Ask clarifying questions" step checks the list before posing a tooling-choice question, states the assumption and skips it on a match (override still honored), and offers to `set` a new entry when Jack volunteers a preference unprompted. Not itself a map item **W** primitive-replacement activation — an ordinary cross-cutting hook into the vendored skill, same as **G**'s standards. See `.digismith/docs/toolchain/design.html`. Not yet built |
```

Delete this line entirely (including its trailing newline), so S's row is immediately followed by V's row with no gap.

- [ ] **Step 3: Edit `skills/toolchain/SKILL.md` — update the map-item reference**

Find this exact text (in the `## Overview` section):

```
DigiSmith's map item **U**. A standing, dictatable list of Jack's tool/technology
defaults for common greenfield decisions — test runner, styling approach, E2E
framework, script language, package manager, Node install method. First (and
so far only) consumer: `digismith:brainstorming`'s clarifying-questions step,
so it stops re-asking questions Jack has already decided.
```

Replace it with:

```
DigiSmith's map item **G.2**, part of map item **G** ("Structure") — formerly its
own letter, **U**, until the 2026-09-11 merge. A standing, dictatable list of
Jack's tool/technology defaults for common greenfield decisions — test runner,
styling approach, E2E framework, script language, package manager, Node install
method. First (and so far only) consumer: `digismith:brainstorming`'s
clarifying-questions step, so it stops re-asking questions Jack has already
decided.
```

- [ ] **Step 4: Edit `skills/brainstorming/SKILL.md` — update the subsection heading**

Find this exact line:

```
**Toolchain defaults (map item U):**
```

Replace it with:

```
**Toolchain defaults (map item G.2):**
```

- [ ] **Step 5: Edit `backlog/README.md` — remove the structure-merge line, update the two U references**

Find this exact line:

```
- [Merge G (Standards) and U (Toolchain) into a new umbrella letter, "Structure"](structure-merge-g-and-u.md) — raised live mid-U-implementation; map-labeling change only, deferred until U ships
```

Delete this line entirely (including its trailing newline) — the file it points to is being deleted in Step 8.

Then find this exact line:

```
- [Opinionated default tech stack (designed as map item U, Toolchain)](opinionated-tech-stack-defaults.md) — source narrative for U; design shipped 2026-09-11, see `.digismith/docs/toolchain/design.html`
```

Replace it with:

```
- [Opinionated default tech stack (designed as map item G.2, Toolchain)](opinionated-tech-stack-defaults.md) — source narrative for G.2; design shipped 2026-09-11, see `.digismith/docs/toolchain/design.html`
```

Then find this exact line:

```
- [Toolchain defaults: trigger scope beyond brainstorming](toolchain-general-trigger-scope.md) — deferred out of U's initial design; brainstorming-only for now, per Jack's own scope call
```

Replace it with:

```
- [Toolchain defaults: trigger scope beyond brainstorming](toolchain-general-trigger-scope.md) — deferred out of G.2's initial design; brainstorming-only for now, per Jack's own scope call
```

- [ ] **Step 6: Edit `backlog/opinionated-tech-stack-defaults.md` — update the title and Status paragraph**

Find this exact line (the file's H1):

```
# Opinionated default tech stack (new letter, tentatively U)
```

Replace it with:

```
# Opinionated default tech stack (shipped as map item G.2, Toolchain)
```

Then find this exact block:

```
**Status:** Designed 2026-09-11 as map item **U**, renamed **Toolchain** during the brainstorm
(the "tech stack" framing oversold the scope — it's specific tool/technology choices, not
architecture). See `.digismith/docs/toolchain/design.html` for the shipped design and
`MEMORY.md`'s **U** row. Not yet built. The "any session, any tooling choice" broadening this
file's live-VPS addendum below argued for was deliberately deferred rather than folded in — see
`backlog/toolchain-general-trigger-scope.md`.
```

Replace it with:

```
**Status:** Designed 2026-09-11 as map item **U**, renamed **Toolchain** during the brainstorm
(the "tech stack" framing oversold the scope — it's specific tool/technology choices, not
architecture). Shipped 2026-09-11; merged into map item **G** as **G.2** the same day once G/U's
overlap was noticed mid-build — see `backlog/structure-merge-g-and-u.md`'s own resolution note
(that file deleted once applied). See `.digismith/docs/toolchain/design.html` for the shipped
design (still filed under the old name/letter — frozen historical record) and `MEMORY.md`'s
**G** row (**G.2** specifically) for the current map entry. The "any session, any tooling choice"
broadening this file's live-VPS addendum below argued for was deliberately deferred rather than
folded in — see `backlog/toolchain-general-trigger-scope.md`.
```

Then find this exact line (end of the "Why this doesn't obviously fold into an existing map item" section):

```
Needs `superpowers:brainstorming` to actually decide, not guessed here.
```

Replace it with:

```
Needs `superpowers:brainstorming` to actually decide, not guessed here.

**Resolved 2026-09-11:** shipped as its own standalone letter first (neither option above —
see `.digismith/docs/toolchain/design.html`'s own Architecture reasoning for why extending G's
`standards/` mechanism was rejected), then folded in as a sibling sub-item (**G.2**) alongside
G's original content (now **G.1**) once the two were noticed to serve the same underlying
purpose — a relabeling, not the `standards/`-extension option this section considered and
declined.
```

- [ ] **Step 7: Edit `backlog/toolchain-general-trigger-scope.md` — update every U reference to G.2**

Find this exact line:

```
**Status:** Deferred. Map item **U** (Toolchain defaults) ships with its consult mechanism scoped
```

Replace it with:

```
**Status:** Deferred. Map item **G.2** (Toolchain, part of **G** "Structure" — formerly its own
letter, **U**, until the 2026-09-11 merge) ships with its consult mechanism scoped
```

Then find this exact line:

```
broader version, deliberately not folded into U's initial design.
```

Replace it with:

```
broader version, deliberately not folded into G.2's initial design.
```

Then find this exact line:

```
## Why this didn't get folded into U directly
```

Replace it with:

```
## Why this didn't get folded into G.2 directly
```

Then find this exact line:

```
Presented to Jack during U's brainstorm as one of three options (keep brainstorming-only, widen to
```

Replace it with:

```
Presented to Jack during G.2's brainstorm (then still its own letter, U) as one of three options
(keep brainstorming-only, widen to
```

Then find this exact line:

```
- Whichever shape is picked, it reuses **U**'s existing storage (`toolchain.yml`) and skill
```

Replace it with:

```
- Whichever shape is picked, it reuses **G.2**'s existing storage (`toolchain.yml`) and skill
```

Then find this exact line:

```
Single-session observation from one VPS setup, folded into U's design doc as a documented
```

Replace it with:

```
Single-session observation from one VPS setup, folded into G.2's design doc as a documented
```

Then find this exact line:

```
See `.digismith/docs/toolchain/design.html` (Out of Scope section) for how U's own design frames
```

Replace it with:

```
See `.digismith/docs/toolchain/design.html` (Out of Scope section) for how G.2's own design frames
```

- [ ] **Step 8: Mark `backlog/structure-merge-g-and-u.md` resolved, then delete it**

Find this exact line (its Status line):

```
**Status:** Not applied. Raised live 2026-09-11 mid-implementation of map item U (Toolchain) —
```

Replace it with:

```
**Status:** Applied 2026-09-11 — see `MEMORY.md`'s **G** row (G.1/G.2 split) and the files listed
in this document's own "Proposed shape" section, all updated. This file is deleted immediately
after this edit, per `backlog/README.md`'s own "delete an item's file once it's been applied"
convention — this Status line is written only so the deletion commit's diff shows what was
resolved, for anyone reading `git show` on that commit later.
```

Then delete the file entirely, from the repo root: `rm backlog/structure-merge-g-and-u.md`.

- [ ] **Step 9: Self-check — confirm no stray live references remain**

Run: `grep -rn "map item U\|map item \*\*U\*\*" MEMORY.md skills/ backlog/`

Expected: zero matches. (The frozen historical docs under `.digismith/docs/toolchain/` are excluded from this grep on purpose — they're allowed to still say U, per this task's Global Constraints.)

If anything matches, it's a missed reference from Steps 1-7 — fix it before committing.

- [ ] **Step 10: Commit**

```bash
git add MEMORY.md skills/toolchain/SKILL.md skills/brainstorming/SKILL.md backlog/README.md backlog/opinionated-tech-stack-defaults.md backlog/toolchain-general-trigger-scope.md
git rm backlog/structure-merge-g-and-u.md
git commit -m "docs(structure): merge map items G and U into G.1/G.2"
```

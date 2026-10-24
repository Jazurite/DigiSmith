# DGS-606 Researcher Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `researcher` role: a session card role, a role card and brief template, and a run role, so a conductor can start a read-only worker that studies outside material.

**Architecture:** Task 1 changes the session card rules. Task 2 adds the skill card and the brief. Task 2b checks that a researcher can start as run role `other`. The run-role lists are DGS-609, not this ticket.

**Tech Stack:** TypeScript under `node --experimental-strip-types`, vitest, pnpm. Spec: `.digismith/board/DGS-606—researcher-role/spec.md`.

## Global Constraints

- Code in `packages/cli/src/` runs under `node --experimental-strip-types`: no parameter properties, enums, namespaces.
- A researcher's ONE write: the clone in `~/Workspace/Library/<name>` and its findings file in the depot. No write in the DigiSmith repo, no ClickUp write, no commit, no push. The card and the brief both say so.
- Legal parent roles of a researcher: conductor, maestro (never worker). A mandate is required.
- No real ClickUp write, no real herdr prompt in tests; `DIGISMITH_DEPOT_DIR` in a temp folder when a test needs the depot.
- Do not touch DGS-605's files (`.worktrees/dgs-605`, `digismith:study`) or DGS-598's files (run role files are DGS-609). Do not edit `.digismith/sessions/workbox.md` (the conductor adds the runbook pointer).
- pnpm only. Commits title-only, conventional, no AI attribution.

---

### Task 1: Session card role `researcher`

**Files:**
- Modify: `scripts/session-card.ts` (`ROLES` line 8, `LEGAL_PARENT_ROLES` line 47, mandate rule line 169)
- Test: `scripts/session-card.test.ts`

**Interfaces:**
- Consumes: `validateCard`, `LEGAL_PARENT_ROLES`, the test helpers `worker()`, `errs()` already in the test file.
- Produces: `"researcher"` in `ROLES` and `Role`; `LEGAL_PARENT_ROLES.researcher = ["conductor", "maestro"]`; the rule `mandate: required for role researcher`.

- [ ] **Step 1: Write the failing tests.** In `scripts/session-card.test.ts`, add a helper after `worker()`:

```ts
const researcher = (): SessionCard => ({ ...worker(), name: "study-tool", role: "researcher", id: "study-tool-researcher", under: "dsm-conductor-01", domain: "DGS-605" });
```

Add inside the final `describe` (after the reviewer parents test):

```ts
  it("accepts a researcher card with a mandate and an under", () => {
    expect(errs(researcher())).toEqual([]);
  });
  it("rejects a researcher without a mandate or without under", () => {
    expect(errs({ ...researcher(), mandate: undefined }).join(" ")).toMatch(/mandate: required for role researcher/);
    expect(errs({ ...researcher(), under: undefined }).join(" ")).toMatch(/under: required for role researcher/);
  });
  it("rejects fields a researcher does not have", () => {
    expect(errs({ ...researcher(), reviewer_type: "task" }).join(" ")).toMatch(/reviewer_type/);
    expect(errs({ ...researcher(), machine: "x" }).join(" ")).toMatch(/machine/);
    expect(errs({ ...researcher(), seat: "dev0" }).join(" ")).toMatch(/seat/);
  });
  it("a researcher's legal parents are a conductor or a Maestro, never a worker or a scout", () => {
    expect([...LEGAL_PARENT_ROLES.researcher]).toEqual(["conductor", "maestro"]);
  });
  it("round-trips a researcher card through format and parse", () => {
    expect(parseCard(formatCard(researcher()))).toEqual(researcher());
  });
```

- [ ] **Step 2: Run to see it fail.** Run: `pnpm vitest run scripts/session-card.test.ts`. Expected: FAIL (`role: must be one of`, and `LEGAL_PARENT_ROLES.researcher` undefined).

- [ ] **Step 3: Implement.** In `scripts/session-card.ts`:
  - line 8: `export const ROLES = ["maestro", "conductor", "worker", "scout", "researcher", "reviewer", "observer"] as const;`
  - in `LEGAL_PARENT_ROLES` after the `scout` line add `researcher: ["conductor", "maestro"],`
  - mandate rule: change `["conductor", "worker", "scout", "reviewer"]` to `["conductor", "worker", "scout", "researcher", "reviewer"]`.

- [ ] **Step 4: Run to see it pass.** Run: `pnpm vitest run scripts/session-card.test.ts`. Expected: PASS (all, including the existing ones).

- [ ] **Step 5: Commit.**

```bash
git add scripts/session-card.ts scripts/session-card.test.ts
git commit -m "feat(dgs-606): add the researcher role to the session card"
```

---

### Task 2: The researcher card and brief template

**Files:**
- Create: `skills/researcher/SKILL.md`
- Create: `skills/researcher/brief.md`
- Test: `scripts/researcher-skill.test.ts`

**Interfaces:**
- Consumes: the Reviewer card layout (`skills/reviewer/SKILL.md`, `skills/reviewer/brief.md`) as the pattern; Task 1's `researcher` card role.
- Produces: the skill `digismith:researcher` (frontmatter `name: researcher`); brief placeholders `{{AGENT}}`, `{{KEY}}`, `{{SUBJECT}}`, `{{NAME}}`, `{{FINDINGS}}`, `{{PLUGIN_ROOT}}`.

- [ ] **Step 1: Write the failing test.** Create `scripts/researcher-skill.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(root, "skills", "researcher", f), "utf8");

describe("researcher card and brief", () => {
  it("the card has the frontmatter name and the one-write rule", () => {
    const card = read("SKILL.md");
    expect(card).toMatch(/^---\nname: researcher\n/);
    expect(card).toContain("~/Workspace/Library/<name>");
    expect(card).toContain("Its ONE write");
  });
  for (const f of ["SKILL.md", "brief.md"]) {
    it(`${f} says no repo write, no ClickUp write, no commit, no push`, () => {
      const t = read(f).toLowerCase();
      for (const s of ["no write in the digismith repo", "no clickup write", "no commit", "no push"]) expect(t).toContain(s);
    });
  }
  it("the card names the conductor spawn path and the run role", () => {
    const card = read("SKILL.md");
    expect(card).toContain("Start of a researcher");
    expect(card).toContain("dg run start");
    expect(card).toContain("--role researcher");
    expect(card).toContain("-researcher");
  });
  it("the card names where the other cards live", () => {
    expect(read("SKILL.md")).toContain("skills/reviewer/SKILL.md");
  });
  it("the brief has every placeholder", () => {
    const b = read("brief.md");
    for (const p of ["{{AGENT}}", "{{KEY}}", "{{SUBJECT}}", "{{NAME}}", "{{FINDINGS}}", "{{PLUGIN_ROOT}}"]) expect(b).toContain(p);
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run: `pnpm vitest run scripts/researcher-skill.test.ts`. Expected: FAIL (ENOENT, the files do not exist).

- [ ] **Step 3: Write `skills/researcher/SKILL.md`** with this content:

````markdown
---
name: researcher
description: Use when a conductor or Maestro starts a Researcher (a worker that studies outside material and reports), when you are a worker told to follow the Researcher card, or when asked what the researcher role is. For reading our own systems use a scout, not a researcher.
---

# Researcher

The Researcher studies outside material (a repository, a tool, an idea) and reports. A scout reads our own systems (ClickUp, the repo, a pane). A Researcher reads new, external things. Both roles stay (Jack, 2026-10-24).

## What it may do
- Read any file on this machine that is not a secret. Read the web (WebFetch, WebSearch).
- Clone the subject into `~/Workspace/Library/<name>`.
- Write its findings file in the depot (the path in the brief; default `~/.digismith-depot/research/<name>.md`).

## What it may not do
- Its ONE write: the clone in `~/Workspace/Library/<name>` and the findings file in the depot. Nothing else.
- No write in the DigiSmith repo or any worktree. No ClickUp write. No commit. No push. No merge.
- No start or stop of another agent. No install into the DigiSmith repo.
- No run of code from the studied repo with network access or secrets.
- Never read or print a token, a key or a `.env` value. No `sudo`. pnpm only. Never answer a "keep allowing reads" prompt.

## Process (the study steps of DGS-605)
1. Clone the subject. Read it in full.
2. Answer in the findings file: how it relates to DigiSmith; how to absorb it; how it helps; where it sits on the lineage.
3. Reply with one pane line `done: <findings path>` and stop.

## Parents and card
The card has `role: researcher`, a `mandate` (the order or brief path) and `under` = the conductor or Maestro that started it. A worker or a scout may not start a Researcher.

## Start of a researcher (owner: conductor or Maestro)
1. The order names the subject, the library `<name>`, the findings path and the seat.
2. Fill `skills/researcher/brief.md` (`{{AGENT}}` = `<name>-researcher`).
3. Follow the Workbox runbook "Start of a ticket", S0 to S6, with `dg run start --ticket <KEY> --role researcher --order <order path> ...`, tab label `<name> ⚚ researcher`, agent name `<name>-researcher`. There is no worktree: start the agent in `~/Workspace/Library`, with `--add-dir` for the depot findings folder.
4. Close the tab when the report is read (runbook "Tab cleanup").

## Other cards
Reviewer: `skills/reviewer/SKILL.md`. The scout has no skill file: its card is the session card plus its brief.
````

- [ ] **Step 4: Write `skills/researcher/brief.md`** with this content:

````markdown
# Brief: {{KEY}} Researcher ({{NAME}})

You are the Researcher worker `{{AGENT}}`. A conductor or Maestro started you. Subject: {{SUBJECT}}.

## Read first
1. The Researcher card: `{{PLUGIN_ROOT}}/skills/researcher/SKILL.md`.

## What to do
Clone the subject into `~/Workspace/Library/{{NAME}}`. Read it in full. Write your findings to `{{FINDINGS}}`: how it relates to DigiSmith, how to absorb it, how it helps, where it sits on the lineage. End with one pane line: `done: {{FINDINGS}}`. Then stop.

## Rules
- Your ONE write: the clone in `~/Workspace/Library/{{NAME}}` and `{{FINDINGS}}`. No write in the DigiSmith repo, no ClickUp write, no commit, no push.
- Do not start or stop another agent. Do not run code from the studied repo with network access or secrets.
- Register your session so your tokens count (skip when `{{KEY}}` is `none`):
  `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket {{KEY}} --role researcher`
- Never read or print a token, an SSH key or a `.env` file. No `sudo`. pnpm only, never npm.
- Never answer a "keep allowing reads" prompt. Times UTC+7 first, UTC in brackets. No AI attribution. Short plain sentences.
````

- [ ] **Step 5: Run to see it pass.** Run: `pnpm vitest run scripts/researcher-skill.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add skills/researcher scripts/researcher-skill.test.ts
git commit -m "feat(dgs-606): add the researcher card and brief"
```

---

### Task 3: moved out

The run-role lists (`researcher` in the run `ROLES`, `roleOf`, the Nexus copy, the equality test) are DGS-609 (backlog, after DGS-598). Maestro ruling (Jack), 2026-10-24. Until DGS-609 lands the card starts a researcher with `dg run start --role other`. Task 2b below checks that and adds the test.

### Task 2b: the researcher starts as run role `other`

**Files:**
- Modify: `skills/researcher/SKILL.md` (spawn step 3: `--role other` until DGS-609)
- Test: `packages/cli/src/run/start-other.test.ts` (new; keeps DGS-598's `index.test.ts` untouched)

**Interfaces:**
- Consumes: `dg run start` (`packages/cli/src/run/index.ts`), `findRunDir`.
- Produces: a test that `dg run start --role other --ticket <KEY> --order <path>` exits 0 and prints a run id.

- [ ] Write the test, run it, change the card text, run `pnpm vitest run packages/cli/src/run/start-other.test.ts scripts/researcher-skill.test.ts`, commit.

---

## Self-Review
- Spec section 1 → Task 1. Sections 2, 3, 4 → Task 2 and 2b. Sections 5 and 6 → DGS-609. First use is after the merge (not a task).
- The role names in Task 3 match Task 1 (`researcher`) and the DGS-598 names `ROLES`, `roleOf`.
- The runbook pointer line is the conductor's.

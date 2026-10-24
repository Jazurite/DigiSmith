# DGS-606 Researcher Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `researcher` role: a session card role, a role card and brief template, and a run role, so a conductor can start a read-only worker that studies outside material.

**Architecture:** Three tasks. Task 1 changes the session card rules. Task 2 adds the skill card and the brief. Task 3 adds `researcher` to the run-role lists and keeps them equal with a test. Task 3 comes last because DGS-598 (merging first) moves the run-role list into `packages/cli/src/run/schema.ts` and adds `roleOf`; Task 3 starts only after the conductor says DGS-598 has merged and this branch is rebased on `main`.

**Tech Stack:** TypeScript under `node --experimental-strip-types`, vitest, pnpm. Spec: `.digismith/board/DGS-606—researcher-role/spec.md`.

## Global Constraints

- Code in `packages/cli/src/` runs under `node --experimental-strip-types`: no parameter properties, enums, namespaces.
- A researcher's ONE write: the clone in `~/Workspace/Library/<name>` and its findings file in the depot. No write in the DigiSmith repo, no ClickUp write, no commit, no push. The card and the brief both say so.
- Legal parent roles of a researcher: conductor, maestro (never worker). A mandate is required.
- No real ClickUp write, no real herdr prompt in tests; `DIGISMITH_DEPOT_DIR` in a temp folder when a test needs the depot.
- Do not touch DGS-605's files (`.worktrees/dgs-605`, `digismith:study`) or DGS-598's files. Do not edit `.digismith/sessions/workbox.md` (the conductor adds the runbook pointer).
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

### Task 3: Researcher in the run-role lists (starts after DGS-598 merges and this branch is rebased on main)

**Files:**
- Modify: `packages/cli/src/run/schema.ts` (`ROLES`; this file comes from DGS-598. Before the rebase the list is in `packages/cli/src/run/record.ts` line 8: do not start this task until the rebase.)
- Modify: `packages/cli/src/run/role.ts` (`roleOf`: one rule line)
- Modify: `scripts/nexus-shared/nightwatch.ts` (line 9 `ROLES`)
- Modify: `packages/cli/src/nightwatch/types.ts` (line 10 `RunRowView.role`)
- Modify: `packages/cli/src/run/index.ts` (the `--role` describe text), `packages/cli/src/run/README.md` (role list in the Fields line)
- Test: `packages/cli/src/run/role.test.ts`, `packages/cli/src/run/roles-equal.test.ts` (new)

**Interfaces:**
- Consumes: from DGS-598, `ROLES` and `Role` (`run/schema.ts`, re-exported by `run/record.ts`) and `roleOf(i: RoleInput): { role: Role; role_from: RoleFrom }` (`run/role.ts`).
- Produces: `"researcher"` in the run `ROLES`; `roleOf` returns `{ role: "researcher", role_from: "herdr" }` for an agent name ending `-researcher`; one test that keeps the two run-role lists equal.

- [ ] **Step 1: Write the failing tests.** Add to `packages/cli/src/run/role.test.ts` (inside `describe("roleOf", ...)`, using the file's `herdr` helper):

```ts
  it("names a researcher from the -researcher suffix, before the scout rule", () => {
    expect(herdr("study-tool-researcher")).toEqual({ role: "researcher", role_from: "herdr" });
    expect(herdr("research-scout")).toEqual({ role: "scout", role_from: "herdr" });
  });
```

Create `packages/cli/src/run/roles-equal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES } from "./record.ts";
import { ROLES as CARD_ROLES } from "../../../../scripts/session-card.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("run roles", () => {
  it("the Nexus copy of the run roles equals the CLI list", () => {
    const src = fs.readFileSync(path.join(root, "scripts/nexus-shared/nightwatch.ts"), "utf8");
    const m = src.match(/export const ROLES = \[([^\]]*)\] as const/);
    expect(m).not.toBeNull();
    const nexus = m![1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
    expect(nexus).toEqual([...ROLES]);
  });
  it("the nightwatch view role type names every run role", () => {
    const src = fs.readFileSync(path.join(root, "packages/cli/src/nightwatch/types.ts"), "utf8");
    for (const r of ROLES) expect(src).toContain(`"${r}"`);
  });
  it("every run role except builder, other, maestro and conductor is a session card role", () => {
    for (const r of ROLES) {
      if (["builder", "other", "maestro", "conductor"].includes(r)) continue;
      expect(CARD_ROLES as readonly string[]).toContain(r);
    }
  });
  it("includes researcher", () => {
    expect(ROLES as readonly string[]).toContain("researcher");
  });
});
```

- [ ] **Step 2: Run to see them fail.** Run: `pnpm vitest run packages/cli/src/run/role.test.ts packages/cli/src/run/roles-equal.test.ts`. Expected: FAIL (no `researcher` in `ROLES`; `roleOf` returns `other`).

- [ ] **Step 3: Implement.**
  - `run/schema.ts`: add `"researcher"` to `ROLES` after `"scout"`.
  - `run/role.ts`: before the `scout`/`probe` line add `if (n.endsWith("-researcher")) return { role: "researcher", role_from: "herdr" };`
  - `scripts/nexus-shared/nightwatch.ts` line 9: same list, same order as `schema.ts`.
  - `nightwatch/types.ts` line 10: add `| "researcher"` to `role`.
  - `run/index.ts` describe text and `run/README.md`: add `researcher` to the role list.
  - Do not touch the watchdog (a researcher run has no phase and is not watched).

- [ ] **Step 4: Run the tests.** Run: `pnpm vitest run packages/cli/src/run scripts/nexus-shared scripts/session-card.test.ts scripts/researcher-skill.test.ts`. Expected: PASS. Then `pnpm vitest run packages/cli/src/nightwatch packages/cli/src/autonomous scripts/nexus-web/app/pages/nightwatch`. Expected: PASS (no new failure).

- [ ] **Step 5: Commit.**

```bash
git add packages/cli/src scripts/nexus-shared
git commit -m "feat(dgs-606): add the researcher run role"
```

---

## Self-Review
- Spec section 1 → Task 1. Sections 2, 3, 4 → Task 2. Sections 5 and 6 → Task 3 (last, after the rebase). First use is after the merge (not a task).
- The role names in Task 3 match Task 1 (`researcher`) and the DGS-598 names `ROLES`, `roleOf`.
- The runbook pointer line is the conductor's.

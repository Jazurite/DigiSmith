# DGS-605 digismith:study Skill: Spec and Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the skill `digismith:study`. When Jack asks to study an outside repository, tool or idea, the Maestro orders a researcher, relays the findings, places them on the lineage and writes a Spike ticket.

**Architecture:** One plain Markdown skill file, `skills/study/SKILL.md`, and one vitest file, `scripts/study-skill.test.ts`, written like `scripts/researcher-skill.test.ts`. No code. The draft in the worktree orders a scout; this plan replaces it with a researcher (role since DGS-606).

**Tech Stack:** Markdown, vitest, pnpm. Ticket: `.digismith/board/DGS-605—study-skill/ticket.md`.

## Spec

The skill tells the Maestro, in this order:

1. **Do not research yourself.** No clone, no long read, no web study in the Maestro session, also not "a quick look" while the researcher works.
2. **Order a researcher.** Write an order to `~/.digismith-depot/sessions/<project>/orders/` (never into the repo). The order names the subject and Jack's words, the library `<name>`, the findings path (`~/.digismith-depot/research/<name>.md`) and the seat. The conductor starts the researcher by the card `skills/researcher/SKILL.md`, section "Start of a researcher" (brief `skills/researcher/brief.md`; `dg run start --role other` until DGS-609).
3. **What the researcher does** (the card owns the detail): clone into `~/Workspace/Library/<name>` (`git pull` if it exists), read it in full, answer three questions in the findings file: how it relates to DigiSmith, how we could absorb it, how it could help us (link the open tickets it touches); say where it sits on the lineage.
4. **Relay.** Read the findings file, check one or two claims against the clone, give Jack the three answers, the clone path and the findings path.
5. **Place it on the lineage.** An agentic spike goes to clan B: Agentic: B.5 when it is about autonomous engineering, B.0: Pavilion when no lineage fits. F.9: Workflows only after Jack adopts it.
6. **Write the ticket.** A Spike in that lineage with `dg clickup create-task --type Spike --status backlog --priority 3` (never a one-off script), with the three answers, the clone path and the findings path. Read it back with `dg clickup get-task`. A ticket is not an order: start nothing until Jack says "start".

The skill never edits the DigiSmith repo. The description triggers on the intent ("study X", "research this repo", "look into this tool", a GitHub link with "study") and says it is not for work inside DigiSmith's own code ("fix this bug", "review this branch") and not for reading our own systems (a scout does that).

Out of scope: a SessionStart hook line, the run-role lists (DGS-609), the first real study (the SSSF spike).

## Decisions (Builder, technical)

- Board folder `DGS-605—study-skill`: the slug of the branch, so `digismith:init` finds it by slug.
- Test file name `scripts/study-skill.test.ts`, the same pattern as `scripts/researcher-skill.test.ts`.
- "Not a scout" check: the test forbids the phrases "order a scout", "orders a scout", "order the scout" and "role `scout`"; the word scout may stay only as "for our own systems use a scout".
- The Spike type and priority use the flags `dg clickup create-task` has (`--type Spike`, `--priority 3` = Normal).

---

### Task 1: The study skill and its test

**Files:**
- Create: `scripts/study-skill.test.ts`
- Replace: `skills/study/SKILL.md` (untracked draft)

- [ ] **Step 1: Write the failing test** `scripts/study-skill.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = fs.readFileSync(path.join(root, "skills", "study", "SKILL.md"), "utf8");
const description = skill.match(/^description: (.*)$/m)?.[1] ?? "";

describe("study skill", () => {
  it("has the frontmatter name", () => {
    expect(skill).toMatch(/^---\nname: study\n/);
  });
  it("the description triggers on the intent", () => {
    for (const s of ["study X", "research this repo", "GitHub link"]) expect(description).toContain(s);
  });
  it("the description excludes work inside DigiSmith's own code", () => {
    for (const s of ["fix this bug", "review this branch"]) expect(description).toContain(s);
  });
  it("names the researcher card, its spawn path and the order folder", () => {
    for (const s of ["skills/researcher/SKILL.md", "Start of a researcher", "~/.digismith-depot/sessions/<project>/orders/", "--role other"]) expect(skill).toContain(s);
  });
  it("says the Maestro does not research itself", () => {
    expect(skill).toContain("The Maestro does not research itself");
  });
  it("does not order a scout", () => {
    expect(skill).not.toMatch(/orders? (a|the) scout|role `scout`/i);
  });
  it("names the clone, the findings file and the ticket rules", () => {
    for (const s of ["~/Workspace/Library/<name>", "~/.digismith-depot/research/<name>.md", "dg clickup", "Spike", "backlog", "A ticket is not an order"]) expect(skill).toContain(s);
  });
});
```

- [ ] **Step 2: Run it, see it fail.** `pnpm vitest run scripts/study-skill.test.ts`. Expected: FAIL (the draft orders a scout and lacks the researcher card path).
- [ ] **Step 3: Rewrite `skills/study/SKILL.md`** to the Spec above: frontmatter `name: study` and the description; sections Order a researcher, Relay, Place it on the lineage, Write the ticket; plain short sentences (technical voice); no code.
- [ ] **Step 4: Run it, see it pass.** `pnpm vitest run scripts/study-skill.test.ts scripts/researcher-skill.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add skills/study/SKILL.md scripts/study-skill.test.ts && git commit -m "feat(dgs-605): add the digismith:study skill"`

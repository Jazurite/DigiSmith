# DGS-570 Role mode writes the Final review ledger line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In role mode the SDD Builder writes the `Final review (...)`, `Scoped re-review (...)` and `Final review: parked — ...` ledger lines that `digismith:report-implementation` reads, so nobody adds them by hand.

**Architecture:** Spec option B (`design.html`). One new paragraph in the Role Mode section of `skills/subagent-driven-development/SKILL.md`, after "Verdict lines". `report-implementation` stays unchanged. One test in `sdd.test.ts` pins the text. One sentence in `MEMORY.md` records the convention.

**Tech Stack:** Markdown skill text, vitest (`packages/cli`), pnpm.

## Global Constraints

- pnpm only, never npm.
- Do not edit `skills/report-implementation/SKILL.md` or `skills/reviewer/SKILL.md`.
- Do not edit the Role Mode text outside the one new paragraph. DGS-568 may edit other parts of the SDD file.
- The existing test `passes --ticket <KEY> in every pack command` counts lines that contain `dg reviewer pack --type`: exactly 4. The new paragraph must not contain that string.
- The Final review grammar is the one in `MEMORY.md` ("Final-review ledger lines are standardized"). Do not change it.
- Short plain sentences. No AI attribution in commits. Title-only conventional commits.

## How the build runs (role mode)

The build of DGS-570 runs with `DIGISMITH_REVIEW_MODE=role` (Workbox runbook, "Start of a Reviewer"). The Builder never reviews. A conductor starts each Reviewer.

- Each task below is one commit, so each review has a small diff.
- Each pack gets the ticket key from the `**Key:**` line of `ticket.md` (`DGS-570`). A Reviewer reads it from the `ticket:` line of `pack.md`.
- After the last task the Builder reports `STOP: ticket-review-ready <pack folder>` and waits.
- Build files: `skills/subagent-driven-development/SKILL.md` (Role Mode section only), `packages/cli/src/reviewer/sdd.test.ts`, `MEMORY.md`. No file under `packages/cli/src` changes except the test, so the main checkout's `dist` needs no rebuild after the merge.
- **First use after the merge:** the next role-mode build. When its Builder finishes, `digismith:report-implementation` must pass Step 1 with no `Final review (...)` line added by hand. The conductor of that build checks the ledger.

---

### Task 1: The Role Mode paragraph and its test

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (insert after the "Verdict lines." paragraph, before "**Waiting is the rule here.**")
- Test: `packages/cli/src/reviewer/sdd.test.ts` (new `it` inside `describe("SDD has the role-mode path (new)")`)

**Interfaces:**
- Consumes: the existing "Verdict lines." paragraph and the `model:` line that the ticket pack command prints.
- Produces: three ledger line shapes that `report-implementation` Step 1 and 2c already read.

- [ ] **Step 1: Write the failing test**

Add after the `explains r<R> in a verdict line is the pack round (F5)` test:

```ts
  it("tells the Builder to write the Final review lines report-implementation reads (DGS-570)", () => {
    const start = sdd.indexOf("## Role Mode (a herdr Builder)");
    const role = sdd.slice(start, sdd.indexOf("## Final Review"));
    for (const s of [
      "**Final review lines.**",
      "Final review (base <MERGE_BASE>..<HEAD>, <model>):",
      "Scoped re-review (fix base <FIX_BASE>..<HEAD>, <model>):",
      "Final review: parked — F<n>",
      "`model:` line",
    ]) expect(role).toContain(s);
    expect(role.indexOf("**Final review lines.**")).toBeGreaterThan(role.indexOf("**Verdict lines.**"));
    expect(role.indexOf("**Final review lines.**")).toBeLessThan(role.indexOf("**Waiting is the rule here.**"));
  });
```

- [ ] **Step 2: Run the test and see it fail**

Run: `pnpm --filter ./packages/cli exec vitest run src/reviewer/sdd.test.ts -t "Final review lines"` (from the worktree root; if the filter form fails, run `pnpm exec vitest run src/reviewer/sdd.test.ts` inside `packages/cli`)
Expected: FAIL, `expected ... to contain "**Final review lines.**"`.

- [ ] **Step 3: Write the paragraph**

Insert this block between the "Verdict lines." paragraph and "**Waiting is the rule here.**":

```markdown
**Final review lines.** `digismith:report-implementation` reads the same
whole-branch lines in every mode, so write them here yourself; never add them by
hand later. When your parent returns the round 1 result of the ticket review,
before any fix wave, append
`Final review (base <MERGE_BASE>..<HEAD>, <model>): <one-line verdict and finding summary>`.
`<MERGE_BASE>` and `<HEAD>` are the hashes you gave the pack. `<model>` is the
`model:` line the ticket pack command printed. Name each finding as
`F<n> <severity> <what>`, or write `no findings`. After the one fix wave and its
scoped re-review, append
`Scoped re-review (fix base <FIX_BASE>..<HEAD>, <model>): <verdict>`, with the
model of the round 2 pack. For a ticket finding decided `parked`, write its
verdict line and also
`Final review: parked — F<n> <finding> — ruling: <why>`. A `fixed` or `rejected`
finding needs only its verdict line. Do not change the `Review ticket final`
verdict lines: `dg reviewer table` reads them.
```

- [ ] **Step 4: Run the whole file and see it pass**

Run: `pnpm exec vitest run src/reviewer/sdd.test.ts` inside `packages/cli`
Expected: all tests PASS, including `passes --ticket <KEY> in every pack command` (still 4 lines).

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md packages/cli/src/reviewer/sdd.test.ts
git commit -m "feat(dgs-570): role mode writes the Final review ledger lines"
```

### Task 2: Record the convention in MEMORY.md

**Files:**
- Modify: `MEMORY.md` (the "Final-review ledger lines are standardized" bullet, one sentence at its end)

**Interfaces:**
- Consumes: Task 1's three line shapes (no change to them).
- Produces: nothing later tasks use.

- [ ] **Step 1: Add the sentence**

Append to the end of that bullet, after `... will read as "no final review recorded yet."`:

```markdown
 In role mode (`Review mode: role`) the Builder writes these same lines itself, from the ticket Reviewer's report (DGS-570).
```

- [ ] **Step 2: Check the bullet reads as one paragraph**

Run: `grep -n "DGS-570" MEMORY.md`
Expected: one hit, inside the Final-review bullet.

- [ ] **Step 3: Run the CLI tests**

Run: `pnpm exec vitest run` inside `packages/cli`
Expected: PASS (no test reads MEMORY.md; this is a sanity run).

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs(dgs-570): note that role mode writes the Final review lines"
```

---

## Post-merge (after both tasks and the ticket review)

- No `dist` rebuild: nothing under `packages/cli/src` changed except a test.
- Post-finish hooks 01-03 in the merge order, plugin update, `report.html` and `plan.md` committed with a pathspec (runbook).
- First use: the next role-mode build (see "How the build runs").

## Self-review

- **Spec coverage:** the paragraph (spec "Design" 1-4) is Task 1. The test (spec "Tests") is Task 1. The MEMORY.md sentence (spec "Files") is Task 2. `report-implementation` untouched: held by Global Constraints.
- **Placeholders:** none.
- **Consistency:** the three line shapes in the test, the paragraph and `MEMORY.md` use the same text. The "exactly 4 pack lines" test is protected by a Global Constraint.

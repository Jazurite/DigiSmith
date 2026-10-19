# Reviewer brief: ticket none Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `skills/reviewer/brief.md` skips session registration when `pack.md` has `ticket: none`, as the card does.

**Architecture:** One bullet in the brief template gains the exception. One assertion in the card test pins it. The card and the five placeholders stay as they are.

**Tech Stack:** Markdown, vitest (`packages/cli`), pnpm.

## Global Constraints

- The brief keeps exactly the five placeholders `AGENT`, `KEY`, `PACK`, `PLUGIN_ROOT`, `TYPE` (pinned by `card.test.ts`).
- The brief keeps the command text `entry.ts session --ticket {{KEY}} --role reviewer` (pinned by `card.test.ts`).
- The card's wording is not changed: it already says a `ticket: none` line means skip the command.
- Short plain sentences. pnpm only, never npm. No AI attribution in commits. Conventional commit, title only.
- Files this plan touches: `skills/reviewer/brief.md`, `packages/cli/src/reviewer/card.test.ts`. It touches nothing in `skills/subagent-driven-development/` (DGS-570 and DGS-568 may), so no merge overlap with them.

## Build mode (role mode)

The build runs with `DIGISMITH_REVIEW_MODE=role` (runbook, "Start of a Reviewer"). The Builder never starts or runs a review. A conductor starts the Reviewers.

- The ledger says `Review mode: role`.
- The key for every `dg reviewer pack` call is the `**Key:**` line of `ticket.md` in the board folder: `DGS-569`. The Reviewer takes it from the `ticket:` line of `pack.md`.
- The plan has one task, one commit. After it the Builder runs `scripts/review-package PLAN_FILE BASE HEAD`, then `dg reviewer pack --type task --ticket DGS-569 --task 1 ...`, reports `STOP: task-review-ready <pack>` and waits.
- After the task review is clean, the Builder builds the whole-ticket package, runs `dg reviewer pack --type ticket --ticket DGS-569 ...`, reports `STOP: ticket-review-ready <pack>` and waits. One fix wave and one scoped re-review at most.

---

### Task 1: Brief follows the card on `ticket: none`

**Files:**
- Modify: `skills/reviewer/brief.md` (the "Register your session" bullet, under "Rules")
- Test: `packages/cli/src/reviewer/card.test.ts` (the `skills/reviewer/brief.md` describe block)

**Interfaces:**
- Consumes: the card sentence in `skills/reviewer/SKILL.md` ("A `ticket: none` line means the work has no tracker key: skip the command.").
- Produces: a brief whose registration bullet carries the same exception. No new placeholder.

- [ ] **Step 1: Write the failing test**

In `packages/cli/src/reviewer/card.test.ts`, add this test inside `describe("skills/reviewer/brief.md", ...)`, after the existing "tells the Reviewer to judge only..." test:

```ts
  it("skips the session registration when pack.md says ticket: none, as the card does", () => {
    expect(brief).toContain("`ticket:` line");
    expect(brief).toContain("`ticket: none`");
    expect(brief).toMatch(/skip the command/);
    expect(brief).toContain("entry.ts session --ticket {{KEY}} --role reviewer");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter ./packages/cli exec vitest run src/reviewer/card.test.ts`
Expected: the new test FAILS (the brief has no `ticket: none`). The other tests pass. If the filter name differs, run `pnpm exec vitest run packages/cli/src/reviewer/card.test.ts` from the repo root.

- [ ] **Step 3: Change the brief**

In `skills/reviewer/brief.md`, replace this bullet:

```
- Register your session so your tokens count with the ticket, first, at the start of every review (again after a `/clear`):
  `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket {{KEY}} --role reviewer`
```

with:

```
- Register your session so your tokens count with the ticket, first, at the start of every review (again after a `/clear`). `pack.md` has a `ticket:` line. A `ticket: none` line means the work has no tracker key: skip the command.
  `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts session --ticket {{KEY}} --role reviewer`
```

Do not change anything else in the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter ./packages/cli exec vitest run src/reviewer`
Expected: PASS, all reviewer tests (card, both-paths, pack, and the rest).

- [ ] **Step 5: Commit**

```bash
git add skills/reviewer/brief.md packages/cli/src/reviewer/card.test.ts
git commit -m "fix(reviewer): brief skips session registration on ticket none"
```

---

## After the merge

- No file under `packages/cli/src` changes except a test, so the main checkout's `dist` needs no rebuild.
- The merge order carries the post-finish hooks 01-03 (plugin update, no cache flush), `report.html` and the `plan.md` commit.
- **First use:** the next Reviewer a conductor starts from `skills/reviewer/brief.md` for a pack with `ticket: none`. The check: that Reviewer registers nothing, and `~/.digismith-depot/token-registry/` gets no `none.jsonl`. A Reviewer for a keyed pack still registers.

## Self-review

- Spec coverage: fix (Task 1 Step 3), test (Task 1 Steps 1, 2, 4), files list (Global Constraints), assumptions (no new placeholder, card untouched). Complete.
- Placeholders: none. Names match: the test strings are the ones the new bullet contains.

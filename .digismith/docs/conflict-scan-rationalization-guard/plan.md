# Conflict-Scan Rationalization Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a rationalization loophole in `subagent-driven-development`'s pre-flight conflict scan by adding one guard paragraph to its Setup section — DigiSmith map item **W.7**, the first-ever activation/divergence of this vendored primitive.

**Architecture:** Single-file, single-paragraph prose insertion into `skills/subagent-driven-development/SKILL.md`'s Setup section, immediately after the existing "Present everything you find to your human partner..." paragraph. No code, no new interfaces, no other file touched.

**Tech Stack:** Markdown prose only. No test harness applies (SKILL.md files aren't covered by `pnpm test`).

## Global Constraints

- Full spec: `.digismith/docs/conflict-scan-rationalization-guard/design.html` — read it if anything below is ambiguous.
- The inserted paragraph's text is exact and given verbatim below — do not paraphrase or shorten it.
- Insert immediately after the paragraph ending "...The review loop remains the net for conflicts that only emerge from implementation." and before the `## Model Selection` heading. No other part of the file changes.
- This is DigiSmith's own self-development. Per standing preference, this work happens in an isolated worktree — never directly on `main`.
- No automated test harness covers `SKILL.md` prose — verification is a careful read-through, not a test run.

---

### Task 1: Insert the guard paragraph into the Setup section

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (Setup section, immediately after the existing conflict-scan paragraph)

**Interfaces:** None — pure prose, no code, no new interfaces.

- [ ] **Step 1: Confirm the exact anchor text is unchanged**

Run: `grep -n "Present everything you find" -A 3 skills/subagent-driven-development/SKILL.md`

Expected output includes this exact text (if it doesn't match verbatim, stop and report rather than guessing at a fuzzy edit):

```
Present everything you find to your human partner as one batched question —
each finding beside the plan text that mandates it, asking which governs —
before execution begins, not one interrupt per discovery mid-plan. If the
scan is clean, proceed without comment. The review loop remains the net for
conflicts that only emerge from implementation.
```

- [ ] **Step 2: Insert the new paragraph**

In `skills/subagent-driven-development/SKILL.md`, find this exact substring:

```
Present everything you find to your human partner as one batched question —
each finding beside the plan text that mandates it, asking which governs —
before execution begins, not one interrupt per discovery mid-plan. If the
scan is clean, proceed without comment. The review loop remains the net for
conflicts that only emerge from implementation.

## Model Selection
```

Replace it with:

```
Present everything you find to your human partner as one batched question —
each finding beside the plan text that mandates it, asking which governs —
before execution begins, not one interrupt per discovery mid-plan. If the
scan is clean, proceed without comment. The review loop remains the net for
conflicts that only emerge from implementation.

Don't adjudicate a finding yourself because you're confident it's your own
mistake rather than a real conflict — "this is just a wording bug in my
constraint, not a real conflict between tasks" is the same silent-discard
pattern the fix loop's breaker forbids, one step earlier. A Global
Constraint contradicting the actual codebase IS a finding under the first
bullet above; present it and let your human partner decide which text
governs, even when you're sure you already know the answer.

## Model Selection
```

- [ ] **Step 3: Read the whole file once, end to end**

Open `skills/subagent-driven-development/SKILL.md` and read it top to bottom. Confirm: the new paragraph reads clearly in context and doesn't contradict anything else in the Setup section; every other section of the file (Model Selection onward, the Task Loop, the fix loop, the Common Rationalizations table, Final Review, Finish) is byte-for-byte unchanged; no stray blank lines or heading-level shifts were introduced around the edit.

- [ ] **Step 4: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md
git commit -m "feat(subagent-driven-development): add conflict-scan rationalization guard (W.7)"
```

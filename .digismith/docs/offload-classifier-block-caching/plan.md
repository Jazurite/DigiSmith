# Offload Classifier-Block Fallback Caching (Z.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `subagent-driven-development`'s mechanical-tier auto-offload path hits a live
Claude Code permission-classifier refusal, cache that discovery in the plan's own ledger so
every later mechanical-tier task in the same run skips straight to a normal Claude dispatch
instead of re-discovering and re-wasting an attempt on the same environmental block.

**Architecture:** Extends the existing "Mechanical-tier auto-offload" paragraph in
`skills/subagent-driven-development/SKILL.md` (built by Z.1, already amended once for the
fix-rounds-to-Claude correction) with two additions: a fifth fallback trigger recognizing a
classifier refusal by its distinctive shape (no events file produced at all, plus an explicit
harness permission-refusal notice instead of any real runner output), and a ledger-check step
every mechanical-tier task performs before its own dispatch attempt. Pure prose — no new script,
no new interface, no code.

**Tech Stack:** Markdown (skill prose only — no code changes in this plan).

## Global Constraints

- This is a single-file, prose-only change to `skills/subagent-driven-development/SKILL.md`.
  `digismith:offload-implementer` itself does not change at all — its own Error Handling table
  stays exactly as it is today.
- The cached block is plan-ledger-scoped only. Never introduce any persistence beyond the
  current plan's own `progress.md` — no new file, no cross-plan/cross-session flag. The ledger
  is already deleted once `digismith:report-implementation` finishes, which is precisely the
  intended lifetime for this cache.
- The new trigger must stay clearly distinguishable from the three dispositions it sits next to
  in `offload-implementer`'s own Error Handling table (a genuine runner error, a `Bash` tool
  timeout, an already-caught missing prerequisite) — the detection text must name the two
  concrete signals together (no events file at all + an explicit harness refusal notice, not
  command output/exit code/stderr), not a vague "if offload seems blocked."
- No automated test suite applies to this change — it is prose read by a controller, not
  executable code. Verification is a careful read-through (Task 1's own Step 3), not a test run
  (there is nothing to add to `pnpm test`'s 271/271 baseline; the full suite still gets run once
  at the end to confirm zero regression from touching the repo at all).
- Currently working in worktree
  `D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\offload-classifier-block-caching-z2` on
  branch `worktree-offload-classifier-block-caching-z2`. Baseline: 271/271 tests passing.

---

### Task 1: Add classifier-refusal caching to the mechanical-tier auto-offload paragraph

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (the "Mechanical-tier auto-offload"
  paragraph block, currently lines 213-241 in this worktree)

**Interfaces:**
- Consumes: nothing from an earlier task — this is the only task in this plan.
- Produces: nothing consumed by a later task in this plan.

- [ ] **Step 1: Extend the fallback-trigger sentence with the fifth trigger**

  In `skills/subagent-driven-development/SKILL.md`, find this existing sentence (currently the
  first sentence of the paragraph starting "If any of `offload-implementer`'s own
  prerequisites..."):

  ```markdown
  If any of `offload-implementer`'s own prerequisites aren't met (runner not on PATH, credential
  env var unset, `print-config.ts` exits non-zero, Depot's readiness check fails) — fall back to a
  normal Claude cheap-tier `Agent`-tool dispatch instead, the same dispatch this task would have
  gotten before this paragraph existed. Note the fallback in this task's ledger entry as a
  one-liner (`Task <N>: mechanical-tier offload unavailable (<reason>), dispatched to Claude
  instead`) so it's visible after the fact. Never block a task on this path being unavailable.
  ```

  Replace it with this version — the parenthetical gains a fifth trigger, and one clause is added
  distinguishing this trigger from a genuine runner failure:

  ```markdown
  If any of `offload-implementer`'s own prerequisites aren't met (runner not on PATH, credential
  env var unset, `print-config.ts` exits non-zero, Depot's readiness check fails), **or the
  dispatch attempt itself is refused by a live Claude Code permission-classifier block** — fall
  back to a normal Claude cheap-tier `Agent`-tool dispatch instead, the same dispatch this task
  would have gotten before this paragraph existed. A classifier refusal is recognizable by two
  things together: no events file is produced at all (the resolved runner's process never
  started), and the tool result carries an explicit harness permission-refusal notice rather than
  any real command output, exit code, or stderr text from `claude`/`opencode` — distinct from a
  genuine runner error (which always produces *some* real output) or a `Bash` tool timeout
  (already handled separately, not a failure by itself). Note the fallback in this task's ledger
  entry as a one-liner (`Task <N>: mechanical-tier offload unavailable (<reason>), dispatched to
  Claude instead`) so it's visible after the fact. Never block a task on this path being
  unavailable.
  ```

- [ ] **Step 2: Add the ledger-caching paragraph immediately after it**

  Immediately after the paragraph from Step 1 (and still before the existing "Integration and
  architecture tier tasks are unaffected by this paragraph — dispatch them via the bullet list
  below exactly as before." sentence that currently follows it), insert this new paragraph
  verbatim:

  ```markdown
  **Cache a classifier refusal for the rest of this plan.** On the *first* live classifier
  refusal detected during this plan run, record it as its own ledger line — not just
  in-session/controller memory, since the ledger is this skill's own designed-for-compaction-
  survival mechanism, the same reason task-completion lines already live there:
  `Task <N>: mechanical-tier offload environment blocked (classifier refusal) — falling back to
  Claude for the rest of this plan`. Before attempting its own first dispatch, every later
  mechanical-tier task in this plan scans the ledger for that line first. If present, skip the
  offload attempt entirely and dispatch straight to a normal Claude cheap-tier `Agent`-tool
  implementer — no wasted attempt, no re-discovery. This applies plan-wide regardless of which
  runner (`claude-code` or `opencode`) triggered the original discovery or which runner a later
  task would have used — both runners have been independently confirmed blocked by the identical
  action shape (credential-fetch-then-spawn), not by anything specific to one binary. This cache
  never persists beyond this plan's own ledger: the next plan — in this session or a different
  one, with possibly-different permission settings — starts with a clean slate and gets a fair,
  fresh attempt at real offload, since the underlying block is believed to be
  session/harness-specific rather than a confirmed permanent condition.
  ```

  So the full run of text, in order, becomes: the "Fix rounds never resume..." paragraph → the
  Step 1 fallback-trigger paragraph (now five triggers) → the new Step 2 caching paragraph → the
  existing "Integration and architecture tier tasks are unaffected..." sentence, unchanged.

- [ ] **Step 3: Manual verification (no automated test — this is skill prose)**

  Read the full "Mechanical-tier auto-offload" section top to bottom and confirm:
  - The fifth trigger reads as one item in a clearly comma/parenthetical-separated list of five,
    not muddled together with the existing four.
  - The classifier-refusal detection text (no events file + explicit harness refusal notice)
    reads unambiguously distinguishable from a genuine runner error and from a `Bash` tool
    timeout — a fresh controller with no memory of this incident should be able to tell all three
    apart from this text alone.
  - The new caching paragraph sits between the fallback-trigger paragraph and the
    "Integration and architecture tier tasks are unaffected..." sentence, not inside either.
  - Nothing elsewhere in the file (Model Selection, the fix loop, Final Review, Finish, Common
    Rationalizations, the "Fix rounds never resume..." paragraph itself) was accidentally
    touched.
  - The frontmatter (`name:`, `description:` with its existing fork-provenance tag) is unchanged
    — this task does not touch the frontmatter at all, since the tag is already present from Z.1.

- [ ] **Step 4: Run the full test suite**

  Run: `pnpm test`
  Expected: PASS, 271/271 — unchanged from baseline, since this task touches only Markdown and no
  test file exercises `SKILL.md` content directly.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/subagent-driven-development/SKILL.md
  git commit -m "feat(subagent-driven-development): cache classifier-refusal fallback in the SDD ledger (Z.2)"
  ```

---

## Execution Handoff

1 task, not unusually risky: a scoped prose insertion into `subagent-driven-development`,
extending a paragraph Z.1 already built and already amended once this same way (the
fix-rounds-to-Claude correction went through the same file with no automated test coverage and no
issues). Using inline execution via `digismith:executing-plans`.

**REQUIRED SUB-SKILL:** Use `digismith:executing-plans`.

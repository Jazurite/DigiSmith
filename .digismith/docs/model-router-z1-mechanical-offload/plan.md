# Model Router Z.1 — Auto-Offload Mechanical Tasks to Kimi K3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `subagent-driven-development`'s Task Loop classifies an implementer task as
mechanical-tier, automatically dispatch it to `kimi-k3` via the existing `offload-implementer`
mechanism instead of a Claude `Agent`-tool subagent — no explicit per-task ask required.

**Architecture:** `scripts/providers/tokenreply.ts`'s `model(role)` currently ignores its
argument and always returns `"kimi-k2.7"`. It gains a role branch — `"kimi-k3"` for
`role === "mechanical"`, `"kimi-k2.7"` unchanged for `role === "task"` — mirroring the pattern
`chutes.ts` already uses. Separately, `subagent-driven-development`'s Task Loop Step 1 gains a
paragraph: on a mechanical-tier task, follow `offload-implementer`'s existing Steps 1-6 dispatch
procedure but pass `--role mechanical` to `print-config.ts` instead of the `--role task` every
existing caller hardcodes. No new script, no new decision engine — the "OffloadRole" hook these
two changes connect already exists in `scripts/providers/types.ts` and was simply never wired to
`mechanical` by anything until now.

**Tech Stack:** TypeScript (Node's built-in type stripping, no `tsx`/`ts-node`), Vitest, Markdown
(skill prose).

## Global Constraints

- No new runtime dependencies. `scripts/providers/tokenreply.ts` stays plain TypeScript, same as
  every other file in `scripts/providers/`.
- Match `chutes.ts`'s existing `model(role)` branching style exactly (a single ternary/conditional
  keyed on `role`), not a switch statement or lookup table — keep the two provider files stylistically
  consistent.
- `skills/offload-implementer/SKILL.md` does not change at all in this plan. Every reference to its
  procedure is by invocation/reference from `subagent-driven-development`'s own text, never a copy
  of its content.
- Apply the W.2 fork-provenance convention: `skills/subagent-driven-development/SKILL.md`'s
  frontmatter `description:` gets `(DigiSmith fork of Superpowers' subagent-driven-development)`
  appended verbatim (this tag is currently missing from the file despite W.7 already being a prior
  activation — Task 2 below closes that gap as part of its own change, not a separate task).
- TDD: the tokenreply.ts change is code with an existing test file and an existing sibling pattern
  (`chutes`'s own "uses distinct models for mechanical vs. task roles" test) — write the failing
  test first.
- Currently working in worktree
  `D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\model-router-z1-mechanical-offload` on branch
  `worktree-model-router-z1-mechanical-offload`. Baseline: 168/168 tests passing.

---

### Task 1: TokenReply provider — role-based model selection

**Files:**
- Modify: `scripts/providers/tokenreply.ts`
- Test: `scripts/providers/registry.test.ts:35-45` (existing `describe("tokenreply", ...)` block)

**Interfaces:**
- Consumes: `OffloadRole` type (`scripts/providers/types.ts:3`, already exists — no change) and the
  `GatewayProvider.model(role: OffloadRole): string` signature (`scripts/providers/types.ts:11`,
  already exists — no change).
- Produces: `tokenreply.model("mechanical")` now returns `"kimi-k3"`; `tokenreply.model("task")`
  continues to return `"kimi-k2.7"` (unchanged value, now explicit rather than the only branch).
  Task 2 does not call `tokenreply.model()` directly, but relies on this behavior transitively via
  `print-config.ts`'s existing `runner.buildConfig(provider, args.role)` → `provider.model(role)`
  call chain (`scripts/providers/print-config.ts:78`, `scripts/providers/tokenreply.ts` via
  `scripts/runners/claude-code.ts:50`).

- [ ] **Step 1: Write the failing test**

  In `scripts/providers/registry.test.ts`, inside the existing `describe("tokenreply", () => { ... })`
  block (currently lines 35-45), add a new test mirroring the `chutes` block's own role test
  immediately above it:

  ```typescript
  it("uses distinct models for mechanical vs. task roles", () => {
    expect(tokenreply.model("mechanical")).toBe("kimi-k3");
    expect(tokenreply.model("task")).toBe("kimi-k2.7");
  });
  ```

  Insert it as the first `it(...)` inside the block, before the existing `"conforms to
  GatewayProvider"` test, so the file reads: `describe("tokenreply", ...)` → new role test →
  existing conforms test → existing base-URL test → existing runners test. (Matches the order
  `chutes`'s own `describe` block already uses: role test first, then the generic conforms check.)

- [ ] **Step 2: Run test to verify it fails**

  Run: `pnpm test scripts/providers/registry.test.ts`
  Expected: FAIL — `tokenreply.model("mechanical")` currently returns `"kimi-k2.7"`, not
  `"kimi-k3"` (the existing `model()` method takes no parameter and ignores whatever is passed).

- [ ] **Step 3: Write minimal implementation**

  In `scripts/providers/tokenreply.ts`, replace the current `model()` method:

  ```typescript
  model() {
    return "kimi-k2.7";
  },
  ```

  with:

  ```typescript
  model(role) {
    return role === "mechanical" ? "kimi-k3" : "kimi-k2.7";
  },
  ```

  Leave every other field (`name`, `displayName`, `baseUrl`, `credentialEnv`, `contextWindow`,
  `supportsRunner`) and the existing comment block above the object untouched, except: append one
  sentence to the end of the existing multi-line comment (which currently ends at "...reverted
  until root-caused on TokenReply's or the model's side."), on its own line:

  ```typescript
  // The mechanical role is a separate exposure, accepted deliberately for
  // Z.1 (see .digismith/docs/model-router-z1-mechanical-offload/design.html) — mechanical-tier
  // tasks need few enough tool calls that offload-implementer's existing XTML-leak recovery
  // mechanism (bounded to ~3 tool calls) is expected to cover them, unlike the general task role
  // this revert was protecting.
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `pnpm test scripts/providers/registry.test.ts`
  Expected: PASS — all tests in the file, including the new one.

  Then run the full suite to confirm no regression elsewhere (other files call
  `tokenreply.model()` transitively through `print-config.ts`/runner tests, all of which currently
  pass `"task"` and expect `"kimi-k2.7"`, which is unchanged):

  Run: `pnpm test`
  Expected: PASS, 169/169 (168 existing + 1 new).

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/providers/tokenreply.ts scripts/providers/registry.test.ts
  git commit -m "feat(providers): branch TokenReply's model selection on OffloadRole"
  ```

---

### Task 2: Auto-offload mechanical-tier tasks in subagent-driven-development

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md` (frontmatter `description:` line, and the
  Task Loop's "### 1. Dispatch the implementer" section)

**Interfaces:**
- Consumes: Task 1's `tokenreply.model(role)` behavior (transitively, via the unchanged
  `print-config.ts`/runner `buildConfig` call chain — this task never calls those functions
  directly, only instructs the controller to invoke `offload-implementer`'s existing procedure
  with a different `--role` argument value).
- Produces: nothing consumed by a later task in this plan — this is the last task.

- [ ] **Step 1: Add the fork-provenance tag to frontmatter**

  In `skills/subagent-driven-development/SKILL.md`, change line 3 from:

  ```yaml
  description: Use when executing implementation plans with independent tasks in the current session
  ```

  to:

  ```yaml
  description: Use when executing implementation plans with independent tasks in the current session (DigiSmith fork of Superpowers' subagent-driven-development)
  ```

  (This tag is required by map item W.2's activation convention and was missed during W.7, this
  skill's first activation — closing that gap is part of this change, not a separate task, since
  both are "the frontmatter line for this file.")

- [ ] **Step 2: Insert the mechanical-tier auto-offload paragraph**

  In the same file, find the "### 1. Dispatch the implementer" section under "## The Task Loop".
  Immediately after this existing paragraph:

  ```markdown
  Record BASE (`git rev-parse HEAD`) before dispatching — the review package
  and fix-round diffs need it.
  ```

  and immediately **before** the existing bullet list that starts with `- **Task brief:**...`,
  insert these three new paragraphs verbatim:

  ```markdown
  **Mechanical-tier auto-offload:** if this task's complexity signal (see Model Selection above)
  is **mechanical**, dispatch its **first attempt** by following `digismith:offload-implementer`'s
  Steps 1 through 6 directly instead of an `Agent`-tool subagent — resolving
  `task_offload_runner`/`task_offload_provider` from the active profile exactly as its own
  explicit-ask path does, with one difference: pass `--role mechanical` to `print-config.ts` in
  its Step 1, not the `--role task` its own explicit-ask callers use. No user request is needed for
  this path; it applies automatically to every mechanical-tier task's first attempt. Task review
  proceeds unmodified once `offload-implementer`'s Step 6 hands back the status contract, exactly
  as it already does for an explicitly-requested offload today.

  **Fix rounds never resume the offloaded session.** If the task reviewer finds something and a
  fix round triggers, dispatch the fix to a normal Claude `Agent`-tool implementer (mechanical
  tier's own cheap-model default) — never back to `kimi-k3`. Brief the fix-round implementer with
  the open findings and a pointer to the original attempt's report file, the same way rounds 4-5's
  escalation already hands a fresh implementer the prior report to read; the only difference here
  is that this substitution happens on round 1, not round 4. This bounds `kimi-k3`'s exposure to
  its known tool-calling bug (see `backlog/tokenreply-kimi-k3-tool-calling-failure.md`) to a single
  clean attempt, and puts every correction in the reliable model's hands regardless of how many
  rounds it takes.

  If any of `offload-implementer`'s own prerequisites aren't met (runner not on PATH, credential
  env var unset, `print-config.ts` exits non-zero, Depot's readiness check fails) — fall back to a
  normal Claude cheap-tier `Agent`-tool dispatch instead, the same dispatch this task would have
  gotten before this paragraph existed. Note the fallback in this task's ledger entry as a
  one-liner (`Task <N>: mechanical-tier offload unavailable (<reason>), dispatched to Claude
  instead`) so it's visible after the fact. Never block a task on this path being unavailable.

  Integration and architecture tier tasks are unaffected by this paragraph — dispatch them via the
  bullet list below exactly as before.
  ```

  **Amended during execution (2026-09-06):** the original plan text (and the design doc) had fix
  rounds resume the same offloaded `kimi-k3` session, matching `offload-implementer`'s own
  explicit-ask behavior. Jack corrected this live: fix rounds for an auto-offloaded mechanical
  task route to Claude instead, never back to `kimi-k3` — the text above reflects the corrected,
  as-shipped behavior, not the original plan draft.

  So the section reads, in order: the "Record BASE" paragraph → these three new paragraphs → the
  existing "Template: [implementer-prompt.md]" bullet list, unchanged.

- [ ] **Step 3: Manual verification (no automated test — this is skill prose)**

  Read the full "### 1. Dispatch the implementer" section top to bottom and confirm:
  - The new paragraphs sit between "Record BASE..." and the existing bullet list, not inside it.
  - They read clearly as a decision made *before* the existing bullet list's Agent-tool-specific
    dispatch guidance, not as a replacement for it.
  - Nothing elsewhere in the file (Model Selection, the fix loop, Final Review, Finish, Common
    Rationalizations) was accidentally touched.
  - The frontmatter `description:` line (Step 1) is valid YAML (no unescaped colons or quotes
    introduced) and the file still parses as a skill (`name:` and `description:` are the only two
    frontmatter keys, both present).

- [ ] **Step 4: Run the full test suite**

  Run: `pnpm test`
  Expected: PASS, same count as after Task 1 (this task touches only Markdown — no test file
  exercises `SKILL.md` content directly).

- [ ] **Step 5: Commit**

  ```bash
  git add skills/subagent-driven-development/SKILL.md
  git commit -m "feat(subagent-driven-development): auto-offload mechanical tasks to kimi-k3 (Z.1)"
  ```

---

## Execution Handoff

2 tasks, neither unusually risky: Task 1 is a small, TDD-covered code change mirroring an existing
pattern (`chutes.ts`'s own role branch); Task 2 is a scoped prose insertion into
`subagent-driven-development`, the same scale and shape of change as W.7's own single-paragraph
activation of this file, which was executed inline. Using inline execution via
`digismith:executing-plans`.

**REQUIRED SUB-SKILL:** Use `digismith:executing-plans`.

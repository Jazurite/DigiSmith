# Retire subagent-driven-always Into Vendored Primitives (W.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `digismith:subagent-driven-development` (recommended) or `digismith:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold map item H's (Subagent-driven always) execution-mode logic directly into the vendored `writing-plans`/`executing-plans` primitives, replacing the unconditional "always subagent-driven" default with autonomous complexity-based reasoning, and retire the standalone `digismith:subagent-driven-always` skill.

**Architecture:** The classification decision (explicit override, no-capability fallback, complexity-based default) moves into `writing-plans`' own Execution Handoff step. `executing-plans` gains a lightweight ledger + self-check step it never had before (its first real activation). `report-implementation` gains a second, simpler report template branch for ledgers that `executing-plans` produces. `inject-standards` needs no change — confirmed during design.

**Tech Stack:** Markdown/prose skill files (no executable code) — verification is via `node scripts/check_vendored_skills.ts`, repo-wide `grep`, and manual read-through, not unit tests.

## Global Constraints

- Every file edited below is Markdown prose (`SKILL.md`), not code.
- Never invent new behavior beyond what `.digismith/docs/retire-h-vendored-primitives/design.html` specifies.
- The fork-provenance tag format is exactly: `(DigiSmith fork of Superpowers' <name>)` appended to the end of the existing `description:` frontmatter text.
- Never leave a dangling reference to `digismith:subagent-driven-always` anywhere in the repo after Task 6 (checked in Task 7).
- Existing SDD-ledger behavior in `report-implementation` must stay byte-for-byte equivalent to today — every new inline-ledger branch is additive, never a rewrite of the SDD path.

---

### Task 1: Fold H's classification logic into `writing-plans`' Execution Handoff

**Files:**
- Modify: `skills/writing-plans/SKILL.md` (the `## Execution Handoff` section, currently lines 167-186)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `writing-plans` now decides inline-vs-subagent-driven itself and invokes the chosen primitive directly — Tasks 2 and 3 assume this decision point exists.

- [ ] **Step 1: Replace the Execution Handoff section**

Find this exact block:

```markdown
## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `<path>`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use digismith:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use digismith:executing-plans
- Batch execution with checkpoints for review
```

Replace it with:

```markdown
## Execution Handoff

After saving the plan, decide which execution approach to use — never present this as a live
question to your human partner:

1. **User has explicitly requested inline execution for this specific plan** (stated earlier
   in conversation) → announce that inline execution is being used, per the user's earlier
   request, then invoke `digismith:executing-plans`. Not a live question — only activates if
   the user volunteered it.
2. **No subagent capability in this environment** (no `Agent` tool or equivalent available) →
   announce that inline execution is being used because this environment has no
   subagent-dispatch capability, then invoke `digismith:executing-plans` automatically. An
   environmental constraint, not a choice.
3. **Otherwise, reason about task complexity:** 1-2 tasks, none unusually risky and none
   needing isolated context (e.g. touching shared mutable state, a security-sensitive path, or
   genuinely benefiting from an independent reviewer's fresh eyes) → announce that inline
   execution is being used, given the plan's small scope, then invoke
   `digismith:executing-plans`. 3 or more tasks, or fewer tasks where at least one carries that
   kind of risk → announce that Subagent-Driven Development is being used, then invoke
   `digismith:subagent-driven-development` directly.

Decide the path first, then announce the matching outcome — never announce one approach before
the decision is made, since the decision can send execution somewhere else entirely.

**If inline execution:**
- **REQUIRED SUB-SKILL:** Use `digismith:executing-plans`
- Batch execution with checkpoints for review

**If Subagent-Driven Development:**
- **REQUIRED SUB-SKILL:** Use `digismith:subagent-driven-development`
- Fresh subagent per task + two-stage review
```

- [ ] **Step 2: Verify the edit reads correctly**

```bash
grep -c "reason about task complexity" skills/writing-plans/SKILL.md
```

Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat(vendored-skills): fold H's classification logic into writing-plans (W.6)"
```

---

### Task 2: Activate `executing-plans` — lightweight ledger, self-check, fork tag

**Files:**
- Modify: `skills/executing-plans/SKILL.md` (frontmatter `description:` line 3; the `**Note:**` line 14; Step 1 line 19; Step 2, currently lines 25-31; Step 3's `finishing-a-development-branch` reference, currently line 37)

**Interfaces:**
- Consumes: nothing from other tasks (independent file).
- Produces: when invoked (per Task 1's new decision), `executing-plans` now writes a ledger at `.superpowers/sdd/<plan-basename>/progress.md` with the grammar `Task <N>: complete (commits <base7>..<head7>, self-check: <summary>)` and a first line `# Inline-execution ledger — plan: <plan file path>` — Task 3 depends on this exact grammar and path.

- [ ] **Step 1: Add the fork-provenance tag to the frontmatter**

Find (line 3):

```
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
```

Replace with:

```
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints (DigiSmith fork of Superpowers' executing-plans)
```

- [ ] **Step 2: Rewrite the internal `superpowers:` cross-references to `digismith:`**

Find (line 14):

```
**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use superpowers:subagent-driven-development instead of this skill.
```

Replace with (only the prefix changes):

```
**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use digismith:subagent-driven-development instead of this skill.
```

Find (line 19):

```
1. Ensure an isolated workspace: use superpowers:using-git-worktrees to create one or verify the existing one
```

Replace with:

```
1. Ensure an isolated workspace: use digismith:using-git-worktrees to create one or verify the existing one
```

Find (line 37):

```
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
```

Replace with:

```
- **REQUIRED SUB-SKILL:** Use digismith:finishing-a-development-branch
```

- [ ] **Step 3: Add the ledger and self-check to Step 2**

Find this exact block:

```markdown
### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed
```

Replace it with:

```markdown
### Step 2: Execute Tasks

If this is the first task, create this plan's ledger with its identity as the first line:
`# Inline-execution ledger — plan: <plan file path>`, at
`.superpowers/sdd/<plan-basename>/progress.md` (the same path convention
`digismith:subagent-driven-development` uses — a given plan only ever runs one way, so there's
no collision). Record the commit at that point as `MERGE_BASE` for the ledger.

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Self-check before marking complete — the same spirit as a fresh-eyes review, not a separate
   dispatch: did you fully implement everything the task specified? Any edge cases missed? Is
   this your best work, following existing patterns? Did you avoid overbuilding (YAGNI)? Do the
   tests actually verify behavior, not just exist?
5. Record `git rev-parse HEAD` as this task's head commit.
6. Append one line to the ledger: `Task <N>: complete (commits <base7>..<head7>, self-check:
   <one-line summary>)` — no review-verdict, no fix-round grammar; there is no independent
   reviewer to produce one.
7. Mark as completed
```

- [ ] **Step 4: Verify the edits read correctly**

```bash
grep -c "superpowers:" skills/executing-plans/SKILL.md
```

Expected: `0`

```bash
grep -c "Inline-execution ledger" skills/executing-plans/SKILL.md
```

Expected: `1`

- [ ] **Step 5: Commit**

```bash
git add skills/executing-plans/SKILL.md
git commit -m "feat(vendored-skills): activate executing-plans (W.6) — lightweight ledger and self-check"
```

---

### Task 3: `report-implementation` branches its template for inline-execution ledgers

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (Prerequisites, currently lines 39-43; Step 1's final-review-line check, currently lines 144-154; Step 2's intro, currently lines 156-162; Step 2a's summary closing clause, currently lines 206-215; Step 2b, currently lines 217-237; Step 3's HTML template's Build Process section, currently lines 425-435; the `{{FINAL_REVIEW_SECTION}}` disposition note, currently lines 478-481; the Quick Reference table's Step 1/2/3 rows, currently lines 599-601)

**Interfaces:**
- Consumes: the exact ledger grammar Task 2 produces (`# Inline-execution ledger — plan: ...` first line; `Task <N>: complete (commits <base7>..<head7>, self-check: <summary>)` per-task lines).
- Produces: nothing other tasks depend on.

This is a normal edit to a native DigiSmith skill (map item N) — `report-implementation` was never one of the 14 vendored Superpowers primitives, so no fork-provenance tag or `vendored/PROVENANCE.md` entry applies here.

- [ ] **Step 1: Update Prerequisites' stale parenthetical**

Find this exact block:

```markdown
A ledger must exist at `.superpowers/sdd/<plan-basename>/progress.md`. If
it doesn't (e.g. the plan ran via `digismith:executing-plans` instead of
`digismith:subagent-driven-development`), this skill's trigger condition
isn't met — skip it silently and let the other skill's Finish step proceed
as normal. Don't render a report from nothing.
```

Replace it with:

```markdown
A ledger must exist at `.superpowers/sdd/<plan-basename>/progress.md`. If it doesn't (no
execution has happened yet for this plan), this skill's trigger condition isn't met — skip it
silently and let the other skill's Finish step proceed as normal. Don't render a report from
nothing. If a ledger does exist, its first line names which mechanism produced it — `# SDD
ledger — plan: ...` or `# Inline-execution ledger — plan: ...` — determining which grammar
Step 2 parses.
```

- [ ] **Step 2: Scope the "missing Final review line" check to SDD ledgers only**

Find this exact block:

```markdown
**If the ledger has no `Final review (...)` line**, don't quietly proceed.
This skill's trigger condition *is* "the final review just passed," so a
missing final-review line means either the ledger doesn't follow
DigiSmith's required grammar (see `MEMORY.md`'s Conventions section) or
this skill fired at the wrong moment. Say so plainly to whoever is running
this skill, and ask before continuing — don't silently render
"final-review detail isn't available yet" as if it were normal partial
progress. (The one genuinely-expected case is a deliberate fixture that
simulates firing before any final review ran at all; that's covered in
Error Handling, and it's still worth stating out loud rather than
absorbing silently.)
```

Replace it with:

```markdown
**For an SDD ledger:** if it has no `Final review (...)` line, don't quietly proceed.
This skill's trigger condition *is* "the final review just passed," so a
missing final-review line means either the ledger doesn't follow
DigiSmith's required grammar (see `MEMORY.md`'s Conventions section) or
this skill fired at the wrong moment. Say so plainly to whoever is running
this skill, and ask before continuing — don't silently render
"final-review detail isn't available yet" as if it were normal partial
progress. (The one genuinely-expected case is a deliberate fixture that
simulates firing before any final review ran at all; that's covered in
Error Handling, and it's still worth stating out loud rather than
absorbing silently.)

**For an inline-execution ledger:** there is never a `Final review (...)` line — that's the
expected, normal shape, not a gap to flag. Proceed straight to Step 2.
```

- [ ] **Step 3: Branch Step 2's intro by ledger type**

Find this exact block:

```markdown
### Step 2: Parse the Ledger into Report Content

The ledger follows DigiSmith's standardized line grammar — per-task lines
from `digismith:subagent-driven-development` itself, plus the
final-review lines DigiSmith requires on top of it (both documented in
`MEMORY.md`'s Conventions section). Everything below keys off that
grammar.
```

Replace it with:

```markdown
### Step 2: Parse the Ledger into Report Content

**For an SDD ledger:** it follows DigiSmith's standardized line grammar — per-task lines
from `digismith:subagent-driven-development` itself, plus the
final-review lines DigiSmith requires on top of it (both documented in
`MEMORY.md`'s Conventions section). Everything below (2a-2f) keys off that
grammar, except 2a's summary-sentence closing clause and 2b's per-task row shape — see the
inline-ledger variants of each, called out inline below.

**For an inline-execution ledger:** simpler grammar, no review/fix-round/final-review lines at
all — just `Task <N>: complete (commits <base7>..<head7>, self-check: <summary>)` lines. Steps
2a (except the summary's closing clause), 2d, 2e, and 2f apply unchanged; 2b uses its
inline-ledger variant below; 2c never applies (skip it — no final review ever exists for this
ledger type).
```

- [ ] **Step 4: Add the inline variant to 2a's summary closing clause**

Find this exact block:

```markdown
  3. this fixed closing sentence: *"Followed the full Superpowers process:
     brainstorming → spec → writing-plans →
     `digismith:subagent-driven-development` (`<N>` tasks, each
     dispatched to a fresh implementer subagent and independently
     reviewed) → a final whole-branch review"* — where `<N>` is the number
     of `### Task N:` headings in the plan. Append
     *", plus `<R>` fix round(s) before merge"* if any task line or the
     final review itself recorded a fix round (`<R>` = total fix rounds
     across the whole run). Trim/rewrap 1-3 for prose flow, but don't add
     facts that aren't in those sources.
```

Replace it with:

```markdown
  3. this fixed closing sentence — **for an SDD ledger:** *"Followed the full Superpowers
     process: brainstorming → spec → writing-plans →
     `digismith:subagent-driven-development` (`<N>` tasks, each
     dispatched to a fresh implementer subagent and independently
     reviewed) → a final whole-branch review"* — where `<N>` is the number
     of `### Task N:` headings in the plan. Append
     *", plus `<R>` fix round(s) before merge"* if any task line or the
     final review itself recorded a fix round (`<R>` = total fix rounds
     across the whole run). **For an inline-execution ledger:** *"Followed the full Superpowers
     process: brainstorming → spec → writing-plans → `digismith:executing-plans` (`<N>` tasks,
     executed directly in this session, each with a self-check before moving on)"* — no
     fix-round or final-review clause, since neither exists for this ledger type. Trim/rewrap
     1-3 for prose flow, but don't add facts that aren't in those sources.
```

- [ ] **Step 5: Add the inline variant to 2b's Build Process rows**

Find this exact block:

```markdown
#### 2b. Build Process rows

One per task. For each `Task <N>: complete (...)` line:

- **Task title** — the plan's `### Task N: ...` heading.
- **Review verdict** — scan **all** `Task <N>: ...` lines for that same
  task number, not just the completion line:
  - If any `Task <N>: fix round <R>/5 (...)` lines exist for that task,
    the verdict is **"Approved after `<R>` fix round(s)"**, where `<R>` is
    the highest round number found — even if the completion line also
    says "review clean". A completion line's "review clean" describes the
    *last* review pass, not the task's whole history.
  - Only when zero fix-round lines exist for that task number is a bare
    **"Approved, clean"** correct.
  - Add any `Task <N>: parked — ...` items to the verdict cell too (e.g.
    "Approved after 2 fix rounds, 1 parked").
- **BLOCKED tasks** — if any `Task <N>: BLOCKED` line exists, still render
  that task's row, and note it plainly in the verdict cell (e.g.
  "BLOCKED — `<reason>`"). Never silently omit a blocked task.
- **Deferred minors** — every `Task <N>: minor (deferred): ...` line for
  that same task number, verbatim.
```

Replace it with:

```markdown
#### 2b. Build Process rows

**For an SDD ledger.** One per task. For each `Task <N>: complete (...)` line:

- **Task title** — the plan's `### Task N: ...` heading.
- **Review verdict** — scan **all** `Task <N>: ...` lines for that same
  task number, not just the completion line:
  - If any `Task <N>: fix round <R>/5 (...)` lines exist for that task,
    the verdict is **"Approved after `<R>` fix round(s)"**, where `<R>` is
    the highest round number found — even if the completion line also
    says "review clean". A completion line's "review clean" describes the
    *last* review pass, not the task's whole history.
  - Only when zero fix-round lines exist for that task number is a bare
    **"Approved, clean"** correct.
  - Add any `Task <N>: parked — ...` items to the verdict cell too (e.g.
    "Approved after 2 fix rounds, 1 parked").
- **BLOCKED tasks** — if any `Task <N>: BLOCKED` line exists, still render
  that task's row, and note it plainly in the verdict cell (e.g.
  "BLOCKED — `<reason>`"). Never silently omit a blocked task.
- **Deferred minors** — every `Task <N>: minor (deferred): ...` line for
  that same task number, verbatim.

**For an inline-execution ledger.** One per task. For each `Task <N>: complete (commits
<base7>..<head7>, self-check: <summary>)` line:

- **Task title** — the plan's `### Task N: ...` heading, same as the SDD case.
- **Self-check** — the `self-check: <summary>` text from that task's ledger line, verbatim.
- No review-verdict column, no deferred-minors column — neither concept exists for this ledger
  type (no independent reviewer, no fix loop). The rendered table has only three columns for
  this ledger type: Task / Delivered / Self-check (see Step 3's inline template variant below).
```

- [ ] **Step 6: Split the HTML template's Build Process section into a placeholder with two variants**

Find this exact block (inside Step 3's template):

```html
<section id="build">
  <h2>Build Process</h2>
  <p>Executed via <code>digismith:subagent-driven-development</code>: fresh implementer
  subagent per task, independent spec-compliance + quality review after each.</p>
  <div class="table-wrap">
  <table>
    <tr><th>Task</th><th>Delivered</th><th>Review verdict</th><th>Deferred minors</th></tr>
    {{BUILD_PROCESS_ROWS}}
  </table>
  </div>
</section>
```

Replace it with:

```html
{{BUILD_PROCESS_SECTION}}
```

Then, immediately after the code block that defines `{{FINAL_REVIEW_SECTION}}` (the one starting `` `{{FINAL_REVIEW_SECTION}}` is this literal block:` ``), insert this new explanation and its two literal variants:

```markdown
`{{BUILD_PROCESS_SECTION}}` is one of two literal blocks, chosen by ledger type (Step 2's
determination). **For an SDD ledger:**

```html
<section id="build">
  <h2>Build Process</h2>
  <p>Executed via <code>digismith:subagent-driven-development</code>: fresh implementer
  subagent per task, independent spec-compliance + quality review after each.</p>
  <div class="table-wrap">
  <table>
    <tr><th>Task</th><th>Delivered</th><th>Review verdict</th><th>Deferred minors</th></tr>
    {{BUILD_PROCESS_ROWS}}
  </table>
  </div>
</section>
```

**For an inline-execution ledger** (note: three columns, not four — no review-verdict or
deferred-minors cells, per 2b's inline variant):

```html
<section id="build">
  <h2>Build Process</h2>
  <p>Executed via <code>digismith:executing-plans</code>: implemented directly in this
  session, task by task, with a self-check after each.</p>
  <div class="table-wrap">
  <table>
    <tr><th>Task</th><th>Delivered</th><th>Self-check</th></tr>
    {{BUILD_PROCESS_ROWS}}
  </table>
  </div>
</section>
```
```

- [ ] **Step 7: Clarify the Final Review section's disposition for inline ledgers**

Find this exact sentence:

```markdown
When the ledger's final-review line reports **zero** findings, both
`{{FINAL_REVIEW_SECTION}}` and `{{TOC_FINALREVIEW_ITEM}}` are the empty
string — the section and its TOC entry are omitted entirely rather than
rendered empty.
```

Replace it with:

```markdown
When the ledger's final-review line reports **zero** findings (SDD ledger only — see 2c), or
when the ledger is an inline-execution ledger (which never has a final review at all), both
`{{FINAL_REVIEW_SECTION}}` and `{{TOC_FINALREVIEW_ITEM}}` are the empty
string — the section and its TOC entry are omitted entirely rather than
rendered empty.
```

- [ ] **Step 8: Update the Quick Reference table**

Find these exact three rows:

```
| 1 | Locate ledger + plan; derive `<feature-slug>` (parent dir when the plan is at `.digismith/docs/<slug>/plan.md`, else parse it out of the `<date>-<slug>-plan.md` filename); compute commit range; `git log --reverse --oneline`; check for an optional ticket key gated by the active profile's `ticket` field; skip entirely if no ledger or if the active profile's `reporting` is `false` (see Prerequisites), ask if no final-review line |
| 2 | Derive header placeholders including the optional `{{TICKET_KEY_META}}` (2a), per-task rows (2b), final-review findings (2c), delivered cards (2d), oldest-first commits (2e); escape all ledger/plan text (2f) |
| 3 | Render using the standard report HTML template, including the literal Final Review & Fix block (or omit it, with its TOC entry, when there are no findings); try `scripts/model_offload.ts` first, but only in DigiSmith's own repo, and state which path produced the file |
```

Replace them with:

```
| 1 | Locate ledger + plan; read the ledger's first line to determine SDD vs. inline-execution grammar; derive `<feature-slug>` (parent dir when the plan is at `.digismith/docs/<slug>/plan.md`, else parse it out of the `<date>-<slug>-plan.md` filename); compute commit range; `git log --reverse --oneline`; check for an optional ticket key gated by the active profile's `ticket` field; skip entirely if no ledger or if the active profile's `reporting` is `false` (see Prerequisites); for an SDD ledger, ask if no final-review line — an inline-execution ledger never has one, that's expected |
| 2 | Derive header placeholders including the optional `{{TICKET_KEY_META}}` (2a); per-task rows (2b, SDD or inline-execution variant); final-review findings (2c, SDD only — never applies to an inline-execution ledger); delivered cards (2d), oldest-first commits (2e); escape all ledger/plan text (2f) |
| 3 | Render using the standard report HTML template, including the ledger-type-appropriate Build Process block and the literal Final Review & Fix block (or omit both/either, with the TOC entry, when there are no findings or no final review at all); try `scripts/model_offload.ts` first, but only in DigiSmith's own repo, and state which path produced the file |
```

- [ ] **Step 9: Verify the edits read correctly**

```bash
grep -c "BUILD_PROCESS_SECTION" skills/report-implementation/SKILL.md
```

Expected: `3` (the placeholder in the template, plus its two defining variant blocks)

```bash
grep -c "Inline-execution ledger" skills/report-implementation/SKILL.md
```

Expected: at least `1`

- [ ] **Step 10: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "feat(report-implementation): branch report template for inline-execution ledgers (W.6)"
```

---

### Task 4: Update `README.md` — remove H's paragraph, adjust skill count

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Remove H's paragraph and fix the intro sentence**

Find this exact block:

```markdown
Six skills sit outside that front door, because they trigger at
specific points inside the build rather than at the front door itself —
one right after a plan is saved, before any task code is written; one
more during the build itself, standing in for a normal task dispatch
when explicitly asked to offload it; the other four later, once code
already exists.

**`subagent-driven-always`** (map item **H**). It intercepts
`digismith:writing-plans`' Execution Handoff question — "1.
Subagent-Driven (recommended) / 2. Inline Execution" — the moment a plan
is saved and before any of its tasks are implemented. It skips the live
question and defaults straight to `digismith:subagent-driven-development`,
since `report-implementation` (N) and standards injection (G) both
depend on the per-task ledger only that path produces. It falls back to
`digismith:executing-plans` only if the user explicitly asked for
inline execution, or if the environment has no subagent-dispatch
capability at all. See
[`skills/subagent-driven-always/SKILL.md`](skills/subagent-driven-always/SKILL.md)
for the exact process, or [`.digismith/history.html`](.digismith/history.html) for
its status.

**`capture-ephemeral-url`** (map item **M**).
```

Replace it with:

```markdown
Five skills sit outside that front door, because they trigger at
specific points inside the build rather than at the front door itself —
one during the build itself, standing in for a normal task dispatch
when explicitly asked to offload it; the other four later, once code
already exists.

**`capture-ephemeral-url`** (map item **M**).
```

- [ ] **Step 2: Verify the edit reads correctly**

```bash
grep -c "subagent-driven-always" README.md
```

Expected: `0`

```bash
grep -c "Five skills sit outside" README.md
```

Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): remove stale subagent-driven-always references (W.6)"
```

---

### Task 5: Update `adopt` — drop the moot H reference

**Files:**
- Modify: `skills/adopt/SKILL.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Drop the H mention**

Find this exact text (currently lines 293-298):

```markdown
Invoke `digismith:subagent-driven-development` directly against
`.digismith/docs/<slug>/plan.md` — `digismith:brainstorming` and
`digismith:writing-plans` already ran outside DigiSmith for this ticket,
so they are not invoked here. From this point on,
`digismith:subagent-driven-always` and `digismith:inject-standards`
Scenario 4 apply exactly as they would for any other
```

Replace it with:

```markdown
Invoke `digismith:subagent-driven-development` directly against
`.digismith/docs/<slug>/plan.md` — `digismith:brainstorming` and
`digismith:writing-plans` already ran outside DigiSmith for this ticket,
so they are not invoked here. From this point on,
`digismith:inject-standards` Scenario 4 applies exactly as it would for any other
```

- [ ] **Step 2: Verify the edit reads correctly**

```bash
grep -c "subagent-driven-always" skills/adopt/SKILL.md
```

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add skills/adopt/SKILL.md
git commit -m "docs(adopt): drop moot subagent-driven-always reference (W.6)"
```

---

### Task 6: Delete `subagent-driven-always`, update `MEMORY.md`, `vendored/PROVENANCE.md`, `.digismith/history.html`, delete the backlog file

**Files:**
- Delete: `skills/subagent-driven-always/SKILL.md` (and the now-empty `skills/subagent-driven-always/` folder)
- Delete: `backlog/retire-subagent-driven-always-h-w6.md`
- Modify: `MEMORY.md` (H's map row; the Build order Tier 2 row's H segment; W's map row)
- Modify: `vendored/PROVENANCE.md` (activation lists, `writing-plans`' entry, "dormant" sentence)
- Modify: `.digismith/history.html` (H's current-status table row and paragraph/links block — not any dated timeline entry)
- Modify: `backlog/README.md` (remove the now-deleted item's index line)

**Interfaces:**
- Consumes: relies on Tasks 1-5 having removed every functional dependency on `digismith:subagent-driven-always` — this task performs the actual deletion.
- Produces: nothing further downstream — this is the retirement itself.

- [ ] **Step 1: Delete the skill and the backlog file**

```bash
git rm -r skills/subagent-driven-always
git rm backlog/retire-subagent-driven-always-h-w6.md
```

- [ ] **Step 2: Update MEMORY.md's map — mark H retired**

Find this exact row:

```
| **H** | Subagent-driven always | Kills Superpowers' "1. Subagent-Driven or 2. Inline?" question — there is no option 2 |
```

Replace it with:

```
| **H** | Subagent-driven always | Killed Superpowers' "1. Subagent-Driven or 2. Inline?" question via a standalone `digismith:subagent-driven-always` skill that intercepted `digismith:writing-plans`' Execution Handoff step and unconditionally defaulted to subagent-driven, since `report-implementation` (N) and `inject-standards` (G) were assumed to need it. **Retired 2026-09-04** once map item W's vendoring mechanism was proven live (twice, by this point) — the classification logic (now autonomous, complexity-based, not unconditional) was folded directly into the vendored primitives themselves (see **W.6**), with N and G updated rather than left dependent on a default that no longer always holds. Letter freed for future reuse, same precedent as letters R and Q before it. |
```

- [ ] **Step 3: Update MEMORY.md's Build order table — H's Tier 2 segment**

Find this exact row (search for `**2** | The override`):

```
| **2** | The override | **H** subagent-driven always (built 2026-08-12) · **Q** convention enforcement (built 2026-08-15, retired 2026-09-04 — absorbed into **W.5**) · **K.1** model offload for DigiSmith's own HTML generation (built 2026-08-16) · **W.1** vendor Superpowers primitives (built 2026-08-20) · **K.2** implementer-task offload (built 2026-08-27) · the rest of model tiering · **W.2** activation mechanism (built 2026-08-29) · **W.4**/**W.5** primitive-by-primitive replacement (Q retired into W.5) · **W.6+** further replacement |
```

(If the trailing segment reads slightly differently — e.g. still `**W.4+**` rather than
`**W.4**/**W.5**...**W.6+**` — locate the actual current text of this row instead of assuming
it matches verbatim; a prior task in a different plan may have already touched it. Either way,
apply the same transformation described below to whatever the row's H segment currently says.)

Replace the row's `**H** subagent-driven always (built 2026-08-12)` segment with
`**H** subagent-driven always (built 2026-08-12, retired 2026-09-04 — absorbed into **W.6**)`,
and replace the trailing `**W.6+**` (or `**W.4+**`, whichever is actually present) with
`**W.6** (H retired) · **W.7+**` — adjusting only the number that needs incrementing past
whatever this repo's actual current highest W sub-item is at the time this task runs.

- [ ] **Step 4: Update MEMORY.md's map — add W.6 to W's row**

Find the end of W's map row — the segment describing **W.5** (search for `**W.5** built
2026-09-04: retired map item **Q**`) followed by whatever trailing catch-all currently follows
it (e.g. `**W.6+**`).

Insert a new **W.6** entry immediately after W.5's description, before that trailing catch-all,
renumbering the catch-all past W.6:

```
**W.6** built 2026-09-04: retired map item **H** (Subagent-driven always) the same way —
folded its classification logic directly into `writing-plans`' Execution Handoff, replacing
the unconditional "always subagent-driven" default with autonomous complexity-based reasoning
(1-2 low-risk tasks → inline-eligible; 3+ tasks, or fewer unusually risky ones → subagent-driven;
the two prior override branches — explicit user request, no subagent capability — carried over
unchanged). This is `executing-plans`' first real activation: it gained a lightweight ledger and
a per-task self-check it never had before, so `report-implementation` (N) could gain a second,
simpler report template branch instead of silently skipping inline-executed plans as it did
before. `inject-standards` (G) needed no change — its existing Scenario 1 (Conversation) already
covers non-subagent implementation work. See
`.digismith/docs/retire-h-vendored-primitives/design.html`
```

- [ ] **Step 5: Update vendored/PROVENANCE.md**

Find the "Skills vendored (verbatim, byte-identical to source)" list and remove
`executing-plans` from it (no longer byte-identical).

Find the "Skills activated (diverged from source)" section and add a new entry after the
existing `writing-plans` entry:

```
- **executing-plans** — map item **W.6**, activated 2026-09-04. Gained a lightweight ledger
  (`.superpowers/sdd/<plan-basename>/progress.md`, first line `# Inline-execution ledger`) and
  a per-task self-check step it never had before — DigiSmith's `writing-plans` now dispatches
  here directly for low-complexity plans instead of defaulting to
  `subagent-driven-development` unconditionally. See DigiSmith `MEMORY.md` map item W.
```

Find the existing `writing-plans` entry (added by W.5) and append a note that it diverged
further:

```
- **writing-plans** — map item **W.5**, activated 2026-09-04 (alongside
  `brainstorming`, above). Now writes to `.digismith/docs/<slug>/plan.md` for
  DigiSmith-tracked work instead of its own upstream default. See DigiSmith
  `MEMORY.md` map item W. **Further diverged by W.6** (2026-09-04): its Execution
  Handoff step now decides inline-vs-subagent-driven by autonomous complexity reasoning instead
  of presenting Superpowers' original live question.
```

Find the "dormant" sentence (search for `have gone through this, all on 2026-09-04`) and update
it to include `executing-plans`:

```
A vendored skill above is "dormant" until a future brainstorm activates
it — **finishing-a-development-branch** (W.4), **brainstorming**/**writing-plans** (W.5), and
**executing-plans** (W.6) have gone through this, all on 2026-09-04; every
other skill in this file is still an inert,
unused copy that nothing in DigiSmith calls into. Activating one means:
```

- [ ] **Step 6: Update .digismith/history.html**

Find the current-status table row for H (search for `<strong>H</strong></td><td>Subagent-driven
always`) and append a retirement note to its description cell, matching how Q's row was
handled in an earlier plan — e.g. change the cell's text from `Kills Superpowers' "1.
Subagent-Driven or 2. Inline?" question — there is no option 2` to `Killed Superpowers' "1.
Subagent-Driven or 2. Inline?" question — retired 2026-09-04, absorbed into W.6 (now autonomous
complexity-based reasoning instead of an unconditional default)`.

Find the current-status paragraph/links block for H (search for `<strong>H — Subagent-driven
always:</strong>`) and append the same style of retirement note used for Q's equivalent block
in an earlier plan — e.g. a trailing sentence or `<br>` line: `Retired 2026-09-04, absorbed
into W.6 — see MEMORY.md map item W.`

Do **not** touch any dated timeline/event entry elsewhere in this file describing when H was
originally built — those are a chronological record and must stay exactly as they were.

Leave the separate "Build Order" tier table's mention of H untouched — it is independently,
broadly stale in ways unrelated to this change (a pre-existing condition noted and explicitly
left alone during W.5's own final review).

- [ ] **Step 7: Update backlog/README.md**

Find and remove the line referencing `retire-subagent-driven-always-h-w6.md` (the file deleted
in Step 1):

```
- [Retire subagent-driven-always (H) into writing-plans, with complexity-based reasoning (new letter W.6)](retire-subagent-driven-always-h-w6.md) — captured mid-execution of W.5, deliberately not folded in; also proposes replacing H's "always subagents" rule with autonomous complexity-based reasoning
```

Delete that line entirely.

- [ ] **Step 8: Commit**

```bash
git add -A -- skills/subagent-driven-always backlog/retire-subagent-driven-always-h-w6.md backlog/README.md MEMORY.md vendored/PROVENANCE.md .digismith/history.html
git commit -m "feat(vendored-skills): retire subagent-driven-always (H), absorbed into writing-plans/executing-plans (W.6)"
```

---

### Task 7: Final verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the complete state after Tasks 1-6.
- Produces: nothing — this is the plan's closing gate.

- [ ] **Step 1: Confirm zero dangling subagent-driven-always references repo-wide**

```bash
grep -rln "subagent-driven-always" --include="*.md" --include="*.ts" . 2>/dev/null | grep -v "\.digismith/docs/"
```

Expected: no output (the only remaining mentions live in frozen historical docs under
`.digismith/docs/**`, excluded here).

- [ ] **Step 2: Run check_vendored_skills.ts and confirm the new divergence**

```bash
node scripts/check_vendored_skills.ts
```

Expected: `executing-plans` now reports local divergence (not `no drift`) for the first time.
`writing-plans` and `brainstorming` and `finishing-a-development-branch` still report local
divergence (unchanged from before this plan). Every other vendored skill still reports `no
drift`.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass (this change touches no executable code, so the existing baseline
should be unaffected).

- [ ] **Step 4: Report completion**

State plainly: `subagent-driven-always` retired, W.6 shipped, letter H freed. Link the design
spec's artifact URL again for reference. Note the one real gap from the design spec's Testing
section: no live end-to-end dry run of a real plan going through the new inline path
(`writing-plans` deciding inline → `executing-plans` producing a ledger →
`report-implementation` rendering from it) was possible within this plan — flag it as a known
risk, same class as K.6's runner and W.5's own `bootstrap`→`brainstorming` chain before their
live confirmations.

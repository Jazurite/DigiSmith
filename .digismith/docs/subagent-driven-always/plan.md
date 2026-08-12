# Subagent-Driven Always (H) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `subagent-driven-always` — DigiSmith's map item **H** —
a skill that removes `superpowers:writing-plans`' "1. Subagent-Driven /
2. Inline Execution — Which approach?" question for any DigiSmith-driven
plan, defaulting unconditionally to `subagent-driven-development`.

**Architecture:** One new skill, `skills/subagent-driven-always/SKILL.md`,
triggered by the same implicit-trigger pattern **M** and **N** already
use (a specific point inside another skill's flow, not an explicit call
from `using-digismith`). No new persisted state — no marker file, no
profile field.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter). No
application code, no test framework — verification is dogfooding via
dispatched subagents reasoning through the new skill instructions against
constructed scenarios, consistent with every DigiSmith skill so far.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description
  starts with "Use…", states the triggering condition only — never a
  workflow summary.
- **Not profile-gated.** Applies globally in any DigiSmith-installed
  environment. Considered and rejected during brainstorming: every
  current profile (`emma`, `personal`, `jazurite`, `digismith`) has
  `reporting: true`, so every profile already depends on the ledger
  `subagent-driven-development` produces — there's no profile today
  where an opt-out branch would be safe.
- **Not a task-count rule.** Also considered and rejected: routing
  single/sequential-task plans to `executing-plans` breaks G and N
  regardless of task count, since `executing-plans` never dispatches an
  implementer subagent and produces no ledger — it's the no-subagent
  fallback per its own skill file, not a "simpler plan" mode.
- **Not a patch to `superpowers:writing-plans` itself.** That file
  belongs to a third-party, machine-wide plugin. This skill intercepts
  via its own trigger-matched description, never by editing another
  plugin's file.
- **Not a change to the plan document header.** `writing-plans`' own
  boilerplate ("REQUIRED SUB-SKILL: Use subagent-driven-development
  (recommended) or executing-plans") stays exactly as Superpowers writes
  it inside the committed plan file.
- **Not scoped to `using-digismith`-started builds only.** A build that
  started mid-flight (ticket and branch already existed before DigiSmith
  touched it) still needs this skill to fire when it reaches Execution
  Handoff — same reasoning as this plan's own build, which started from
  an already-existing worktree.
- Cross-skill references inside `SKILL.md` content must be
  plugin-qualified: `superpowers:writing-plans`,
  `superpowers:subagent-driven-development`, `superpowers:executing-plans`.
- **Roadmap update:** map item **H** already has a row in `MEMORY.md`'s
  map table and `.digismith/history.html`'s map table (it's an original
  map item, not a new letter like **O** or **P** were) — only the status
  cells and Tier 2 build-order row change, not the row's own description
  text.

---

### Task 1: `subagent-driven-always` Skill

**Files:**
- Create: `skills/subagent-driven-always/SKILL.md`

**Interfaces:**
- Consumes: nothing from an earlier task (first task).
- Produces: the skill file itself — nothing else in the repo depends on
  its internals; it's a standalone behavioral rule with no callers to
  update.

- [ ] **Step 1: Create `skills/subagent-driven-always/SKILL.md`**

```markdown
---
name: subagent-driven-always
description: Use the moment superpowers:writing-plans reaches its Execution Handoff step and is about to present "1. Subagent-Driven / 2. Inline Execution — Which approach?" — skip the prompt and resolve it automatically.
---

# Subagent-Driven Always

## Overview

DigiSmith's map item **H**. `superpowers:writing-plans` ends every plan
with a live choice between Subagent-Driven Development and Inline
Execution. For any profile currently in use, the answer is always the
same: **N** (`digismith:report-implementation`) depends on the per-task
review and final-review ledger only `superpowers:subagent-driven-development`
produces, and **G** (`digismith:inject-standards`) has nothing to inject
into unless an implementer subagent actually gets dispatched. This skill
removes the question — the answer is decided before it's ever asked.

## When to Use

The moment `superpowers:writing-plans` reaches its Execution Handoff
step, right after a plan is saved, and is about to present "1.
Subagent-Driven (recommended) / 2. Inline Execution — Which approach?"
Applies globally, in any DigiSmith-installed environment — not gated by
profile, and not limited to plans that started via
`digismith:using-digismith` (a plan that began mid-flight, on an
already-existing branch, still reaches this same trigger point).

## Process

### Step 1: Skip the Prompt

Don't present the two-option question. Announce that Subagent-Driven
Development is being used, per DigiSmith map item H, then proceed to
Step 2.

### Step 2: Choose the Actual Path

1. **User has explicitly requested inline execution for this specific
   plan** (stated earlier in conversation, or in direct response to
   Step 1's announcement) → invoke `superpowers:executing-plans`
   instead. Not a live question this skill asks — only activates if the
   user volunteers it.
2. **No subagent capability in this environment** (no `Agent` tool or
   equivalent available) → invoke `superpowers:executing-plans`
   automatically. This is exactly the scenario that skill's own file
   documents as its reason to exist — not a workaround, its intended
   purpose.
3. **Otherwise (default path)** → invoke
   `superpowers:subagent-driven-development` directly.

Task count never changes this decision — `subagent-driven-development`
dispatches one implementer subagent per task whether a plan has 1 task
or 5, so a single-task plan takes the same default path as any other.

## What This Skill Does Not Touch

The plan document's own header line (`writing-plans`' boilerplate:
"REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or
executing-plans") is untouched — informational text inside the committed
plan file, not a live decision point.

## Error Handling

- **User insists on inline execution** → respected, not overridden.
  Intentional, user-directed exception — not a failure of this skill.
- **No subagent capability** → falls back to `executing-plans`
  automatically. An environmental constraint, not a choice — distinct
  from the explicit-override case above; don't conflate the two in what
  gets reported.

## Quick Reference

| Condition | Path |
|---|---|
| User explicitly asked for inline execution | `superpowers:executing-plans` |
| No subagent capability available | `superpowers:executing-plans` |
| Otherwise (default) | `superpowers:subagent-driven-development` |
```

- [ ] **Step 2: Dogfood — default path, multi-task plan**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only skills/subagent-driven-always/SKILL.md at
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\subagent-driven-always\skills\subagent-driven-always\SKILL.md
(read it for real), reasoning through this scenario: superpowers:writing-plans
just saved a 4-task plan and has reached its Execution Handoff step. The
user has said nothing about execution mode anywhere in the conversation.
Subagents are available in this environment. Report: does the skill
present the two-option question? What does it do instead, and which
Superpowers skill does it invoke?
```

Expected: reports the two-option question is never presented, Step 1's
announcement happens instead, and `superpowers:subagent-driven-development`
is invoked directly (default path, no override, no fallback condition
met).

- [ ] **Step 3: Dogfood — explicit user override**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only skills/subagent-driven-always/SKILL.md at
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\subagent-driven-always\skills\subagent-driven-always\SKILL.md
(read it for real), reasoning through this scenario: superpowers:writing-plans
just saved a plan and has reached its Execution Handoff step. Earlier in
the same conversation, the user said "just do this one inline, don't
bother with subagents." Subagents are available in this environment.
Report: which Superpowers skill gets invoked, and why — quote the exact
condition from the skill file that applies here.
```

Expected: reports `superpowers:executing-plans` is invoked, citing the
explicit-override condition in Step 2 — not the no-subagent-capability
condition, since subagents ARE available here; the override is about
what the user asked for, not an environmental constraint.

- [ ] **Step 4: Dogfood — no subagent capability**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only skills/subagent-driven-always/SKILL.md at
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\subagent-driven-always\skills\subagent-driven-always\SKILL.md
(read it for real), reasoning through this scenario: superpowers:writing-plans
just saved a plan and has reached its Execution Handoff step. The user
has said nothing about execution mode. This environment has no Agent
tool or equivalent subagent-dispatch capability at all. Report: which
Superpowers skill gets invoked, and why — quote the exact condition from
the skill file that applies here.
```

Expected: reports `superpowers:executing-plans` is invoked, citing the
no-subagent-capability condition — explicitly distinguished in its own
report from the explicit-override case (this is an environmental
constraint, not a user choice).

- [ ] **Step 5: Dogfood — single-task plan takes the same default path**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only skills/subagent-driven-always/SKILL.md at
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\subagent-driven-always\skills\subagent-driven-always\SKILL.md
(read it for real), reasoning through this scenario: superpowers:writing-plans
just saved a plan with exactly ONE task and has reached its Execution
Handoff step. The user has said nothing about execution mode. Subagents
are available. Report: does the skill treat a single-task plan any
differently from a multi-task plan? Which Superpowers skill gets
invoked?
```

Expected: reports no special-casing for task count — same default path,
`superpowers:subagent-driven-development` invoked, matching Step 2's
result exactly.

- [ ] **Step 6: If any dogfood run in Steps 2-5 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. Otherwise
fix `skills/subagent-driven-always/SKILL.md`'s wording directly, then
re-run the specific dogfood step that failed to confirm the fix.

- [ ] **Step 7: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\subagent-driven-always
git add skills/subagent-driven-always/SKILL.md
git commit -m "feat(subagent-driven-always): add skill to kill writing-plans' execution-mode question"
```

---

### Task 2: Update `.digismith/history.html` and `MEMORY.md` for Map Item H

**Files:**
- Modify: `.digismith/history.html`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Task
  1's completed work.
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Update map item H's status in `.digismith/history.html`'s map table**

Change:

```html
    <tr><td><strong>H</strong></td><td>Subagent-driven always</td>
      <td>Kills Superpowers' "1. Subagent-Driven or 2. Inline?" question — there is no option 2</td>
      <td><span class="status todo">Not started</span></td></tr>
```

to:

```html
    <tr><td><strong>H</strong></td><td>Subagent-driven always</td>
      <td>Kills Superpowers' "1. Subagent-Driven or 2. Inline?" question — there is no option 2</td>
      <td><span class="status done">Done</span></td></tr>
```

Add a new descriptive paragraph after the existing P paragraph (after its
closing `</p>`, before `</section>`):

```html
  <p style="font-size:.88rem; color:var(--muted);">
    <strong>H — Subagent-driven always:</strong>
    <a href="docs/subagent-driven-always/design.html">design spec</a> ·
    <a href="docs/subagent-driven-always/plan.md">implementation plan</a> ·
    <a href="docs/subagent-driven-always/report.html">implementation report</a>
  </p>
```

- [ ] **Step 2: Update the Progress Overview stats**

Change:

```html
    <div class="stat"><div class="n">6 / 16</div><div class="l">map items shipped</div></div>
```

to:

```html
    <div class="stat"><div class="n">7 / 16</div><div class="l">map items shipped</div></div>
```

(H is a 7th done item alongside A, G, M, N, O, and P — 16 map items
total is unchanged, H isn't a new letter.)

- [ ] **Step 3: Update the Build Order (`#tiers`) Tier 2 row**

Change:

```html
    <tr><td><strong>2</strong></td><td>The override</td>
      <td><strong>H</strong> subagent-driven always · <strong>K</strong> open-weight model extension</td>
      <td><span class="status todo">Not started</span></td></tr>
```

to:

```html
    <tr><td><strong>2</strong></td><td>The override</td>
      <td><strong>H</strong> subagent-driven always <span class="status done">Done</span> · <strong>K</strong> open-weight model extension</td>
      <td><span class="status next">In progress (1/2)</span></td></tr>
```

- [ ] **Step 4: Add a timeline entry**

Append to the `.timeline` div, after its existing final entry:

```html
    <div class="event">
      <div class="date">2026-08-12</div>
      <h4>H brainstormed, specced, and built — 2 tasks, subagent-driven-development</h4>
      <p>Jack asked to remove <code>superpowers:writing-plans</code>' live
      "Subagent-Driven or Inline Execution" choice for every DigiSmith-driven
      plan. A profile toggle and a task-count rule were both explored and
      rejected during brainstorming — every current profile already depends
      on <code>subagent-driven-development</code>'s ledger for <strong>N</strong>,
      and <code>executing-plans</code> turned out to be the no-subagent
      fallback, not a lighter-weight mode, so routing any plan there by task
      count would have broken <strong>G</strong> and <strong>N</strong>
      regardless of size. One new skill,
      <code>subagent-driven-always</code>, intercepts the Execution Handoff
      trigger directly — the same implicit-trigger pattern <strong>M</strong>
      and <strong>N</strong> already use — rather than patching
      <code>writing-plans</code> itself. This plan's own build is its first
      real dogfood run: it started from an already-existing worktree, not
      via <code>using-digismith</code>, directly testing H's
      not-scoped-to-using-digismith requirement.</p>
    </div>
```

- [ ] **Step 5: Update `MEMORY.md`'s Build order Tier 2 row**

Change:

```markdown
| **2** | The override | **H** subagent-driven always · **K** open-weight model extension |
```

to:

```markdown
| **2** | The override | **H** subagent-driven always (built 2026-08-12) · **K** open-weight model extension |
```

- [ ] **Step 6: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\subagent-driven-always
git add .digismith/history.html MEMORY.md
git commit -m "docs: update history — subagent-driven-always (H) shipped"
```

---

**After Task 2's final review passes:** per `MEMORY.md`'s Conventions
("Every `subagent-driven-development` plan invokes
`digismith:report-implementation`"), invoke
`digismith:report-implementation` before this plan's ledger is deleted.
Since this plan's own build never went through `digismith:jira-intake`
(DigiSmith working on itself, `ticket: false` under the new `digismith`
profile), the report renders with no ticket-key field — same shape as
every DigiSmith-own-repo report so far.

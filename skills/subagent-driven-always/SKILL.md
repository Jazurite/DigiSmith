---
name: subagent-driven-always
description: Use the moment digismith:writing-plans reaches its Execution Handoff step and is about to present "1. Subagent-Driven / 2. Inline Execution — Which approach?"
---

# Subagent-Driven Always

## Overview

DigiSmith's map item **H**. `digismith:writing-plans` ends every plan
with a live choice between Subagent-Driven Development and Inline
Execution. For every profile in use today — and, since this isn't
profile-gated, everywhere else too — the answer is always the same:
**N** (`digismith:report-implementation`) depends on the per-task
review and final-review ledger only `digismith:subagent-driven-development`
produces, and **G** (`digismith:inject-standards`) has nothing to inject
into unless an implementer subagent actually gets dispatched. This skill
removes the question — the answer is decided before it's ever asked.

## When to Use

The moment `digismith:writing-plans` reaches its Execution Handoff
step, right after a plan is saved, and is about to present "1.
Subagent-Driven (recommended) / 2. Inline Execution — Which approach?"
Applies globally, in any DigiSmith-installed environment — not gated by
profile, and not limited to plans that started via `digismith:init`
(whether dispatched through `digismith:bootstrap` or `digismith:adopt` —
a plan adopted mid-flight, on an already-existing branch, still reaches
this same trigger point).

## Process

### Step 1: Skip the Prompt

Don't present the two-option question. This is unconditional, and comes
before any decision below — the question never gets asked no matter
which path Step 2 lands on.

### Step 2: Decide, Then Announce

Decide which path applies first. Only once the path is decided, announce
the matching outcome — never announce Subagent-Driven Development before
this decision is made, since the decision can send execution somewhere
else entirely.

1. **User has explicitly requested inline execution for this specific
   plan** (stated earlier in conversation) → announce that inline
   execution is being used, per the user's earlier request, then invoke
   `digismith:executing-plans` instead. Not a live question this skill
   asks — only activates if the user volunteers it.
2. **No subagent capability in this environment** (no `Agent` tool or
   equivalent available) → announce that inline execution is being used
   because this environment has no subagent-dispatch capability, then
   invoke `digismith:executing-plans` automatically. This is exactly
   the scenario that skill's own file documents as its reason to exist —
   not a workaround, its intended purpose.
3. **Otherwise (default path)** → announce that Subagent-Driven
   Development is being used, per DigiSmith map item H, then invoke
   `digismith:subagent-driven-development` directly.

Task count never changes this decision — `digismith:subagent-driven-development`
dispatches one implementer subagent per task whether a plan has 1 task
or 5, so a single-task plan takes the same default path as any other.

## What This Skill Does Not Touch

The plan document's own header line (`digismith:writing-plans`'
boilerplate: "REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
(recommended) or superpowers:executing-plans") is untouched — informational
text inside the committed plan file, not a live decision point.

## Error Handling

- **User insists on inline execution** → respected, not overridden.
  Intentional, user-directed exception — not a failure of this skill.
- **No subagent capability** → falls back to `digismith:executing-plans`
  automatically. An environmental constraint, not a choice — distinct
  from the explicit-override case above. Name the consequence explicitly
  when reporting either `executing-plans` fallback (this one or the
  explicit-override case): there is no per-task review ledger under
  `executing-plans`, so `digismith:report-implementation` will have
  nothing to render from when it eventually runs.

## Quick Reference

| Condition | Path |
|---|---|
| User explicitly asked for inline execution | `digismith:executing-plans` |
| No subagent capability available | `digismith:executing-plans` |
| Otherwise (default) | `digismith:subagent-driven-development` |

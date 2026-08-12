---
name: subagent-driven-always
description: Use the moment superpowers:writing-plans reaches its Execution Handoff step and is about to present "1. Subagent-Driven / 2. Inline Execution — Which approach?"
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

Task count never changes this decision — `superpowers:subagent-driven-development`
dispatches one implementer subagent per task whether a plan has 1 task
or 5, so a single-task plan takes the same default path as any other.

## What This Skill Does Not Touch

The plan document's own header line (`superpowers:writing-plans`'
boilerplate: "REQUIRED SUB-SKILL: Use subagent-driven-development
(recommended) or executing-plans") is untouched — informational text
inside the committed plan file, not a live decision point.

## Error Handling

- **User insists on inline execution** → respected, not overridden.
  Intentional, user-directed exception — not a failure of this skill.
- **No subagent capability** → falls back to `superpowers:executing-plans`
  automatically. An environmental constraint, not a choice — distinct
  from the explicit-override case above; don't conflate the two in what
  gets reported.

## Quick Reference

| Condition | Path |
|---|---|
| User explicitly asked for inline execution | `superpowers:executing-plans` |
| No subagent capability available | `superpowers:executing-plans` |
| Otherwise (default) | `superpowers:subagent-driven-development` |

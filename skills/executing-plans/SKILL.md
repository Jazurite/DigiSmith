---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints (DigiSmith fork of Superpowers' executing-plans)
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use digismith:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Ensure an isolated workspace: use digismith:using-git-worktrees to create one or verify the existing one
2. Read plan file
3. Review critically - identify any questions or concerns about the plan
4. If concerns: Raise them with your human partner before starting
5. If no concerns: Create todos for the plan items and proceed

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

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use digismith:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

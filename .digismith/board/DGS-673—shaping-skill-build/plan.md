# Build the digismith:shaping skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `skills/shaping/SKILL.md`, the skill that takes a ClickUp ticket from `backlog` to `concept` by writing a `## Pitch` and firing the `shaped` Steward event.

**Architecture:** One new self-contained Markdown skill file in the plain style of `skills/jira-intake/SKILL.md`. It uses `dg clickup` for reads and writes, `dg steward event shaped` (DGS-674) to move the ticket, and the tokens `entry.ts` for the `shaping` step marks (DGS-674).

**Tech Stack:** Markdown skill prose. Package manager: pnpm only.

## Global Constraints

- Design: `.digismith/board/DGS-673—shaping-skill-build/design.html`; parent design `.digismith/board/DGS-671—shaping-skill/design.html`.
- The skill file must never mention `digismith:brainstorming` or the word "brainstorming" in any case (no cross-reference between the two skills, Jack's decision).
- Appetite sizes are exactly: Small, Medium, Big. Sign-off values are exactly Auto and Jack. Mode values are exactly Autonomous and Manual.
- Times in UTC+7 where a time appears. No AI attribution in commits; title-only conventional commits, scope `dgs-673`. Never commit to `main`. pnpm only.

---

### Task 1: Write skills/shaping/SKILL.md

**Files:**
- Create: `skills/shaping/SKILL.md`

**Interfaces:**
- Consumes: `dg steward event shaped --ticket <KEY> --by shaping` (added by DGS-674; not callable until DGS-674 is merged) and `--step shaping` in `tokens/entry.ts` (DGS-674).
- Produces: the skill `digismith:shaping`.

- [x] **Step 1: Write the file**

Create `skills/shaping/SKILL.md` with exactly this content:

`````markdown
---
name: shaping
description: Use when a ClickUp ticket is in backlog (a raw idea), or in concept without a ## Pitch, and it needs shaping before anyone refines or claims it — "shape DGS-12", picking an idea from the backlog, or a claim that found no pitch. Turns the idea into a pitch on the ticket (problem, appetite, idea, scope, risks, roadmap fit) and moves it to concept. Not for Jira tickets and not for solution design.
---

# Shaping

## Overview

A ticket is born in `backlog` as a raw idea. This skill shapes it: it decides how much the idea is worth (the appetite), pins down the problem, sketches the idea at product level, and writes all of that as a `## Pitch` on the ticket. Only then does the ticket reach `concept`, so `concept` means "shaped".

Shaping answers what and why. It does not design the solution: elements, flows, architecture and rabbit holes belong to refinement. It writes no code, writes no orders and starts no workers.

Method: adapted from Basecamp's Shape Up (appetite as a budget set before the solution, a narrowed problem, a rough idea, explicit no-gos). Only the parts that fit DigiSmith are used.

## When to Use

- A ClickUp ticket is in `backlog` and Jack wants it shaped.
- A ticket is in `concept` but its description has no `## Pitch` (it was moved there before shaping existed).
- A claim or a refinement found a ticket without a pitch.

Do not use it for a Jira ticket, and not to design or plan the build.

## Hard Gate

Write nothing to the ticket and fire no event until Jack has said yes to the finished pitch. Reading is free. A question to Jack is free.

## Process

Mark the start of this step, with `<Key>` taken from the ticket you are shaping:

```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts step-start --ticket <Key> --step shaping
```

A warning or non-zero exit never blocks the flow.

### Step 1: Read

1. `dg clickup get-task <Key>`. Check the status is `backlog`, or `concept` with no `## Pitch` in the description.
2. The description already has a `## Pitch`: stop. Tell Jack, and ask whether to replace it. Never overwrite silently.
3. Look at the code and at existing tickets (`dg clickup list-tasks --list <list id>`) for what already exists or overlaps. A duplicate: tell Jack and stop.

### Step 2: Set boundaries

1. Fix the appetite first. It is a budget that limits the idea, not an estimate:
   - **Small**: one worker, one session.
   - **Medium**: a few tickets, about one day.
   - **Big**: does not fit one pitch. Narrow the problem, or split the idea into smaller tickets and shape the first.
2. If the idea does not fit its appetite, cut scope. Never raise the appetite to fit.
3. Narrow the problem. Ask what is really going wrong and where today's workflow breaks. Pin it to one specific story that shows why today does not work.
4. Ask the shaper's questions: why does it matter, who is affected, what does success look like, what does it cost compared with the alternatives. Record the baseline: how things get done today without it.
5. A grab-bag ("redesign X", "X 2.0") has no clear start or end: reframe it around one problem or split it.
6. A problem that cannot be pinned down and is not critical: walk away (see Walk away).

### Step 3: Draw the idea

In a few sentences, at product level: what the user gets, what is in scope and what is out. Mark what is appealing but not core with a leading `~` (a nice-to-have). No element list, no flow sketch, no technical design: those are refinement's work.

### Step 4: Note the risks and the fit

1. Risks: list what looks risky or unknown. Flag it only; do not solve it.
2. Roadmap fit: read the epics and initiatives in the ticket's list and propose a parent and a milestone, with one reason. Never propose a done milestone. A ticket that fits no initiative becomes an open question: it may not be worth a bet yet.
3. Sign-off, with one reason: **Auto** for a fully defined contract (a new API command, internal tools, refactors, tests, docs); **Jack** for taste, look and wording, personal data, business choices, anything public, cost or irreversible.
4. Mode, with one reason: **Autonomous** (the factory may claim it) or **Manual** (attended work, the factory never claims it).

### Step 5: Ask

Ask Jack at most three questions, one per message, only about what the draft could not settle. Prefer multiple choice and put your recommendation first. Good default questions: does the problem matter, is the appetite right, is the idea attractive.

If Jack says "interview me", switch to an interview: one question at a time, multiple choice where possible, until every field of the pitch is settled.

### Step 6: Self-review, then show Jack

Check the pitch against this list and fix it before showing it:

- Rough: no element list, no flow sketch, no technical design.
- Bounded: an appetite and a scope out.
- A problem story, and an idea that answers it (an idea without a problem, or a problem without an idea, is unshaped).
- No "TBD" and no field that contradicts another.

Show the pitch. Wait for Jack's yes. If he changes something, change it and show it again.

### Step 7: Write, move, hand over

1. Read the ticket's current description. Write a file in the scratchpad directory that holds the current description unchanged, a blank line, then the pitch (template below). Update the ticket:

```bash
dg clickup update-task --task <Key> --markdown-description-file <scratchpad file>
```

2. Read the ticket back. Check that the original text is still there and the `## Pitch` heading is present.
3. Mark the end of this step (same key rule as the start), then fire the event:

```bash
node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/tokens/entry.ts step-end --ticket <Key> --step shaping
dg steward event shaped --ticket <Key> --by shaping
```

On a ticket already in `concept` the event does nothing and succeeds. That is expected.

4. Tell Jack the result in one line and the next step: "discover it" or "refine it". Stop there.

## The Pitch Template

```markdown
## Pitch

**Problem.** <one specific story that shows why today does not work; start with the baseline>

**Appetite.** <Small | Medium | Big> — <one line on why>

**Idea.** <a few sentences: what the user gets. Elements marked ~ are nice-to-haves>

**Scope in.** <list>
**Scope out (no-gos).** <list>

**Risks.** <what looks risky or unknown, flagged for refinement; not solved here>

**Roadmap fit.** Parent: <epic or initiative> · Milestone: <milestone> — <one reason>

**Sign-off.** <Auto | Jack> — <one reason>
**Mode.** <Autonomous | Manual> — <one reason>

**Open questions.** <what shaping could not settle, or "none">
```

## Walk Away

Shaping can end in "not now": the problem cannot be pinned down, or the idea is not worth a bet yet. Leave the ticket in `backlog`, add a one-line comment on why, and fire no event. Jack decides whether to discard it. This skill never discards a ticket.

## What This Skill Never Does

- Write code, write orders, or start workers.
- Design the solution (elements, flows, architecture, rabbit holes): refinement does that.
- Change a ticket's status by hand: only the `shaped` event moves it.
- Discard or close a ticket.
- Write to the ticket before Jack's yes.
`````

- [x] **Step 2: Verify the structure**

Run:

```bash
head -3 skills/shaping/SKILL.md | grep -c "^name: shaping$"
grep -c "^## Hard Gate$" skills/shaping/SKILL.md
grep -c "^## The Pitch Template$" skills/shaping/SKILL.md
grep -c "^## Walk Away$" skills/shaping/SKILL.md
grep -c "dg steward event shaped --ticket <Key> --by shaping" skills/shaping/SKILL.md
grep -c "step-start --ticket <Key> --step shaping" skills/shaping/SKILL.md
grep -c "step-end --ticket <Key> --step shaping" skills/shaping/SKILL.md
grep -c "markdown-description-file" skills/shaping/SKILL.md
grep -ci "brainstorming" skills/shaping/SKILL.md
```

Expected: `1`, `1`, `1`, `1`, `1`, `1`, `1`, `1` (or more), and `0` for the last one.

- [x] **Step 3: Commit**

```bash
git add skills/shaping/SKILL.md
git commit -m "feat(dgs-673): add the shaping skill"
```

---

### Task 2: Check the live commands after DGS-674 is merged

**Files:**
- None changed (a check only; do it when DGS-674 is on this branch's base).

**Interfaces:**
- Consumes: the merged `shaped` event and `shaping` step from DGS-674.
- Produces: confirmation that the commands written in the skill run.

- [x] **Step 1: Dry-run the event**

Run: `dg steward event shaped --ticket DGS-673 --by shaping --dry-run`
Expected: a line such as `dry run: DGS-673: ...` (a move from `backlog`, or a no-op if the ticket is already in `concept` or later; a refusal naming the status for any other). It must not say the event is unknown.

- [x] **Step 2: Check the step mark**

Run: `DIGISMITH_TOKEN_REGISTRY_DIR=$(mktemp -d) node --experimental-strip-types packages/cli/src/tokens/entry.ts step-start --ticket T-CHECK --step shaping --session-id check-1`
Expected: exit code 0 and no "invalid --step" message. (The temporary registry directory keeps the real registry clean.)

- [x] **Step 3: Record the result**

If both checks pass, say so in the task report. If either fails, stop: DGS-674 is not merged yet, and this ticket waits for it.

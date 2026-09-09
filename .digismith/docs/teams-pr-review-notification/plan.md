# Teams PR-Review Notification (I.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a ready-to-paste Microsoft Teams review-request message — matching Jack's own real message style exactly — either automatically offered right after a PR is created, or on direct request, covering both a single PR and a multi-repo epic (several PRs across market repos sharing one ticket).

**Architecture:** A new skill, `skills/teams-pr-review-notification/SKILL.md`, does all the templating and asking. It's wired into exactly one existing file: `finishing-a-development-branch`'s Option 2 gains a one-line offer to invoke it right after reporting a new PR's URL. No new packages, no live Teams connection of any kind — pure text templating plus `AskUserQuestion` prompts, reusing the existing `digismith:preferences` skill for a saved-default reviewer list.

**Tech Stack:** Skill prose only (Markdown). No new code, no automated tests — same disposition as H.1 and W.4/W.4.1, which also diverged `finishing-a-development-branch` with no executable logic of their own. Verification is a careful read-through plus a real end-to-end run.

## Global Constraints

- **Map item:** I.4, under map item **I** (broadened from "QA handoff" to "Reporting" 2026-09-08). Not Y-lineage — see the design doc's "Why I.4, Not Y" section for the reasoning already settled during brainstorming.
- **Design doc:** `.digismith/docs/teams-pr-review-notification/design.html` — read in full before starting; this plan implements it exactly, no re-litigating settled decisions (mechanism, template, trigger points, reviewer resolution).
- **No live Teams connection, ever.** No Graph API call, no browser automation, no credential of any kind. The skill's job ends the moment the message text is printed for Jack to copy.
- **Reviewer storage:** exactly one preferences key, `teams_reviewers`, a single opaque string value (comma-separated names, e.g. `Hoang Ngo EXT, Linh Van Vu EXT`) reused verbatim inside the message — never parsed, split, or validated. All reads/writes go through `digismith:preferences`' `get`/`set` operations, never a raw file read or a direct `scripts/preferences.ts` invocation from inside this skill's own prose (same rule H.1 already established for `finish_option`).
- **Template is fixed, not configurable:** `Hello 500 ae` is literal text reused verbatim every time — never derived, computed, or made a setting.
- **Never invoke the new skill unasked.** Both the auto-offer (`finishing-a-development-branch`) and this skill's own on-demand entry always confirm before drafting; declining is a normal outcome, not an error.
- **Never fabricate content.** The ask line (what the message asks reviewers to do) and, for the multi-repo case, the PR links themselves are always gathered by asking directly when not already known — never invented or guessed.
- **I.2 doesn't exist yet.** Multi-repo PR gathering is a direct ask to Jack for now (ticket key/title + each repo's link) — do not build any automated multi-repo discovery here; that belongs to I.2 once it ships.

---

## File Structure

- `skills/teams-pr-review-notification/SKILL.md` — **new.** The entire capability: scope determination, PR-info gathering, reviewer resolution, message rendering, presentation.
- `skills/finishing-a-development-branch/SKILL.md` — **modified.** Option 2 gains a one-line offer to invoke the new skill right after reporting the PR URL, plus one new Common Rationalizations row.
- `backlog/teams-pr-review-notification.md` — **deleted.** Applied; its own open questions are all resolved by the design doc this plan implements.
- `backlog/README.md` — **modified.** Its pointer line for the deleted backlog file is removed.

---

### Task 1: Create the Teams PR-review notification skill

**Files:**
- Create: `skills/teams-pr-review-notification/SKILL.md`

**Interfaces:**
- Consumes: `digismith:preferences`' `get`/`set` operations (key `teams_reviewers`) — invoked as a skill by name, never re-derived inline. `jira-progress-write-back`'s own market-label derivation convention (Step 4: `shopify-template-<code>` → `<code>` uppercased, else the repo directory name as-is) and its `^([A-Z]+-\d+)__` branch-name-parsing regex (Step 1) — reused verbatim, not re-invented.
- Produces: an invokable skill, `digismith:teams-pr-review-notification`, taking optional pre-known PR title/URL/ticket-key context from a caller (used by Task 2's auto-offer) or resolving everything itself when invoked directly with no context.

- [ ] **Step 1: Write the new skill file**

```markdown
---
name: teams-pr-review-notification
description: Use right after finishing-a-development-branch's Option 2 (Push and Create PR) reports a new PR's URL, or when explicitly asked to draft a Teams review-request message — generates ready-to-paste text only, matching Jack's own real message style; never connects to Teams itself.
---

# Teams PR-Review Notification

## Overview

DigiSmith's map item **I.4**. Generates a ready-to-paste Microsoft Teams
message asking reviewers to look at one or more open pull requests,
matching Jack's own established message style exactly. DigiSmith never
connects to Teams itself — no API call, no browser automation — this
skill only produces text for Jack to paste in himself. See
`.digismith/docs/teams-pr-review-notification/design.html` for the full
design, including why a live Graph API integration and browser automation
were both considered and ruled out.

## Invoked By

- **Automatically-offered**, by `finishing-a-development-branch`'s Option 2
  right after it reports a newly-created PR's URL — a lightweight yes/no
  ask, never invoked without confirmation.
- **Directly**, on explicit request ("draft a Teams review request for
  this PR", "notify Teams about these PRs") — covers both a single PR and
  a multi-repo epic (several PRs across market repos, sharing one ticket).

## Step 1: Determine Scope — Single PR or Multi-Repo Epic

**Invoked by `finishing-a-development-branch`'s auto-offer** → always
single-PR; the caller already has the PR's title, URL, and current ticket
key (if the branch name matched `<Key>__<slug>`) — use exactly what was
passed, skip straight to Step 3.

**Invoked directly** → ask, unless already obvious from how it was asked
("draft a Teams message for these four PRs" is already multi-repo; "for
this PR" is already single): "Is this for one PR, or several PRs across
different repos for the same ticket?"

## Step 2: Gather PR Info

**Single PR, invoked directly:**

```bash
git branch --show-current
gh pr view --json title,url
```

Parse `<Key>` from the branch name against `^([A-Z]+-\d+)__` the same way
`jira-progress-write-back` Step 1 does. `gh pr view` fails or returns
nothing (no `gh` on PATH, no open PR for this branch) → ask directly for
the PR title and URL rather than guessing.

**Multi-repo epic:** no automated gathering yet — multi-repo distribution
(map item **I.2**) doesn't exist yet to fan this out automatically. Ask
directly for the ticket key, its title, and each repo's PR link, one
message, e.g.: "What's the ticket key/title, and what are the PR links
(one per repo)?"

## Step 3: Resolve Reviewer Name(s)

Invoke `digismith:preferences`' `get` operation for key `teams_reviewers`
in the repo currently being worked in.

**Returns a value** → use it as-is (a single comma-separated string, e.g.
`Hoang Ngo EXT, Linh Van Vu EXT`) — reused verbatim inside the message's
parentheses, never re-parsed or re-split.

**Returns `unset`** → first use in this repo. Ask via `AskUserQuestion`
for the reviewer name(s) to tag this time (a single free-text answer,
comma-separated if more than one). Then ask a lightweight follow-up:
"Remember this as the default reviewer list for this repo?" **Yes** →
write it via `digismith:preferences`' `set` operation for key
`teams_reviewers`. **No** → proceed with just this run's answer; ask
again next time, never treat a decline as "stop asking."

## Step 4: Determine the Ask Line

Ask directly what to say after the `--` (e.g. "what should the message
ask them to do?") — never fabricate one. May be in Vietnamese or English,
whatever Jack says; never auto-translate or rephrase it.

## Step 5: Render the Message

```
Hello 500 ae (<reviewer names from Step 3>) -- <ask line from Step 4>

<Key>: <Ticket title>

🔗 <market1> PR: <link1>
🔗 <market2> PR: <link2>
```

- `Hello 500 ae` is fixed, literal text — reused verbatim every time, never
  derived or computed.
- The ticket line (`<Key>: <Ticket title>`) is omitted entirely when there
  is no real ticket key — never write a placeholder in its place.
- One `🔗 <market> PR: <link>` line per PR gathered in Step 2, in the same
  order they were gathered. `<market>` is derived the same way
  `jira-progress-write-back` Step 4 already does: if the repo's directory
  name matches `shopify-template-<code>`, the label is `<code>` uppercased
  (e.g. `shopify-template-jp` → `JP`); otherwise the repo directory name
  as-is (e.g. `shopify-hub`).

## Step 6: Present

Print the rendered message as a plain text block for Jack to copy. Nothing
is sent, posted, or connected to Teams — the skill's job ends here.

## Error Handling

| Case | Disposition |
|---|---|
| Invoked directly, no PR found for the current branch (`gh pr view` fails or returns nothing) | Ask directly for the PR title and URL rather than guessing |
| No `teams_reviewers` preference set, and Jack declines to save one at first use | Proceed with just this run's typed-in answer; ask again next time, never treat the decline as "stop asking" |
| No ticket key/context available | Omit the ticket line entirely rather than inventing a placeholder |

## Out of Scope

- Any live Teams connection (Graph API, browser automation) — see the
  design doc's Mechanism section for why both were ruled out.
- Automating multi-repo PR discovery — belongs to map item **I.2** once it
  ships, not duplicated here.
- Editing or updating a previously-sent message — DigiSmith never sends
  anything, so there is nothing to find and edit later.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine single-PR vs. multi-repo-epic scope |
| 2 | Gather PR title/URL/ticket key — from the caller (auto-offered), `gh pr view` (on-demand single), or a direct ask (multi-repo epic) |
| 3 | Resolve reviewer name(s) via `digismith:preferences` (`get`/`set` on `teams_reviewers`), prompting on first use |
| 4 | Ask directly for the message's free-text ask line |
| 5 | Render the fixed template — `Hello 500 ae` literal greeting, ticket line omitted if no key, one `🔗 <market> PR: <link>` line per PR |
| 6 | Present as plain text — nothing sent |
```

- [ ] **Step 2: Self-check — read the whole file end to end**

Confirm: frontmatter `description` states both invocation paths; every
step has concrete content (no "TBD"/"handle appropriately"); the message
template matches the design doc's template exactly, including the literal
`Hello 500 ae` text and the `🔗 <market> PR: <link>` line shape; the
Error Handling table covers every case named in the design doc's own
Error Handling section (missing PR, no reviewer default, no ticket
context). Fix anything that doesn't match before continuing.

- [ ] **Step 3: Commit**

```bash
git add skills/teams-pr-review-notification/SKILL.md
git commit -m "feat(teams-pr-review-notification): add I.4 skill for Teams review-request messages"
```

---

### Task 2: Wire the auto-offer into `finishing-a-development-branch`, retire the backlog item

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (Option 2 section, and its Common Rationalizations table)
- Delete: `backlog/teams-pr-review-notification.md`
- Modify: `backlog/README.md`

**Interfaces:**
- Consumes: `digismith:teams-pr-review-notification` (Task 1) — invoked by name, passing PR title/URL/ticket-key as context, exactly as that skill's own Step 1 expects for its auto-offered path.
- Produces: nothing another task consumes — this task's own deliverable stands alone.

- [ ] **Step 1: Insert the auto-offer at the end of Option 2, immediately before `### Option 3: Keep As-Is`**

Current end of Option 2 reads:

```markdown
Keep the worktree — your human partner iterates on PR feedback there.

### Option 3: Keep As-Is
```

Change to:

```markdown
Keep the worktree — your human partner iterates on PR feedback there.

Once the PR is created and its URL reported, offer one lightweight
follow-up: *"Draft a Teams review-request message for this PR?"*
**Yes** → invoke `digismith:teams-pr-review-notification`, passing this
PR's title, URL, and the current ticket key if the branch name matched
`<Key>__<slug>`. **No** → say nothing further, proceed normally. Never
invoke it unasked — this is an offer, not an automatic action, the same
disposition Step 4.5's "remember this?" follow-up already has for a
different case.

### Option 3: Keep As-Is
```

- [ ] **Step 2: Add a Common Rationalizations row**

In the existing table (after the last row, `"A saved preference means I
can skip the follow-up ask"`), add:

```markdown
| "The PR was just created, they'd obviously want a Teams message too" | Always ask first — this is an offer, never an automatic action. Declining is a normal outcome, not something to talk them out of. |
```

- [ ] **Step 3: Self-check — read Option 2's full section end to end**

Confirm the new paragraph sits after "Keep the worktree..." and before
`### Option 3`, doesn't alter any existing Option 2 behavior (push, PR
creation, worktree retention all unchanged), and the new Common
Rationalizations row is the last row in that table.

- [ ] **Step 4: Delete the now-applied backlog file**

```bash
rm backlog/teams-pr-review-notification.md
```

- [ ] **Step 5: Remove its pointer line from `backlog/README.md`**

Delete this exact line:

```markdown
- [Microsoft Teams PR-review notification (I.4)](teams-pr-review-notification.md) — notify a Teams channel to request code review right after a PR opens; a reporting/communication channel, not a Y-lineage self-development hook
```

Verify this exact line is still present before removing it — other
DigiSmith sessions may be concurrently active on the same repo. If it
doesn't match, stop and report rather than guessing at a fuzzy
replacement.

- [ ] **Step 6: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md backlog/README.md
git rm backlog/teams-pr-review-notification.md
git commit -m "feat(finishing-a-development-branch): offer a Teams review-request draft after PR creation (I.4)"
```

---

## Self-Review

**Spec coverage:** Mechanism (text-only, no live connection) → Task 1's
Overview and Out of Scope. Trigger points (auto-offered + on-demand) →
Task 1 Step 1 + Task 2 Step 1. Reviewer resolution via
`digismith:preferences` → Task 1 Step 3. Message template (fixed
`Hello 500 ae`, market-label convention, ticket-line omission) → Task 1
Step 5. Data flow → Task 1 Steps 1-6. Error handling → Task 1's Error
Handling table. All design doc sections are covered.

**Placeholder scan:** No "TBD"/"handle appropriately"/"similar to Task N"
found in either task.

**Type consistency:** `teams_reviewers` is the one preferences key, used
identically in Task 1 Step 3's `get`/`set` calls — no other name used
anywhere else in the plan. `digismith:teams-pr-review-notification` is
the skill name used identically in Task 1's frontmatter and Task 2 Step
1's invocation.

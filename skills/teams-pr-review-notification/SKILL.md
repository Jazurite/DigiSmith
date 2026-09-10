---
name: teams-pr-review-notification
description: Use right after finishing-a-development-branch's Option 2 (Push and Create PR) reports a new PR's URL and Jack accepts the offer to draft one, or when explicitly asked to draft a Teams review-request message — generates ready-to-paste text only, matching Jack's own real message style; never connects to Teams itself.
---

# Teams PR-Review Notification

## Overview

DigiSmith's map item **I.4**. Generates a ready-to-paste Microsoft Teams
message asking reviewers to look at one or more open pull requests,
matching Jack's own established message style exactly. DigiSmith never
connects to Teams itself — no API call, no browser automation — this
skill only produces text for Jack to paste in himself. The message is
drafted by `generate-comment` (**Q.1**) — this skill just triggers it and
presents the result. See
`.digismith/docs/teams-pr-review-notification/design.html` for the
original design (why a live Graph API integration and browser automation
were both ruled out) and `.digismith/docs/generate-comment/design.html`
for the templating mechanism this now consumes.

## Invoked By

- **Automatically-offered**, by `finishing-a-development-branch`'s Option 2
  right after it reports a newly-created PR's URL — a lightweight yes/no
  ask, never invoked without confirmation.
- **Directly**, on explicit request ("draft a Teams review request for
  this PR", "notify Teams about these PRs") — covers both a single PR and
  a multi-repo epic (several PRs across market repos, sharing one ticket).

## Process

### Step 1: Generate the Message

Invoke `generate-comment` (**Q.1**) with template type
`teams-review-request`. When auto-offered by
`finishing-a-development-branch`, pass along the PR title, URL, and
current ticket key it already has (if the branch name matched
`<Key>__<slug>`) so `generate-comment` doesn't re-ask for what's already
known. When invoked directly, `generate-comment` gathers everything
itself (scope, PR info, reviewer names, ask line — see its own Process
for the exact steps). Receive back `{markdown, headingPrefix}` —
`headingPrefix` is not used by this skill at all; only `markdown`
matters here.

### Step 2: Present

Print `markdown` as a plain text block for Jack to copy. Nothing is
sent, posted, or connected to Teams — the skill's job ends here.

## Error Handling

Everything that can go wrong drafting the message (no PR found for the
current branch, no `teams_reviewers` preference set, no ticket
key/context available) is `generate-comment`'s own Error Handling now —
see its SKILL.md. This skill has nothing left to handle on its own except
presenting whatever `generate-comment` returns.

## Out of Scope

- Any live Teams connection (Graph API, browser automation) — see the
  original design doc's Mechanism section for why both were ruled out.
- Automating multi-repo PR discovery — belongs to map item **I.2** once it
  ships, not duplicated here.
- Editing or updating a previously-sent message — DigiSmith never sends
  anything, so there is nothing to find and edit later.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Generate the message via `generate-comment` (template type `teams-review-request`) |
| 2 | Present as plain text — nothing sent |

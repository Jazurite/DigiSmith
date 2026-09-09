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
`teams_reviewers`, passing the value quoted (`--value "<names>"`) since it
contains spaces and commas that an unquoted CLI arg would silently
truncate after the first token. **No** → proceed with just this run's
answer; ask again next time, never treat a decline as "stop asking."

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
- When `<Key>` is known but no ticket title is available, ask for it
  directly rather than fabricating one (same rule as Step 4's ask line).
- The ticket line (`<Key>: <Ticket title>`) is omitted entirely when there
  is no real ticket key, or a key with no title available and none
  obtained by asking — never write a placeholder in its place.
- One `🔗 <market> PR: <link>` line per PR known from Step 1's caller
  context or gathered in Step 2, in the same order they were gathered.
  `<market>` is derived the same way
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

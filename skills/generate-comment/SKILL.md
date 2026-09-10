---
name: generate-comment
description: Use when jira-progress-write-back or teams-pr-review-notification need a drafted comment/message — selects a template, gathers its content, and fills it in. Never posts or sends anything itself.
---

# Generate Comment

## Overview

DigiSmith's map item **Q.1**. Owns template selection, content-gathering
questions, and filling a Markdown template — the shared mechanism behind
every reporting comment/message DigiSmith drafts. Returns filled Markdown
text plus a heading-prefix string for the caller's own dedup-search (only
meaningful to `jira-progress-write-back`; `teams-pr-review-notification`
ignores it). Never posts, sends, or connects to anything itself — purely a
drafting step. See `.digismith/docs/generate-comment/design.html` for the
full design.

## Invoked By

Only ever invoked by another skill (`jira-progress-write-back` or
`teams-pr-review-notification`) as part of their own process — never
directly by Jack.

## Prerequisites

`skills/generate-comment/templates/` must contain the three shipped
templates: `progress-update.md`, `investigation-update.md`,
`teams-review-request.md`.

## Process

### Step 1: Determine Template Type

The caller passes the type directly (`progress-update`,
`investigation-update`, or `teams-review-request`) whenever it already
knows which one it needs. If invoked without a type specified, ask
directly via `AskUserQuestion` — never guess: "Progress Update,
Investigation Update, or Teams Review Request?"

### Step 2: Gather Content — Progress Update

Only for template type `progress-update`.

Check whether this session already has `.digismith/docs/<slug>/report.html`
from map item **N** (`digismith:report-implementation`), the same slug
this ticket's work used. **Present** → read it and draft 1-4 short bullets
summarizing the delivered work section, in the same tone as a real
example:

> Trial/Returns banner implemented and verified live on JP, PH, and KR —
> icon + editable text, shown only on product pages, correct
> desktop/mobile ordering next to breadcrumbs.

**Not present** (N hasn't run this session, e.g. this plan used
`digismith:executing-plans` instead of `subagent-driven-development`, or
this skill is invoked standalone) → draft the same style of bullets
directly from the session's actual work instead — never fabricate
specifics not actually done this session. Compose the bullets as one
Markdown bullet-list block (one `- ` line per bullet, joined with
newlines) — this is the `whats-done` placeholder value.

Then ask the user, via `AskUserQuestion`, which roles need a ping on this
update and who for each (e.g. code review, design approval, QA) — there
is no automatic source for this. Skip a role entirely if the user says no
one needs tagging for it; never invent a placeholder mention. For each
name given, resolve a JIRA `accountId` by searching for that name — the
same resolution `jira-progress-write-back` already does today (no new
mechanism introduced here). **Exactly one clear match** → use it. **No
match, or the user declines to clarify an ambiguous multi-match** → stop
and ask directly rather than guessing an ID.

Draft one bullet per role-with-a-person using the `@[Name](accountId)`
mention token (never Jira's own native mention syntax — converting this
token to a real ADF mention node is `markdown-to-adf.ts`'s job later, not
this skill's):

```
- **<emoji> <Role> Needed >** (@[<Name>](<accountId>)) — <ask, plain text, one sentence>
```

Compose all such bullets as one Markdown bullet-list block — the
`next-steps` placeholder value. Compute today's date in `D/M` form (day
and month, no leading zeros, no year):

```bash
date +%-d/%-m
```

That's the `date` placeholder value.

### Step 3: Gather Content — Investigation Update

Only for template type `investigation-update`.

Ask the user, via direct conversation, three things, each drafted as its
own Markdown bullet-list block (1-4 bullets each, never fabricated):

- What's been checked — the `whats-checked` placeholder
- What's been found — the `whats-found` placeholder
- What's needed, and from whom — the `needs` placeholder, using the same
  role/person ask-and-resolve pattern as Step 2's Next Steps (ask who,
  resolve to a JIRA `accountId`, use the `@[Name](accountId)` mention
  token, stop and ask directly on no-match or ambiguous match)

Compute the `date` placeholder the same way as Step 2.

### Step 4: Gather Content — Teams Review Request

Only for template type `teams-review-request`.

**Determine scope** — single PR or multi-repo epic. If the caller already
knows (e.g. auto-offered with a specific PR's info already in hand), skip
straight to gathering; otherwise ask, unless already obvious from how it
was asked ("draft a Teams message for these four PRs" is already
multi-repo; "for this PR" is already single): "Is this for one PR, or
several PRs across different repos for the same ticket?"

**Gather PR info.** Single PR, not already supplied by the caller:

```bash
git branch --show-current
gh pr view --json title,url
```

Parse `<Key>` from the branch name against `^([A-Z]+-\d+)__` the same way
`jira-progress-write-back` does. `gh pr view` fails or returns nothing →
ask directly for the PR title and URL rather than guessing. Multi-repo
epic → no automated gathering (multi-repo distribution, map item **I.2**,
doesn't exist yet) — ask directly for the ticket key, its title, and each
repo's PR link, one message.

**Resolve reviewer name(s).** Invoke `digismith:preferences`' `get`
operation for key `teams_reviewers` in the repo currently being worked
in. **Returns a value** → use it as-is (a single comma-separated string)
— reused verbatim, never re-parsed or re-split. **Returns `unset`** →
first use in this repo. Ask via `AskUserQuestion` for the reviewer
name(s) to tag this time (comma-separated if more than one). Then ask a
lightweight follow-up: "Remember this as the default reviewer list for
this repo?" **Yes** → write it via `digismith:preferences`' `set`
operation for key `teams_reviewers`, value quoted (`--value "<names>"`).
**No** → proceed with just this run's answer; ask again next time, never
treat a decline as "stop asking."

**Determine the ask line.** Ask directly what to say after the `--` —
never fabricate one. May be in Vietnamese or English, whatever Jack says;
never auto-translate or rephrase it. That's the `ask-line` placeholder.

**Compose the remaining placeholders:**

- `reviewers` = the reviewer name(s) string as-is — no mention-token
  wrapping (Teams reviewer names are plain text, not resolved Jira
  mentions; there is no `accountId` lookup in this path at all).
- `ticket-line` = `"<Key>: <Ticket title>"` when a real ticket key and
  title are both known (ask directly for the title if the key is known
  but the title isn't — never fabricate one); an **empty string** when
  there is no real ticket key at all. Never a placeholder string in its
  place.
- `pr-links` = one `🔗 <market> PR: <link>` line per PR known, joined
  with newlines, in the order gathered. `<market>` is derived the same
  way `jira-progress-write-back`'s repo-label step does: if the repo's
  directory name matches `shopify-template-<code>`, the label is
  `<code>` uppercased; otherwise the repo directory name as-is.

### Step 5: Fill the Template

Resolve DigiSmith's own repo path the same two-step way
`inject-standards`/`offload-implementer` already establish: is the
current working directory itself the DigiSmith repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask for DigiSmith's repo path this session and
remember it. Call this `<digismith-repo>` below.

Write the gathered placeholders to a scratch JSON file (e.g.
`/tmp/generate-comment-data-<type>.json`), then:

```bash
node --experimental-strip-types <digismith-repo>/scripts/fill-template.ts --template <digismith-repo>/skills/generate-comment/templates/<type>.md --data /tmp/generate-comment-data-<type>.json
```

`<type>` is `progress-update`, `investigation-update`, or
`teams-review-request`, matching Step 1's determination. Parse the
printed JSON (`{"markdown": "...", "headingPrefix": "..."}`) from stdout.

### Step 6: Return

Report back to the caller: the filled `markdown` text and the
`headingPrefix` string, exactly as `fill-template.ts` produced them. This
skill's job ends here — it never posts, sends, or confirms anything
itself; that's each caller's own job.

## Error Handling

| Case | Disposition |
|---|---|
| Unrecognized template type requested | Stop, report the valid types (`progress-update`, `investigation-update`, `teams-review-request`), don't guess |
| `fill-template.ts` fails (template file missing/unreadable) | Stop, report the failure plainly, no fabricated draft |
| A mentioned name doesn't resolve to exactly one JIRA account (Progress/Investigation only) | Stop and ask for clarification. Never guess an `accountId` |
| No PR found for the current branch (Teams, direct-invoke case) | Ask directly for the PR title and URL rather than guessing |
| No `teams_reviewers` preference set, and Jack declines to save one at first use | Proceed with just this run's typed-in answer; ask again next time, never treat the decline as "stop asking" |
| No ticket key/context available (Teams) | Set `ticket-line` to an empty string rather than inventing a placeholder |

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine template type — from the caller, or ask |
| 2 | Progress Update content: N's `report.html` or session summary, Next Steps role/mention resolution, today's date |
| 3 | Investigation Update content: what's checked / found / needed, role/mention resolution, today's date |
| 4 | Teams Review Request content: scope, PR info, reviewer names via `digismith:preferences`, ask line |
| 5 | Fill the template via `fill-template.ts`, parse the returned JSON |
| 6 | Return `{markdown, headingPrefix}` to the caller — never post or send |

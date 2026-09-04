---
name: jira-progress-write-back
description: Use right after digismith:capture-ephemeral-url succeeds, or when explicitly asked to post or update the JIRA progress update for the current ticket — posts real JIRA ADF formatting (status lozenges, emoji, a dated progress comment) instead of a markdown approximation, for a single repo/ticket at a time.
---

# JIRA Progress Write-back

## Overview

DigiSmith's map item **I.1**. Posts/updates a JIRA ticket's description
(a "🔗 Materials & Links" entry, and — only if already present — the
"📦 Track" checklist's Technical Development line) and a dated "📣
Progress Update" comment, using real ADF nodes (status lozenges, emoji,
mentions) instead of a markdown approximation that would round-trip as
broken literal text. Consumes map item **M**'s captured URLs. Single
repo/ticket at a time — no cross-repo awareness; that's map item **I.2**,
not this skill.

## When to Use

Right after `digismith:capture-ephemeral-url` reports its two URLs, or
whenever explicitly asked to post/update the JIRA progress update for the
current ticket.

## Prerequisites

A working `digismith:depot`-provisioned Jira client at
`~/.digismith-depot/repo/packages/jira-client/src/cli.ts`, and complete
credentials at `~/.digismith-depot/.env` (see Step 2, which provisions both if
missing). The active profile's `ticket` field must be `true` (see Step
0) — if it's `false`, there's no ticket key to write to and this skill
has nothing to do.

## Process

### Step 0: Profile Pre-Check

Check for `.digismith/profile` in the repo currently being worked in.

**Missing** → proceed to Step 1.

**Present** → read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule `digismith:inject-standards` uses
for `standards/`: is the current working directory itself the DigiSmith
repo (`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
directly. Otherwise ask the user for DigiSmith's repo path this session
and remember it. Never read `profiles/` under a plugin cache path — a
stale, version-locked snapshot. Read `profiles/<name>.yml` there. No
matching file → treat as stale, proceed as if `.digismith/profile` were
missing — continue to Step 1.

Otherwise, if that profile's `ticket` field is `false`, stop here: report
one line — "skipping JIRA write-back — no ticket tracking in `<name>`
profile" — and don't do anything else in this skill. If `ticket` is
`true`, continue to Step 1.

### Step 1: Resolve the Ticket Key

```bash
git branch --show-current
```

Parse `<Key>` from the current branch name against `^([A-Z]+-\d+)__`
(e.g. `EMKT-9001__fix-cart-drawer-padding-mobile` → `EMKT-9001`). If the
branch name doesn't match, ask directly for the ticket key instead of
guessing.

### Step 2: Ensure the Jira Client Is Available

Defensively invoke `digismith:depot`'s `ensure` operation — `bootstrap`/
`adopt` normally already did this at ticket start, but this skill can
also run standalone in a session that skipped them. Same disposition as
`digismith:depot`'s own Error Handling: if `ensure` fails, stop here,
report the error plainly, don't fabricate a write.

Then check credentials:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts check-credentials
```

**Exit 0** → credentials are present and complete, continue to Step 3.

**Exit 1** → `~/.digismith-depot/.env` is missing or incomplete. Ask via
`AskUserQuestion` for the three values, mentioning where to generate a
token (`id.atlassian.com/manage-profile/security/api-tokens`):

- Jira account email
- Jira API token
- Jira site hostname (e.g. `your-org.atlassian.net`)

Write them to `~/.digismith-depot/.env` (create `~/.digismith-depot/` first if it
doesn't exist):

```
JIRA_EMAIL=<email>
JIRA_API_TOKEN=<token>
JIRA_SITE=<site>
```

Then re-run `check-credentials` to confirm before continuing to Step 3.
This only ever happens once per machine — every future session finds the
file already there.

### Step 3: Fetch the Current Ticket

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts get-issue --key <Key> --fields summary,description
```

This isn't a display fetch: whatever comes back gets spliced and written
straight back in Step 7/11, and the response is real, structured ADF for
every field by construction — no `responseContentFormat` parameter to
get wrong, no lossy rendered-markdown hybrid to guard against, unlike the
MCP connector this replaced. Keep the raw `description` ADF document in
memory for the rest of this process. Comments are fetched separately in
Step 8, not here — the issue endpoint's embedded `comment` field returns
only a page of comments with no pagination applied, so a ticket with a
long comment history would silently look emptier than it is.

### Step 4: Determine This Repo's Row Label

From the current repo's directory name: if it matches
`shopify-template-<code>`, the label is `<code>` uppercased (e.g.
`shopify-template-jp` → `JP`). Otherwise, the label is the repo directory
name as-is (e.g. `shopify-hub`). This is a label only — nothing branches
on whether it "counts" as a market; the description write below treats
every repo the same way.

### Step 5: Draft the Materials & Links Delta

Search the fetched `description` document's top-level `content` array
for a heading node whose text contains "Materials & Links".

**Not found (most common — first write on this ticket)** → the delta is
a fresh heading + bullet list, to be inserted (Step 7 decides where):

```json
{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"🔗 Materials & Links:"}]}
```
```json
{"type":"bulletList","content":[
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Preview Theme","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<preview-theme-url>"}}]}
  ]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Customize","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<customize-url>"}}]}
  ]}]},
  {"type":"listItem","content":[{"type":"paragraph","content":[
    {"type":"text","text":"Pull Request","marks":[{"type":"strong"}]},
    {"type":"text","text":": "},
    {"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"<pr-url>"}}]}
  ]}]}
]}
```

No country/market label on the bullets — single-repo scope means there's
only ever one entry in view.

**Found, and it's followed by a `bulletList`** (this skill's own earlier
write) → the delta is: replace that bullet list's three `href` values
in place (same three listItems, same order, just new link targets).

**Found, and it's followed by a `table`** (pre-existing multi-market
history — human-authored, or a future I.2) → don't restructure it. The
delta is a table-row upsert instead: the table's header row tells you
column order (expect `Country | Preview Theme | Customize | Pull
Request`, but read the actual header cells rather than assuming). Search
the table's row nodes for one whose first cell's text matches this
repo's label (Step 4). Found → replace that row's link cells. Not found
→ append a new row with this repo's label and links, same cell shape as
the existing rows.

**Found, but followed by neither a `bulletList` nor a `table`**
(unrecognized shape) → this is **not** the same as "not found": a
heading already exists, so do not append a second one. Produce no delta
at all — the existing Materials & Links section (heading and whatever
follows it) is left exactly as fetched, completely untouched. Report why
in Step 15. Never guess at a risky edit against an unfamiliar structure.

### Step 6: Draft the Track Checklist Delta

Search the same `description` document for a heading node whose text
contains "Track" (expect "📦 Track:"). **Not found** → no delta; the
Track checklist is untouched, note this for the final report (see Step
15 / Error Handling — never scaffold one from nothing).

**Found** → scan the nodes immediately following that heading (up to the
next heading node or end of document) for a paragraph whose content
starts with bold text reading "Technical Development" (matching the real
example's `**Technical Development -**` shape, tolerant of the exact
trailing punctuation). That paragraph must contain one `status`-type
node — this is the node whose `attrs` this step changes: set
`attrs.text` to `"DONE"` and `attrs.color` to `"green"`, regardless of
its current value. (Single-repo scope, per the design spec: this skill
has no visibility into other repos, so completing this one *is* the
whole of what it's tracking — see design spec's "Marking it done"
section.)

Then scan the paragraphs after that Technical Development paragraph,
stopping at whichever comes first — the next stage's own bold-labeled
paragraph, the next heading, or end of document — for one whose content
is exactly an `emoji` node (short name `:check_mark:`) followed by this
repo's label (Step 4) in bold text. **Already present**
→ no further change, idempotent. **Not present** → the delta also
includes a new paragraph node to insert immediately after the last
existing checkmark paragraph under Technical Development (or immediately
after the Technical Development status paragraph itself, if it has no
checkmarks yet):

```json
{"type":"paragraph","content":[
  {"type":"emoji","attrs":{"shortName":":check_mark:","text":"✅"}},
  {"type":"text","text":" "},
  {"type":"text","text":"<label>","marks":[{"type":"strong"}]}
]}
```

**If the structure under the Track heading doesn't clearly match this
shape** (e.g. no paragraph starts with bold "Technical Development" at
all) → treat it the same as "not found": no delta, report why in Step
15. Never guess at a risky edit against an unfamiliar structure.

### Step 7: Compose the Full New Description Document

Take the `description` document fetched in Step 3 and produce a complete
new document with Step 5's delta and (if any) Step 6's delta spliced in,
every other node untouched:

- Materials & Links: if Step 5 found nothing, append the new heading +
  bullet list to the end of the top-level `content` array. If Step 5
  found an existing section (bullets or table), replace only that
  section's content nodes in place, at the same position. If Step 5
  found a heading but produced no delta (unrecognized shape — neither
  bullets nor a table), the description's Materials & Links section is
  left exactly as fetched, untouched — do not append a second heading.
- Track checklist: if Step 6 produced a delta, splice the changed
  `status` node's attrs and (if applicable) the new checkmark paragraph
  into their exact positions within the existing node sequence. If Step
  6 found nothing, the document is unchanged from Step 3 in this regard.

This composed document is the exact value Step 13 sends back — hold it
in memory, don't write yet.

### Step 8: Find Today's Existing Progress Comment

Fetch every comment on the ticket, paginated to completion (not just the
first page):

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts get-comments --key <Key>
```

Compute today's date in `D/M` form (day and month, no leading zeros, no
year — e.g. `26/8`):

```bash
date +%-d/%-m
```

Search the comments array just fetched for one whose body
document's first node is a heading whose text starts with "📣 Progress
Update – " followed by that exact `D/M` string — but a plain
string-prefix check is not enough by itself: since `D/M` has no leading
zeros or fixed width, a shorter day/month string can prefix-collide with
a longer one from an unrelated date. For example, if today is `3/1` (3
January) and an old comment is headed "📣 Progress Update – 3/12" (3
December), that heading literally starts with the string for `3/1`, so a
naive prefix check would wrongly match it and silently overwrite the
December comment. Guard against this with a boundary check instead of a
plain prefix check: the heading matches only if it starts with "📣
Progress Update – <D/M>" **and** the character immediately after that
matched substring is either absent (the heading ends there) or a
non-digit. That boundary correctly rejects the `3/12`-vs-`3/1` case
(the next character after the match is `2`, a digit) while still
correctly matching a heading with legitimate trailing content, e.g. "📣
Progress Update – 26/8 (week 2)" against a search for `26/8` (the next
character is a space, a non-digit) — do not require full-string equality
on the whole heading instead, since that would break matching those
legitimately-suffixed headings. **Found** → remember its `id` as
`commentId` for Step 14. **Not found** → Step 14 creates a new comment
instead.

### Step 9: Draft "What's Done"

Check whether this session already has
`.digismith/docs/<slug>/report.html` from map item **N**
(`digismith:report-implementation`) — the same slug this ticket's work
used. **Present** → read it and draft 1-4 short bullets summarizing the
delivered work section, in the same tone as a real example:

> Trial/Returns banner implemented and verified live on JP, PH, and KR —
> icon + editable text, shown only on product pages, correct
> desktop/mobile ordering next to breadcrumbs.

**Not present** (N hasn't run this session, e.g. this plan used
`digismith:executing-plans` instead of `subagent-driven-development`,
or the skill is invoked standalone) → draft the same style of bullets
directly from the session's actual work instead — never fabricate
specifics not actually done this session.

Always end the "What's done" block with this fixed line:

```
👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.
```

### Step 10: Draft "Next Steps"

Ask the user, via `AskUserQuestion`, which roles need a ping on this
update and who for each (e.g. code review, design approval, QA) — there
is no automatic source for this (this repo's `CODEOWNERS`, where one
exists, only names a team, never individuals). Skip a role entirely if
the user says no one needs tagging for it; never invent a placeholder
mention.

For each name given, resolve a JIRA `accountId` by searching for that
name. **Exactly one clear match** → use it. **No match, or the user
declines to clarify an ambiguous multi-match** → stop and ask directly
rather than guessing an ID; an unresolved or wrong `accountId` produces
either a broken mention or a silent wrong tag, both worse than asking.

Draft one bullet per role-with-a-person, matching the real shape:

```
**<emoji> <Role> Needed >** (<mention>, <mention>) — <ask, plain text, one sentence>
```

### Step 11: Compose the Full Comment Document

```json
{"type":"doc","version":1,"content":[
  {"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"📣 Progress Update – <D/M>"}]},
  {"type":"rule"},
  {"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"✅ What's done"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"<bullet 1>"}]}]}
  ]},
  {"type":"paragraph","content":[{"type":"text","text":"👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above."}]},
  {"type":"heading","attrs":{"level":4},"content":[{"type":"text","text":"🎯 Next Steps:"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[
      {"type":"text","text":"<emoji> <Role> Needed >","marks":[{"type":"strong"}]},
      {"type":"text","text":" ("},
      {"type":"mention","attrs":{"id":"<accountId>"}},
      {"type":"text","text":") — <ask>"}
    ]}]}
  ]}
]}
```

One `listItem` per bullet from Steps 9 and 10 — the shape above shows
one of each for clarity; repeat the pattern for every bullet actually
drafted.

### Step 12: Confirm With the User

Render the description delta (in the human-readable terms of what's
changing — "adding a Materials & Links entry with these three links" /
"marking Technical Development done with a JP checkmark" / "Track
section not found, skipping" as applicable) and the full comment text.
Alongside the comment text, state plainly whether this write will
**create a new comment** or **replace the existing comment Step 8
found** (name its `commentId` when replacing), so the user can catch and
cancel a wrong match before it lands. Then ask via `AskUserQuestion`:
post as drafted, let the user revise first, or cancel. **Revise** →
incorporate the requested change and re-present before proceeding.
**Cancel** → stop here, nothing is written. Only **post as drafted**
continues to Step 13. This applies every time this skill runs, not just
the first — both writes are team-visible external side effects, and
JIRA's own edit history is visible to the whole team.

### Step 13: Write the Description

Write Step 7's composed document to a scratch file (e.g.
`/tmp/jira-description-<Key>.json`), then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts update-description --key <Key> --file /tmp/jira-description-<Key>.json
```

### Step 14: Write the Comment

Write Step 11's composed document to a scratch file (e.g.
`/tmp/jira-comment-<Key>.json`), then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts add-comment --key <Key> --file /tmp/jira-comment-<Key>.json
```

Only if Step 8 found an existing comment, add `--comment-id <id>` to the
same command — this updates the existing comment in place instead of
creating a new one.

### Step 15: Report

Confirm what was written: the ticket key, whether the description's
Materials & Links entry was created or updated (and the Track line, if
touched, or a note that it was skipped and why), and whether the comment
was created or updated (with a link to the ticket). This skill's job
ends here.

## Error Handling

- **No credentials, and the user declines to provide them at Step 2** →
  stop, say so plainly. Don't fabricate a write.
- **`digismith:depot`'s `ensure` operation fails at Step 2** → stop, say
  so plainly (see that skill's own Error Handling for the exact
  disposition). Don't fabricate a write.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key rather than guessing.
- **Track section absent, or present but not in the expected shape** →
  skip the Track delta entirely (Step 6), report plainly in Step 15.
  Never scaffold or force an edit against an unfamiliar structure.
- **Materials & Links section already exists as neither bullets nor a
  table** (unrecognized shape) → same disposition as the Track case:
  skip that part of the delta, report why, don't force an edit.
- **A mentioned name doesn't resolve to exactly one JIRA account** → stop
  and ask for clarification. Never guess an `accountId`.
- **Custom, site-uploaded emoji needed with no resolvable `id`** → skip
  the icon, plain text/status pill only. No tool in this session's
  toolset enumerates site-specific emoji.
- **Mistaken or duplicate comment already posted** → no delete
  capability exists — edit it via `--comment-id` instead of creating a
  corrective second comment.
- **User cancels at Step 12** → stop, nothing written, no partial write
  of just the description or just the comment.
- **The `update-description` or `add-comment` CLI call fails** (HTTP
  error, network error) → report the failure plainly with whatever
  error detail it printed to stderr; don't retry silently or fall back
  to a markdown write.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Profile pre-check — skip entirely if `ticket: false` |
| 1 | Resolve `<Key>` from branch name |
| 2 | Ensure the Jira client is available: defensive `digismith:depot` `ensure` check, then `check-credentials` — bootstrap via `AskUserQuestion` if incomplete |
| 3 | Fetch the description via `get-issue` — real ADF for every field, no format parameter needed |
| 4 | Derive this repo's row label |
| 5 | Draft Materials & Links delta — bullets by default, table-row upsert if a table already exists, no delta (section left untouched) if it's neither |
| 6 | Draft Track checklist delta — Technical Development line only, only if the section already exists |
| 7 | Compose the full new description document (whole-field replace) |
| 8 | Fetch all comments via `get-comments` (paginated to completion) and find today's existing Progress Update comment, if any |
| 9 | Draft "What's done" — prefer N's report, else session summary |
| 10 | Draft "Next Steps" — ask roles/people, resolve via account lookup |
| 11 | Compose the full comment document |
| 12 | Confirm full draft with the user — post / revise / cancel |
| 13 | Write the description via `update-description` |
| 14 | Write the comment via `add-comment` (create, or update via `--comment-id`) |
| 15 | Report what was written |

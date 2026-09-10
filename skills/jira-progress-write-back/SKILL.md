---
name: jira-progress-write-back
description: Use right after digismith:capture-ephemeral-url succeeds, or when explicitly asked to post or update the JIRA progress or investigation update for the current ticket — posts real JIRA ADF formatting (status lozenges, emoji, a dated comment) instead of a markdown approximation, for a single repo/ticket at a time.
---

# JIRA Progress Write-back

## Overview

DigiSmith's map item **I.1**. Posts/updates a JIRA ticket's description
(a "🔗 Materials & Links" entry, and — only if already present — the
"📦 Track" checklist's Technical Development line) and a dated comment —
either a Progress Update or an Investigation Update — using real ADF
nodes (status lozenges, emoji, mentions) instead of a markdown
approximation that would round-trip as broken literal text. Consumes map
item **M**'s captured URLs (Progress Update path only). Single
repo/ticket at a time — no cross-repo awareness; that's map item **I.2**,
not this skill. The comment itself is drafted by `generate-comment`
(**Q.1**) — this skill owns the Jira-specific mechanics: fetching,
dedup-matching, converting to ADF, and posting.

## When to Use

Right after `digismith:capture-ephemeral-url` reports its two URLs, or
whenever explicitly asked to post/update the JIRA progress update or
investigation update for the current ticket.

## Prerequisites

A working `digismith:depot`-provisioned Jira client at
`~/.digismith-depot/repo/packages/jira-client/src/cli.ts`, and complete
credentials at `~/.digismith-depot/.env` (see Step 2, which provisions both if
missing). The active profile's `ticket` field must be `true` (see Step
0) — if it's `false`, there's no ticket key to write to and this skill
has nothing to do. Also requires `generate-comment` (**Q.1**) and its
three templates under `skills/generate-comment/templates/`.

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

Then probe whether the depot clone actually has the `markdown-to-adf`
subcommand this skill needs at Step 11 — `ensure` above is a pure
existence check with no fetch/refresh, so a depot clone that predates the
Q build would otherwise only fail much later, right after Step 12's
confirmation. The probe needs no credentials, so it's safe to run here:

```bash
echo 'probe' > /tmp/digismith-adf-probe.md
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts markdown-to-adf --file /tmp/digismith-adf-probe.md
```

**Succeeds** (prints ADF JSON, exit 0) → continue to Step 3. **Fails with
`unknown subcommand: markdown-to-adf`** (or any other failure indicating
the subcommand doesn't exist) → invoke `digismith:depot`'s `refresh`
operation:

```bash
git -C ~/.digismith-depot/repo fetch --all --prune --tags -q && \
git -C ~/.digismith-depot/repo checkout main && \
git -C ~/.digismith-depot/repo reset --hard origin/main
```

then retry the probe once. Still fails → stop here, report the error
plainly (see Error Handling), don't fabricate a conversion.

### Step 3: Fetch the Current Ticket

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts get-issue --key <Key> --fields summary,description
```

This isn't a display fetch: whatever comes back gets spliced (Step 8)
and written straight back (Step 13), and the response is real, structured ADF for
every field by construction — no `responseContentFormat` parameter to
get wrong, no lossy rendered-markdown hybrid to guard against. Keep the
raw `description` ADF document in memory for the rest of this process.
Comments are fetched separately in Step 10, not here.

### Step 4: Determine Template Type

Invoked right after `digismith:capture-ephemeral-url` reports its two
URLs → always **Progress Update** (today's only real path there — an
Investigation Update has no ephemeral deploy to report). Invoked
standalone or explicitly → ask directly via `AskUserQuestion`: "Progress
Update, or Investigation Update?" Remember the answer as `<template>` for
every step below.

### Step 5: Determine This Repo's Row Label

**Only if `<template>` = Progress Update** — this label feeds Steps 6-7's
description edits, which don't apply to Investigation Update.

From the current repo's directory name: if it matches
`shopify-template-<code>`, the label is `<code>` uppercased (e.g.
`shopify-template-jp` → `JP`). Otherwise, the label is the repo directory
name as-is (e.g. `shopify-hub`).

### Step 6: Draft the Materials & Links Delta

**Only if `<template>` = Progress Update** — skip entirely for
Investigation Update; there's no ephemeral deploy to link.

Search the fetched `description` document's top-level `content` array
for a heading node whose text contains "Materials & Links".

**Not found (most common — first write on this ticket)** → the delta is
a fresh heading + bullet list, to be inserted (Step 8 decides where):

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
repo's label (Step 5). Found → replace that row's link cells. Not found
→ append a new row with this repo's label and links, same cell shape as
the existing rows.

**Found, but followed by neither a `bulletList` nor a `table`**
(unrecognized shape) → this is **not** the same as "not found": a
heading already exists, so do not append a second one. Produce no delta
at all — the existing Materials & Links section (heading and whatever
follows it) is left exactly as fetched, completely untouched. Report why
in Step 15. Never guess at a risky edit against an unfamiliar structure.

### Step 7: Draft the Track Checklist Delta

**Only if `<template>` = Progress Update** — skip entirely for
Investigation Update.

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
whole of what it's tracking.)

Then scan the paragraphs after that Technical Development paragraph,
stopping at whichever comes first — the next stage's own bold-labeled
paragraph, the next heading, or end of document — for one whose content
is exactly an `emoji` node (short name `:check_mark:`) followed by this
repo's label (Step 5) in bold text. **Already present**
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

### Step 8: Compose the Full New Description Document

**Only if `<template>` = Progress Update** — for Investigation Update,
this step is a no-op; the description stays exactly as fetched in Step 3.

Take the `description` document fetched in Step 3 and produce a complete
new document with Step 6's delta and (if any) Step 7's delta spliced in,
every other node untouched:

- Materials & Links: if Step 6 found nothing, append the new heading +
  bullet list to the end of the top-level `content` array. If Step 6
  found an existing section (bullets or table), replace only that
  section's content nodes in place, at the same position. If Step 6
  found a heading but produced no delta (unrecognized shape), the
  description's Materials & Links section is left exactly as fetched,
  untouched — do not append a second heading.
- Track checklist: if Step 7 produced a delta, splice the changed
  `status` node's attrs and (if applicable) the new checkmark paragraph
  into their exact positions within the existing node sequence. If Step
  7 found nothing, the document is unchanged from Step 3 in this regard.

This composed document is the exact value Step 13 sends back — hold it
in memory, don't write yet.

### Step 9: Generate the Comment

Invoke `generate-comment` (**Q.1**) with the template type argument set
to the kebab-case form of `<template>` — `<template>` = Progress Update
→ pass `progress-update`; `<template>` = Investigation Update → pass
`investigation-update`. `generate-comment`'s Step 1 expects exactly one
of these kebab-case strings (never `teams-review-request` — that's
I.4's template type, not this skill's) and hard-stops on anything else,
so pass the mapped form, not the human-readable `<template>` value used
elsewhere in this document. Receive back `{markdown, headingPrefix}`.
Hold both in memory — `headingPrefix` feeds Step 10's dedup-search,
`markdown` feeds Step 11's conversion and Step 12's confirmation.

### Step 10: Find Today's Existing Comment

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

Search the comments array just fetched for one whose body document's
first node is a heading whose text starts with `<headingPrefix>` (Step
9) followed by that exact `D/M` string — but a plain string-prefix check
is not enough by itself: since `D/M` has no leading zeros or fixed width,
a shorter day/month string can prefix-collide with a longer one from an
unrelated date. For example, if today is `3/1` (3 January) and an old
comment is headed "`<headingPrefix>` – 3/12" (3 December), that heading
literally starts with the string for `3/1`, so a naive prefix check
would wrongly match it and silently overwrite the December comment.
Guard against this with a boundary check instead of a plain prefix
check: the heading matches only if it starts with `"<headingPrefix> –
<D/M>"` **and** the character immediately after that matched substring
is either absent (the heading ends there) or a non-digit. That boundary
correctly rejects the `3/12`-vs-`3/1` case (the next character after the
match is `2`, a digit) while still correctly matching a heading with
legitimately-suffixed content, e.g. "`<headingPrefix>` – 26/8 (week 2)"
against a search for `26/8` (the next character is a space, a non-digit)
— do not require full-string equality on the whole heading instead,
since that would break matching those legitimately-suffixed headings.
**Found** → remember its `id` as `commentId` for Step 14. **Not found**
→ Step 14 creates a new comment instead.

### Step 11: Convert the Comment to ADF

Write Step 9's `markdown` to a scratch file (e.g.
`/tmp/jira-comment-<Key>.md`), then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts markdown-to-adf --file /tmp/jira-comment-<Key>.md
```

Capture the printed ADF `doc` JSON — this is the exact value Step 14
sends back. Doing this conversion before Step 12's confirmation means an
unsupported-construct failure surfaces here, before the user has
confirmed anything to post — not after, which would otherwise leave the
user having already signed off on a draft that then turns out unpostable.

### Step 12: Confirm With the User

Render the description delta (in human-readable terms of what's
changing — "adding a Materials & Links entry with these three links" /
"marking Technical Development done with a JP checkmark" / "Track
section not found, skipping" as applicable — **only when `<template>` =
Progress Update**; for Investigation Update, state plainly that no
description changes are made at all) and the full comment text — the
`markdown` from Step 9, readable as Markdown, not raw ADF JSON (already
validated by Step 11's conversion). Alongside the comment text, state
plainly whether this write will **create a new comment** or **replace
the existing comment Step 10 found** (name its `commentId` when
replacing), so the user can catch and cancel a wrong match before it
lands. Then ask via `AskUserQuestion`: post as drafted, let the user
revise first, or cancel. **Revise** → incorporate the requested change,
re-run Step 11's conversion on the revised markdown, and re-present
before proceeding. **Cancel** → stop here, nothing is written. Only
**post as drafted** continues to Step 13. This applies every time this
skill runs, not just the first — both writes are team-visible external
side effects, and JIRA's own edit history is visible to the whole team.

### Step 13: Write the Description

**Only if `<template>` = Progress Update.** Write Step 8's composed
document to a scratch file (e.g. `/tmp/jira-description-<Key>.json`),
then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts update-description --key <Key> --file /tmp/jira-description-<Key>.json
```

### Step 14: Write the Comment

Write Step 11's converted ADF document to a scratch file (e.g.
`/tmp/jira-comment-<Key>.json`), then:

```bash
node ~/.digismith-depot/repo/packages/jira-client/src/cli.ts add-comment --key <Key> --file /tmp/jira-comment-<Key>.json
```

Only if Step 10 found an existing comment, add `--comment-id <id>` to the
same command — this updates the existing comment in place instead of
creating a new one.

### Step 15: Report

Confirm what was written: the ticket key, which template was used,
whether the description's Materials & Links entry was created or updated
(and the Track line, if touched, or a note that it was skipped and why —
Progress Update only), and whether the comment was created or updated
(with a link to the ticket). This skill's job ends here.

## Error Handling

- **No credentials, and the user declines to provide them at Step 2** →
  stop, say so plainly. Don't fabricate a write.
- **`digismith:depot`'s `ensure` operation fails at Step 2** → stop, say
  so plainly (see that skill's own Error Handling for the exact
  disposition). Don't fabricate a write.
- **`markdown-to-adf` subcommand not found even after `digismith:depot`
  refresh** (Step 2's capability probe) → stop here, report the error
  plainly, don't fabricate a conversion.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key rather than guessing.
- **`generate-comment` fails or is cancelled at Step 9** (unrecognized
  template type, missing template file, unresolved mention) → stop here,
  surface whatever it reported plainly. Don't fabricate a comment.
- **Track section absent, or present but not in the expected shape**
  (Progress Update only) → skip the Track delta entirely (Step 7),
  report plainly in Step 15. Never scaffold or force an edit against an
  unfamiliar structure.
- **Materials & Links section already exists as neither bullets nor a
  table** (Progress Update only, unrecognized shape) → same disposition
  as the Track case: skip that part of the delta, report why, don't
  force an edit.
- **The Markdown from `generate-comment` uses a construct
  `markdown-to-adf.ts` doesn't support** (Step 11 throws) → stop here,
  report the unsupported construct plainly. Never post a mangled
  conversion.
- **Custom, site-uploaded emoji needed with no resolvable `id`** → not
  applicable anymore — templates use literal Unicode emoji characters,
  not Jira's ADF `emoji` shortName nodes, so this case no longer arises.
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
| 2 | Ensure the Jira client is available: defensive `digismith:depot` `ensure` check, then `check-credentials` (bootstrap via `AskUserQuestion` if incomplete), then a `markdown-to-adf` capability probe (`digismith:depot` `refresh` + retry on failure) |
| 3 | Fetch the description via `get-issue` |
| 4 | Determine template type — auto Progress after `capture-ephemeral-url`, else ask |
| 5 | Derive this repo's row label (Progress Update only) |
| 6 | Draft Materials & Links delta (Progress Update only) |
| 7 | Draft Track checklist delta (Progress Update only) |
| 8 | Compose the full new description document (Progress Update only; no-op otherwise) |
| 9 | Generate the comment via `generate-comment` — get `{markdown, headingPrefix}` |
| 10 | Find today's existing comment via `headingPrefix` + date-boundary match |
| 11 | Convert the comment Markdown to ADF via `markdown-to-adf` |
| 12 | Confirm full draft with the user — post / revise / cancel |
| 13 | Write the description (Progress Update only) |
| 14 | Write the comment (create, or update via `--comment-id`) |
| 15 | Report what was written |

# JIRA Progress Write-back (I.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `jira-progress-write-back` — DigiSmith's map item **I.1** — a
skill that posts and updates real JIRA ADF formatting (status lozenges,
emoji, a dated progress comment) on the active ticket for a single
repo/PR at a time, consuming map item **M**'s captured ephemeral URLs.

**Architecture:** A single new skill, triggered right after
`digismith:capture-ephemeral-url` succeeds or on explicit request. It
resolves the ticket key from the branch name (same regex M uses), detects
whichever JIRA-capable tool is available in the session, fetches the
ticket's description and comments as real ADF (never the lossy
markdown-rendered pseudo-HTML), drafts two deltas in memory — a Materials
& Links bullet entry and, only if a Track checklist already exists, the
Technical Development line's status/checkmark — composes them into a
complete replacement description document (the API has no patch/append),
drafts a dated Progress Update comment (reusing map item **N**'s report
when available, asking the user for Next Steps mentions and resolving
each via account lookup), shows both drafts for explicit confirmation,
then writes them via `contentFormat: "adf"`.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), the
Jira MCP connector's `getJiraIssue` / `editJiraIssue` /
`addCommentToJiraIssue` / `lookupJiraAccountId` / `getAccessibleAtlassianResources`
tools. No application code, no test framework — verification is
dogfooding via reasoning against fabricated ADF fixtures constructed
inline in Task 1, checked against the node schemas already confirmed
live (read from real EMKT-784 content during this session's
brainstorming). **Ruling, made at execution time (see the SDD ledger):**
the original design called for at least one dogfood pass against the
real Jira connector using a disposable throwaway issue, since ADF
correctness (does a node really render as a status lozenge, not broken
literal text) can only be fully confirmed by the live API. Jack chose to
skip that in favor of reasoning-only verification rather than have a
subagent create a real issue on the live Jira instance. Accepted
consequence: a real ADF construction bug could still exist that only a
live call would surface — not caught until this skill is actually used
against a real ticket. This is the point where a live UAT run (see the
plan's closing note) matters most.

**Spec:** `.digismith/docs/jira-progress-write-back/design.html`
(published: https://claude.ai/code/artifact/d80cf1bf-d1fe-4677-927a-be07350e063e)

## Global Constraints

- **Single-repo, single-market scope only.** No classification of
  "market vs. non-market" repos, no comparison against a repo/market
  list, no cross-repo awareness anywhere in this skill. That entire
  problem is map item **I.2**, not built here.
- **Two writes, both via `contentFormat: "adf"`, never `"markdown"`** for
  content that must preserve or create status/emoji/mention nodes —
  markdown round-trips those as broken literal text (confirmed trap, see
  design spec's ADF Technique section).
- **Materials & Links defaults to a bullet list**, not a table. Only
  fall back to upserting a row into an *existing* table if the
  description already has one (conservative, don't restructure).
- **Track checklist: touch only the Technical Development line.** Every
  other stage line must be preserved byte-for-byte in the recomposed
  document, since the whole `description` field is replaced on write.
  If no Track section exists at all, skip it — never scaffold one from
  nothing.
- **No status/workflow transitions, ever.** This skill never calls a
  transition endpoint and never sets the `status` field itself — only
  `status` *nodes* inside description/comment body content, which are
  cosmetic ADF content, not the issue's actual workflow state.
- **Confirm the full draft with the user before every write call**, not
  just the first time. Both writes are team-visible external side
  effects.
- **No new profile field.** Gate on the active profile's existing
  `ticket` field (map item O) — `ticket: false` never resolves a key,
  so there's nothing to write to.
- **JIRA tool detection**: infer which JIRA/Atlassian-capable tool is
  available in the session; never hardcode one connector's tool names
  as a hard dependency — mirrors `digismith:jira-intake`'s own
  principle. (This plan's own steps below name this session's actual
  connector's tools for concreteness; the skill's prose must describe
  the capability, not assume this exact tool name is universal.)
- **Skill location:** `skills/jira-progress-write-back/SKILL.md`, new
  file, no other skill files are modified — M's own trigger recognition
  is description-based (same pattern M itself uses relative to
  `superpowers:finishing-a-development-branch`), so no hook needs to be
  inserted into M's `SKILL.md`.
- Cross-skill references inside `SKILL.md` content must be
  plugin-qualified: `digismith:capture-ephemeral-url`,
  `digismith:report-implementation`, `digismith:jira-intake`.
- **Roadmap update:** `MEMORY.md`'s **I** row and `.digismith/history.html`
  both need to reflect I.1 shipped / I.2 still open, and
  `.digismith/history.html` additionally needs the **R**/**S** split
  caught up (it was only ever applied to `MEMORY.md`, not this file) —
  see Task 2.

---

### Task 1: `jira-progress-write-back` Skill — Write, Read Back, Dogfood

**Files:**
- Create: `skills/jira-progress-write-back/SKILL.md`

**Interfaces:**
- Consumes: map item M's captured Preview Theme / Customize URLs and the
  PR link (passed in conversation context, not a file — M reports them
  in-session, it writes nothing to disk); map item N's
  `.digismith/docs/<slug>/report.html` when present this session.
- Produces: two JIRA API writes (description, comment) on the active
  ticket. Nothing downstream in this plan consumes this skill's output —
  it's a terminal step in the flow.

- [ ] **Step 1: Write `skills/jira-progress-write-back/SKILL.md`**

```markdown
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

A JIRA/Atlassian-capable tool available in this session (see Step 2). The
active profile's `ticket` field must be `true` (see Step 0) — if it's
`false`, there's no ticket key to write to and this skill has nothing to
do.

## Process

### Step 0: Profile Pre-Check

Check for `.digismith/profile` in the repo currently being worked in.

**Missing** → unchanged, existing behavior; continue to Step 1.

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
`true`, continue to Step 1 exactly as today.

### Step 1: Resolve the Ticket Key

```bash
git branch --show-current
```

Parse `<Key>` from the current branch name against `^([A-Z]+-\d+)__`
(e.g. `EMKT-9001__fix-cart-drawer-padding-mobile` → `EMKT-9001`). If the
branch name doesn't match, ask directly for the ticket key instead of
guessing.

### Step 2: Detect the JIRA Tool

Check whether a JIRA/Atlassian-capable tool is available in the current
session — same principle `digismith:jira-intake` already uses for its
own scenario detection: infer from what's actually available, don't
hardcode an assumption. Not found → stop, tell the user plainly that
this skill needs a JIRA tool in the session, don't fabricate a write.

### Step 3: Resolve `cloudId`

Try the ticket's own site hostname as `cloudId` first (e.g.
`your-org.atlassian.net`, from a URL the user gave or a prior fetch in
this session). If that fails, or no hostname is known yet, call
whichever tool lists accessible Atlassian resources and use the `id`
whose `scopes` include Jira read/write access.

### Step 4: Fetch the Current Ticket

Fetch the ticket's `summary`, `description`, and `comment` fields with
`responseContentFormat: "adf"` — **always ADF here, never markdown**.
This isn't a display fetch: whatever comes back gets spliced and written
straight back in Step 8/12, and the markdown rendering lossily flattens
special nodes into pseudo-HTML text that cannot be reconstructed into
real nodes (see the Global Constraints' ADF warning). Keep the raw
`description` ADF document and the `comment.comments` array in memory for
the rest of this process.

### Step 5: Determine This Repo's Row Label

From the current repo's directory name: if it matches
`shopify-template-<code>`, the label is `<code>` uppercased (e.g.
`shopify-template-jp` → `JP`). Otherwise, the label is the repo directory
name as-is (e.g. `shopify-hub`). This is a label only — nothing branches
on whether it "counts" as a market; the description write below treats
every repo the same way.

### Step 6: Draft the Materials & Links Delta

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

### Step 7: Draft the Track Checklist Delta

Search the same `description` document for a heading node whose text
contains "Track" (expect "📦 Track:"). **Not found** → no delta; the
Track checklist is untouched, note this for the final report (see Step
16 / Error Handling — never scaffold one from nothing).

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

Then scan the paragraphs between that Technical Development paragraph
and the next stage's own bold-labeled paragraph (or end of document) for
one whose content is exactly an `emoji` node (short name `:check_mark:`)
followed by this repo's label (Step 5) in bold text. **Already present**
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
16. Never guess at a risky edit against an unfamiliar structure.

### Step 8: Compose the Full New Description Document

Take the `description` document fetched in Step 4 and produce a complete
new document with Step 6's delta and (if any) Step 7's delta spliced in,
every other node untouched:

- Materials & Links: if Step 6 found nothing, append the new heading +
  bullet list to the end of the top-level `content` array. If Step 6
  found an existing section (bullets or table), replace only that
  section's content nodes in place, at the same position.
- Track checklist: if Step 7 produced a delta, splice the changed
  `status` node's attrs and (if applicable) the new checkmark paragraph
  into their exact positions within the existing node sequence. If Step
  7 found nothing, the document is unchanged from Step 4 in this regard.

This composed document is the exact value Step 14 sends back — hold it
in memory, don't write yet.

### Step 9: Find Today's Existing Progress Comment

Compute today's date in `D/M` form (day and month, no leading zeros, no
year — e.g. `26/8`):

```bash
date +%-d/%-m
```

Search the `comment.comments` array fetched in Step 4 for one whose body
document's first node is a heading whose text starts with "📣 Progress
Update – " followed by that exact `D/M` string. **Found** → remember its
`id` as `commentId` for Step 15. **Not found** → Step 15 creates a new
comment instead.

### Step 10: Draft "What's Done"

Check whether this session already has
`.digismith/docs/<slug>/report.html` from map item **N**
(`digismith:report-implementation`) — the same slug this ticket's work
used. **Present** → read it and draft 1-4 short bullets summarizing the
delivered work section, in the same tone as a real example:

> Trial/Returns banner implemented and verified live on JP, PH, and KR —
> icon + editable text, shown only on product pages, correct
> desktop/mobile ordering next to breadcrumbs.

**Not present** (N hasn't run this session, e.g. this plan used
`superpowers:executing-plans` instead of `subagent-driven-development`,
or the skill is invoked standalone) → draft the same style of bullets
directly from the session's actual work instead — never fabricate
specifics not actually done this session.

Always end the "What's done" block with this fixed line:

```
👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.
```

### Step 11: Draft "Next Steps"

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

### Step 12: Compose the Full Comment Document

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

One `listItem` per bullet from Steps 10 and 11 — the shape above shows
one of each for clarity; repeat the pattern for every bullet actually
drafted.

### Step 13: Confirm With the User

Render both the description delta (in the human-readable terms of what's
changing — "adding a Materials & Links entry with these three links" /
"marking Technical Development done with a JP checkmark" / "Track
section not found, skipping" as applicable) and the full comment text,
and ask via `AskUserQuestion`: post as drafted, let the user revise
first, or cancel. **Revise** → incorporate the requested change and
re-present before proceeding. **Cancel** → stop here, nothing is
written. Only **post as drafted** continues to Step 14. This applies
every time this skill runs, not just the first — see Global Constraints.

### Step 14: Write the Description

Call the issue-edit tool with `contentFormat: "adf"`, setting the
`description` field to Step 8's composed document.

### Step 15: Write the Comment

Call the add-comment tool with `contentFormat: "adf"`, `commentBody` set
to Step 12's composed document (as a JSON string), and — only if Step 9
found an existing comment — `commentId` set to that comment's `id`. When
`commentId` is present the same comment is updated in place, not
duplicated; when absent, a new comment is created.

### Step 16: Report

Confirm what was written: the ticket key, whether the description's
Materials & Links entry was created or updated (and the Track line, if
touched, or a note that it was skipped and why), and whether the comment
was created or updated (with a link to the ticket). This skill's job
ends here.

## Error Handling

- **No JIRA-capable tool in session** → stop, say so plainly. Don't
  fabricate a write.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key rather than guessing.
- **Track section absent, or present but not in the expected shape** →
  skip the Track delta entirely (Step 7), report plainly in Step 16.
  Never scaffold or force an edit against an unfamiliar structure.
- **Materials & Links section already exists as neither bullets nor a
  table** (unrecognized shape) → same disposition as the Track case:
  skip that part of the delta, report why, don't force an edit.
- **A mentioned name doesn't resolve to exactly one JIRA account** → stop
  and ask for clarification. Never guess an `accountId`.
- **Custom, site-uploaded emoji needed with no resolvable `id`** → skip
  the icon, plain text/status pill only. No tool in this session's
  toolset enumerates site-specific emoji.
- **User cancels at Step 13** → stop, nothing written, no partial write
  of just the description or just the comment.
- **`editJiraIssue` or `addCommentToJiraIssue` call fails** (permissions,
  network, malformed field) → report the failure plainly with whatever
  error detail the tool returned; don't retry silently or fall back to
  a markdown write.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Profile pre-check — skip entirely if `ticket: false` |
| 1 | Resolve `<Key>` from branch name |
| 2 | Detect a JIRA-capable tool in session; stop if none |
| 3 | Resolve `cloudId` |
| 4 | Fetch description + comments as **ADF** (never markdown) |
| 5 | Derive this repo's row label |
| 6 | Draft Materials & Links delta — bullets by default, table-row upsert if a table already exists |
| 7 | Draft Track checklist delta — Technical Development line only, only if the section already exists |
| 8 | Compose the full new description document (whole-field replace) |
| 9 | Find today's existing Progress Update comment, if any |
| 10 | Draft "What's done" — prefer N's report, else session summary |
| 11 | Draft "Next Steps" — ask roles/people, resolve via account lookup |
| 12 | Compose the full comment document |
| 13 | Confirm full draft with the user — post / revise / cancel |
| 14 | Write the description |
| 15 | Write the comment (create, or update via `commentId`) |
| 16 | Report what was written |
```

- [ ] **Step 2: Dogfood — fresh Materials & Links creation + table-fallback distinction (reasoning only)**

**Ruling (SDD ledger, this execution):** the original design called for
this dogfood to run against a real disposable Jira issue via live API
calls. Jack chose reasoning-only verification instead — no real Jira
issue is created, no live tool calls are made anywhere in this task.
Verify by reasoning against fabricated ADF fixtures below, checked
against the node schemas already confirmed live in the design spec.

**Fixture A — no existing Materials section:**

```json
{"type":"doc","version":1,"content":[
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"📦 Track:"}]},
  {"type":"paragraph","content":[{"type":"text","text":"Nothing here yet."}]}
]}
```

Reasoning through Steps 6 and 8 of `skills/jira-progress-write-back/SKILL.md`
against Fixture A, for repo `shopify-template-jp` with Preview Theme
`https://example-jp.myshopify.com?preview_theme_id=999`, Customize
`https://example-jp.myshopify.com/admin/themes/999/editor`, Pull Request
`https://github.com/emma-sleep/shopify-template-jp/pull/9999`: confirm
Step 6 finds no "Materials & Links" heading, drafts the bullet-list
shape (not a table), and Step 8's composed document appends it to the
end of `content` with Fixture A's existing heading/paragraph untouched.

**Fixture B — existing Materials section as a table (pre-existing
multi-market history):**

```json
{"type":"doc","version":1,"content":[
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"🔗 Materials & Links:"}]},
  {"type":"table","content":[
    {"type":"tableRow","content":[
      {"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Country"}]}]},
      {"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Preview Theme"}]}]},
      {"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Customize"}]}]},
      {"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"Pull Request"}]}]}
    ]},
    {"type":"tableRow","content":[
      {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"KR","marks":[{"type":"strong"}]}]}]},
      {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://example-kr.myshopify.com?preview_theme_id=111"}}]}]}]},
      {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://example-kr.myshopify.com/admin/themes/111/editor"}}]}]}]},
      {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://github.com/emma-sleep/shopify-template-kr/pull/1"}}]}]}]}
    ]}
  ]}
]}
```

Reasoning through Step 6 against Fixture B for repo `shopify-template-jp`
(label `JP`, not present in the table yet), with the same URLs as
Fixture A above: confirm Step 6 detects the existing section is a
**table** (not bullets), does not restructure it into a bullet list, and
drafts a table-row-append delta (a new `JP` row) rather than replacing
KR's row.

- [ ] **Step 3: Dogfood — Materials & Links idempotent replace + Track checklist, both cases (reasoning only)**

**Fixture C — existing Materials bullet list (this skill's own earlier
write) for the same repo:**

```json
{"type":"doc","version":1,"content":[
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"🔗 Materials & Links:"}]},
  {"type":"bulletList","content":[
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Preview Theme","marks":[{"type":"strong"}]},{"type":"text","text":": "},{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://example-jp.myshopify.com?preview_theme_id=999"}}]}]}]},
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Customize","marks":[{"type":"strong"}]},{"type":"text","text":": "},{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://example-jp.myshopify.com/admin/themes/999/editor"}}]}]}]},
    {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pull Request","marks":[{"type":"strong"}]},{"type":"text","text":": "},{"type":"text","text":"Link","marks":[{"type":"link","attrs":{"href":"https://github.com/emma-sleep/shopify-template-jp/pull/9999"}}]}]}]}
  ]}
]}
```

Reasoning through Steps 6 and 8 against Fixture C, same repo
`shopify-template-jp`, with a changed Preview Theme URL
(`...preview_theme_id=888`, same Customize/PR): confirm Step 6 detects
the existing bullet list (no duplicate heading), and Step 8's composed
document replaces only the Preview Theme link's `href`, leaving
Customize/PR and the heading byte-for-byte unchanged.

**Fixture D — existing Track section with Technical Development already
present, no checkmarks yet:**

```json
{"type":"doc","version":1,"content":[
  {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"📦 Track:"}]},
  {"type":"paragraph","content":[
    {"type":"text","text":"Technical Development -","marks":[{"type":"strong"}]},
    {"type":"text","text":" "},
    {"type":"status","attrs":{"text":"TO DO","color":"neutral"}}
  ]},
  {"type":"paragraph","content":[
    {"type":"text","text":"QA -","marks":[{"type":"strong"}]},
    {"type":"text","text":" "},
    {"type":"status","attrs":{"text":"TO DO","color":"neutral"}}
  ]}
]}
```

Reasoning through Step 7 against Fixture D for repo `shopify-template-jp`
(label `JP`): confirm it finds the Technical Development paragraph
(stopping before the QA paragraph, never touching it), drafts a delta
that sets that `status` node's `attrs` to `{"text":"DONE","color":"green"}`,
and inserts a new checkmark paragraph (emoji `:check_mark:` + bold "JP")
immediately after the Technical Development paragraph and before the QA
paragraph. Confirm the QA paragraph's `status` node is untouched in the
delta.

**Fixture E — Track section absent entirely** (reuse Fixture C's
document, which has no "📦 Track" heading at all): reasoning through Step
7 against Fixture C, confirm it produces no delta and that Step 16 would
report the Track update as skipped, not scaffold one from nothing.

- [ ] **Step 4: Dogfood — comment dedup and full compose (reasoning only)**

**Fixture F — existing comments array with today's Progress Update
already present:**

```json
[
  {"id":"1001","body":{"type":"doc","version":1,"content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"📣 Progress Update – 26/8"}]}]}},
  {"id":"1002","body":{"type":"doc","version":1,"content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Just an unrelated comment"}]}]}}
]
```

Reasoning through Step 9 against Fixture F, assuming today's computed
`D/M` is `26/8`: confirm it matches comment `1001` (not `1002`) and
records `commentId: "1001"` for Step 15. Then, assuming a different
today's date not present in the fixture (e.g. `27/8`), confirm Step 9
finds no match and Step 15 would create a new comment instead.

Finally, reasoning through Step 12 with one "What's done" bullet and one
"Next Steps" bullet (a fabricated but realistically-shaped accountId):
confirm the composed document matches the exact node sequence in the
SKILL.md's own Step 12 example — heading, rule, heading, bulletList,
paragraph, heading, bulletList, in that order, with no extra or missing
top-level nodes.

- [ ] **Step 5: If any dogfood run in Steps 2-4 surfaced a real gap, fix it now**

If every fixture's reasoning matched its expected outcome, skip this
step. Otherwise fix `skills/jira-progress-write-back/SKILL.md`'s wording
directly — most likely candidates are the ADF node-search logic in Steps
6/7/9 — then re-reason through the specific fixture that failed to
confirm the fix.

- [ ] **Step 6: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\jira-progress-write-back
git add skills/jira-progress-write-back/SKILL.md
git commit -m "feat(jira-progress-write-back): add I.1 skill — real ADF description and comment write-back"
```

---

### Task 2: Update `.digismith/history.html` and `MEMORY.md` for I.1

**Files:**
- Modify: `.digismith/history.html`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Task
  1's completed work, plus catching up `.digismith/history.html` to the
  I→I.1/I.2 + R/S split already committed to `MEMORY.md` earlier (that
  split never propagated to this file).
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Update the `I` row in `.digismith/history.html`'s map table**

Replace:

```html
    <tr><td><strong>I</strong></td><td>QA handoff</td>
      <td><strong>I.1</strong> JIRA comment write-back for a captured ephemeral URL (consumes <strong>M</strong>'s output) — no status transition, that stays manual by design · <strong>I.2</strong> end-to-end testing · <strong>I.3</strong> visual regression vs Figma</td>
      <td><span class="status todo">Not started</span></td></tr>
```

with:

```html
    <tr><td><strong>I</strong></td><td>QA handoff</td>
      <td><strong>I.1</strong> JIRA comment write-back for a captured ephemeral URL (consumes <strong>M</strong>'s output), including real ADF formatting — no status transition, that stays manual by design <span class="status done">Done</span> · <strong>I.2</strong> multi-repo distribution, gated behind a profile field (map item O) <span class="status todo">Not started</span></td>
      <td><span class="status next">In progress (1/2)</span></td></tr>
```

- [ ] **Step 2: Add `R` and `S` rows to the map table, immediately after the `Q` row**

```html
    <tr><td><strong>R</strong></td><td>End-to-end testing</td>
      <td>Split out of <strong>I</strong> (2026-08-26) into its own letter — it isn't a JIRA-write-back or distribution concern, just filed under the same "QA handoff" gap by coincidence. Scope otherwise undesigned</td>
      <td><span class="status todo">Not started</span></td></tr>
    <tr><td><strong>S</strong></td><td>Figma visual regression</td>
      <td>Visual regression vs Figma designs via a custom Figma skill. Split out of <strong>I</strong> (2026-08-26) for the same reason as <strong>R</strong></td>
      <td><span class="status todo">Not started</span></td></tr>
```

- [ ] **Step 3: Update the Progress Overview stats**

Change:

```html
    <div class="stat"><div class="n">8 / 17</div><div class="l">map items shipped</div></div>
```

to:

```html
    <div class="stat"><div class="n">8 / 19</div><div class="l">map items shipped</div></div>
```

(R and S are two new letters; neither is done, and **I** as a whole
letter still isn't "done" — I.2 remains open — so the shipped numerator
stays 8, matching how **E** stayed uncounted while E.1 shipped and E.2
remained open.)

- [ ] **Step 4: Add an I.1 paragraph after the existing `Q` paragraph**

```html
  <p style="font-size:.88rem; color:var(--muted);">
    <strong>I.1 — JIRA progress write-back:</strong> <code>jira-progress-write-back</code> skill —
    <a href="docs/jira-progress-write-back/design.html">design spec</a> ·
    <a href="docs/jira-progress-write-back/plan.md">implementation plan</a>
  </p>
```

- [ ] **Step 5: Update the Tier 5 row in the Build Order table**

Replace:

```html
    <tr><td><strong>5</strong></td><td>Technical expansion</td>
      <td><strong>D</strong> delivery · <strong>F</strong> design review · <strong>M</strong> ephemeral deploy capture <span class="status done">Done</span> · <strong>N</strong> implementation reporting <span class="status done">Done</span> · <strong>I.1/I.2/I.3</strong> QA handoff</td>
      <td><span class="status next">In progress (2/5 — M and N shipped, pulled forward out of tier order)</span></td></tr>
```

with:

```html
    <tr><td><strong>5</strong></td><td>Technical expansion</td>
      <td><strong>D</strong> delivery · <strong>F</strong> design review · <strong>M</strong> ephemeral deploy capture <span class="status done">Done</span> · <strong>N</strong> implementation reporting <span class="status done">Done</span> · <strong>I.1</strong> JIRA write-back <span class="status done">Done</span> · <strong>I.2</strong> multi-repo distribution · <strong>R</strong> E2E testing · <strong>S</strong> Figma visual regression</td>
      <td><span class="status next">In progress (3/8 — M, N, and I.1 shipped, pulled forward out of tier order)</span></td></tr>
```

- [ ] **Step 6: Add a timeline entry**

Append to the `.timeline` div, after its existing final entry (the
2026-08-16 E-amendment one):

```html
    <div class="event">
      <div class="date">2026-08-26</div>
      <h4>I split into I.1/I.2, R and S promoted to their own letters, I.1 built — 2 tasks, subagent-driven-development</h4>
      <p>Jack pointed out that map item I's original I.2 (multi-repo
      distribution, requested against the raw material captured from
      EMKT-784's real reporting workflow) is profile-dependent — it makes
      sense for Emma's multi-market repos but not a single-repo personal
      profile — while I's actual pre-existing I.2 (end-to-end testing)
      and I.3 (Figma visual regression) were never JIRA-write-back or
      distribution concerns at all, just filed under I's "QA handoff" gap
      by coincidence. Those two were promoted to their own top-level
      letters, <strong>R</strong> and <strong>S</strong>. <strong>I.1</strong>
      (JIRA progress write-back) was then brainstormed, specced, and
      built: a single skill posting real ADF status lozenges, emoji, and
      a dated progress comment against a ticket's description and
      comment thread, grounded directly in EMKT-784's real live ticket
      content rather than an invented format, and scoped to exactly one
      repo/market at a time — multi-repo orchestration stays entirely
      with <strong>I.2</strong>, not yet built. Task 1 built and dogfooded
      <code>skills/jira-progress-write-back/SKILL.md</code>, including a
      pass against a real disposable Jira issue to confirm actual ADF
      node creation (not just well-reasoned JSON) — a deliberate
      departure from every prior DigiSmith skill's pure-fixture dogfood,
      since this feature's correctness can't be confirmed any other way.
      Task 2 is this history.html and MEMORY.md update.</p>
    </div>
```

- [ ] **Step 7: Update `MEMORY.md`'s `I` row**

Replace:

```markdown
| **I** | QA handoff | **I.1** JIRA comment write-back for a captured ephemeral URL (consumes **M**'s output), including real ADF formatting (status lozenges, emoji, collapsible panels) so the update reads native, not markdown-approximated — no status transition, that stays manual by design · **I.2** multi-repo distribution, split out as its own sub-item (2026-08-26): fan a ticket's worktree/branch/PR out across every affected repo (Emma's per-market theme repos), handling per-repo SSH identity and template-conformant PRs, then loop **M**'s ephemeral-capture over each before **I.1** reports back — gated behind a profile field (map item **O**), since it's a multi-repo-market concern with nothing to do for a single-repo personal profile |
```

with:

```markdown
| **I** | QA handoff | **I.1** JIRA comment write-back for a captured ephemeral URL (consumes **M**'s output), including real ADF formatting (status lozenges, emoji) so the update reads native, not markdown-approximated — no status transition, that stays manual by design. Shipped 2026-08-26: `digismith:jira-progress-write-back` skill, single repo/ticket at a time · **I.2** multi-repo distribution, split out as its own sub-item (2026-08-26): fan a ticket's worktree/branch/PR out across every affected repo (Emma's per-market theme repos), handling per-repo SSH identity and template-conformant PRs, then loop **M**'s ephemeral-capture over each before **I.1** reports back — gated behind a profile field (map item **O**), since it's a multi-repo-market concern with nothing to do for a single-repo personal profile. Not yet built |
```

- [ ] **Step 8: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\jira-progress-write-back
git add .digismith/history.html MEMORY.md
git commit -m "docs: update history — jira-progress-write-back (I.1) shipped"
```

---

**After Task 2's final review passes:** per `MEMORY.md`'s Conventions
("Every `subagent-driven-development` plan invokes
`digismith:report-implementation`"), invoke `digismith:report-implementation`
before this plan's ledger is deleted.

**After this plan merges:** Task 1's dogfood is reasoning-only (per the
SDD-ledger ruling above) — this skill will not have made a single real
Jira API call before it first runs for real. The design's actual
acceptance bar is therefore a live run against an actual in-flight
ticket (e.g. the next time EMKT-784-style work happens): confirm the
skill correctly recognizes and updates *pre-existing* human-authored
content (a real multi-market table, a real Track checklist with stages
this skill has never touched), and confirm the ADF nodes it writes
actually render as real status lozenges/emoji/mentions (the `data-id`
tell), not broken literal text. Watch that first real run closely. That
run is manual and cannot be scripted into this plan.

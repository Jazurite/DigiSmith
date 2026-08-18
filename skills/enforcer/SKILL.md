---
name: enforcer
description: Use when about to invoke superpowers:brainstorming or superpowers:writing-plans for DigiSmith-tracked feature work, or immediately after either one finishes writing its output — via digismith:bootstrap's hand-off, or directly for DigiSmith's own self-development with no ticket involved. Also covers: in plan mode, or "spec"/"plan"/"shape" language, or running brainstorming/writing-plans, for DigiSmith-tracked work specifically.
---

# Enforcer

## Overview

DigiSmith's map item **Q**. `superpowers:brainstorming` and
`superpowers:writing-plans` are third-party Superpowers skills with their
own default output locations (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`,
`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`) and, for
`brainstorming`, its own default format (plain Markdown). DigiSmith's
unified docs convention requires `.digismith/docs/<slug>/design.html`
(HTML) and `.digismith/docs/<slug>/plan.md` (Markdown — already the right
format, just the wrong location by default) instead. Both skills already
expose the hook this needs, each in its own one-line form — no single
merged quote exists verbatim in either: `brainstorming` notes that user
preferences for spec *location* override its default, and
`writing-plans` says the same for plan *location*. Nothing told them the
override existed until now — this skill is that explicit telling, plus a
check that it actually worked. For `brainstorming` specifically, Enforcer's
Advisory goes one step further than that location hook literally covers:
it also overrides *format* — HTML instead of `brainstorming`'s own default
Markdown — which the upstream hook says nothing about on its own.

## When to Use

Two moments, for DigiSmith-tracked work only (see Detecting
DigiSmith-Tracked Work below):

- **Before** invoking `superpowers:brainstorming` or
  `superpowers:writing-plans` — give it the override instruction
  (Advisory).
- **Immediately after** either one reports it has written its output —
  `brainstorming`'s "Spec written and committed to `<path>`" message, or
  `writing-plans`'s "Plan complete and saved to `<path>`" message — check
  it landed correctly (Verified).

Both moments happen inside the same continuous session as
`digismith:bootstrap` or the ad-hoc brainstorming call itself. There is no
separate dispatch for this — it's a self-check the acting agent runs on
its own next actions, the same way `inject-standards`' Scenario 3 already
self-triggers on "running brainstorming/writing-plans" today.

## Detecting DigiSmith-Tracked Work

Current working directory is DigiSmith's own repo
(`.claude-plugin/plugin.json` with `"name": "digismith"`), or the repo
has `.digismith/profile` present. If neither, this isn't DigiSmith-tracked
work — do nothing, let `brainstorming`/`writing-plans` run with their own
unmodified defaults.

## Resolving the Slug

- Invoked from `digismith:bootstrap` Step 3: the slug is already known —
  reuse it exactly as `digismith:bootstrap` derived it (the folder
  `ticket.md` sits in, or the directly-derived slug under
  `ticket: false`). Never re-derive independently.
- Invoked ad hoc — no ticket, no `digismith:bootstrap` in the loop (DigiSmith's
  own self-development, or any other untracked-by-a-ticket case): derive
  the slug directly from the feature description, applying
  `digismith:jira-intake` Step 3.1's deterministic rule — lowercase, drop
  filler words (a, an, the, on, to, of, for, in), replace remaining
  non-alphanumeric runs with a single hyphen, truncate to ~40 characters
  at a word boundary. Same algorithm `digismith:bootstrap` itself restates
  inline for its own `ticket: false` path — not reinvented here either.

## Process

### Step 1: Advisory — Before `superpowers:brainstorming`

Append this to the invocation, as explicit instructions the agent gives
itself:

Write the spec to `.digismith/docs/<slug>/design.html`, not the default
`docs/superpowers/specs/...md` location. Use this exact HTML shell,
filling in `{{TITLE}}`, `{{DATE}}`, `{{MAP_ITEM}}`, and the body
`<section>`s per the spec's own content — reuse the `<style>` block
byte-for-byte, never modify it:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #5a5a5a; --border: #dcdcdc;
    --code-bg: #f4f4f4; --accent: #7a4fb5; --card-bg: #faf9fc;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16151a; --fg:#e8e6ee; --muted:#a3a0ac; --border:#332f3d;
      --code-bg:#211f28; --accent:#b892ea; --card-bg:#1d1b23; }
  }
  * { box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.6; max-width: 860px; margin: 0 auto; padding: 2.5rem 1.5rem 6rem;
  }
  header.doc-head { border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; margin-bottom: 2rem; }
  h1 { font-size: 1.7rem; margin: 0 0 .4rem; }
  .meta { color: var(--muted); font-size: .9rem; }
  .meta span { margin-right: 1.2rem; }
  .badge {
    display: inline-block; border: 1px solid var(--accent); color: var(--accent);
    border-radius: 999px; padding: .1rem .6rem; font-size: .78rem; font-weight: 600;
  }
  nav.toc { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px;
    padding: 1rem 1.4rem; margin: 1.5rem 0 2.5rem; font-size: .92rem; }
  nav.toc h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); margin: 0 0 .6rem; }
  nav.toc ol { margin: 0; padding-left: 1.2rem; columns: 2; }
  nav.toc a { color: var(--fg); text-decoration: none; }
  nav.toc a:hover { color: var(--accent); }
  section { margin-bottom: 2.6rem; }
  h2 { font-size: 1.25rem; border-bottom: 1px solid var(--border); padding-bottom: .35rem; }
  h3 { font-size: 1.05rem; color: var(--accent); margin-top: 1.6rem; }
  code { background: var(--code-bg); padding: .1rem .35rem; border-radius: 4px; font-size: .88em; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 1rem; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  ul, ol { padding-left: 1.4rem; }
  li { margin-bottom: .3rem; }
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: .9rem; margin: 1.2rem 0; }
  @media (max-width: 700px) { .cards { grid-template-columns: 1fr; } nav.toc ol { columns: 1; } table { font-size: .82rem; } }
  .card { border: 1px solid var(--border); background: var(--card-bg); border-radius: 10px; padding: 1rem 1.2rem; }
  .card h4 { margin: 0 0 .3rem; font-size: .98rem; }
  .card .tag { font-size: .74rem; color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
  .card p { margin: .4rem 0 0; font-size: .9rem; color: var(--muted); }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; margin: 1rem 0; }
  .table-wrap { overflow-x: auto; }
  th, td { border: 1px solid var(--border); padding: .5rem .7rem; text-align: left; vertical-align: top; }
  th { background: var(--card-bg); }
  .callout { border-left: 3px solid var(--accent); background: var(--card-bg);
    padding: .8rem 1.1rem; border-radius: 0 8px 8px 0; font-size: .92rem; }
  footer { color: var(--muted); font-size: .82rem; border-top: 1px solid var(--border);
    padding-top: 1rem; margin-top: 3rem; }
</style>
</head>
<body>

<header class="doc-head">
  <span class="badge">approved for planning</span>
  <h1>{{TITLE}}</h1>
  <div class="meta">
    <span>Date: {{DATE}}</span>
    <span>Map item: {{MAP_ITEM}}</span>
  </div>
</header>

<nav class="toc">
  <h2>Contents</h2>
  <ol>
    {{TOC_ITEMS}}
  </ol>
</nav>

{{BODY_SECTIONS}}

<footer>DigiSmith · .digismith/docs/<slug>/design.html</footer>

</body>
</html>
```

`{{MAP_ITEM}}` is "no map letter — `<one-line reason>`" for a structural
change with no map letter, same as `unified-docs-convention/design.html`
already does — never leave it blank or invent a letter.

Also append a gitignore check, mirroring `digismith:report-implementation`'s
identical check for `report.html`: `.digismith/docs/` can be gitignored in
a consumer repo per `digismith:jira-intake`'s own per-repo choice, and
`git add` hard-fails on an ignored path. Before committing,
`git check-ignore -q .digismith/docs/<slug>/design.html` — **0 = ignored**
→ write the file but skip `git add`/commit, never force with `-f`;
**1 = not ignored** → commit normally. Exit code 1 is the normal, expected
answer, not a failure.

### Step 2: Verified — After `superpowers:brainstorming` Reports Completion

`brainstorming` reports its own output path when it finishes (e.g. "Spec
written and committed to `<path>`"). Compare that reported path against
the expected `.digismith/docs/<slug>/design.html`:

- **Matches, and the file is HTML** → done, continue to Step 3 (Publish).
- **Doesn't match, or wrong format** → read the file `brainstorming`
  actually wrote (its reported path). Before rewrapping it yourself, try
  offloading the rewrap — but **only when the current working directory is
  DigiSmith's own repo** (`.claude-plugin/plugin.json` with `"name":
  "digismith"`, the same repo-identity check this file already uses in
  Step 3). The script lives at DigiSmith's repo root and its profile field
  is read from there, so anywhere else — which is every consumer repo, the
  normal case for real ticket work — skip the offload attempt entirely and
  rewrap in-session, with no error noise. When the check passes: write a
  prompt file containing (1) the exact
  Step 1 HTML shell with `{{TITLE}}`, `{{DATE}}`, `{{MAP_ITEM}}` already
  filled in and `{{TOC_ITEMS}}`/`{{BODY_SECTIONS}}` left as literal
  placeholders, (2) the misplaced file's full content, and (3) one
  instruction line: "Fill `{{TOC_ITEMS}}` and `{{BODY_SECTIONS}}` from
  the content above, preserving all of its information; return only the
  complete HTML document, nothing else." Run:
  `python scripts/model_offload.py --prompt-file <prompt-file>
  --profile-path .digismith/profile`. On exit 0, use its stdout as the
  file content verbatim — the script already validated it's a complete,
  fully-substituted HTML document and exits non-zero if it isn't. On any
  non-zero exit (offload unavailable, off, skipped because this isn't
  DigiSmith's repo, or failed — the stderr line names which), rewrap it yourself
  exactly as before: the body content it already wrote becomes
  `{{BODY_SECTIONS}}`. Either way, write the result to
  `.digismith/docs/<slug>/design.html`, creating the folder if needed,
  and report what was corrected: "Enforcer: brainstorming wrote to
  `<old-path>` — moved and reformatted (<via Chutes|in-session>) to
  `.digismith/docs/<slug>/design.html`."
- **Nothing found at the reported location** → stop and say so plainly;
  don't guess or silently proceed. This means `brainstorming` produced no
  artifact at all, a different failure than a misplaced one.

### Step 3: Publish — HTML Artifact, Convention Amendment

Once Step 2 confirms `.digismith/docs/<slug>/design.html` is correctly
placed, check whether this repo's profile allows publishing before
calling `Artifact`.

**Resolve the profile:** if `.digismith/profile` exists (this step runs
whenever Detecting DigiSmith-Tracked Work passed — via repo identity *or*
this file, so it may legitimately be absent), read its one-line content
as the active profile name. Locate DigiSmith's own repo — same rule
`digismith:inject-standards` and `report-implementation` use: current
working directory has `.claude-plugin/plugin.json` with `"name":
"digismith"` → use it directly; otherwise ask the user for the path and
remember it. If that path can't be resolved (declined, or wrong), treat
it the same as "no matching profile" below — proceed as if
`publish_artifact` were absent/true. Never read `profiles/` under a
plugin cache path — a stale, version-locked snapshot. Read
`profiles/<name>.yml` there.

- **No `.digismith/profile` file, or no matching `profiles/<name>.yml`**
  → treat as absent, proceed as below (same disposition as
  `publish_artifact: true`).
- **`publish_artifact: false`** → skip the `Artifact` tool call entirely.
  State plainly: "Not published — `publish_artifact: false` in this
  repo's profile." `design.html` itself is unaffected — it was already
  written (and, per Step 1's gitignore disposition, possibly committed)
  before this check runs.
- **`publish_artifact: true`, or the field absent** → proceed: per
  `MEMORY.md`'s Conventions section (Unified Docs Convention entry), the
  per-feature HTML docs — `design.html` and `report.html`, specifically,
  never `.digismith/history.html` or the plain `plan.md`/`ticket.md`
  working files — get published for readability. Call the `Artifact`
  tool on `design.html`: `title` from the doc's own `<title>` tag,
  `description` one sentence summarizing the feature, `favicon` one or
  two emoji fitting the feature's topic (pick contextually — never reuse
  a generic default across unrelated features). Report the returned URL
  back to whoever is running this.

### Step 4: Advisory — Before `superpowers:writing-plans`

`writing-plans` runs as `brainstorming`'s own terminal step once the user
approves the spec — there is no separate `digismith:bootstrap` hook here, so
this step fires from this skill's own trigger recognition (see When to
Use), not from a second explicit call anywhere else. Append to the
invocation:

Write the plan to `.digismith/docs/<slug>/plan.md`, not the default
`docs/superpowers/plans/...md` location. Format is unchanged — plans stay
Markdown.

### Step 5: Verified — After `superpowers:writing-plans` Reports Completion

Same pattern as Step 2, simpler since format never changes (Markdown
either way):

- **Matches** → done.
- **Doesn't match** → move the file `writing-plans` actually wrote (its
  reported path) to `.digismith/docs/<slug>/plan.md`, creating the folder
  if needed. Report the correction, same phrasing as Step 2.
- **Nothing found** → stop and say so plainly.

This step fires at the same moment `digismith:subagent-driven-always`
(map item H) intercepts `writing-plans`' Execution Handoff step — both
trigger right after the plan is saved. This step must complete first:
a misplaced `plan.md` needs to be corrected before
`subagent-driven-always` dispatches `subagent-driven-development` against
the wrong path.

`plan.md` is not published as an artifact — see the convention
amendment's own scope note: it's a working document, not something
presented.

## Error Handling

- **Not DigiSmith-tracked work** (Detecting DigiSmith-Tracked Work found
  neither signal) → do nothing, let both Superpowers skills run with
  their own unmodified defaults.
- **Advisory given but the hand-off still lands in the wrong place** →
  expected to happen sometimes, not a bug in this skill — that's exactly
  what Step 2/Step 5's move-and-correct exists for.
- **Neither the expected path nor the reported actual path has anything
  written** → stop, say so, don't fabricate a location.
- **Target `design.html` path is gitignored in this repo**
  (`git check-ignore -q .digismith/docs/<slug>/design.html` exits 0) →
  write the file, skip `git add`/`git commit`, and say plainly that it
  wasn't committed because this repo's `.digismith/docs/` is gitignored.
  Not an error, and not a reason to force with `-f`. (Exit code 1 means
  "not ignored" — the normal path — not a failure.)
- **`Artifact` publish call fails** (e.g. size limit, malformed HTML) →
  report the failure plainly; the file itself is still correctly placed,
  so this doesn't roll back Step 2's correction — only the publish step
  didn't complete.
- **Active profile has `publish_artifact: false`** → `design.html` is
  still written (and committed, per Step 1's gitignore disposition)
  exactly as normal; only the `Artifact` publish call (Step 3) is
  skipped.

## Quick Reference

| Step | Action |
|---|---|
| — | Detect DigiSmith-tracked work (repo identity or `.digismith/profile`); skip entirely if neither |
| — | Resolve `<slug>` (reuse `digismith:bootstrap`'s, or derive via `digismith:jira-intake` Step 3.1's rule for ad-hoc calls) |
| 1 | Advisory before `brainstorming`: exact target path + HTML shell (style block verbatim) |
| 2 | Verified after `brainstorming`: check `design.html` landed correctly; move/rewrap if not |
| 3 | Publish `design.html` via `Artifact` unless the active profile has `publish_artifact: false`; report the link |
| 4 | Advisory before `writing-plans`: exact target path, format unchanged |
| 5 | Verified after `writing-plans`: check `plan.md` landed correctly; move if not |

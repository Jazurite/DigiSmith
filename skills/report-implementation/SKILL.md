---
name: report-implementation
description: Use when a `digismith:subagent-driven-development` plan's final whole-branch review has just come back clean (all findings fixed, parked, or none found) — right before that skill's own Finish step deletes the plan's workspace.
---

# Report Implementation

## Overview

DigiSmith's map item **N**. Formalizes what was, until now, a
manually-written report (see
`.digismith/docs/standards-injection/report.html`,
written by hand for map item G) into a required step of every
`digismith:subagent-driven-development` plan's completion. Generates an
HTML implementation report — what shipped, the per-task review record,
the final-review findings and how they were resolved, the commit list —
and commits it to `.digismith/docs/<feature-slug>/`.

## When to Use

Right when a `digismith:subagent-driven-development` plan's final
whole-branch review has come back clean — every finding fixed, parked
with a ruling, or the review found nothing to begin with — and **before**
that skill's own Finish step runs `rm -rf` on the plan's workspace
(`.superpowers/sdd/<plan-basename>/`). This is earlier than "after the
branch merges": the ledger this skill reads only exists until that
deletion, and this repo's merges are always fast-forward, so the commit
range recorded here won't change once
`digismith:finishing-a-development-branch` actually runs.

That last point is an assumption, not a guarantee: it holds because every
DigiSmith feature so far has merged fast-forward. If a real merge commit
is ever created instead, the commit range recorded at trigger-time could
differ from what actually lands on `main` — re-examine this design the
first time that happens.

## Prerequisites

A ledger must exist at `.superpowers/sdd/<plan-basename>/progress.md`. If
it doesn't (e.g. the plan ran via `digismith:executing-plans` instead of
`digismith:subagent-driven-development`), this skill's trigger condition
isn't met — skip it silently and let the other skill's Finish step proceed
as normal. Don't render a report from nothing.

The active profile must also have reporting turned on. Check for
`.digismith/profile` in the repo currently being worked in (never
DigiSmith's own repo, which only hosts this skill).

- **Missing** → proceed exactly as today; this gate does nothing.
- **Present** → read its one-line content as the active profile name,
  then locate DigiSmith's own repo — same rule
  `digismith:inject-standards` uses for `standards/`: is the current
  working directory itself the DigiSmith repo
  (`.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
  directly. Otherwise ask the user for DigiSmith's repo path this session
  and remember it. Never read `profiles/` under a plugin cache path — a
  stale, version-locked snapshot. Read `profiles/<name>.yml` there.
  - **No matching file** → treat as stale; proceed exactly as today, same
    as "missing."
  - **`reporting: false`** → this skill's trigger condition isn't met.
    Skip it entirely and silently — the same disposition as the no-ledger
    case above — and let
    `digismith:subagent-driven-development`'s Finish step proceed as
    normal. Don't write a report, don't commit anything, don't ask.
  - **`reporting: true`, or the field absent** → proceed as today.
    Neither shipped profile turns reporting off, so this is the normal
    path.

The same resolved profile (or its "missing"/"stale" disposition) carries
forward to Step 4 item 5's `publish_artifact` check — read once here, not
re-located or re-read there.

This skill runs in the **controller session** — the one driving
`digismith:subagent-driven-development` — not as a sub-dispatched agent.
That's what makes `AskUserQuestion` available, which Step 4's
ask-before-overwrite rule depends on. Don't delegate this skill wholesale
to a subagent that can't ask.

## Process

### Step 1: Locate and Read Sources

1. **Plan file** — the same plan file the just-finished run executed,
   normally `.digismith/docs/<feature-slug>/plan.md`. Derive
   `<feature-slug>` from that file's path, **guarded**:
   - **Check first:** does the plan's path actually match
     `.digismith/docs/<something>/plan.md` — i.e. is its parent directory
     sitting directly under `.digismith/docs/`?
   - **Yes (the normal case)** → `<feature-slug>` is that parent directory
     name. Read it straight off the path; don't re-derive it from content.
     E.g. `.digismith/docs/capture-ephemeral-url/plan.md` →
     `capture-ephemeral-url`.
   - **No (the plan lives somewhere else)** → the parent directory name is
     *not* a slug and must not be used as one. This happens when a plan
     predates the unified-docs convention, or was deliberately excluded
     from a migration, and still sits under the old
     `docs/superpowers/plans/` layout — where the parent directory is
     literally `plans`. Fall back to parsing the slug out of the plan
     file's **own filename**, which follows `<date>-<slug>-plan.md`: strip
     the leading `<date>-` (`YYYY-MM-DD-`) and the trailing `-plan.md`.
     E.g. `docs/superpowers/plans/2026-08-08-unified-docs-convention-plan.md`
     → `unified-docs-convention` (**not** `plans`).

   Either way, the slug you end up with defines
   `.digismith/docs/<feature-slug>/` as the target folder for everything
   downstream — report output path (Step 4), the footer, and the sibling
   spec/plan links. In the fallback case that folder may not yet contain a
   `design.html` or `plan.md` at all (they're still at their old location);
   that needs no extra handling — Step 2a's existing
   omit-the-link-if-the-file-isn't-there rule already covers it.
2. **Ledger** — `.superpowers/sdd/<plan-basename>/progress.md`, in full.
3. **Commit range:**
   - `MERGE_BASE` — the hash before `..` in the ledger's *first*
     `Task 1: complete (commits <base>..<head>, ...)` line.
   - `HEAD` — current `git rev-parse HEAD`.
4. Run `git log --reverse --oneline MERGE_BASE..HEAD` — `--reverse` is
   required, because the Commits section lists commits oldest-first
   (chronological build order) and plain `git log` is newest-first.

If no ledger exists at that path, stop here entirely — this skill doesn't
apply to this run.

5. **Ticket key (optional):** using the same `<feature-slug>` already
   derived above, check whether
   `.digismith/docs/<feature-slug>/ticket.md` exists and has a
   `**Key:**` line. If so, note that key for Step 2a. Then check for
   `.digismith/profile` in the repo currently being worked in (the same
   repo `<feature-slug>` lives in) — Prerequisites already resolved this
   same file and its `profiles/<name>.yml` for the `reporting` gate, so
   reuse what you read there rather than re-locating or re-asking. Missing → the derived key (if any)
   is used as-is in Step 2a. Present → read its one-line content as the
   active profile name, locate DigiSmith's own repo (same rule
   `digismith:inject-standards` uses for `standards/`: current working
   directory has `.claude-plugin/plugin.json` with
   `"name": "digismith"` → use it directly; otherwise ask the user for
   the path and remember it; never read `profiles/` under a plugin cache
   path — a stale, version-locked snapshot), and read
   `profiles/<name>.yml` there. No
   matching file → treat as stale, use the derived key (if any) as-is,
   same as "missing". Otherwise, if that profile's `ticket` field is
   `false`, discard the derived key entirely for Step 2a regardless of
   whether `ticket.md` had one — the ticket-key meta span is omitted.

**If the ledger has no `Final review (...)` line**, don't quietly proceed.
This skill's trigger condition *is* "the final review just passed," so a
missing final-review line means either the ledger doesn't follow
DigiSmith's required grammar (see `MEMORY.md`'s Conventions section) or
this skill fired at the wrong moment. Say so plainly to whoever is running
this skill, and ask before continuing — don't silently render
"final-review detail isn't available yet" as if it were normal partial
progress. (The one genuinely-expected case is a deliberate fixture that
simulates firing before any final review ran at all; that's covered in
Error Handling, and it's still worth stating out loud rather than
absorbing silently.)

### Step 2: Parse the Ledger into Report Content

The ledger follows DigiSmith's standardized line grammar — per-task lines
from `digismith:subagent-driven-development` itself, plus the
final-review lines DigiSmith requires on top of it (both documented in
`MEMORY.md`'s Conventions section). Everything below keys off that
grammar.

#### 2a. Header-level placeholders

Derive all of these mechanically — a cold-start agent with no
conversational memory of the feature must be able to produce them from
the plan file, the ledger, and `git` alone:

- **`{{FEATURE_TITLE}}`** — the plan file's own H1 heading
  (`# <Title> Implementation Plan`) with the trailing
  `" Implementation Plan"` stripped. E.g. `# Capture Ephemeral URL (M)
  Implementation Plan` → `Capture Ephemeral URL (M)`.
- **`{{DATE}}`** — today's date in ISO `YYYY-MM-DD`: the date this report
  is generated, not the plan's date.
- **`{{MAP_ITEM}}`** — the map-item letter/number in `{{FEATURE_TITLE}}`'s
  own parenthetical. E.g. `Capture Ephemeral URL (M)` → `M`.
- **`{{TICKET_KEY_META}}`** — from Step 1.5: if a ticket key survived
  that step's profile gate, this is literally
  `<span>Ticket: <strong><Key></strong></span>` with the real key
  substituted (escaped per Step 2f, though a JIRA key like `EMKT-9001`
  never actually needs it). If no key survived (no `ticket.md`, no
  `**Key:**` line in it, or the active profile has `ticket: false`),
  this is the empty string — the span is omitted entirely, not rendered
  blank.
- `{{FEATURE_SLUG}}`: the slug already derived in Step 1 — the plan file's
  parent directory name in the normal case, or the slug parsed out of its
  filename in Step 1's fallback case. E.g. `capture-ephemeral-url`. Never
  a bare container directory like `plans`.
- **`{{MERGE_BASE_SHORT}}` / `{{HEAD_SHORT}}`** — the short hashes from
  Step 1's commit range.
- `{{SPEC_RELATIVE_LINK}}` / `{{PLAN_RELATIVE_LINK}}`: same folder as the
  report itself — literally `design.html` and `plan.md`. Check each one
  for real: if `design.html` doesn't exist in that folder (a plan with no
  separate design spec, or a spec that hasn't been migrated there yet),
  omit that link and its clause from the summary sentence rather than
  linking a 404; same for `plan.md`; keep whichever clause names a file
  that does exist. If neither exists, drop the whole "Reference documents"
  sentence.
- **`{{REPORT_FILENAME}}`** — always literally `report.html`.
- **`{{SUMMARY_PARAGRAPH}}`** — derive mechanically; never require memory
  of the conversation that built the feature. Compose it from three
  sources:
  1. the plan's own `**Goal:**` line (what was built and why),
  2. the plan's own `**Architecture:**` line (how it's shaped),
  3. this fixed closing sentence: *"Followed the full Superpowers process:
     brainstorming → spec → writing-plans →
     `digismith:subagent-driven-development` (`<N>` tasks, each
     dispatched to a fresh implementer subagent and independently
     reviewed) → a final whole-branch review"* — where `<N>` is the number
     of `### Task N:` headings in the plan. Append
     *", plus `<R>` fix round(s) before merge"* if any task line or the
     final review itself recorded a fix round (`<R>` = total fix rounds
     across the whole run). Trim/rewrap 1-3 for prose flow, but don't add
     facts that aren't in those sources.

#### 2b. Build Process rows

One per task. For each `Task <N>: complete (...)` line:

- **Task title** — the plan's `### Task N: ...` heading.
- **Review verdict** — scan **all** `Task <N>: ...` lines for that same
  task number, not just the completion line:
  - If any `Task <N>: fix round <R>/5 (...)` lines exist for that task,
    the verdict is **"Approved after `<R>` fix round(s)"**, where `<R>` is
    the highest round number found — even if the completion line also
    says "review clean". A completion line's "review clean" describes the
    *last* review pass, not the task's whole history.
  - Only when zero fix-round lines exist for that task number is a bare
    **"Approved, clean"** correct.
  - Add any `Task <N>: parked — ...` items to the verdict cell too (e.g.
    "Approved after 2 fix rounds, 1 parked").
- **BLOCKED tasks** — if any `Task <N>: BLOCKED` line exists, still render
  that task's row, and note it plainly in the verdict cell (e.g.
  "BLOCKED — `<reason>`"). Never silently omit a blocked task.
- **Deferred minors** — every `Task <N>: minor (deferred): ...` line for
  that same task number, verbatim.

#### 2c. Final Review & Fix rows

One row per distinct finding named in the ledger's `Final review (...)`
line and any subsequent `Task <N>: fix round ...` /
`Scoped re-review (...)` / `Final review: parked — ...` lines that
reference it. Each row: severity, the finding (trimmed from the ledger
text), and its resolution (fixed, or parked with its ruling quoted).
**If the final-review line reports zero findings, omit this entire
section** — never render an empty table.

#### 2d. What Was Delivered cards

One per task, titled from the plan's `### Task N: ...` heading, described
in one sentence drawn from that task's `**Interfaces:** Produces:` line in
the plan file.

#### 2e. Commits

`{{COMMIT_LIST_ITEMS}}` is one
`<li><span class="sha">&lt;short-sha&gt;</span> &lt;subject&gt;</li>` per
commit, **oldest-first (chronological)** — exactly the order Step 1's
`git log --reverse --oneline MERGE_BASE..HEAD` prints. Never newest-first.

#### 2f. Escaping (do this before substituting anything)

Every value pulled from the ledger or plan and dropped into the HTML
template — deferred-minor text, finding text, resolution text, verdicts,
summary content, commit subjects — must be escaped first, in this order:

1. Replace `&` → `&amp;`, then `<` → `&lt;`, then `>` → `&gt;`.
2. Then convert Markdown backtick-spans: `` `text` `` → `<code>text</code>`.

This is not optional. This project's own ledger lines routinely contain
literal angle brackets (`<Key>__<slug>`, `<plan-basename>`,
`Task <N>: complete`) that would otherwise be swallowed as unknown tags or
break the table markup outright.

### Step 3: Render the HTML

Before rendering it yourself, try offloading this step — but **only when
the current working directory is DigiSmith's own repo**
(`.claude-plugin/plugin.json` with `"name": "digismith"`, the same
repo-identity check Prerequisites already uses). The script lives at
DigiSmith's repo root and its profile field is read from there, so
anywhere else — which is every consumer repo, the normal case for real
ticket work — skip the offload attempt entirely and render in-session,
with no error noise.

When the check passes: write a prompt
file containing (1) every placeholder value derived in Step 2 (2a-2f),
clearly labeled by name, and (2) the exact template below plus one
instruction line: "Substitute each `{{PLACEHOLDER}}` with the labeled
value above exactly — escaping is already applied, don't re-escape;
return only the complete HTML document, nothing else." Run:
`python scripts/model_offload.py --prompt-file <prompt-file>
--profile-path .digismith/profile`. On exit 0, use its stdout as
`report.html`'s content verbatim — the script already validated it's a
complete, fully-substituted HTML document and exits non-zero if it isn't
— and skip the manual substitution below, continuing straight to Step 4.
On any non-zero exit (offload unavailable, off, skipped because this
isn't DigiSmith's repo, or failed — the stderr line names which), render
it yourself exactly as described below.

Either way, when Step 4 reports the written `report.html`, state plainly
which path produced it — "generated via Chutes" or "generated in-session,
offload unavailable/off" — the same way `digismith:enforcer` names its
rewrap path. Never leave the choice silent.

Use this exact template, replacing each `{{PLACEHOLDER}}`. Keep the
`<style>` block byte-for-byte — it's the same one every DigiSmith
spec/report already uses:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{FEATURE_TITLE}} — Implementation Report</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #5a5a5a; --border: #dcdcdc;
    --code-bg: #f4f4f4; --accent: #7a4fb5; --card-bg: #faf9fc;
    --good: #1a7f4b; --good-bg: #eefaf3; --warn: #9a6400; --warn-bg: #fdf6e3;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16151a; --fg:#e8e6ee; --muted:#a3a0ac; --border:#332f3d;
      --code-bg:#211f28; --accent:#b892ea; --card-bg:#1d1b23;
      --good:#4fd889; --good-bg:#12271c; --warn:#e0b34d; --warn-bg:#2b230f; }
  }
  * { box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 2.5rem 1.5rem 6rem;
  }
  header.doc-head { border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; margin-bottom: 2rem; }
  h1 { font-size: 1.7rem; margin: 0 0 .4rem; }
  .meta { color: var(--muted); font-size: .9rem; }
  .meta span { margin-right: 1.2rem; }
  .badge {
    display: inline-block; border: 1px solid var(--good); color: var(--good);
    background: var(--good-bg);
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
  @media (max-width: 560px) { .cards { grid-template-columns: 1fr; } nav.toc ol { columns: 1; } table { font-size: .82rem; } }
  .card { border: 1px solid var(--border); background: var(--card-bg); border-radius: 10px; padding: 1rem 1.2rem; }
  .card h4 { margin: 0 0 .3rem; font-size: .98rem; }
  .card .tag { font-size: .74rem; color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
  .card p { margin: .4rem 0 0; font-size: .9rem; color: var(--muted); }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; margin: 1rem 0; }
  .table-wrap { overflow-x: auto; }
  th, td { border: 1px solid var(--border); padding: .5rem .7rem; text-align: left; vertical-align: top; }
  th { background: var(--card-bg); }
  .callout { border-left: 3px solid var(--accent); background: var(--card-bg);
    padding: .8rem 1.1rem; border-radius: 0 8px 8px 0; font-size: .92rem; margin: 1rem 0; }
  .callout.action { border-left-color: var(--warn); background: var(--warn-bg); }
  .status-ok { color: var(--good); font-weight: 600; }
  .status-fixed { color: var(--warn); font-weight: 600; }
  .commit-list { list-style: none; padding: 0; margin: .6rem 0; }
  .commit-list li { font-family: ui-monospace, Consolas, monospace; font-size: .84rem;
    padding: .3rem 0; border-bottom: 1px dashed var(--border); }
  .commit-list li:last-child { border-bottom: none; }
  .sha { color: var(--accent); font-weight: 600; }
  footer { color: var(--muted); font-size: .82rem; border-top: 1px solid var(--border);
    padding-top: 1rem; margin-top: 3rem; }
</style>
</head>
<body>

<header class="doc-head">
  <span class="badge">implementation complete — ready to merge</span>
  <h1>{{FEATURE_TITLE}} — Implementation Report</h1>
  <div class="meta">
    <span>Date: {{DATE}}</span>
    <span>Map item: <strong>{{MAP_ITEM}}</strong></span>
    {{TICKET_KEY_META}}
    <span>Commit range: <code>{{MERGE_BASE_SHORT}}..{{HEAD_SHORT}}</code></span>
  </div>
</header>

<nav class="toc">
  <h2>Contents</h2>
  <ol>
    <li><a href="#summary">Summary</a></li>
    <li><a href="#delivered">What Was Delivered</a></li>
    <li><a href="#build">Build Process</a></li>
    {{TOC_FINALREVIEW_ITEM}}
    <li><a href="#merge">Commits</a></li>
  </ol>
</nav>

<section id="summary">
  <h2>Summary</h2>
  <p>{{SUMMARY_PARAGRAPH}}</p>
  <p>Reference documents: the <a href="{{SPEC_RELATIVE_LINK}}">design spec</a> and the
  <a href="{{PLAN_RELATIVE_LINK}}">implementation plan</a>.</p>
</section>

<section id="delivered">
  <h2>What Was Delivered</h2>
  <div class="cards">
    {{DELIVERED_CARDS}}
  </div>
</section>

<section id="build">
  <h2>Build Process</h2>
  <p>Executed via <code>digismith:subagent-driven-development</code>: fresh implementer
  subagent per task, independent spec-compliance + quality review after each.</p>
  <div class="table-wrap">
  <table>
    <tr><th>Task</th><th>Delivered</th><th>Review verdict</th><th>Deferred minors</th></tr>
    {{BUILD_PROCESS_ROWS}}
  </table>
  </div>
</section>

{{FINAL_REVIEW_SECTION}}

<section id="merge">
  <h2>Commits</h2>
  <ul class="commit-list">
    {{COMMIT_LIST_ITEMS}}
  </ul>
</section>

<footer>DigiSmith · .digismith/docs/{{FEATURE_SLUG}}/{{REPORT_FILENAME}}</footer>

</body>
</html>
```

`{{TOC_FINALREVIEW_ITEM}}` is
`<li><a href="#finalreview">Final Review &amp; Fix</a></li>` when that
section exists, or an empty string when it's omitted.

`{{FINAL_REVIEW_SECTION}}` is this literal block:

```html
<section id="finalreview">
  <h2>Final Review &amp; Fix</h2>
  <p>{{FINAL_REVIEW_SUMMARY_SENTENCE}}</p>
  <div class="table-wrap">
  <table>
    <tr><th>Severity</th><th>Finding</th><th>Resolution</th></tr>
    {{FINAL_REVIEW_ROWS}}
  </table>
  </div>
</section>
```

- `{{FINAL_REVIEW_ROWS}}` — one
  `<tr><td>...</td><td>...</td><td>...</td></tr>` per finding from Step
  2c: severity / finding text / resolution text, each escaped per Step 2f.
- `{{FINAL_REVIEW_SUMMARY_SENTENCE}}` — a one-line summary of the final
  review's overall verdict, e.g. *"Ready to merge: With fixes — 4
  Important findings, all resolved."*

When the ledger's final-review line reports **zero** findings, both
`{{FINAL_REVIEW_SECTION}}` and `{{TOC_FINALREVIEW_ITEM}}` are the empty
string — the section and its TOC entry are omitted entirely rather than
rendered empty.

### Step 4: Write and Commit

1. Target path: `.digismith/docs/<feature-slug>/report.html`, using the
   slug from Step 1 — normally the same folder as that feature's `plan.md`
   and `design.html`, e.g. plan
   `.digismith/docs/capture-ephemeral-url/plan.md` → report
   `.digismith/docs/capture-ephemeral-url/report.html`. (In Step 1's
   fallback case the plan itself lives elsewhere; the report still goes
   into `.digismith/docs/<feature-slug>/`, creating that folder if needed.)
   That filename is also what `{{REPORT_FILENAME}}` renders in the footer.
2. If a file already exists at that path, ask via `AskUserQuestion` before
   overwriting it — never silently clobber. (This works because the skill
   runs in the controller session; see Prerequisites.)
3. Write the file.
4. **Before staging, check whether the target path is gitignored in this
   repo** — `digismith:jira-intake` makes commit-vs-gitignore an explicit
   per-repo choice, so `.digismith/docs/` is genuinely ignored in some
   consumer repos and `git add` would hard-fail there ("Use -f if you
   really want to add them"):
   ```bash
   git check-ignore -q .digismith/docs/<feature-slug>/report.html
   ```
   Read the exit code, not the (empty) output: **0 = ignored**, **1 = not
   ignored**. Exit code 1 is a normal, expected answer meaning "this path
   is not ignored" — it is *not* a command failure, don't treat it as an
   error.
   - **Ignored (exit 0)** → the report is written but **not** committed.
     Say so plainly: the report was written to
     `.digismith/docs/<feature-slug>/report.html` but not committed,
     because this repo's `.digismith/docs/` is gitignored — matching the
     choice already made for this repo. Do **not** re-ask the
     commit-vs-gitignore question, and do **not** override it with
     `git add -f`. Continue to item 5 below.
   - **Not ignored (exit 1)** → commit as normal:
     ```bash
     git add .digismith/docs/<feature-slug>/report.html
     git commit -m "docs: add <feature> (<map-item>) implementation report"
     ```

5. **Publish as an artifact — unless the profile says not to.** Reuse the
   profile already resolved in Prerequisites for the `reporting` gate —
   don't re-locate or re-read it.
   - **`publish_artifact: false`** → skip the `Artifact` tool call
     entirely. State plainly: "Not published — `publish_artifact: false`
     in this repo's profile." `report.html` itself is unaffected — it was
     already written and (per item 4's disposition) possibly committed
     before this item runs.
   - **`publish_artifact: true`, the field absent, or no profile at
     all** → proceed: per `MEMORY.md`'s Conventions section (Unified Docs
     Convention entry), the per-feature HTML docs — `design.html` and
     `report.html`, specifically, never `.digismith/history.html` or the
     plain `plan.md`/`ticket.md` working files — get published for
     readability. Call the `Artifact` tool on the just-written
     `report.html`: `title` from `{{FEATURE_TITLE}}`, `description` from
     the plan's own `**Goal:**` line, `favicon` one or two emoji fitting
     the feature's topic. Report the returned URL alongside the report
     path in Step 5's hand-back. This runs regardless of whether Step 4
     committed the file — publishing to `Artifact` doesn't depend on the
     repo's gitignore choice.

### Step 5: Hand Back

This skill's job ends here.
`digismith:subagent-driven-development`'s own Finish step continues
exactly as written: delete the plan's workspace, then invoke
`digismith:finishing-a-development-branch`. Do not re-invoke or
duplicate any part of that sequencing.

## Error Handling

- **No ledger found** → skip this skill entirely; not applicable to this
  run.
- **Active profile has `reporting: false`** → skip this skill entirely
  and silently, same as the no-ledger case; not applicable to this run.
  (No `.digismith/profile`, a stale one, `reporting: true`, or the field
  absent → proceed as normal.)
- **Ledger missing a `Final review (...)` line** → say so plainly and ask
  before proceeding (Step 1). This is unexpected at this skill's trigger
  point, so never absorb it silently. If the answer is to proceed anyway
  (e.g. a deliberate fixture that simulates firing before any final review
  ran), generate what's derivable from the per-task lines alone, omit the
  Final Review & Fix section and its TOC entry, and note in the Summary
  that final-review detail isn't available yet.
- **Ledger's final-review line reports zero findings** → omit the Final
  Review & Fix section and its TOC entry. Not an error; never render an
  empty table.
- **`Task <N>: BLOCKED` line present** → still render that task's row,
  with the blockage stated in its verdict cell.
- **Plan file isn't at `.digismith/docs/<slug>/plan.md`** → not an error;
  use Step 1's fallback and parse the slug out of the plan's
  `<date>-<slug>-plan.md` filename. Never let the slug come out as a
  container directory name like `plans`.
- **Target report path is gitignored in this repo** (`git check-ignore -q`
  exits 0) → write the report, skip `git add`/`git commit`, and say
  plainly that it wasn't committed because this repo's `.digismith/docs/`
  is gitignored. Not an error, and not a reason to re-ask the
  commit-vs-gitignore question or to force with `-f`. (Exit code 1 from
  that command means "not ignored" — the normal path — not a failure.)
- **Report file already exists** → ask before overwriting.
- **`Artifact` publish call fails** (e.g. size limit, malformed HTML) →
  report the failure plainly; `report.html` itself is still correctly
  written (and committed, per the gitignore disposition above) regardless
  — only the publish step didn't complete.
- **Active profile has `publish_artifact: false`** → `report.html` is
  still written (and committed, per the gitignore disposition above)
  exactly as normal; only the `Artifact` publish call (item 5) is
  skipped. Not the same disposition as `reporting: false` — the report
  itself is never skipped, only its publication.
- **Empty commit range** (`MERGE_BASE == HEAD`) → stop and say so —
  treat it as a sign something upstream is wrong, not as "no report
  needed."

## Quick Reference

| Step | Action |
|---|---|
| 1 | Locate ledger + plan; derive `<feature-slug>` (parent dir when the plan is at `.digismith/docs/<slug>/plan.md`, else parse it out of the `<date>-<slug>-plan.md` filename); compute commit range; `git log --reverse --oneline`; check for an optional ticket key gated by the active profile's `ticket` field; skip entirely if no ledger or if the active profile's `reporting` is `false` (see Prerequisites), ask if no final-review line |
| 2 | Derive header placeholders including the optional `{{TICKET_KEY_META}}` (2a), per-task rows (2b), final-review findings (2c), delivered cards (2d), oldest-first commits (2e); escape all ledger/plan text (2f) |
| 3 | Render using the standard report HTML template, including the literal Final Review & Fix block (or omit it, with its TOC entry, when there are no findings); try `scripts/model_offload.py` first, but only in DigiSmith's own repo, and state which path produced the file |
| 4 | Write to `.digismith/docs/<feature-slug>/report.html`, ask before overwrite; `git check-ignore -q` the path first — exit 1 (not ignored) → `git add` + commit, exit 0 (ignored) → leave it uncommitted and say so; then publish `report.html` via the `Artifact` tool regardless of whether it was committed, unless the active profile has `publish_artifact: false` |
| 5 | Hand back to `digismith:subagent-driven-development`'s unmodified Finish step |

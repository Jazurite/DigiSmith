---
name: report-implementation
description: Use when a subagent-driven-development plan's final whole-branch review has just come back clean (all findings fixed, parked, or none found) — right before that skill's own Finish step deletes the plan's workspace.
---

# Report Implementation

## Overview

DigiSmith's map item **N**. Formalizes what was, until now, a
manually-written report (see
`docs/superpowers/reports/2026-08-05-standards-injection-report.html`,
written by hand for map item G) into a required step of every
`superpowers:subagent-driven-development` plan's completion. Generates an
HTML implementation report — what shipped, the per-task review record,
the final-review findings and how they were resolved, the commit list —
and commits it to `docs/superpowers/reports/`.

## When to Use

Right when a `superpowers:subagent-driven-development` plan's final
whole-branch review has come back clean — every finding fixed, parked
with a ruling, or the review found nothing to begin with — and **before**
that skill's own Finish step runs `rm -rf` on the plan's workspace
(`.superpowers/sdd/<plan-basename>/`). This is earlier than "after the
branch merges": the ledger this skill reads only exists until that
deletion, and this repo's merges are always fast-forward, so the commit
range recorded here won't change once
`superpowers:finishing-a-development-branch` actually runs.

## Prerequisites

A ledger must exist at `.superpowers/sdd/<plan-basename>/progress.md`. If
it doesn't (e.g. the plan ran via `superpowers:executing-plans` instead of
`superpowers:subagent-driven-development`), this skill's trigger condition
isn't met — skip it silently and let the other skill's Finish step proceed
as normal. Don't render a report from nothing.

## Process

### Step 1: Locate and Read Sources

1. **Plan file** — the same `docs/superpowers/plans/<date>-<slug>-plan.md`
   the just-finished run executed.
2. **Ledger** — `.superpowers/sdd/<plan-basename>/progress.md`, in full.
3. **Commit range:**
   - `MERGE_BASE` — the hash before `..` in the ledger's *first*
     `Task 1: complete (commits <base>..<head>, ...)` line.
   - `HEAD` — current `git rev-parse HEAD`.
4. Run `git log --oneline MERGE_BASE..HEAD` and
   `git diff --stat MERGE_BASE..HEAD`.

If no ledger exists at that path, stop here entirely — this skill doesn't
apply to this run.

### Step 2: Parse the Ledger into Report Content

- **Build Process rows** (one per task): for each `Task <N>: complete
  (...)` line, the task's title comes from the plan's `### Task N: ...`
  heading. "Review verdict" is "Approved, clean" when the completion line
  says "review clean" with no fix-round/parked mentions; otherwise
  summarize what the ledger records (e.g. "Approved after fix round, 1
  parked"). "Deferred minors" lists every `Task <N>: minor (deferred):
  ...` line for that same task number, verbatim.
- **Final Review & Fix rows:** one row per distinct finding named in the
  ledger's `Final review (...)` line and any subsequent fix-round /
  `Scoped re-review (...)` / `parked` lines that reference it. Each row:
  the finding (trimmed from the ledger text) and its resolution (fixed, or
  parked with its ruling quoted). **If the final-review line reports zero
  findings, omit this entire section** — never render an empty table.
- **What Was Delivered cards:** one per task, titled from the plan's
  `### Task N: ...` heading, described in one sentence drawn from that
  task's `**Interfaces:** Produces:` line in the plan file.

### Step 3: Render the HTML

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
  <p>Executed via <code>superpowers:subagent-driven-development</code>: fresh implementer
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

<footer>DigiSmith · docs/superpowers/reports/{{REPORT_FILENAME}}</footer>

</body>
</html>
```

`{{TOC_FINALREVIEW_ITEM}}` is
`<li><a href="#finalreview">Final Review &amp; Fix</a></li>` when that
section exists, or an empty string when it's omitted. `{{FINAL_REVIEW_SECTION}}`
is the full `<section id="finalreview">...</section>` block (same shape as
G's report — a table of Severity/Finding/Resolution) or an empty string.

### Step 4: Write and Commit

1. Target path: `docs/superpowers/reports/<date-slug>-report.html`, where
   `<date-slug>` is exactly the plan file's own `<date>-<slug>` (e.g. plan
   `docs/superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md` →
   report `docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html`).
2. If a file already exists at that path, ask via `AskUserQuestion` before
   overwriting it — never silently clobber.
3. Commit:
   ```bash
   git add docs/superpowers/reports/<file>.html
   git commit -m "docs: add <feature> (<map-item>) implementation report"
   ```

### Step 5: Hand Back

This skill's job ends here.
`superpowers:subagent-driven-development`'s own Finish step continues
exactly as written: delete the plan's workspace, then invoke
`superpowers:finishing-a-development-branch`. Do not re-invoke or
duplicate any part of that sequencing.

## Error Handling

- **No ledger found** → skip this skill entirely; not applicable to this
  run.
- **Ledger missing a final-review line** (fired before the final review
  actually ran) → generate what's derivable from the per-task lines
  alone, and note in the Summary that final-review detail isn't available
  yet.
- **Report file already exists** → ask before overwriting.
- **Empty commit range** (`MERGE_BASE == HEAD`) → stop and say so —
  treat it as a sign something upstream is wrong, not as "no report
  needed."

## Quick Reference

| Step | Action |
|---|---|
| 1 | Locate ledger + plan + commit range; skip entirely if no ledger |
| 2 | Parse ledger into per-task rows, final-review findings (if any), delivered-cards |
| 3 | Render using the standard report HTML template |
| 4 | Write to `docs/superpowers/reports/<date-slug>-report.html`, ask before overwrite, commit |
| 5 | Hand back to `subagent-driven-development`'s unmodified Finish step |

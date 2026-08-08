# Implementation Reporting (N) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `report-implementation` — DigiSmith's map item **N** — so
that every `subagent-driven-development` plan automatically gets an HTML
implementation report (what shipped, per-task review record, final-review
findings and resolutions, commit list), generated right before the plan's
ledger is deleted, instead of relying on a human remembering to write one
by hand (as happened once, manually, for map item G).

**Architecture:** A single skill, `skills/report-implementation/SKILL.md`,
that triggers when a `subagent-driven-development` plan's final review has
just passed and reads that plan's ledger (`.superpowers/sdd/<plan>/progress.md`)
plus the plan file and `git log`/`git diff` over the plan's commit range,
renders an HTML report using the same template as the existing
hand-written G report, and commits it to `docs/superpowers/reports/`. It
never modifies `subagent-driven-development` or
`finishing-a-development-branch` — it runs once, immediately before the
former's own Finish step deletes the workspace.

**Tech Stack:** Claude Code Skill (`SKILL.md`, YAML frontmatter). No
application code, no test framework — an instruction file containing an
HTML template with placeholder substitution, same category of skill as
`capture-ephemeral-url` (executable/renderable instructions, not just
prose).

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…", third person, states triggering conditions only —
  never a workflow summary.
- **Trigger is precise and earlier than "after merge":** a
  `subagent-driven-development` plan's final whole-branch review has just
  come back clean (findings fixed, parked, or none found) — before that
  skill's Finish step runs `rm -rf` on `.superpowers/sdd/<plan-basename>/`.
  Because every merge in this repo's history has been a fast-forward, the
  commit range recorded at this point never changes once
  `finishing-a-development-branch` later runs.
- **No ledger → skip entirely.** If `.superpowers/sdd/<plan-basename>/progress.md`
  doesn't exist (e.g. the plan ran via `superpowers:executing-plans`, which
  Jack calls "jdi"), this skill's trigger condition isn't met — don't
  render a report from nothing.
- **Report file path:** `docs/superpowers/reports/<date-slug>-report.html`,
  reusing the exact `<date>-<slug>` the plan/spec files already use for
  that feature (e.g. plan `docs/superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md`
  → report `docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html`).
- **Reuse the existing report template exactly** — same CSS, same section
  skeleton — from
  `docs/superpowers/reports/2026-08-05-standards-injection-report.html`
  (map item G's hand-written report). This plan's Task 1 embeds that
  template with placeholders; don't invent a new visual style.
- **Final Review & Fix section is conditional.** Omit it entirely if the
  ledger's final-review line reports zero findings — never render an
  empty table.
- **Existing file at the target path → ask before overwriting** via
  `AskUserQuestion`, matching `digismith:jira-intake`'s existing-file
  posture. Never silently clobber a report.
- **Never modifies `subagent-driven-development` or
  `finishing-a-development-branch`** (both Superpowers files, out of this
  repo). This skill's own job ends once the report is written and
  committed; it hands back to those skills' existing, unmodified
  sequencing.
- **No automated test suite.** Verification is dogfooding, same as every
  DigiSmith skill. Unusually, Task 1's dogfood run is not throwaway
  scaffolding: it reconstructs the real (deleted) ledger from the
  `capture-ephemeral-url` (M) plan this same session already built, and
  runs it against that plan's **real, still-existing** git history
  (`c25f658..abb3ac1`). The report this produces is the actual missing
  implementation report for M — keep it, commit it for real, don't clean
  it up as test scaffolding.
- Cross-skill references inside `SKILL.md` content must be
  plugin-qualified: `superpowers:subagent-driven-development`,
  `superpowers:finishing-a-development-branch`, `superpowers:executing-plans`,
  `digismith:jira-intake`.

---

### Task 1: `report-implementation` Skill — Happy Path (and M's Real Report)

**Files:**
- Create: `skills/report-implementation/SKILL.md`
- Create (dogfood output, kept for real): `docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html`
- Create (test fixture, cleaned up after): a temporary ledger file

**Interfaces:**
- Consumes: a `subagent-driven-development` ledger's line grammar
  (`Task <N>: complete (commits <a>..<b>, ...)`, `Task <N>: minor
  (deferred): ...`, `Task <N>: parked — ...`, `Final review (...): ...`,
  `Scoped re-review (...): ...`); a plan file's `### Task N: ...` headings
  and `**Interfaces:** Produces:` lines; `git log`/`git diff --stat`
  output.
- Produces: a committed HTML report at
  `docs/superpowers/reports/<date-slug>-report.html`.

- [ ] **Step 1: Write `skills/report-implementation/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Reconstruct the real (deleted) M-plan ledger as a fixture**

This session already ran `subagent-driven-development` end-to-end for the
`capture-ephemeral-url` (M) plan and deleted its ledger per that skill's
own Finish step — before `report-implementation` existed to catch it.
Reconstruct that ledger's actual content from this session's own record
of it, so Task 1's dogfood run is grounded in real events rather than an
invented scenario:

```bash
mkdir -p /tmp/report-impl-dogfood
cat > /tmp/report-impl-dogfood/progress.md << 'EOF'
# SDD ledger — plan: docs/superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md
Task 1: minor (deferred): dogfood sub-dispatches used haiku model for reasoning-style verification; reviewer independently re-verified regex extraction in Python, so not a compliance gap, but noted for final review triage.
Task 1: minor (deferred): SKILL.md Step 1 doesn't state how the current branch name is obtained (e.g. `git branch --show-current`) before parsing — omission in the plan's own literal text, not implementer-introduced.
Task 1: complete (commits c25f658..2839cce, review clean)
Task 2: parked — Important finding "unverifiable quoted note in task-2-report.md:102" — ruling: the quote is real, sourced from the controller's own Task 2 dispatch prompt (a supplementary note, not literally from task-2-brief.md as the report labeled it), with an approximate SKILL.md line range that was slightly off from the actual Error Handling section (real: SKILL.md:107-121). Not fabrication; report-hygiene mislabeling only, confined to a gitignored scratch file (task-2-report.md) that is never committed or shipped. No code impact, no fix dispatched.
Task 2: minor (deferred): Step 1 dogfood substituted the real worktree branch name for the brief's specified hypothetical ("main"); same regex failure mode either way so harmless this run, but the substitution wasn't held constant — worth tightening future briefs to forbid checking real environment state during fixture-based reasoning tests.
Task 2: complete (commits 2839cce..2839cce, no code change, review clean modulo 1 parked report-hygiene item)
Task 3: minor (deferred): docs/history.html:148's I.3 description drops the "(custom Figma skill)" parenthetical present in MEMORY.md:98 — pre-existing drift between the two docs, not introduced by this task.
Task 3: complete (commits 2839cce..bf04405, review clean)
Final review (base c25f658..bf04405, opus): Ready to merge "With fixes" — 3 Important findings (gh pr checks non-zero exit code unstated; Step 4 jq returns oldest/unfiltered comment not most recent deploy comment; drift fallback gated on "neither" instead of "either" regex failing) + 1 Minor promoted to must-fix (Step 1 missing `git branch --show-current`). Ledger triage: T1/T2 minors stay deferred, T2 parked item closed (verified .superpowers/sdd/ is gitignored and untracked), T3 minor stays deferred. Dispatching ONE fix wave for the 4 required items (sonnet).
Scoped re-review (fix base bf04405..e689c6f, sonnet): Findings 1, 3, 4 fully ADDRESSED. Finding 2 (jq oldest-comment bug) ADDRESSED for its stated defect, but the rewrite introduces a new Important-severity regression: `| last` on an empty filtered array outputs the literal string "null" instead of empty, which would defeat Step 4's 60-second retry-then-give-up path for the "comment not posted yet" race (misdiagnosed as format drift instead of "not found yet"). Bounded impact — still stops and reports something to the user, never fabricates a URL.
Final review: parked — residual Important finding (jq `| last` returns "null" string on zero matches instead of empty output) — ruling: real but non-load-bearing (nothing downstream in this plan builds on Step 4's exact output; this is the last task, no further tasks depend on it; doesn't reveal a plan-level design defect, just a jq idiom gap). Per "no second fix wave" at final review, not fixed in this pass. Exact one-token fix for a future pass: change `| last` to `| last // empty` in SKILL.md's Step 4 jq command (~line 91). Flagged directly to Jack in the end-of-work summary rather than silently left in the ledger alone.
EOF
```

Note: the actual jq fix and the README mention were applied in a follow-up
commit (`abb3ac1`) at Jack's request, after this ledger's last line was
written — the fixture above ends where the real ledger actually ended;
`abb3ac1` is simply the last commit in the real git range this dogfood
test also uses (Step 3 below), so the report's commit list will correctly
show it even though the ledger prose doesn't narrate it separately.

- [ ] **Step 3: Dogfood the real report against real git history**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\report-implementation\SKILL.md
exactly, with these substitutions for Step 1's normal lookup (this is a
dogfood run reconstructing a real ledger that was already deleted by the
time this skill existed — treat the fixture below as if you'd found it at
the real path):

- Plan file: D:\Workspace\Jazurite\DigiSmith\docs\superpowers\plans\2026-08-08-capture-ephemeral-url-plan.md
  (this is the REAL plan file, still on disk).
- Ledger: /tmp/report-impl-dogfood/progress.md (a reconstructed fixture —
  read it exactly as Step 1 describes reading a ledger).
- MERGE_BASE: c25f658 (per the fixture ledger's first Task 1 line).
- HEAD: abb3ac1 (this repo's actual current main HEAD — verify with
  `git rev-parse HEAD` in D:\Workspace\Jazurite\DigiSmith).

Run the real `git log --oneline c25f658..abb3ac1` and
`git diff --stat c25f658..abb3ac1` against the actual DigiSmith repo — this
part is NOT simulated, it's real git history. Then continue through
Steps 2-4 for real: parse the fixture ledger, render the report, write it
to D:\Workspace\Jazurite\DigiSmith\docs\superpowers\reports\2026-08-08-capture-ephemeral-url-report.html,
and commit it with message "docs: add capture-ephemeral-url (M)
implementation report". This is real output to keep, not test scaffolding
— it's the actual missing report for the M feature. Report back: the
final file path, confirmation it was committed, and the commit hash.
```

Expected: a real, committed HTML file. Verify it yourself afterward (next
step) rather than trusting the report blind.

- [ ] **Step 4: Independently verify the dogfooded report's accuracy**

```bash
cd D:\Workspace\Jazurite\DigiSmith
git show --stat HEAD
```

Expected: the top commit is the "docs: add capture-ephemeral-url (M)
implementation report" commit, adding exactly one file.

Read the generated file
(`docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html`)
and confirm:
- Build Process table has exactly 3 rows (Tasks 1-3), Task 1 and 3 show
  "Approved, clean" with their real deferred minors listed, Task 2 shows
  something reflecting its parked finding (not a plain "clean").
- A Final Review & Fix section exists (the fixture's final review had
  real findings — this section must NOT be omitted) and includes the 3
  Important findings, the promoted Minor, and the final parked
  `// empty` finding.
- The commit list includes all 4 real commits in the range
  (`2839cce`, `bf04405`, `e689c6f`, `abb3ac1`) with their real subjects.
- No unrendered `{{PLACEHOLDER}}` tokens remain anywhere in the file.

If anything is wrong, fix `skills/report-implementation/SKILL.md`
directly (this is exactly the kind of gap Task 1 exists to catch) and
re-run Step 3 to regenerate the report before continuing — amend the
report commit rather than leaving a known-wrong report file committed.

- [ ] **Step 5: Commit the skill itself**

```bash
cd D:\Workspace\Jazurite\DigiSmith
git add skills/report-implementation/SKILL.md
git commit -m "feat(reporting): add report-implementation skill (N), happy path"
rm -rf /tmp/report-impl-dogfood
```

---

### Task 2: `report-implementation` Edge Cases

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (only if a dogfood run
  below surfaces a real gap — no changes are expected if Task 1's content
  is correct)

**Interfaces:**
- Consumes: `skills/report-implementation/SKILL.md` from Task 1, unchanged
  unless a gap is found.
- Produces: nothing new downstream — this task verifies the four
  remaining spec-required scenarios not covered in Task 1: no ledger
  found, ledger missing a final-review line, report file already exists,
  empty commit range.

- [ ] **Step 1: Dogfood the no-ledger skip**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\report-implementation\SKILL.md.
There is no ledger at /tmp/report-impl-nonexistent/progress.md (it does
not exist — verify this yourself with a file-existence check rather than
assuming). Per the skill's Prerequisites and Error Handling, this should
skip the skill entirely — no report generated, no file written. Report
what you found and confirm no file was created anywhere under
docs/superpowers/reports/.
```

Expected: confirms the missing-ledger check and a clean no-op — no new
file in `docs/superpowers/reports/`.

```bash
cd D:\Workspace\Jazurite\DigiSmith && git status
```

Expected: clean working tree, no untracked report files.

- [ ] **Step 2: Dogfood a ledger with no final-review line yet**

```bash
mkdir -p /tmp/report-impl-dogfood2
cat > /tmp/report-impl-dogfood2/progress.md << 'EOF'
# SDD ledger — plan: docs/superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md
Task 1: complete (commits c25f658..2839cce, review clean)
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\report-implementation\SKILL.md,
using /tmp/report-impl-dogfood2/progress.md as the ledger (a fixture —
read it as-is) and
D:\Workspace\Jazurite\DigiSmith\docs\superpowers\plans\2026-08-08-capture-ephemeral-url-plan.md
as the plan file. This ledger has only a Task 1 completion line — no
final-review line at all (as if this skill fired before the final review
actually ran). Per the skill's Error Handling, generate what's derivable
from the Task 1 line alone, note in the Summary that final-review detail
isn't available yet, and do NOT fabricate a Final Review & Fix section.
Do not commit anything — just report back what the rendered Summary
paragraph and section structure would contain.
```

Expected: report confirms no fabricated final-review content, and that
the Summary would note the gap.

```bash
rm -rf /tmp/report-impl-dogfood2
```

- [ ] **Step 3: Dogfood the existing-file ask-before-overwrite**

```bash
mkdir -p D:/Workspace/Jazurite/DigiSmith/docs/superpowers/reports
touch "D:/Workspace/Jazurite/DigiSmith/docs/superpowers/reports/2099-01-01-fixture-feature-report.html"
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 4 ("Write and Commit") of
D:\Workspace\Jazurite\DigiSmith\skills\report-implementation\SKILL.md.
The target path
D:\Workspace\Jazurite\DigiSmith\docs\superpowers\reports\2099-01-01-fixture-feature-report.html
already exists (an empty placeholder file for this test). Per the skill,
you should ask before overwriting it. Since this is an unattended dogfood
run and AskUserQuestion isn't available to you, simply report that you
detected the existing file and would have asked, rather than overwriting
it. Confirm you did not modify the existing file.
```

Expected: report confirms detection and that it would ask, not overwrite.

```bash
cd D:\Workspace\Jazurite\DigiSmith
git status --porcelain docs/superpowers/reports/2099-01-01-fixture-feature-report.html
rm "docs/superpowers/reports/2099-01-01-fixture-feature-report.html"
```

Expected: the status check shows the file untouched (still empty/unmodified)
before cleanup.

- [ ] **Step 4: Dogfood the empty-commit-range stop**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 1 ("Locate and Read Sources") of
D:\Workspace\Jazurite\DigiSmith\skills\report-implementation\SKILL.md,
reasoning through this scenario (do not run any git commands): the
ledger's first Task 1 line reads
"Task 1: complete (commits abb3ac1..abb3ac1, review clean)" — MERGE_BASE
and HEAD are identical. Per the skill's Error Handling, this should stop
and report that something upstream looks wrong, rather than proceeding to
render a report describing no work. Report what the skill's instructions
say to do here.
```

Expected: reports a clean stop citing the empty-range rule, not a
rendered (empty) report.

- [ ] **Step 5: If any dogfood run in Steps 1-4 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. If any
subagent's behavior diverged from the skill's Error Handling section,
fix `skills/report-implementation/SKILL.md`'s wording directly, then
re-run the specific dogfood step that failed to confirm the fix.

- [ ] **Step 6: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith
git add skills/report-implementation/SKILL.md
git commit -m "test(reporting): verify report-implementation edge cases (no ledger, missing final-review line, existing file, empty range)"
```

If Step 5 made no changes, this commit will be empty — in that case skip
committing and instead note in your final report that all four edge cases
passed on the first pass with no skill changes needed.

---

### Task 3: Update `docs/history.html` and `MEMORY.md` for Map Item N

**Files:**
- Modify: `docs/history.html`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Tasks
  1-2's completed work.
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Add map item N and update Progress Overview / Build Order**

Open `docs/history.html` and, matching its existing structure exactly:

- In the map table (`#map`), add a new row for **N** immediately after
  **M**:

```html
<tr><td><strong>N</strong></td><td>Implementation reporting</td>
  <td>Formalizes G's hand-written report into a required step: once a <code>subagent-driven-development</code> plan's final review passes, generate the HTML implementation report before the plan's ledger gets deleted</td>
  <td><span class="status done">Done</span></td></tr>
```

- Add a new descriptive paragraph after the existing M paragraph:

```html
<p style="font-size:.88rem; color:var(--muted);">
  <strong>N — Implementation reporting:</strong> <code>report-implementation</code> skill —
  <a href="superpowers/specs/2026-08-08-report-implementation-design.html">design spec</a> ·
  <a href="superpowers/plans/2026-08-08-report-implementation-plan.md">implementation plan</a> ·
  its own dogfood run produced <a href="superpowers/reports/2026-08-08-capture-ephemeral-url-report.html">M's real implementation report</a>
</p>
```

- Update the Progress Overview (`#overview`) shipped-count tile from
  `3 / 13` to `4 / 14` (N is a 4th done item alongside A, G, and M, and a
  14th map item).

- N wasn't in `MEMORY.md`'s original 6-tier plan either, same as M. Follow
  the precedent M already set in this same table (M's own Task 3 folded it
  into Tier 5's existing row rather than inventing a new tier row): find
  Tier 5's row in the Build Order table (`#tiers`) and append N to its
  Items cell, right after M:

```html
<strong>M</strong> ephemeral deploy capture <span class="status done">Done</span> · <strong>N</strong> implementation reporting <span class="status done">Done</span> · <strong>I.1/I.2/I.3</strong> QA handoff
```

  (Replace only the M-onward portion of Tier 5's existing Items cell with
  the line above — leave **D** delivery and **F** design review at the
  front of that cell untouched.) Update Tier 5's Status cell to reflect
  two items now done in that tier (e.g. "In progress (2/4 — M and N
  shipped, pulled forward out of tier order)").

- [ ] **Step 2: Update `MEMORY.md`'s Build order Tier 5 line to match**

`MEMORY.md`'s own Build order table (not just `docs/history.html`'s copy
of it) already got M added to Tier 5 during that feature's work. Keep it
in sync — change:

```
| **5** | Technical expansion | **D** delivery · **F** design review · **M** ephemeral deploy capture (pulled forward and built 2026-08-08) · **I.1** JIRA write-back for the captured URL · **I.2** E2E · **I.3** Figma visual regression |
```

to:

```
| **5** | Technical expansion | **D** delivery · **F** design review · **M** ephemeral deploy capture (pulled forward and built 2026-08-08) · **N** implementation reporting (pulled forward and built 2026-08-08) · **I.1** JIRA write-back for the captured URL · **I.2** E2E · **I.3** Figma visual regression |
```

- [ ] **Step 3: Add a timeline entry**

Append to the `.timeline` div, after the existing final entry:

```html
<div class="event">
  <div class="date">2026-08-08</div>
  <h4>N brainstormed, specced, and built — 3 tasks, subagent-driven-development</h4>
  <p>Jack asked to formalize G's hand-written implementation report into a
  required step. Brainstorming surfaced a real sequencing problem: the
  ledger content that makes a report worth reading is deleted by
  <code>subagent-driven-development</code>'s own Finish step before
  <code>finishing-a-development-branch</code> even runs — so
  <code>report-implementation</code> triggers earlier than "after merge,"
  right before that deletion, relying on this repo's merges always being
  fast-forward so the commit range it records never changes afterward.
  Task 1's dogfood run reconstructed M's actual (already-deleted) ledger
  from this session's own record of it and generated M's real missing
  report against real git history — kept, not discarded as test
  scaffolding. Task 2 dogfooded four edge cases with no gaps found. Task 3
  is this history.html update.</p>
</div>
```

- [ ] **Step 4: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith
git add docs/history.html MEMORY.md
git commit -m "docs: update history — report-implementation (N) shipped"
```

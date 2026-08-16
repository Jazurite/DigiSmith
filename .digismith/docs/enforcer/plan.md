# Enforcer (Q) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `digismith:enforcer` so `superpowers:brainstorming` and
`superpowers:writing-plans` — third-party Superpowers skills with their
own default output locations/formats — honor DigiSmith's unified docs
convention (`.digismith/docs/<slug>/design.html` in HTML,
`.digismith/docs/<slug>/plan.md` in Markdown) instead of silently falling
back to their own defaults, the way brainstorming actually did on
2026-08-15.

**Architecture:** A new standalone skill that does two things around each
hand-off: tells the target skill explicitly where/how to write
(Advisory), then checks afterward that it actually landed there and
corrects it if not (Verified). Two wiring points reach it: an explicit
call added to `using-digismith` Step 3, and the skill's own trigger
description mirroring `inject-standards`' existing "running
brainstorming/writing-plans" wording so it also fires for ad-hoc
DigiSmith self-development with no ticket involved. A same-change
convention amendment (not Enforcer-specific) makes any HTML doc DigiSmith
writes get published via the `Artifact` tool for readability —
implemented here for `design.html` and, via a small matching addition, in
`report-implementation` (map item N) for `report.html`.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), plain
Markdown/HTML docs. No application code, no test framework — these are
instruction files, same as every other DigiSmith skill.

## Global Constraints

- Detecting DigiSmith-tracked work: current working directory is
  DigiSmith's own repo (`.claude-plugin/plugin.json` with
  `"name": "digismith"`), or the repo has `.digismith/profile` present —
  the exact rule `inject-standards` and `using-digismith` already use.
  Restate verbatim, never reinvent.
- Slug resolution: reuse `using-digismith`'s already-derived slug when
  invoked from its Step 3; otherwise apply `digismith:jira-intake` Step
  3.1's deterministic algorithm (lowercase, drop filler words, hyphenate,
  truncate at ~40 chars) for ad-hoc calls — the same algorithm
  `using-digismith` itself already restates inline for its `ticket: false`
  path.
- `design.html`'s `<style>` block: copied byte-for-byte from an existing
  DigiSmith `design.html` (e.g. `unified-docs-convention`'s) — never
  modified, never regenerated from scratch.
- No automated test suite, consistent with every DigiSmith skill.
  Verification is dogfooding: dispatch a subagent with the relevant
  section of the skill's own content as its instructions against a
  concrete fixture scenario, then check the resulting file state.
- Plan format: this file stays Markdown.
  `superpowers:subagent-driven-development`'s `scripts/task-brief` parses
  task boundaries with the regex `^#+[ \t]+Task[ \t]+[0-9]+` — an HTML
  plan would break it. Specs are HTML; plans are not.
- Non-goals (confirmed during brainstorming — do not expand scope):
  folding in the separate `review-time-standards-injection-gap` backlog
  item; modifying Superpowers' own skill files; building a generic
  interception framework beyond the two named hand-off points
  (`brainstorming`, `writing-plans`).

---

### Task 1: `digismith:enforcer` Skill — Advisory, Verified, Publish

**Files:**
- Create: `skills/enforcer/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces: the `digismith:enforcer` skill itself — Task 2 references it
  by name from `using-digismith` Step 3; Task 3's `report-implementation`
  addition follows the same publish pattern this task establishes for
  `design.html`, applied to `report.html`.

This is the core deliverable — build and dogfood it first, since Tasks
2-3 only wire existing skills to call it or mirror its publish step.

- [ ] **Step 1: Write `skills/enforcer/SKILL.md`**

```markdown
---
name: enforcer
description: Use when about to invoke superpowers:brainstorming or superpowers:writing-plans for DigiSmith-tracked feature work, or immediately after either one finishes writing its output — via using-digismith's hand-off, or directly for DigiSmith's own self-development with no ticket involved. Also covers: in plan mode, or "spec"/"plan"/"shape" language, or running brainstorming/writing-plans, for DigiSmith-tracked work specifically.
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
expose the hook this needs: "(User preferences for spec/plan location
override this default)." Nothing told them the override existed until
now — this skill is that explicit telling, plus a check that it actually
worked.

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
`using-digismith` or the ad-hoc brainstorming call itself. There is no
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

- Invoked from `using-digismith` Step 3: the slug is already known —
  reuse it exactly as `using-digismith` derived it (the folder
  `ticket.md` sits in, or the directly-derived slug under
  `ticket: false`). Never re-derive independently.
- Invoked ad hoc — no ticket, no `using-digismith` in the loop (DigiSmith's
  own self-development, or any other untracked-by-a-ticket case): derive
  the slug directly from the feature description, applying
  `digismith:jira-intake` Step 3.1's deterministic rule — lowercase, drop
  filler words (a, an, the, on, to, of, for, in), replace remaining
  non-alphanumeric runs with a single hyphen, truncate to ~40 characters
  at a word boundary. Same algorithm `using-digismith` itself restates
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

### Step 2: Verified — After `superpowers:brainstorming` Reports Completion

`brainstorming` reports its own output path when it finishes (e.g. "Spec
written and committed to `<path>`"). Compare that reported path against
the expected `.digismith/docs/<slug>/design.html`:

- **Matches, and the file is HTML** → done, continue to Step 3 (Publish).
- **Doesn't match, or wrong format** → read the file `brainstorming`
  actually wrote (its reported path). Rewrap its content into the Step
  1 HTML shell — the body content it already wrote becomes
  `{{BODY_SECTIONS}}` — and write the result to
  `.digismith/docs/<slug>/design.html`, creating the folder if needed.
  Report what was corrected: "Enforcer: brainstorming wrote to
  `<old-path>` — moved and reformatted to
  `.digismith/docs/<slug>/design.html`."
- **Nothing found at the reported location** → stop and say so plainly;
  don't guess or silently proceed. This means `brainstorming` produced no
  artifact at all, a different failure than a misplaced one.

### Step 3: Publish — HTML Artifact, Convention Amendment

Per `MEMORY.md`'s Conventions section (Unified Docs Convention entry),
any HTML doc DigiSmith writes gets published for readability. Once Step 2
confirms `.digismith/docs/<slug>/design.html` is correctly placed, call
the `Artifact` tool on it: `title` from the doc's own `<title>` tag,
`description` one sentence summarizing the feature, `favicon` one or two
emoji fitting the feature's topic (pick contextually — never reuse a
generic default across unrelated features). Report the returned URL back
to whoever is running this.

### Step 4: Advisory — Before `superpowers:writing-plans`

`writing-plans` runs as `brainstorming`'s own terminal step once the user
approves the spec — there is no separate `using-digismith` hook here, so
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
- **`Artifact` publish call fails** (e.g. size limit, malformed HTML) →
  report the failure plainly; the file itself is still correctly placed,
  so this doesn't roll back Step 2's correction — only the publish step
  didn't complete.

## Quick Reference

| Step | Action |
|---|---|
| — | Detect DigiSmith-tracked work (repo identity or `.digismith/profile`); skip entirely if neither |
| — | Resolve `<slug>` (reuse `using-digismith`'s, or derive via `jira-intake` Step 3.1's rule for ad-hoc calls) |
| 1 | Advisory before `brainstorming`: exact target path + HTML shell (style block verbatim) |
| 2 | Verified after `brainstorming`: check `design.html` landed correctly; move/rewrap if not |
| 3 | Publish `design.html` via `Artifact`, report the link |
| 4 | Advisory before `writing-plans`: exact target path, format unchanged |
| 5 | Verified after `writing-plans`: check `plan.md` landed correctly; move if not |
```

- [ ] **Step 2: Dogfood — Verified catches a correctly-placed spec (no-op case)**

```bash
mkdir -p .digismith/docs/_test-enforcer-fixture
cat > .digismith/docs/_test-enforcer-fixture/design.html << 'EOF'
<!doctype html><html><head><title>Test Fixture</title></head>
<body><p>Fixture already in the right place.</p></body></html>
EOF
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow Step 2 (Verified) of D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-enforcer\skills\enforcer\SKILL.md
exactly. Slug is "_test-enforcer-fixture". brainstorming just reported:
"Spec written and committed to
.digismith/docs/_test-enforcer-fixture/design.html". Check it. Report
what you found and what action (if any) you took. Do not call the
Artifact tool for this test — just report that Step 3 would fire next.
```

Expected: report says the reported path already matches the expected
path and format, no move/rewrap performed, and it would proceed to Step
3.

- [ ] **Step 3: Dogfood — Verified moves and rewraps a misplaced spec**

```bash
rm -rf .digismith/docs/_test-enforcer-fixture
mkdir -p docs/superpowers/specs
cat > docs/superpowers/specs/2026-08-15-test-enforcer-fixture-design.md << 'EOF'
# Test Fixture Design

## Problem

A plain Markdown spec, written to the wrong (Superpowers-default)
location, to verify Enforcer's move-and-rewrap correction.

## Approach

Fixture content only.
EOF
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow Step 2 (Verified) of D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-enforcer\skills\enforcer\SKILL.md
exactly. Slug is "_test-enforcer-fixture". brainstorming just reported:
"Spec written and committed to
docs/superpowers/specs/2026-08-15-test-enforcer-fixture-design.md". Check
it against the expected
.digismith/docs/_test-enforcer-fixture/design.html. Take the correction
action the skill describes, then report exactly what you did and the
resulting file path(s). Do not call the Artifact tool for this test —
just report that Step 3 would fire next on the corrected file.
```

Expected: report says the reported path didn't match, the fixture's
Markdown content was rewrapped into the Step 1 HTML shell, and the result
was written to `.digismith/docs/_test-enforcer-fixture/design.html`.
Verify directly:

```bash
test -f .digismith/docs/_test-enforcer-fixture/design.html && echo "moved+rewrapped: OK"
grep -q "<style>" .digismith/docs/_test-enforcer-fixture/design.html && echo "HTML shell applied: OK"
grep -q "Fixture content only" .digismith/docs/_test-enforcer-fixture/design.html && echo "original content preserved: OK"
```

- [ ] **Step 4: Dogfood — Verified moves a misplaced plan**

```bash
rm -rf .digismith/docs/_test-enforcer-fixture
mkdir -p docs/superpowers/plans
cat > docs/superpowers/plans/2026-08-15-test-enforcer-fixture.md << 'EOF'
# Test Fixture Implementation Plan

**Goal:** Fixture content only, to verify Enforcer's plan-move correction.
EOF
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow Step 5 (Verified) of D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-enforcer\skills\enforcer\SKILL.md
exactly. Slug is "_test-enforcer-fixture". writing-plans just reported:
"Plan complete and saved to
docs/superpowers/plans/2026-08-15-test-enforcer-fixture.md". Check it
against the expected .digismith/docs/_test-enforcer-fixture/plan.md. Take
the correction action the skill describes, then report exactly what you
did and the resulting file path.
```

Expected: report says the reported path didn't match, and the file was
moved (not reformatted — plans stay Markdown) to
`.digismith/docs/_test-enforcer-fixture/plan.md`. Verify directly:

```bash
test -f .digismith/docs/_test-enforcer-fixture/plan.md && echo "moved: OK"
grep -q "Fixture content only" .digismith/docs/_test-enforcer-fixture/plan.md && echo "content preserved: OK"
```

- [ ] **Step 5: Clean up fixtures**

```bash
rm -rf .digismith/docs/_test-enforcer-fixture
rm -f docs/superpowers/specs/2026-08-15-test-enforcer-fixture-design.md
rm -f docs/superpowers/plans/2026-08-15-test-enforcer-fixture.md
rmdir docs/superpowers/specs docs/superpowers/plans docs/superpowers 2>/dev/null || true
git status --short
```

Expected: `git status --short` shows no fixture paths remaining (only
`skills/enforcer/SKILL.md` staged/untracked from Step 1).

- [ ] **Step 6: Commit**

```bash
git add skills/enforcer/SKILL.md
git commit -m "feat(enforcer): add digismith:enforcer skill (map item Q)"
```

---

### Task 2: Wire Enforcer into `using-digismith` Step 3

**Files:**
- Modify: `skills/using-digismith/SKILL.md` (Step 3, "Hand Off to
  Brainstorming")

**Interfaces:**
- Consumes: `digismith:enforcer` (Task 1) by name only — this task adds a
  reference, not new logic.
- Produces: the explicit-call wiring point described in the design's
  "Trigger Wiring" section. Enforcer's own self-trigger description
  (already written in Task 1) covers the ad-hoc path independently of
  this task.

- [ ] **Step 1: Locate the exact text to modify**

```bash
grep -n "Step 3: Hand Off to Brainstorming" -A 15 skills/using-digismith/SKILL.md
```

Confirm the current text reads (as read earlier this session):

```
### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `superpowers:brainstorming`, passing
the ticket content **you already read in Step 1** as seed context so it
doesn't start cold. Pass the content you're carrying; do not try to
re-read `ticket.md` from inside the worktree, it isn't there (see Step
1). Once invoked, `using-digismith`'s own job is done.
```

- [ ] **Step 2: Add the explicit Enforcer call**

Insert one sentence before "invoke `superpowers:brainstorming`":

```markdown
### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `digismith:enforcer` — it needs the
slug Step 2 already derived, so pass that along rather than letting
`enforcer` re-derive it. Then invoke `superpowers:brainstorming`, passing
the ticket content **you already read in Step 1** as seed context so it
doesn't start cold. Pass the content you're carrying; do not try to
re-read `ticket.md` from inside the worktree, it isn't there (see Step
1). Once invoked, `using-digismith`'s own job is done.
```

- [ ] **Step 3: Verify the edit**

```bash
grep -n "digismith:enforcer" skills/using-digismith/SKILL.md
```

Expected: one match, inside Step 3.

- [ ] **Step 4: Commit**

```bash
git add skills/using-digismith/SKILL.md
git commit -m "feat(using-digismith): invoke digismith:enforcer before brainstorming hand-off"
```

---

### Task 3: `report-implementation` Gets the Matching Publish Step

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (Step 4, "Write and
  Commit")

**Interfaces:**
- Consumes: the convention amendment established in Task 1 (publish HTML
  docs via `Artifact`) — same pattern, applied here to `report.html`
  instead of `design.html`. No functional dependency on
  `digismith:enforcer` itself; `report-implementation` doesn't call it.
- Produces: nothing downstream in this plan consumes this task.

- [ ] **Step 1: Locate the exact text to modify**

```bash
grep -n "Not ignored (exit 1)" -A 6 skills/report-implementation/SKILL.md
```

Confirm the current text ends Step 4 with:

```
   - **Not ignored (exit 1)** → commit as normal:
     ```bash
     git add .digismith/docs/<feature-slug>/report.html
     git commit -m "docs: add <feature> (<map-item>) implementation report"
     ```

### Step 5: Hand Back
```

- [ ] **Step 2: Add the publish sub-step**

Item 4's own sub-bullets (`Ignored (exit 0)` / `Not ignored (exit 1)`)
are the last content before the `### Step 5: Hand Back` heading — nothing
after item 4 needs renumbering. Insert a new top-level numbered item, `5.`,
directly after item 4's closing code block and before that heading:

```markdown
5. **Publish as an artifact.** Per `MEMORY.md`'s Conventions section
   (Unified Docs Convention entry), any HTML doc DigiSmith writes gets
   published for readability. Call the `Artifact` tool on the just-written
   `report.html`: `title` from `{{FEATURE_TITLE}}`, `description` from the
   plan's own `**Goal:**` line, `favicon` one or two emoji fitting the
   feature's topic. Report the returned URL alongside the report path in
   Step 5's hand-back. This runs regardless of whether Step 4 committed
   the file — publishing to `Artifact` doesn't depend on the repo's
   gitignore choice.
```

- [ ] **Step 3: Verify the edit**

```bash
grep -n "Publish as an artifact" skills/report-implementation/SKILL.md
```

Expected: one match, as item 5 inside Step 4, before `### Step 5: Hand
Back`.

- [ ] **Step 4: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "feat(report-implementation): publish report.html as an artifact"
```

---

### Task 4: Amend `MEMORY.md` — Map Row, Build Order, Convention Clause

**Files:**
- Modify: `MEMORY.md` (map table, build-order table, Conventions section)

**Interfaces:**
- Consumes: nothing structurally — pure documentation, run last so it
  reflects the finished state of Tasks 1-3.
- Produces: the durable record future sessions read (per this repo's own
  "record decisions in plain, git-committed text" convention).

- [ ] **Step 1: Add the map table row**

Locate the map table (`grep -n "| \*\*P\*\* |" MEMORY.md`) and add a new
row directly after the **P** row:

```markdown
| **Q** | Convention enforcement | Makes `superpowers:brainstorming`/`superpowers:writing-plans` honor DigiSmith's unified docs convention (correct folder, HTML format) instead of falling back to their own defaults; also carries the amendment that any HTML doc DigiSmith writes gets published via the `Artifact` tool for readability |
```

- [ ] **Step 2: Add Q to the build order table**

Locate Tier 2 (`grep -n "The override" MEMORY.md`) and update its Items
cell:

```markdown
| **2** | The override | **H** subagent-driven always (built 2026-08-12) · **Q** convention enforcement · **K** open-weight model extension |
```

(No "(built ...)" annotation yet — per this repo's own pattern, that gets
added in a follow-up documentation commit after this branch actually
merges, same as **H**'s and **O**'s history show.)

- [ ] **Step 3: Amend the Unified Docs Convention bullet**

Locate it (`grep -n "Unified docs convention" MEMORY.md`) and append one
sentence to the end of that bullet's existing paragraph:

```markdown
Any HTML doc in that set — `design.html`, `report.html` — also gets
published via the `Artifact` tool once written, with the link reported
back; `plan.md` and `ticket.md` stay as plain working files, never
published (added 2026-08-15 alongside map item **Q**).
```

- [ ] **Step 4: Verify all three edits**

```bash
grep -n "Convention enforcement" MEMORY.md
grep -n "Q\*\* convention enforcement" MEMORY.md
grep -n "added 2026-08-15 alongside map item" MEMORY.md
```

Expected: one match each.

- [ ] **Step 5: Repo-wide grep for stray old-convention paths**

Per the design's Error Handling section — confirm nothing this plan
touched left a stray file under the old Superpowers-default locations:

```bash
git status --short
find docs/superpowers -type f 2>/dev/null
```

Expected: `git status --short` shows only this plan's own intended
changes (the four task commits, already made); `find docs/superpowers`
finds nothing (the fixture cleanup in Task 1 Step 5 already removed the
directory).

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md
git commit -m "docs: add map item Q (Enforcer), amend unified docs convention"
```

# Retire Enforcer Into Vendored Primitives (W.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `digismith:subagent-driven-development` (recommended) or `digismith:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold map item Q's (Convention enforcement) logic directly into the vendored `brainstorming`/`writing-plans` primitives, retire the standalone `digismith:enforcer` skill, and update its three call-sites.

**Architecture:** Detection (DigiSmith-tracked work) + slug resolution + path/format override move directly into `skills/brainstorming/SKILL.md` and `skills/writing-plans/SKILL.md`'s own content. The publish-to-Artifact step moves into `skills/bootstrap/SKILL.md` (the orchestrator). The wrap-externally-sourced-content mechanics move into `skills/adopt/SKILL.md` (its sole remaining consumer). `skills/enforcer/` is deleted; `MEMORY.md` and `vendored/PROVENANCE.md` record the retirement.

**Tech Stack:** Markdown/prose skill files (no executable code) — verification is via `node scripts/check_vendored_skills.ts`, repo-wide `grep`, and manual read-through, not unit tests.

## Global Constraints

- Every file edited below is Markdown prose (`SKILL.md`), not code — "tests" in this plan mean the verification commands specified per task, not a test framework.
- Never invent new behavior beyond what `.digismith/docs/retire-enforcer-vendored-primitives/design.html` specifies — carry Enforcer's existing behavior over faithfully (including its existing gaps, e.g. `writing-plans` never had a gitignore check — don't add one).
- The fork-provenance tag format is exactly: `(DigiSmith fork of Superpowers' <name>)` appended to the end of the existing `description:` frontmatter text.
- Never leave a dangling reference to `digismith:enforcer` anywhere in the repo after Task 6 (checked in Task 7).

---

### Task 1: Activate `brainstorming` — detection, slug resolution, HTML path/format override

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (frontmatter `description:` line 3; "After the Design" → "Documentation" section, lines 103-110)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `brainstorming`'s own vendored copy self-detects DigiSmith-tracked work and writes to `.digismith/docs/<slug>/design.html` in HTML when detected — Tasks 3 and 4 rely on this being true when they update `bootstrap`/`adopt` to stop invoking Enforcer.

- [ ] **Step 1: Add the fork-provenance tag to the frontmatter**

In `skills/brainstorming/SKILL.md`, change line 3 from:

```
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
```

to:

```
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation. (DigiSmith fork of Superpowers' brainstorming)"
```

- [ ] **Step 2: Replace the Documentation section's default-location bullet with the DigiSmith-tracked override**

Find this exact block (currently lines 103-110):

```markdown
## After the Design

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git
```

Replace it with:

```markdown
## After the Design

**Documentation:**

- **DigiSmith-tracked work** (current working directory has `.claude-plugin/plugin.json` with
  `"name": "digismith"`, or `.digismith/profile` is present) — write the validated design to
  `.digismith/docs/<slug>/design.html` instead of this skill's own default location, using the
  exact HTML shell below (reuse the `<style>` block byte-for-byte, filling in `{{TITLE}}`,
  `{{DATE}}`, `{{MAP_ITEM}}`, and the body `<section>`s per the spec's own content):

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

  `{{MAP_ITEM}}` is "no map letter — `<one-line reason>`" for a structural change with no map
  letter, same as `unified-docs-convention/design.html` already does — never leave it blank or
  invent a letter.

  **Slug:** reuse whatever slug the caller already resolved and passed into this invocation
  (e.g. `digismith:bootstrap`/`digismith:adopt` derive one before calling this skill, and pass
  it along) — never re-derive independently when one was already given. No slug was passed (a
  fully ad-hoc call — DigiSmith's own self-development or any other untracked-by-a-ticket case,
  no `digismith:bootstrap` in the loop) → derive it yourself: lowercase the feature description,
  drop filler words (a, an, the, on, to, of, for, in), replace remaining non-alphanumeric runs
  with a single hyphen, truncate to ~40 characters at a word boundary.

  **Before committing**, check whether the target path is gitignored in this repo:
  `git check-ignore -q .digismith/docs/<slug>/design.html` — exit 0 (ignored) → write the file,
  skip `git add`/commit, never force with `-f`; exit 1 (not ignored, the normal case for
  DigiSmith's own repo) → commit normally.

- **Not DigiSmith-tracked work** — write the validated design (spec) to
  `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (this skill's own unmodified default)
  - (User preferences for spec location override this default)
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git
```

- [ ] **Step 3: Verify the edit reads correctly**

Read the full file back and confirm: the frontmatter tag is present, the DigiSmith-tracked
branch and the not-tracked branch are both intact and mutually exclusive, and no other part of
the file was altered.

```bash
grep -c "DigiSmith fork of Superpowers' brainstorming" skills/brainstorming/SKILL.md
```

Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat(vendored-skills): activate brainstorming (W.5) — fold Enforcer's detection/slug/path-override logic in directly"
```

---

### Task 2: Activate `writing-plans` — detection, slug reuse, plan.md path override

**Files:**
- Modify: `skills/writing-plans/SKILL.md` (frontmatter `description:` line 3; "Save plans to:" block, lines 18-19)

**Interfaces:**
- Consumes: nothing from other tasks (self-contained edit to a different file than Task 1).
- Produces: `writing-plans`' own vendored copy self-detects DigiSmith-tracked work and writes to `.digismith/docs/<slug>/plan.md` when detected — Task 3 (`bootstrap`) relies on this being true.

- [ ] **Step 1: Add the fork-provenance tag to the frontmatter**

In `skills/writing-plans/SKILL.md`, change line 3 from:

```
description: Use when you have a spec or requirements for a multi-step task, before touching code
```

to:

```
description: Use when you have a spec or requirements for a multi-step task, before touching code (DigiSmith fork of Superpowers' writing-plans)
```

- [ ] **Step 2: Replace the "Save plans to" block with the DigiSmith-tracked override**

Find this exact block (currently lines 18-19):

```markdown
**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)
```

Replace it with:

```markdown
**Save plans to:**

- **DigiSmith-tracked work** (current working directory has `.claude-plugin/plugin.json` with
  `"name": "digismith"`, or `.digismith/profile` is present) — `.digismith/docs/<slug>/plan.md`
  instead of this skill's own default location. Format is unchanged — plans stay Markdown.

  **Slug:** reuse the slug already established earlier in this same session (this skill runs as
  `brainstorming`'s own terminal step once the user approves the spec, so a slug is normally
  already in context from that earlier work). No slug in context (a fully standalone
  invocation) → derive it yourself, same rule as `brainstorming`'s own ad-hoc case: lowercase
  the feature description, drop filler words (a, an, the, on, to, of, for, in), replace
  remaining non-alphanumeric runs with a single hyphen, truncate to ~40 characters at a word
  boundary.

  There is no gitignore check for `plan.md` — only `design.html` gets one.

- **Not DigiSmith-tracked work** — `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` (this
  skill's own unmodified default)
  - (User preferences for plan location override this default)
```

- [ ] **Step 3: Verify the edit reads correctly**

```bash
grep -c "DigiSmith fork of Superpowers' writing-plans" skills/writing-plans/SKILL.md
```

Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat(vendored-skills): activate writing-plans (W.5) — fold Enforcer's detection/slug/path-override logic in directly"
```

---

### Task 3: Update `bootstrap` — remove Enforcer invocation, add direct publish step

**Files:**
- Modify: `skills/bootstrap/SKILL.md` (Step 3 prose, lines 375-392; Quick Reference table row, line 446)

**Interfaces:**
- Consumes: relies on Task 1's `brainstorming` self-handling its own path/format (this task stops telling `bootstrap` to invoke `digismith:enforcer` beforehand).
- Produces: `bootstrap` now publishes `design.html` itself after `brainstorming` reports completion — no other task depends on this.

- [ ] **Step 1: Replace Step 3's prose**

Find this exact block (currently lines 375-392):

```markdown
### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `digismith:enforcer` — it needs the
slug already derived (the `ticket.md` folder name Step 2 reused under
`ticket: true`, or the slug Step 1 derived directly under `ticket:
false` — never re-derived a third way), so pass that along rather than
letting `enforcer` re-derive it. Then invoke `digismith:brainstorming`, passing
the ticket content **you already read in Step 1** — title, description,
acceptance criteria — as seed context so it doesn't start
cold. Pass the content you're carrying; do not try to re-read
`ticket.md` from inside the worktree, it isn't there (see Step 1). Once
invoked, `bootstrap`'s own job is done.
`digismith:brainstorming`'s own process (including its own
user-approval gates) and its terminal-step chain into
`digismith:writing-plans` and
`digismith:subagent-driven-development`/`digismith:executing-plans`
take over unmodified — do not re-invoke or duplicate any part of that
chain yourself.
```

Replace it with:

```markdown
### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `digismith:brainstorming`, passing both the slug already
derived (the `ticket.md` folder name Step 2 reused under `ticket: true`, or the slug Step 1
derived directly under `ticket: false` — never re-derived a third way; `brainstorming` reuses
it verbatim rather than re-deriving) and the ticket content **you already read in Step 1** —
title, description, acceptance criteria — as seed context so it doesn't start cold. Pass the
content you're carrying; do not try to re-read `ticket.md` from inside the worktree, it isn't
there (see Step 1).

Once `brainstorming` reports it has written its design doc (its own "Spec written and
committed to `<path>`" message), publish it: read the active profile the same way `bootstrap`
already resolves one elsewhere in this file, and unless it has `publish_artifact: false`, call
the `Artifact` tool on the reported `design.html` path — `title` from the doc's own `<title>`
tag, `description` one sentence summarizing the feature, `favicon` one or two emoji fitting the
feature's topic (pick contextually, never reuse a generic default across unrelated features).
Report the returned URL. `publish_artifact: false` → skip the `Artifact` call, state plainly:
"Not published — `publish_artifact: false` in this repo's profile." Not DigiSmith-tracked work
(`brainstorming` used its own upstream default location, not `.digismith/docs/`) → skip this
publish step entirely, nothing to publish under this convention.

`bootstrap`'s own job is done once the publish step above completes (or is skipped).
`digismith:brainstorming`'s own process (including its own user-approval gates) and its
terminal-step chain into `digismith:writing-plans` and
`digismith:subagent-driven-development`/`digismith:executing-plans` take over unmodified — do
not re-invoke or duplicate any part of that chain yourself.
```

- [ ] **Step 2: Update the Quick Reference table row**

Find this exact row (line 446):

```
| 3 | Invoke `digismith:enforcer` (passing the already-derived slug) before `digismith:brainstorming`, then invoke `digismith:brainstorming` with the Step 1 ticket content as seed context (when there is any); Superpowers' own chain takes over from there |
```

Replace it with:

```
| 3 | Invoke `digismith:brainstorming` directly, passing the already-derived slug plus the Step 1 ticket content as seed context (when there is any); once it reports its design doc written, publish via `Artifact` unless `publish_artifact: false`; Superpowers' own chain takes over from there |
```

- [ ] **Step 3: Verify no dangling Enforcer reference remains in this file**

```bash
grep -c "enforcer" skills/bootstrap/SKILL.md
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add skills/bootstrap/SKILL.md
git commit -m "refactor(bootstrap): stop invoking digismith:enforcer, publish design.html directly (W.5)"
```

---

### Task 4: Update `adopt` — inline Enforcer's wrap-and-place mechanics directly

**Files:**
- Modify: `skills/adopt/SKILL.md` (Step 6 prose, lines 179-200; Quick Reference table row, line 242)

**Interfaces:**
- Consumes: nothing from other tasks (self-contained edit; does not depend on `brainstorming`/`writing-plans` self-handling anything, since `adopt` handles externally-sourced content that never touches those primitives).
- Produces: `adopt` becomes fully self-sufficient for placing externally-sourced spec/plan content — no other task depends on this.

- [ ] **Step 1: Replace Step 6's prose**

Find this exact block (currently lines 179-200):

```markdown
### Step 6: Relocate the Docs

Run `digismith:enforcer`'s Step 2/5 "Verified" move-and-correct logic
directly, against the plan (and spec, if one was supplied) from Step 1,
targeting the slug resolved in Step 3:

- **Plan:** write the content you read into context in Step 1 to
  `.digismith/docs/<slug>/plan.md`, creating the folder if needed. Format
  doesn't change — plans are already Markdown.
- **Spec, if supplied:** rewrap the content you read into context in Step 1
  into `digismith:enforcer`'s HTML shell at
  `.digismith/docs/<slug>/design.html` (reuse the shell byte-for-byte from
  `digismith:enforcer`'s Step 1), respecting the same gitignore check
  (`git check-ignore -q .digismith/docs/<slug>/design.html`) and
  `publish_artifact` gate `digismith:enforcer` Step 3 already defines —
  publishing `design.html` via the `Artifact` tool when that gate allows it,
  exactly as `digismith:enforcer` Step 3 does. No spec supplied → skip
  `design.html` entirely, not an error.
- **Relocation target already exists with different content** (e.g. a
  previous partial `digismith:adopt` run, or a genuine naming collision) →
  ask before overwriting, same "never silently overwrite" posture used
  everywhere else in this project.
```

Replace it with:

```markdown
### Step 6: Relocate the Docs

Write the plan (and spec, if one was supplied) from Step 1 directly into `.digismith/docs/`,
targeting the slug resolved in Step 3:

- **Plan:** write the content you read into context in Step 1 to
  `.digismith/docs/<slug>/plan.md`, creating the folder if needed. Format doesn't change — plans
  are already Markdown. No gitignore check for `plan.md`.
- **Spec, if supplied:** rewrap the content you read into context in Step 1 into the HTML shell
  below at `.digismith/docs/<slug>/design.html` (reuse the `<style>` block byte-for-byte, filling
  in `{{TITLE}}`, `{{DATE}}`, `{{MAP_ITEM}}`, and the body `<section>`s from the supplied spec's
  own content):

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

  Respect the gitignore check before committing: `git check-ignore -q
  .digismith/docs/<slug>/design.html` — exit 0 (ignored) → write the file, skip `git
  add`/commit, never force with `-f`; exit 1 (not ignored) → commit normally. Then publish via
  `Artifact` unless the active profile has `publish_artifact: false` — `title` from the doc's
  own `<title>` tag, `description` one sentence summarizing the feature, `favicon` one or two
  emoji fitting the topic. `publish_artifact: false` → skip the `Artifact` call, state plainly
  why. No spec supplied → skip `design.html` entirely, not an error.
- **Relocation target already exists with different content** (e.g. a previous partial
  `digismith:adopt` run, or a genuine naming collision) → ask before overwriting, same "never
  silently overwrite" posture used everywhere else in this project.
```

- [ ] **Step 2: Update the Quick Reference table row**

Find this exact row (line 242):

```
| 6 | Write Step 1's in-hand plan (required) and spec (optional) content into `.digismith/docs/<slug>/` via `digismith:enforcer`'s move-and-correct logic, publishing `design.html` when `publish_artifact` allows |
```

Replace it with:

```
| 6 | Write Step 1's in-hand plan (required) and spec (optional) content directly into `.digismith/docs/<slug>/`, publishing `design.html` when `publish_artifact` allows |
```

- [ ] **Step 3: Verify no dangling Enforcer reference remains in this file**

```bash
grep -c "enforcer" skills/adopt/SKILL.md
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add skills/adopt/SKILL.md
git commit -m "refactor(adopt): inline Enforcer's wrap-and-place mechanics directly (W.5)"
```

---

### Task 5: Update `report-implementation` — drop the stylistic Enforcer cross-reference

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (line 304)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on — purely a wording fix.

- [ ] **Step 1: Replace the cross-reference**

Find this exact text (currently lines 302-305):

```
Either way, when Step 4 reports the written `report.html`, state plainly
which path produced it — "generated via `<provider-name>`" or "generated
in-session, offload unavailable/off" — the same way `digismith:enforcer`
names its rewrap path. `<provider-name>` comes from parsing
```

Replace it with:

```
Either way, when Step 4 reports the written `report.html`, state plainly
which path produced it — "generated via `<provider-name>`" or "generated
in-session, offload unavailable/off". `<provider-name>` comes from parsing
```

- [ ] **Step 2: Verify no dangling Enforcer reference remains in this file**

```bash
grep -c "enforcer" skills/report-implementation/SKILL.md
```

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "docs(report-implementation): drop stale Enforcer cross-reference (W.5)"
```

---

### Task 6: Delete Enforcer, update `MEMORY.md` and `vendored/PROVENANCE.md`

**Files:**
- Delete: `skills/enforcer/SKILL.md` (and the now-empty `skills/enforcer/` folder)
- Modify: `MEMORY.md` (Q's map row; Build order Tier 2 entry for Q; W's map row)
- Modify: `vendored/PROVENANCE.md` (activation lists)

**Interfaces:**
- Consumes: relies on Tasks 1-5 having already removed every functional dependency on `digismith:enforcer` — this task performs the actual deletion.
- Produces: nothing further downstream — this is the retirement itself.

- [ ] **Step 1: Delete the Enforcer skill**

```bash
git rm -r skills/enforcer
```

- [ ] **Step 2: Update MEMORY.md's map — mark Q retired**

Read `MEMORY.md`'s map table row for **Q** (currently: `| **Q** | Convention enforcement |
Makes \`digismith:brainstorming\`/\`digismith:writing-plans\` honor DigiSmith's unified docs
convention (correct folder, HTML format) instead of falling back to their own defaults; also
carries the amendment that any HTML doc DigiSmith writes gets published via the \`Artifact\`
tool for readability, unless the active profile has \`publish_artifact: false\` |`).

Replace its description cell with:

```
Made `digismith:brainstorming`/`digismith:writing-plans` honor DigiSmith's unified docs
convention (correct folder, HTML format) instead of falling back to their own defaults, via a
standalone `digismith:enforcer` skill that wrapped both from the outside. **Retired 2026-09-04**
once map item W's vendoring mechanism was proven live — Enforcer's logic was absorbed directly
into the vendored primitives themselves (see **W.5**) rather than kept as an external wrapper.
Letter freed for future reuse, same precedent as letter R being freed and later reused for W's
own predecessor numbering.
```

- [ ] **Step 3: Update MEMORY.md's Build order table — annotate Tier 2's Q entry**

Find the Build order table's Tier 2 row (contains `**Q** convention enforcement (built
2026-08-15)`). Change that segment to:

```
**Q** convention enforcement (built 2026-08-15, retired 2026-09-04 — absorbed into **W.5**)
```

- [ ] **Step 3b: Update MEMORY.md's Build order table — W.4+ reference**

In the same Tier 2 row from Step 3, find this exact segment (at the end of the row):

```
**W.4+** primitive-by-primitive replacement |
```

Replace it with:

```
**W.4**/**W.5** primitive-by-primitive replacement (Q retired into W.5) · **W.6+** further replacement |
```

- [ ] **Step 4: Update MEMORY.md's map — add W.5 to W's row**

Find W's map row's `**W.4**` entry (ends with "...The other 13 vendored primitives remain
dormant, byte-identical clones — not yet decided whether any of them need to diverge ·").
Insert a new **W.5** entry immediately after it, before the existing `**W.5+**` (renumber that
trailing catch-all to **W.6+**):

```
**W.5** built 2026-09-04: retired map item **Q** (Convention enforcement) by folding its logic
directly into the vendored primitives it used to wrap from the outside — detection (DigiSmith-
tracked work) and slug resolution moved into `brainstorming`'s and `writing-plans`' own vendored
content, along with `brainstorming`'s HTML path/format override and `writing-plans`' plan.md
path override; the Artifact-publish step moved into `bootstrap`; the wrap-and-place mechanics
for externally-sourced content moved into `adopt`. Both primitives carry the fork-provenance tag.
See `.digismith/docs/retire-enforcer-vendored-primitives/design.html` · **W.6+**
```

(This replaces the old standalone `**W.5+**` marker with `**W.6+**`, continuing the same
trailing catch-all text that already followed it.)

- [ ] **Step 5: Update vendored/PROVENANCE.md**

Find this exact block (currently lines 9-23):

```markdown
## Skills vendored (verbatim, byte-identical to source)

- brainstorming
- dispatching-parallel-agents
- executing-plans
- receiving-code-review
- requesting-code-review
- subagent-driven-development
- systematic-debugging
- test-driven-development
- using-git-worktrees
- using-superpowers
- verification-before-completion
- writing-plans
- writing-skills
```

Replace it with (removing `brainstorming` and `writing-plans`, now both activated):

```markdown
## Skills vendored (verbatim, byte-identical to source)

- dispatching-parallel-agents
- executing-plans
- receiving-code-review
- requesting-code-review
- subagent-driven-development
- systematic-debugging
- test-driven-development
- using-git-worktrees
- using-superpowers
- verification-before-completion
- writing-skills
```

Find this exact block (currently lines 25-29):

```markdown
## Skills activated (diverged from source)

- **finishing-a-development-branch** — map item **W.4**, activated 2026-09-04.
  Option 1 ("Merge Locally") now pushes `<base-branch>` to origin after a
  successful merge and green tests. See DigiSmith `MEMORY.md` map item W.
```

Replace it with:

```markdown
## Skills activated (diverged from source)

- **finishing-a-development-branch** — map item **W.4**, activated 2026-09-04.
  Option 1 ("Merge Locally") now pushes `<base-branch>` to origin after a
  successful merge and green tests. See DigiSmith `MEMORY.md` map item W.
- **brainstorming** — map item **W.5**, activated 2026-09-04 (alongside
  `writing-plans`, below). Now self-detects DigiSmith-tracked work and writes
  to `.digismith/docs/<slug>/design.html` in HTML instead of its own upstream
  Markdown default — absorbing map item Q's logic, which is now retired. See
  DigiSmith `MEMORY.md` map item W.
- **writing-plans** — map item **W.5**, activated 2026-09-04 (alongside
  `brainstorming`, above). Now writes to `.digismith/docs/<slug>/plan.md` for
  DigiSmith-tracked work instead of its own upstream default. See DigiSmith
  `MEMORY.md` map item W.
```

Find this exact sentence (currently lines 56-58):

```
A vendored skill above is "dormant" until a future brainstorm activates
it — **finishing-a-development-branch** is the first to have gone through
this (W.4, 2026-09-04); every other skill in this file is still an inert,
```

Replace it with:

```
A vendored skill above is "dormant" until a future brainstorm activates
it — **finishing-a-development-branch** (W.4) and **brainstorming**/
**writing-plans** (W.5) have gone through this, all on 2026-09-04; every
other skill in this file is still an inert,
```

- [ ] **Step 6: Commit**

```bash
git add -A -- skills/enforcer MEMORY.md vendored/PROVENANCE.md
git commit -m "feat(vendored-skills): retire Enforcer (Q), absorbed into brainstorming/writing-plans (W.5)"
```

---

### Task 7: Final verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the complete state after Tasks 1-6.
- Produces: nothing — this is the plan's closing gate.

- [ ] **Step 1: Confirm zero dangling Enforcer references repo-wide**

```bash
grep -rn "enforcer" --include="*.md" --include="*.ts" . 2>/dev/null | grep -v "\.digismith/docs/" | grep -vi "node_modules"
```

Expected: no output (the only remaining mentions of "enforcer" live in frozen historical docs
under `.digismith/docs/**`, which are excluded here, and in this plan/spec's own files, which
this grep pattern also naturally excludes since it filters `.digismith/docs/`).

- [ ] **Step 2: Run check_vendored_skills.ts and confirm both primitives show local divergence**

```bash
node scripts/check_vendored_skills.ts
```

Expected: both `brainstorming` and `writing-plans` report `N file(s) changed upstream, 1
locally diverged` (or similar — 0 upstream, 1+ local), not `no drift`. Every other vendored
skill (except `finishing-a-development-branch`, already diverged from W.4) still reports `no
drift`.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass (this change touches no executable code, so the existing 125-test
baseline should be unaffected).

- [ ] **Step 4: Report completion**

State plainly: Enforcer retired, W.5 shipped, letter Q freed. Link the design spec's artifact
URL again for reference. Note the one real gap from the design spec's Testing section: no live
end-to-end dry run of the full `bootstrap` → `brainstorming` → `writing-plans` chain was
possible within this plan — flag it as a known risk, same class as K.6's runner before its live
confirmation.

# Unified Docs Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DigiSmith's two inconsistent storage conventions —
`docs/superpowers/{specs,plans,reports}/` (type-organized, DigiSmith's own
repo only) and `docs/<slug>/ticket.md` (consumer repos, hardcoded
gitignored) — with one: `.digismith/docs/<feature-slug>/{ticket.md,
design.html, plan.md, report.html}`, wherever DigiSmith writes docs, with
commit-vs-gitignore an explicit per-repo choice instead of an assumption.

**Architecture:** Task 1 migrates DigiSmith's own repo (13 existing files
across 5 shipped features, plus `docs/history.html`) into the new
structure and fixes every cross-reference. Task 2 updates
`report-implementation`'s path-derivation logic to write into the new
structure going forward (and gains a simplification: the feature slug is
now just the plan file's parent folder name, and sibling links are
same-folder instead of `../specs/`/`../plans/`). Task 3 updates
`jira-intake`'s consumer-repo ticket path and adds the ask-once/detect
commit-vs-gitignore logic, plus updates `using-digismith`'s reference to
where `ticket.md` lives.

**Tech Stack:** Markdown/HTML skill instructions and documentation files.
No application code, no test framework, no map letter — this is a
structural/Convention change, recorded in `MEMORY.md`'s Conventions
section and `docs/history.html`'s timeline, not the map table.

## Global Constraints

- **This plan's own spec, plan, and (eventual) report are explicitly
  EXCLUDED from Task 1's migration.** Moving this very plan file mid-flight
  would break `subagent-driven-development`'s `task-brief`/`review-package`
  scripts, which reference it by a fixed path throughout execution. They
  stay at `docs/superpowers/specs/2026-08-08-unified-docs-convention-design.html`
  and `docs/superpowers/plans/2026-08-08-unified-docs-convention-plan.md`
  through this plan's entire execution, and get moved by hand, once,
  **after** this plan's own SDD run fully completes (not a numbered task
  here — a one-off follow-up).
- **Migrate structure, not history.** Only fix references that are live,
  functioning navigation (a file's own `<footer>` self-reference, a
  report's `<a href>` links to its sibling spec/plan, `docs/history.html`'s
  links, `MEMORY.md`'s Conventions prose, `README.md`'s links). Do
  **not** rewrite narrative prose *inside* old plan/report bodies that
  describes what commands were run or what a skill's design was **at the
  time** (e.g. a 2026-08-06 report's sentence about writing to
  `docs/superpowers/reports/` is an accurate historical statement — leave
  it as written). The distinction: functioning links and self-references
  get fixed because they'd otherwise point at a folder structure that no
  longer exists; narrative history doesn't get rewritten to pretend a
  convention existed before it did.
- **Verification is scoped, not a blanket grep.** After Task 1, grep
  `superpowers/specs`, `superpowers/plans`, `superpowers/reports`, and
  `docs/superpowers` **only** inside `.digismith/history.html`,
  `MEMORY.md`, `README.md`, and every moved file's `<footer>` line plus
  any `<a href="../specs|../plans|../reports...">` line — expect **zero**
  hits in those specific locations. Old-path mentions surviving inside
  plan/report body prose elsewhere are expected and correct per the
  constraint above, not a test failure.
- **New folder naming**: `.digismith/docs/<feature-slug>/`, files named
  by role only — `ticket.md`, `design.html`, `plan.md`, `report.html` — no
  date prefix (the folder name and git history carry that now).
  `.digismith/history.html` replaces `docs/history.html`.
- Cross-skill references inside `SKILL.md` content must stay
  plugin-qualified: `superpowers:subagent-driven-development`,
  `digismith:jira-intake`, etc. (unchanged by this plan, just don't break
  them while editing surrounding text).
- No automated test suite. Verification is the scoped grep above plus
  dogfooding for Tasks 2 and 3's logic changes.

---

### Task 1: Migrate DigiSmith's Own Repo to the New Structure

**Files:**
- Move (git mv, preserving history): all 13 files listed below, plus
  `docs/history.html` → `.digismith/history.html`
- Modify: `.digismith/history.html` (post-move, link fixes + new timeline
  entry), `MEMORY.md` (Conventions section), `README.md` (link fixes)
- Modify (footer/sibling-link fixes only, post-move): the 8 moved `.html`
  files that have a `<footer>` line or sibling links

**Interfaces:**
- Consumes: the 13 existing files' current paths and content (read-only
  except for the specific footer/sibling-link lines named below).
- Produces: `.digismith/docs/<slug>/{design.html,plan.md,report.html}`
  for 5 features, `.digismith/history.html`, an updated `MEMORY.md`
  Conventions section that documents the new convention as the standard.

- [ ] **Step 1: Create the new folders and move files**

```bash
cd D:\Workspace\Jazurite\DigiSmith

mkdir -p .digismith/docs/standards-injection .digismith/docs/jira-intake .digismith/docs/using-digismith .digismith/docs/capture-ephemeral-url .digismith/docs/report-implementation

git mv docs/superpowers/specs/2026-08-05-standards-injection-design.html .digismith/docs/standards-injection/design.html
git mv docs/superpowers/plans/2026-08-05-standards-injection-plan.md .digismith/docs/standards-injection/plan.md
git mv docs/superpowers/reports/2026-08-05-standards-injection-report.html .digismith/docs/standards-injection/report.html

git mv docs/superpowers/specs/2026-08-06-jira-intake-design.html .digismith/docs/jira-intake/design.html
git mv docs/superpowers/plans/2026-08-07-jira-intake-plan.md .digismith/docs/jira-intake/plan.md

git mv docs/superpowers/specs/2026-08-07-using-digismith-design.html .digismith/docs/using-digismith/design.html
git mv docs/superpowers/plans/2026-08-07-using-digismith-plan.md .digismith/docs/using-digismith/plan.md

git mv docs/superpowers/specs/2026-08-08-capture-ephemeral-url-design.html .digismith/docs/capture-ephemeral-url/design.html
git mv docs/superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md .digismith/docs/capture-ephemeral-url/plan.md
git mv docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html .digismith/docs/capture-ephemeral-url/report.html

git mv docs/superpowers/specs/2026-08-08-report-implementation-design.html .digismith/docs/report-implementation/design.html
git mv docs/superpowers/plans/2026-08-08-report-implementation-plan.md .digismith/docs/report-implementation/plan.md
git mv docs/superpowers/reports/2026-08-08-report-implementation-report.html .digismith/docs/report-implementation/report.html

git mv docs/history.html .digismith/history.html
```

Expected: `docs/superpowers/specs/` and `docs/superpowers/plans/` each
still contain exactly one file (this plan's own spec and plan — see
Global Constraints). `docs/superpowers/reports/` is now empty (it has no
excluded file, since this plan's own report doesn't exist yet). Confirm
with:

```bash
ls docs/superpowers/specs/ docs/superpowers/plans/ docs/superpowers/reports/ 2>&1
```

- [ ] **Step 2: Fix each moved file's own `<footer>` self-reference**

Eight files have a `<footer>DigiSmith · docs/superpowers/...</footer>`
line. Fix each to its new path:

| File | Old footer text | New footer text |
|---|---|---|
| `.digismith/docs/standards-injection/design.html` | `docs/superpowers/specs/2026-08-05-standards-injection-design.html` | `.digismith/docs/standards-injection/design.html` |
| `.digismith/docs/standards-injection/report.html` | `docs/superpowers/reports/2026-08-05-standards-injection-report.html` | `.digismith/docs/standards-injection/report.html` |
| `.digismith/docs/jira-intake/design.html` | `docs/superpowers/specs/2026-08-06-jira-intake-design.html` | `.digismith/docs/jira-intake/design.html` |
| `.digismith/docs/using-digismith/design.html` | `docs/superpowers/specs/2026-08-07-using-digismith-design.html` | `.digismith/docs/using-digismith/design.html` |
| `.digismith/docs/capture-ephemeral-url/design.html` | `docs/superpowers/specs/2026-08-08-capture-ephemeral-url-design.html` | `.digismith/docs/capture-ephemeral-url/design.html` |
| `.digismith/docs/capture-ephemeral-url/report.html` | `docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html` | `.digismith/docs/capture-ephemeral-url/report.html` |
| `.digismith/docs/report-implementation/design.html` | `docs/superpowers/specs/2026-08-08-report-implementation-design.html` | `.digismith/docs/report-implementation/design.html` |
| `.digismith/docs/report-implementation/report.html` | `docs/superpowers/reports/2026-08-08-report-implementation-report.html` | `.digismith/docs/report-implementation/report.html` |

Each is a one-line change of the form
`<footer>DigiSmith · <old path></footer>` → `<footer>DigiSmith · <new
path></footer>`. (Plan files, `.md`, have no footer — skip them.)

- [ ] **Step 3: Fix sibling-links in the 3 report files**

Each report has two lines linking to its own spec and plan. Fix both
lines in each of these three files:

`.digismith/docs/standards-injection/report.html`:
```
old: <a href="../specs/2026-08-05-standards-injection-design.html">design spec</a> and the
     <a href="../plans/2026-08-05-standards-injection-plan.md">implementation plan</a>.</p>
new: <a href="design.html">design spec</a> and the
     <a href="plan.md">implementation plan</a>.</p>
```

`.digismith/docs/capture-ephemeral-url/report.html`:
```
old: <a href="../specs/2026-08-08-capture-ephemeral-url-design.html">design spec</a> and the
     <a href="../plans/2026-08-08-capture-ephemeral-url-plan.md">implementation plan</a>.</p>
new: <a href="design.html">design spec</a> and the
     <a href="plan.md">implementation plan</a>.</p>
```

`.digismith/docs/report-implementation/report.html`:
```
old: <a href="../specs/2026-08-08-report-implementation-design.html">design spec</a> and the
     <a href="../plans/2026-08-08-report-implementation-plan.md">implementation plan</a>.</p>
new: <a href="design.html">design spec</a> and the
     <a href="plan.md">implementation plan</a>.</p>
```

- [ ] **Step 4: Rewrite `.digismith/history.html`'s links**

In the `#map` section, five paragraphs (G, A, E, M, N) each link to that
feature's spec/plan/report. Rewrite every `superpowers/specs/…`,
`superpowers/plans/…`, `superpowers/reports/…` href in those five
paragraphs to the new same-structure form:

- G's paragraph: `superpowers/specs/2026-08-05-standards-injection-design.html` → `docs/standards-injection/design.html`; `superpowers/plans/2026-08-05-standards-injection-plan.md` → `docs/standards-injection/plan.md`; `superpowers/reports/2026-08-05-standards-injection-report.html` → `docs/standards-injection/report.html`.
- A's paragraph: `superpowers/specs/2026-08-06-jira-intake-design.html` → `docs/jira-intake/design.html`; `superpowers/plans/2026-08-07-jira-intake-plan.md` → `docs/jira-intake/plan.md`.
- E's paragraph: `superpowers/specs/2026-08-07-using-digismith-design.html` → `docs/using-digismith/design.html`; `superpowers/plans/2026-08-07-using-digismith-plan.md` → `docs/using-digismith/plan.md`.
- M's paragraph: `superpowers/specs/2026-08-08-capture-ephemeral-url-design.html` → `docs/capture-ephemeral-url/design.html`; `superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md` → `docs/capture-ephemeral-url/plan.md`.
- N's paragraph: `superpowers/specs/2026-08-08-report-implementation-design.html` → `docs/report-implementation/design.html`; `superpowers/plans/2026-08-08-report-implementation-plan.md` → `docs/report-implementation/plan.md`; the cross-link `superpowers/reports/2026-08-08-capture-ephemeral-url-report.html` (labeled "M's real implementation report") → `docs/capture-ephemeral-url/report.html`.

Additionally, while editing N's paragraph: it currently links M's report
but not N's own (N's report didn't exist yet when that paragraph was
written — a gap the final review flagged). Add a new clause linking
`docs/report-implementation/report.html` labeled "N's own implementation
report", in the same `<p style="font-size:.88rem; color:var(--muted);">`
style as the rest of that paragraph.

Because `.digismith/history.html` now sits at `.digismith/`'s root, next
to `.digismith/docs/`, all these links are one level down
(`docs/<slug>/<file>`) — no `../` needed anywhere.

- [ ] **Step 5: Add a timeline entry for this reorg (no map-letter entry — see Global Constraints)**

Append to `.digismith/history.html`'s `.timeline` div, after the existing
final entry:

```html
<div class="event">
  <div class="date">2026-08-08</div>
  <h4>Unified docs convention adopted — no map letter</h4>
  <p>Replaced two inconsistent storage conventions —
  <code>docs/superpowers/{specs,plans,reports}/</code> (DigiSmith's own repo,
  organized by artifact type) and <code>docs/&lt;slug&gt;/ticket.md</code>
  (consumer repos, hardcoded gitignored) — with one:
  <code>.digismith/docs/&lt;feature-slug&gt;/{ticket.md, design.html, plan.md,
  report.html}</code>, wherever DigiSmith writes docs. Commit-vs-gitignore in
  a consumer repo is now an explicit ask-once-then-remember choice instead of
  a hardcoded assumption. All 13 existing files across G/A/E/M/N migrated in
  the same pass; this is a structural change, not a new pipeline capability,
  so it's recorded here and in <code>MEMORY.md</code>'s Conventions section
  rather than added to the map table.</p>
</div>
```

- [ ] **Step 6: Rewrite `MEMORY.md`'s Conventions section**

Find this bullet (the first one, describing the old convention):

```
old:
- Specs and plans for DigiSmith work live inside this repo, git-committed,
  at `docs/superpowers/{specs,plans}/`. (Originally documented as living
  at the knowpolis vault root — that path doesn't exist on the machine
  this was built on, so this repo's own `docs/` became the default.)
```

Replace it with:

```
new:
- **Unified docs convention** (adopted 2026-08-08, replacing the two
  conventions below): everywhere DigiSmith writes docs — its own repo or
  any consumer repo — they live together at
  `.digismith/docs/<feature-slug>/{ticket.md, design.html, plan.md,
  report.html}`, one folder per feature, files named by role only (no
  date prefix — the folder name and git history carry that). In
  DigiSmith's own repo, `.digismith/` is git-committed, same as the old
  `docs/` was. In a consumer repo, commit-vs-gitignore is an explicit
  per-repo choice: `jira-intake` checks that repo's `.gitignore` for a
  `.digismith/` entry before writing there for the first time — entry
  present → write gitignored, no question asked; absent and
  `.digismith/docs/` doesn't exist there yet → ask once via
  `AskUserQuestion`, and if gitignored is chosen, add the entry (its
  presence becomes the remembered answer for every future session; its
  absence means "committed," equally durable). `.digismith/history.html`
  replaces `docs/history.html` in DigiSmith's own repo.
```

Leave the "Specs are authored in HTML..." bullet and the "Record
decisions in plain, git-committed text..." bullet immediately below
unchanged — they describe format and philosophy, not the path
convention, and both still hold.

- [ ] **Step 7: Fix `README.md`'s links**

Four occurrences of `docs/history.html` become `.digismith/history.html`
(lines vary — the two in the opening paragraph, the one in the
`capture-ephemeral-url` paragraph, the one in the `report-implementation`
paragraph, and the one in "Current Scope"). One occurrence of
`` `docs/<slug>/ticket.md` `` (in the "1. Get a real ticket" section)
becomes `` `.digismith/docs/<slug>/ticket.md` ``. Read the full file and
replace every one — do not leave any `docs/history.html` or bare
`docs/<slug>/ticket.md` reference.

- [ ] **Step 8: Scoped verification**

```bash
cd D:\Workspace\Jazurite\DigiSmith
grep -n "superpowers/specs\|superpowers/plans\|superpowers/reports\|docs/superpowers" .digismith/history.html MEMORY.md README.md
grep -rn "footer>DigiSmith" .digismith/docs/
grep -rn 'href="\.\./specs\|href="\.\./plans\|href="\.\./reports' .digismith/docs/
```

Expected: all three commands return **no matches**. Per Global
Constraints, do not run a blanket repo-wide grep and do not "fix" any
old-path mentions found inside plan/report body prose elsewhere (e.g.
inside `.digismith/docs/report-implementation/plan.md`'s own historical
instructions) — those are expected and correct.

Then verify every link target actually exists on disk (broken-link
check):

```bash
for f in .digismith/docs/*/design.html .digismith/docs/*/plan.md .digismith/docs/*/report.html .digismith/history.html; do
  [ -f "$f" ] && echo "OK: $f" || echo "MISSING: $f"
done
```

Expected: `OK` for every one of the 13 moved files plus
`.digismith/history.html` — no `MISSING` lines. The glob naturally omits
`jira-intake/report.html` and `using-digismith/report.html` from the loop
entirely, since neither feature has a report yet — that's expected, not
a gap to investigate.

```bash
git status
```

Expected: the 14 moved files show as renames, plus modifications to the
files touched in Steps 2-7.

- [ ] **Step 9: Commit**

```bash
git add -A -- .digismith docs README.md MEMORY.md
git commit -m "docs: migrate to unified .digismith/docs/<feature-slug>/ convention"
```

---

### Task 2: Update `report-implementation` for the New Convention

**Files:**
- Modify: `skills/report-implementation/SKILL.md`

**Interfaces:**
- Consumes: a plan file now located at `.digismith/docs/<feature-slug>/plan.md`
  (previously `docs/superpowers/plans/<date>-<slug>-plan.md`).
- Produces: `.digismith/docs/<feature-slug>/report.html` (previously
  `docs/superpowers/reports/<date-slug>-report.html`), with
  `{{SPEC_RELATIVE_LINK}}`/`{{PLAN_RELATIVE_LINK}}` now same-folder
  (`design.html`/`plan.md`) instead of `../specs/…`/`../plans/…`.

This is a net simplification: the feature slug is now the plan file's own
parent directory name (no more parsing it out of a `<date>-<slug>-plan.md`
filename), and every artifact lives in one folder, so sibling links no
longer need to climb up and back down.

- [ ] **Step 1: Update Step 1 ("Locate and Read Sources")**

Find:
```
old:
1. **Plan file** — the same `docs/superpowers/plans/<date>-<slug>-plan.md`
   the just-finished run executed.
```

Replace with:
```
new:
1. **Plan file** — the same `.digismith/docs/<feature-slug>/plan.md` the
   just-finished run executed. `<feature-slug>` is that file's own parent
   directory name — read it directly from the path, don't re-derive it
   from content.
```

- [ ] **Step 2: Update the placeholder-derivation rules (Step 2a)**

Find the `{{SPEC_RELATIVE_LINK}}` / `{{PLAN_RELATIVE_LINK}}` bullet
(added in this skill's own final-review fix wave) — it currently derives
`../specs/<date>-<slug>-design.html` and `../plans/<date>-<slug>-plan.md`.
Replace its content with:

```
new:
- `{{SPEC_RELATIVE_LINK}}` / `{{PLAN_RELATIVE_LINK}}`: same folder as the
  report itself — literally `design.html` and `plan.md`. If no
  `design.html` exists at that path (a plan with no separate design
  spec), omit that link and its clause from the summary sentence rather
  than linking a 404; keep the other link's clause if that file exists.
```

Also find `{{REPORT_FILENAME}}`'s derivation rule and simplify: it's now
always literally `report.html` (no date-slug prefix), so state that
directly rather than describing a filename-construction step.

- [ ] **Step 3: Update Step 4 ("Write and Commit")**

Find:
```
old:
1. Target path: `docs/superpowers/reports/<date-slug>-report.html`, where
   `<date-slug>` is exactly the plan file's own `<date>-<slug>` (e.g. plan
   `docs/superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md` →
   report `docs/superpowers/reports/2026-08-08-capture-ephemeral-url-report.html`).
```

Replace with:
```
new:
1. Target path: `.digismith/docs/<feature-slug>/report.html`, in the same
   folder as that feature's `plan.md` (and `design.html`, if it exists) —
   e.g. plan `.digismith/docs/capture-ephemeral-url/plan.md` → report
   `.digismith/docs/capture-ephemeral-url/report.html`.
```

Update the `git add` example line and the Quick Reference table row to
match (`.digismith/docs/<feature-slug>/report.html` instead of
`docs/superpowers/reports/<date-slug>-report.html`).

- [ ] **Step 4: Update the footer template placeholder and the Overview's example reference**

The HTML template's `<footer>` line currently reads
`DigiSmith · docs/superpowers/reports/{{REPORT_FILENAME}}`. Change to
`DigiSmith · .digismith/docs/{{FEATURE_SLUG}}/{{REPORT_FILENAME}}`.

Add a new bullet to Step 2a's placeholder-derivation list, alongside the
existing `{{MAP_ITEM}}`/`{{DATE}}` bullets:

```
- `{{FEATURE_SLUG}}`: the plan file's own parent directory name (already
  identified in Step 1) — e.g. `capture-ephemeral-url`.
```

The Overview section's reference to
`docs/superpowers/reports/2026-08-05-standards-injection-report.html` (G's
report, used as the template-origin citation) is historical narrative —
per this plan's Global Constraints, leave the sentence's meaning intact
but update the path itself to `.digismith/docs/standards-injection/report.html`,
since Task 1 already moved that actual file and a cold-start agent
following this link should find it.

- [ ] **Step 5: Dogfood the updated derivation against a fixture**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 1 and Step 2a of the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\report-implementation\SKILL.md.
Treat this as the plan file: D:\Workspace\Jazurite\DigiSmith\.digismith\docs\capture-ephemeral-url\plan.md
(a real file — read it for real). Report: what you derive as
<feature-slug>, {{SPEC_RELATIVE_LINK}}, {{PLAN_RELATIVE_LINK}},
{{REPORT_FILENAME}}, and the full target path from Step 4 you would write
to. Do not actually write or commit anything — this is a dry-run report
only.
```

Expected: `<feature-slug>` = `capture-ephemeral-url`,
`{{SPEC_RELATIVE_LINK}}` = `design.html`, `{{PLAN_RELATIVE_LINK}}` =
`plan.md`, `{{REPORT_FILENAME}}` = `report.html`, target path =
`.digismith/docs/capture-ephemeral-url/report.html` (which — correctly —
already has a real `report.html` there from Task 1's migration, so a real
run here would hit the "ask before overwriting" rule; the dogfood subagent
should note this too, not attempt to write).

- [ ] **Step 6: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith
git add skills/report-implementation/SKILL.md
git commit -m "feat(reporting): update report-implementation for unified docs convention"
```

---

### Task 3: Update `jira-intake` and `using-digismith` for Consumer Repos

**Files:**
- Modify: `skills/jira-intake/SKILL.md`
- Modify: `skills/using-digismith/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: tickets now written to `.digismith/docs/<slug>/ticket.md` in
  a consumer repo, with an explicit ask-once/detect commit-vs-gitignore
  step before the first write into a given repo.

- [ ] **Step 1: Update `jira-intake`'s Overview and Step 3**

Find (Overview, line 12):
```
old: Both converge on the same `docs/<slug>/ticket.md` shape.
new: Both converge on the same `.digismith/docs/<slug>/ticket.md` shape.
```

Find (Step 3.2):
```
old:
2. Target path: `docs/<slug>/ticket.md`, in the repo currently being
   worked in — never DigiSmith's own repo, which only hosts this skill,
   not the tickets it processes — gitignored, matching the existing
   convention for specs/plans/reports in that same folder.
```

Replace with:
```
new:
2. Target path: `.digismith/docs/<slug>/ticket.md`, in the repo currently
   being worked in — never DigiSmith's own repo, which only hosts this
   skill, not the tickets it processes.
3. **Commit-vs-gitignore, decided once per repo:** before writing into
   `.digismith/docs/` in this repo for the first time, check that repo's
   own `.gitignore` for a `.digismith/` (or `.digismith/docs/`) entry:
   - **Entry found** → write gitignored, proceed, no question asked.
   - **No entry, and `.digismith/docs/` doesn't already exist in this
     repo** → ask once via `AskUserQuestion` ("commit this repo's
     DigiSmith docs, or keep them local-only?"). If gitignored is chosen,
     append the entry to this repo's `.gitignore` (creating the file if it
     doesn't exist) — its presence is now the remembered answer for every
     future session in this repo. If committed is chosen, do nothing
     further; the entry's continued absence is itself the remembered
     "committed" signal.
   - **No entry, but `.digismith/docs/` already exists in this repo** →
     an earlier write already happened without adding a `.gitignore`
     entry; treat as "committed" (matches the existing files' actual
     state), don't ask again.
```

(Renumber the old Steps 3-4 — "check for an existing file," "write the
file" — to Steps 4-5.)

- [ ] **Step 2: Update `jira-intake`'s Handling Existing Files section and Quick Reference**

Find:
```
old: Before writing, check whether `docs/<slug>/ticket.md` already exists:
new: Before writing, check whether `.digismith/docs/<slug>/ticket.md` already exists:
```

Find the Quick Reference table's Step 3 row and update its path mention
from `docs/<slug>/ticket.md` to `.digismith/docs/<slug>/ticket.md`; add a
new row for the commit-vs-gitignore step between the old "3" and "4"
(renumbered per Step 1 above).

- [ ] **Step 3: Update `using-digismith`'s references**

Four places reference `docs/<slug>/ticket.md` (Overview is unaffected —
`using-digismith` doesn't mention the path itself there): Step 1's two
mentions ("Check whether this conversation already produced a
`docs/<slug>/ticket.md`..." and "read the full content of the
`docs/<slug>/ticket.md` that..."), Step 2.1's mention ("reuse the folder
name `ticket.md` is already sitting in (`docs/<slug>/ticket.md`)"), and
the Quick Reference table's Step 1 row. Replace all four occurrences of
`docs/<slug>/ticket.md` with `.digismith/docs/<slug>/ticket.md`. No other
wording changes needed — the gitignored/worktree-doesn't-see-it behavior
Step 1 describes is unaffected by the path change.

- [ ] **Step 4: Dogfood the ask-once/detect logic against a fixture repo**

Create a throwaway fixture repo (never DigiSmith's own):

```bash
mkdir -p /tmp/digismith-fixture-repo-1
cd /tmp/digismith-fixture-repo-1
git init -q
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only jira-intake's Step 3 (target path + commit-vs-gitignore) from
D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md, operating in
/tmp/digismith-fixture-repo-1 (a fresh, empty git repo — this is a
dogfood test, not a real ticket intake). There is no .gitignore file yet
in this repo, and .digismith/docs/ does not exist yet. Per the skill,
this should ask once via AskUserQuestion. Since this is an unattended
dogfood run and AskUserQuestion isn't available to you, report that you
detected the no-entry/doesn't-exist-yet case and would have asked, rather
than fabricating an answer. Do not write any files.
```

Expected: report confirms detection of the "ask" branch, no files
written, no `.gitignore` created.

Then create a second fixture proving the "entry found" branch:

```bash
mkdir -p /tmp/digismith-fixture-repo-2
cd /tmp/digismith-fixture-repo-2
git init -q
echo ".digismith/" > .gitignore
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only jira-intake's Step 3 (target path + commit-vs-gitignore) from
D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md, operating in
/tmp/digismith-fixture-repo-2 (a fresh git repo whose .gitignore already
contains ".digismith/"). Per the skill, this should proceed directly
without asking, since the entry is already present. Report what you
detected and confirm you would proceed to write gitignored, no question
asked.
```

Expected: report confirms the "entry found, no ask" branch fired.

Clean up:

```bash
rm -rf /tmp/digismith-fixture-repo-1 /tmp/digismith-fixture-repo-2
```

- [ ] **Step 5: If any dogfood run in Step 4 surfaced a real gap, fix it now**

If both branches matched their expected outcome, skip this step. If
either diverged from the skill's Step 3 wording, fix
`skills/jira-intake/SKILL.md` directly, then re-run the specific dogfood
step that failed to confirm the fix.

- [ ] **Step 6: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith
git add skills/jira-intake/SKILL.md skills/using-digismith/SKILL.md
git commit -m "feat(intake): move ticket storage to unified .digismith/docs/ convention, add ask-once commit/gitignore choice"
```

If Step 5 made no changes, this is still a real commit (the path/wording
changes from Steps 1-3 are non-empty regardless).

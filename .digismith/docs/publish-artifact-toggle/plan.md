# Publish Artifact Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `publish_artifact` profile field so `report-implementation`
and `digismith:enforcer` can generate an HTML doc (`report.html`,
`design.html`) without also publishing it externally via the `Artifact`
tool — closing the gap Enforcer (map item Q) shipped and flagged
(`backlog/artifact-publish-opt-out.md`).

**Architecture:** One new boolean field, `publish_artifact`, added to all
four `profiles/*.yml` files, all set to `true` (no behavior change today).
Two skills each independently check it — reusing profile-resolution logic
already present (`report-implementation`) or newly added in this plan
(`enforcer`) — immediately before their existing `Artifact` tool call.
`false` skips only the publish call; the HTML doc itself is still written
and committed exactly as today.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), YAML
profile files. No application code, no test framework — these are
instruction files.

## Global Constraints

- Field name: `publish_artifact` (Jack's explicit naming, confirmed over
  chat — not `artifact` or `show_artifact`, both considered and
  superseded).
- All four profiles default `publish_artifact: true` — per Jack's
  explicit call, this must not change any profile's current behavior.
- Missing `.digismith/profile`, or a profile file that predates this
  field → treat as absent → behave as `publish_artifact: true`. Same
  absent-field convention already used for `reporting: true, or the field
  absent → proceed as today` in `report-implementation`'s own
  Prerequisites section.
- `false` skips the `Artifact` tool call only — never skip writing or
  committing the HTML doc itself. State the outcome plainly: "Not
  published — `publish_artifact: false` in this repo's profile."
- Non-goals (confirmed during brainstorming — do not expand scope):
  auto-cleanup/delete-after-approval (closed as infeasible — no
  per-artifact delete capability exists); changing any profile's current
  behavior; gating report/spec *generation* itself (`reporting: false`
  already does that; this only gates the publish step within a run
  that's already happening).
- No automated test suite, consistent with every DigiSmith skill.
  Verification is dogfooding: dispatch a subagent with the relevant
  section of the skill's own content as its instructions against a
  concrete fixture scenario, then check the resulting file state / report
  text.
- Plan format: this file stays Markdown; the design spec is HTML — see
  `.digismith/docs/publish-artifact-toggle/design.html`.

---

### Task 1: Add `publish_artifact` to All Profiles and MEMORY.md

**Files:**
- Modify: `profiles/digismith.yml`
- Modify: `profiles/emma.yml`
- Modify: `profiles/jazurite.yml`
- Modify: `profiles/personal.yml`
- Modify: `MEMORY.md:109` (map item O's row)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces: the `publish_artifact` field itself, which Tasks 2 and 3 read
  in their dogfood fixtures.

- [ ] **Step 1: Add the field to `profiles/digismith.yml`**

Current file (7 lines):
```yaml
name: digismith
standards: [global]
ticket: false
ephemeral: false
reporting: true
logging: true
```

New file — insert `publish_artifact: true` directly after `reporting:
true`:
```yaml
name: digismith
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
```

- [ ] **Step 2: Add the field to `profiles/emma.yml`**

Current file (10 lines, has a leading comment):
```yaml
# `standards` is hand-maintained: keep it in sync with standards/'s
# top-level folder names — a new folder there is not picked up here
# automatically.
name: emma
standards: [global, shopify, team]
ticket: true
ephemeral: true
reporting: true
logging: true
```

New file:
```yaml
# `standards` is hand-maintained: keep it in sync with standards/'s
# top-level folder names — a new folder there is not picked up here
# automatically.
name: emma
standards: [global, shopify, team]
ticket: true
ephemeral: true
reporting: true
publish_artifact: true
logging: true
```

- [ ] **Step 3: Add the field to `profiles/jazurite.yml`**

Current file (7 lines):
```yaml
name: jazurite
standards: [global]
ticket: false
ephemeral: false
reporting: true
logging: true
```

New file:
```yaml
name: jazurite
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: true
```

- [ ] **Step 4: Add the field to `profiles/personal.yml`**

Current file (7 lines):
```yaml
name: personal
standards: [global]
ticket: false
ephemeral: false
reporting: true
logging: false
```

New file:
```yaml
name: personal
standards: [global]
ticket: false
ephemeral: false
reporting: true
publish_artifact: true
logging: false
```

- [ ] **Step 5: Update `MEMORY.md`'s map-table row for O**

Find the exact line (`grep -n "\*\*O\*\* | Profiling" MEMORY.md`). Current
text:
```
| **O** | Profiling | A per-repo behavior profile (standards subset, ticket/ephemeral/reporting on-off) that existing stages consult independently at their own trigger point — new letter, added directly per Jack's request during this brainstorm |
```

Replace `ticket/ephemeral/reporting` with
`ticket/ephemeral/reporting/publish_artifact`:
```
| **O** | Profiling | A per-repo behavior profile (standards subset, ticket/ephemeral/reporting/publish_artifact on-off) that existing stages consult independently at their own trigger point — new letter, added directly per Jack's request during this brainstorm |
```

- [ ] **Step 6: Verify all five edits**

```bash
grep -c "publish_artifact: true" profiles/digismith.yml profiles/emma.yml profiles/jazurite.yml profiles/personal.yml
grep -n "publish_artifact" MEMORY.md
```

Expected: `1` for each of the four profile files; one match in
`MEMORY.md` (inside the O row).

- [ ] **Step 7: Commit**

```bash
git add profiles/digismith.yml profiles/emma.yml profiles/jazurite.yml profiles/personal.yml MEMORY.md
git commit -m "feat(profiling): add publish_artifact field to all profiles"
```

---

### Task 2: Gate `report-implementation`'s Artifact Publish

**Files:**
- Modify: `skills/report-implementation/SKILL.md`

**Interfaces:**
- Consumes: the `publish_artifact` field from Task 1's profiles.
- Produces: nothing downstream in this plan consumes this task — Task 3
  applies the same idea independently to a different file.

- [ ] **Step 1: Locate the exact text to modify — item 5 of Step 4**

```bash
grep -n "5. \*\*Publish as an artifact" skills/report-implementation/SKILL.md
```

Current text (this exact block, immediately after item 4's two
gitignore-disposition bullets, before `### Step 5: Hand Back`):
```markdown
5. **Publish as an artifact.** Per `MEMORY.md`'s Conventions section
   (Unified Docs Convention entry), the per-feature HTML docs — `design.html`
   and `report.html`, specifically, never `.digismith/history.html` or the
   plain `plan.md`/`ticket.md` working files — get published for
   readability. Call the `Artifact` tool on the just-written
   `report.html`: `title` from `{{FEATURE_TITLE}}`, `description` from the
   plan's own `**Goal:**` line, `favicon` one or two emoji fitting the
   feature's topic. Report the returned URL alongside the report path in
   Step 5's hand-back. This runs regardless of whether Step 4 committed
   the file — publishing to `Artifact` doesn't depend on the repo's
   gitignore choice.
```

- [ ] **Step 2: Replace item 5 with the gated version**

```markdown
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
```

- [ ] **Step 3: Add a note to Prerequisites that the resolved profile carries forward**

Locate the end of the `reporting` gate in Prerequisites:
```bash
grep -n "Neither shipped profile turns reporting off" skills/report-implementation/SKILL.md
```

Current text ends:
```markdown
  - **`reporting: true`, or the field absent** → proceed as today.
    Neither shipped profile turns reporting off, so this is the normal
    path.
```

Add one sentence directly after that bullet (still inside Prerequisites,
before the "This skill runs in the **controller session**" paragraph):
```markdown

The same resolved profile (or its "missing"/"stale" disposition) carries
forward to Step 4 item 5's `publish_artifact` check — read once here, not
re-located or re-read there.
```

- [ ] **Step 4: Add an Error Handling bullet**

Locate the Error Handling section's existing `Artifact` publish-failure
bullet:
```bash
grep -n "Artifact\` publish call fails" skills/report-implementation/SKILL.md
```

Insert a new bullet immediately after it (same section, same list):
```markdown
- **Active profile has `publish_artifact: false`** → `report.html` is
  still written and committed exactly as normal; only the `Artifact`
  publish call (item 5) is skipped. Not the same disposition as
  `reporting: false` — the report itself is never skipped, only its
  publication.
```

- [ ] **Step 5: Update the Quick Reference table's row 4**

Locate it:
```bash
grep -n "^| 4 |" skills/report-implementation/SKILL.md
```

Current text:
```
| 4 | Write to `.digismith/docs/<feature-slug>/report.html`, ask before overwrite; `git check-ignore -q` the path first — exit 1 (not ignored) → `git add` + commit, exit 0 (ignored) → leave it uncommitted and say so; then publish `report.html` via the `Artifact` tool regardless of whether it was committed |
```

Replace the trailing clause:
```
| 4 | Write to `.digismith/docs/<feature-slug>/report.html`, ask before overwrite; `git check-ignore -q` the path first — exit 1 (not ignored) → `git add` + commit, exit 0 (ignored) → leave it uncommitted and say so; then publish `report.html` via the `Artifact` tool regardless of whether it was committed, unless the active profile has `publish_artifact: false` |
```

- [ ] **Step 6: Dogfood — `publish_artifact: false` skips the publish call**

```bash
mkdir -p .digismith/docs/_test-publish-artifact-fixture
cat > .digismith/docs/_test-publish-artifact-fixture/report.html << 'EOF'
<!doctype html><html><head><title>Test Fixture</title></head>
<body><p>Fixture report.html, already written and committed by item 4.</p></body></html>
EOF
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow item 5 of Step 4 in
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-show-artifact\skills\report-implementation\SKILL.md
exactly. The profile already resolved in Prerequisites for this run has
`publish_artifact: false`. report.html already exists at
.digismith/docs/_test-publish-artifact-fixture/report.html (written and
committed by item 4, out of scope for this test). Report exactly what
item 5 does in this case — do not call the Artifact tool for this test,
just report whether you would have called it or not, and what message
you'd state instead.
```

Expected: report says item 5 skips the `Artifact` call entirely and
states "Not published — `publish_artifact: false` in this repo's
profile" (or equivalent), without touching `report.html` itself.

- [ ] **Step 7: Dogfood — `publish_artifact: true` proceeds normally**

Same fixture, new subagent dispatch (Agent tool, general-purpose):

```
Follow item 5 of Step 4 in
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-show-artifact\skills\report-implementation\SKILL.md
exactly. The profile already resolved in Prerequisites for this run has
`publish_artifact: true`. report.html already exists at
.digismith/docs/_test-publish-artifact-fixture/report.html. Report
exactly what item 5 does in this case — do not actually call the Artifact
tool for this test, just report that you would have called it, with what
title/description/favicon you'd use.
```

Expected: report says item 5 proceeds to call `Artifact`, naming a
plausible title (e.g. "Test Fixture", matching the fixture's `<title>`
tag), description, and favicon.

- [ ] **Step 8: Clean up the fixture**

```bash
rm -rf .digismith/docs/_test-publish-artifact-fixture
git status --short
```

Expected: no fixture paths remain.

- [ ] **Step 9: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "feat(report-implementation): gate Artifact publish on publish_artifact"
```

---

### Task 3: Gate `enforcer`'s Artifact Publish

**Files:**
- Modify: `skills/enforcer/SKILL.md`

**Interfaces:**
- Consumes: the `publish_artifact` field from Task 1's profiles.
- Produces: nothing downstream in this plan consumes this task.

Unlike `report-implementation`, `enforcer`'s "Detecting DigiSmith-Tracked
Work" section only checks whether `.digismith/profile` *exists* — it
never reads a specific field's value. This task adds that resolution
logic inline in Step 3, following the same restate-don't-import pattern
`inject-standards`, `using-digismith`, and `report-implementation` each
already use for reading `profiles/<name>.yml`.

- [ ] **Step 1: Locate the exact text to modify — Step 3**

```bash
grep -n "### Step 3: Publish" skills/enforcer/SKILL.md
```

Current text (the entire Step 3 section, up to but not including `###
Step 4`):
```markdown
### Step 3: Publish — HTML Artifact, Convention Amendment

Per `MEMORY.md`'s Conventions section (Unified Docs Convention entry),
the per-feature HTML docs — `design.html` and `report.html`, specifically,
never `.digismith/history.html` or the plain `plan.md`/`ticket.md`
working files — get published for readability. Once Step 2
confirms `.digismith/docs/<slug>/design.html` is correctly placed, call
the `Artifact` tool on it: `title` from the doc's own `<title>` tag,
`description` one sentence summarizing the feature, `favicon` one or two
emoji fitting the feature's topic (pick contextually — never reuse a
generic default across unrelated features). Report the returned URL back
to whoever is running this.
```

- [ ] **Step 2: Replace Step 3 with the gated version**

```markdown
### Step 3: Publish — HTML Artifact, Convention Amendment

Once Step 2 confirms `.digismith/docs/<slug>/design.html` is correctly
placed, check whether this repo's profile allows publishing before
calling `Artifact`.

**Resolve the profile:** if `.digismith/profile` exists (see Detecting
DigiSmith-Tracked Work above — this step only runs when that check
already passed), read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule used throughout this skill:
current working directory has `.claude-plugin/plugin.json` with
`"name": "digismith"` → use it directly; otherwise ask the user for the
path and remember it; never read `profiles/` under a plugin cache path —
a stale, version-locked snapshot. Read `profiles/<name>.yml` there.

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
```

- [ ] **Step 3: Add an Error Handling bullet**

Locate the Error Handling section's existing `Artifact` publish-failure
bullet:
```bash
grep -n "Artifact\` publish call fails" skills/enforcer/SKILL.md
```

Insert a new bullet immediately after it (same section, same list):
```markdown
- **Active profile has `publish_artifact: false`** → `design.html` is
  still written (and committed, per Step 1's gitignore disposition)
  exactly as normal; only the `Artifact` publish call (Step 3) is
  skipped.
```

- [ ] **Step 4: Update the Quick Reference table's row 3**

Locate it:
```bash
grep -n "^| 3 |" skills/enforcer/SKILL.md
```

Current text:
```
| 3 | Publish `design.html` via `Artifact`, report the link |
```

Replace:
```
| 3 | Publish `design.html` via `Artifact` unless the active profile has `publish_artifact: false`; report the link |
```

- [ ] **Step 5: Dogfood — `publish_artifact: false` skips the publish call**

```bash
mkdir -p .digismith/docs/_test-enforcer-publish-fixture
cat > .digismith/docs/_test-enforcer-publish-fixture/design.html << 'EOF'
<!doctype html><html><head><title>Test Fixture Spec</title></head>
<body><p>Fixture design.html, already correctly placed by Step 2.</p></body></html>
EOF
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow Step 3 of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-show-artifact\skills\enforcer\SKILL.md
exactly. Slug is "_test-enforcer-publish-fixture". A .digismith/profile
exists naming a profile whose profiles/<name>.yml has
`publish_artifact: false` (don't worry about locating a real profile file
for this test — treat that as already resolved). design.html already
exists at
.digismith/docs/_test-enforcer-publish-fixture/design.html, correctly
placed. Report exactly what Step 3 does in this case — do not call the
Artifact tool for this test, just report whether you would have called
it or not, and what message you'd state instead.
```

Expected: report says Step 3 skips the `Artifact` call entirely and
states "Not published — `publish_artifact: false` in this repo's
profile" (or equivalent), without touching `design.html` itself.

- [ ] **Step 6: Dogfood — `publish_artifact: true` proceeds normally**

Same fixture, new subagent dispatch (Agent tool, general-purpose):

```
Follow Step 3 of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\worktree-show-artifact\skills\enforcer\SKILL.md
exactly. Slug is "_test-enforcer-publish-fixture". A .digismith/profile
exists naming a profile whose profiles/<name>.yml has
`publish_artifact: true` (treat that as already resolved). design.html
already exists at
.digismith/docs/_test-enforcer-publish-fixture/design.html, correctly
placed. Report exactly what Step 3 does in this case — do not actually
call the Artifact tool for this test, just report that you would have
called it, with what title/description/favicon you'd use.
```

Expected: report says Step 3 proceeds to call `Artifact`, naming a
plausible title (e.g. "Test Fixture Spec", matching the fixture's
`<title>` tag), description, and favicon.

- [ ] **Step 7: Clean up the fixture**

```bash
rm -rf .digismith/docs/_test-enforcer-publish-fixture
git status --short
```

Expected: no fixture paths remain.

- [ ] **Step 8: Commit**

```bash
git add skills/enforcer/SKILL.md
git commit -m "feat(enforcer): gate Artifact publish on publish_artifact"
```

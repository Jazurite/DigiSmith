# Capture Ephemeral URL (M) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `capture-ephemeral-url` — DigiSmith's map item **M** — so
that once a PR is open in an Emma theme repo, DigiSmith waits for the
ephemeral-deploy check, extracts the Shopify Preview Theme and Theme
Editor URLs from the bot's PR comment, and reports them.

**Architecture:** A single skill, `skills/capture-ephemeral-url/SKILL.md`,
five steps: resolve the ticket key from the branch name, identify the PR
via `gh pr view`, poll `gh pr checks` for one specific named check, extract
both URLs from the `github-actions` bot's PR comment with anchored
regexes, then report. No PR creation (that's
`superpowers:finishing-a-development-branch`'s job) and no JIRA write-back
(that's the separate, later map item **I.1**) — this skill's job ends at
reporting the two URLs in the conversation.

**Tech Stack:** Claude Code Skill (`SKILL.md`, YAML frontmatter) whose
Process steps run real `gh` CLI commands and regexes — unlike some earlier
DigiSmith skills, this one's instructions are executable shell snippets,
not just prose. No separate application code, no test framework.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…", third person, states triggering conditions only —
  never a workflow summary (per `superpowers:writing-skills`'s Skill
  Discovery Optimization rules).
- Exact check name to watch for:
  `Continuous Integration / Ephemeral / Comment Ephemeral Information`.
  Match it verbatim — no fuzzy matching.
- `gh pr checks` in the `gh` version installed here (2.93.0) has **no
  `conclusion` field** — its JSON output fields are `name`, `bucket`,
  `state`, `description`, `event`, `link`, `startedAt`, `completedAt`,
  `workflow`. `bucket` is the categorized terminal-state field
  (`pass` / `fail` / `pending` / `skipping` / `cancel`) — use `bucket`,
  not `conclusion`, for the poll decision. Verified via
  `gh pr checks --help` during planning; don't reintroduce a `conclusion`
  field reference.
- Poll interval: ~30–60 seconds. Timeout: **20 minutes** of no terminal
  `bucket` value for the named check.
- URL extraction regexes (anchor on Shopify's own URL structure —
  `preview_theme_id=<digits>` and `/editor` — rather than capturing up to
  the next whitespace, since the bot comment's raw text may have no
  separator between a URL and the following sentence):
  - Preview: `Preview Theme:\**\s*(https://\S+?preview_theme_id=\d+)`
  - Editor: `Customize your Theme:\**\s*(https://\S+?/editor)`
- No automated status transition, ever — permanent product decision, not
  scoped to this build only.
- No JIRA comment write-back in this build — backlogged as **I.1**, a
  separate later feature consuming this skill's output. Do not add JIRA
  calls here.
- No PR creation in this skill — `superpowers:finishing-a-development-branch`
  already owns "push and create PR." Duplicating it would violate
  DigiSmith's philosophy #2.
- Ticket key parsing: branch name must match `^([A-Z]+-\d+)__` to extract
  `<Key>` (same convention `using-digismith` establishes). No match → ask
  directly for the key rather than guessing; the key is used only for the
  final report, not looked up anywhere.
- **Dogfooding constraint discovered during planning:** the `gh` CLI in
  this environment is authenticated as `hieu-huynh-emma`, which cannot
  resolve `Jazurite/DigiSmith` (`gh repo view` fails with "Could not
  resolve to a Repository"). DigiSmith's own repo can't stand in for live
  PR/check testing the way it did for `using-digismith`'s git-only
  mechanics. Creating a real scratch PR against an actual Emma repo purely
  to dogfood a personal tool would be visible to teammates and
  inappropriate. Consequence: Tasks 1–2 dogfood the *decision logic*
  (branch parsing, poll-decision branching, regex extraction) against
  fixture JSON/text, not live `gh pr view`/`gh pr checks`/`gh pr view
  --json comments` calls. The live calls get their first real
  verification the next time this skill actually runs against a real Emma
  PR — treat that as this skill's canary run, and fix forward if it
  surfaces a gap (same bounded-dogfood posture `using-digismith`'s plan
  took for its live `brainstorming` hand-off).
- Cross-skill references inside `SKILL.md` content must be
  plugin-qualified: `superpowers:finishing-a-development-branch`.

---

### Task 1: `capture-ephemeral-url` Skill — Happy Path

**Files:**
- Create: `skills/capture-ephemeral-url/SKILL.md`

**Interfaces:**
- Consumes: the current git branch name (`<Key>__<slug>` convention);
  `gh pr view --json number`; `gh pr checks --json name,bucket`; `gh pr
  view --json comments`.
- Produces: a plain-language report of the resolved ticket key (if any),
  the Preview Theme URL, and the Theme Editor URL.

This task writes the full skill and verifies the happy-path decision
logic via fixtures: ticket-key parsing, the poll-to-success branch, and
URL extraction from a real example comment. Task 2 covers the remaining
edge cases (no-match branch, timeout, failure, missing/malformed
comment).

- [ ] **Step 1: Write `skills/capture-ephemeral-url/SKILL.md`**

```markdown
---
name: capture-ephemeral-url
description: Use when a pull request was just created for an Emma Shopify theme repo and its ephemeral-deploy Preview Theme and Theme Editor URLs need to be captured — right after superpowers:finishing-a-development-branch's "push and create PR" option, or when explicitly asked to capture the ephemeral URLs for a given PR.
---

# Capture Ephemeral URL

## Overview

DigiSmith's map item **M**. Waits for Emma's ephemeral-deploy GitHub
Actions check to finish on an open PR, then extracts the Shopify Preview
Theme URL and Theme Editor URL from the `github-actions` bot's PR comment
and reports them. Does not create the PR (that's
`superpowers:finishing-a-development-branch`'s job) and does not write to
JIRA (that's a separate, later map item, **I.1**) — this skill's job ends
at reporting the two URLs.

## When to Use

Right after a PR is pushed and created for an Emma theme repo — typically
immediately following `superpowers:finishing-a-development-branch`'s
"push and create PR" option — or whenever explicitly asked to capture the
ephemeral URLs for a given PR.

## Prerequisites

`gh` CLI installed and authenticated against the account that has access
to the PR's repo. Missing or unauthenticated → stop and say so plainly;
don't fabricate URLs.

## Process

### Step 1: Resolve the Ticket Key

Parse `<Key>` from the current branch name, matching the
`<Key>__<slug>` convention (e.g. `EMKT-9001__fix-cart-drawer-padding-mobile`
→ `EMKT-9001` — pattern `^([A-Z]+-\d+)__`). If the branch name doesn't
match, ask directly for the ticket key instead of guessing — it's used
only in the final report, not looked up anywhere.

### Step 2: Identify the PR

```bash
gh pr view --json number -q .number
```

against the current branch. If no PR is found, stop and report that
plainly — don't guess a PR number or wait on a check that may not exist.

### Step 3: Poll the Ephemeral-Deploy Check

Poll for the exact check named
`Continuous Integration / Ephemeral / Comment Ephemeral Information`:

```bash
gh pr checks <PR> --json name,bucket \
  --jq '.[] | select(.name=="Continuous Integration / Ephemeral / Comment Ephemeral Information") | .bucket'
```

Poll every ~30–60 seconds, for up to **20 minutes**. Use whatever
background-polling primitive the current session has (e.g. an until-loop
run in the background); a plain sleep-and-recheck loop works too if
nothing more specific is available.

Branch on the returned `bucket` value:
- `pass` → continue to Step 4.
- `fail` or `cancel` → stop; report the failure/cancellation. Don't
  attempt extraction — there's nothing to extract.
- `skipping` → stop; report that the check was skipped.
- `pending`, or no output yet (check hasn't appeared in the list) → keep
  polling.
- 20 minutes elapse with no terminal `bucket` value → stop; report the
  timeout plainly. Don't hang indefinitely.

### Step 4: Extract the URLs

```bash
gh pr view <PR> --json comments \
  --jq '.comments[] | select(.author.login=="github-actions") | .body'
```

Take the `github-actions` bot's "Ephemeral Theme Deployed Successfully"
comment (the most recent one, if more than one matches) and extract both
URLs with:

```
Preview Theme:\**\s*(https://\S+?preview_theme_id=\d+)
Customize your Theme:\**\s*(https://\S+?/editor)
```

These anchor on Shopify's own URL structure rather than capturing up to
the next whitespace, so they work even if the comment's raw text has no
space or line break between a URL and the sentence that follows it.

If the check succeeded but no matching comment is found yet, wait up to
an additional 60 seconds and check once more (a brief posting lag is
expected) before giving up.

If a comment is found but **neither** regex matches, don't fail silently
— report the raw comment body so the format drift is visible.

### Step 5: Report

Tell the user the resolved ticket key (if any), the Preview Theme URL,
and the Theme Editor URL. Nothing is written to a file or to JIRA.

## Error Handling

- **`gh` missing or unauthenticated** → stop, say so plainly.
- **Branch doesn't match `<Key>__<slug>`** → ask directly for the ticket
  key.
- **No PR found for the current branch** → stop, report plainly.
- **Check's `bucket` reaches `fail` or `cancel`** → stop, report it, skip
  extraction.
- **Check's `bucket` is `skipping`** → stop, report it, skip extraction.
- **20-minute timeout with no terminal `bucket` value** → stop, report
  the timeout.
- **Check passed but comment not found after the retry** → report "check
  passed but comment not found."
- **Comment found but neither URL regex matches** → report the raw
  comment body.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Resolve `<Key>` from branch name; ask if it doesn't match |
| 2 | `gh pr view --json number` for the current branch; stop if none found |
| 3 | Poll `gh pr checks` for the named check's `bucket`, ~30–60s interval, 20-min timeout |
| 4 | Fetch PR comments, extract both URLs via the anchored regexes; fall back to raw body on drift |
| 5 | Report both URLs (and the ticket key, if resolved) — no file write, no JIRA |
```

- [ ] **Step 2: Dogfood ticket-key resolution (real, in this repo)**

```bash
git branch --show-current
git checkout -b EMKT-9001__test-capture-ephemeral-url
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 1 ("Resolve the Ticket Key") of the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md.
The current branch is EMKT-9001__test-capture-ephemeral-url. Report the
ticket key you resolved.
```

Expected: reports `EMKT-9001`.

Clean up:

```bash
git checkout main
git branch -D EMKT-9001__test-capture-ephemeral-url
```

- [ ] **Step 3: Dogfood URL extraction against the real example comment**

Dispatch a subagent (Agent tool, general-purpose) with this prompt
(the comment body is the literal example from the real Emma bot,
deliberately including its run-together spacing to stress-test the
anchored regexes):

```
Follow only Step 4 ("Extract the URLs") of the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md,
applying its two regexes to this comment body (do not run any gh
commands — this is a text-parsing test only):

🎉 Ephemeral Theme Deployed Successfully! The ephemeral theme 'PR-611 | EMKT-752: Product Specification Revamp' (182235660589) has been created and is ready for preview.🔗 Preview Theme: https://emma-sleep-korea.myshopify.com?preview_theme_id=182235660589View your theme on the storefront✏️ Customize your Theme: https://emma-sleep-korea.myshopify.com/admin/themes/182235660589/editorOnly affects the ephemeral theme💡 This ephemeral theme will be automatically deleted when the PR is closed.

Report the two extracted URLs exactly.
```

Expected: reports exactly
`https://emma-sleep-korea.myshopify.com?preview_theme_id=182235660589` and
`https://emma-sleep-korea.myshopify.com/admin/themes/182235660589/editor`
— with no trailing "View your theme..." or "Only affects..." text
attached.

- [ ] **Step 4: Dogfood the poll-to-success decision logic against fixture JSON**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 3 ("Poll the Ephemeral-Deploy Check") of the
instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md,
reasoning through this simulated sequence of `gh pr checks --json
name,bucket` outputs as if one were returned per polling tick (do not run
any gh commands — this is a decision-logic test only). For each tick,
state what action the skill's instructions say to take (keep polling /
proceed to Step 4 / stop and report):

Tick 1:
[{"name":"Continuous Integration / Lint","bucket":"pass"},{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"pending"}]

Tick 2:
[{"name":"Continuous Integration / Lint","bucket":"pass"},{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"pending"}]

Tick 3:
[{"name":"Continuous Integration / Lint","bucket":"pass"},{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"pass"}]

Report your per-tick decisions and the final action.
```

Expected: "keep polling" for Ticks 1–2, "proceed to Step 4 (extract)" for
Tick 3 — correctly filtering on the named check, not the unrelated
`Lint` check.

- [ ] **Step 5: Commit**

```bash
git add skills/capture-ephemeral-url/SKILL.md
git commit -m "feat(qa): add capture-ephemeral-url skill (M), happy path"
```

---

### Task 2: `capture-ephemeral-url` Edge Cases

**Files:**
- Modify: `skills/capture-ephemeral-url/SKILL.md` (only if a dogfood run
  below surfaces a real gap — no changes are expected if Task 1's content
  is correct)

**Interfaces:**
- Consumes: `skills/capture-ephemeral-url/SKILL.md` from Task 1, unchanged
  unless a gap is found.
- Produces: nothing new downstream — this task verifies the remaining
  spec-required scenarios not covered in Task 1: no-match branch, check
  failure, timeout, and missing/malformed comment.

- [ ] **Step 1: Dogfood the no-match-branch fallback**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 1 ("Resolve the Ticket Key") of the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md.
The current branch is named "main" — it does not match the
<Key>__<slug> pattern. Per the skill, this should ask directly for the
ticket key rather than guessing. Since this is an unattended dogfood run
and AskUserQuestion isn't available to you, simply report that you
detected the non-matching branch and would have asked, rather than
fabricating a key. Do not guess or invent a ticket key.
```

Expected: report confirms detection of the non-matching branch and that
it would ask rather than fabricate a key.

- [ ] **Step 2: Dogfood the check-failure path**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 3 ("Poll the Ephemeral-Deploy Check") of the
instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md,
reasoning through this single simulated `gh pr checks --json name,bucket`
output (do not run any gh commands):

[{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"fail"}]

Report what action the skill's instructions say to take.
```

Expected: reports "stop, report the failure, skip extraction" — not
"keep polling" and not "proceed to Step 4."

- [ ] **Step 3: Dogfood the timeout path**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 3 ("Poll the Ephemeral-Deploy Check") of the
instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md,
except for this test only, treat the timeout as 3 polling ticks instead
of 20 minutes. Reason through this simulated sequence of `gh pr checks
--json name,bucket` outputs, one per tick (do not run any gh commands):

Tick 1: [{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"pending"}]
Tick 2: [{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"pending"}]
Tick 3: [{"name":"Continuous Integration / Ephemeral / Comment Ephemeral Information","bucket":"pending"}]

The named check never reaches a terminal bucket within the 3-tick test
timeout. Report the final action per the skill's timeout handling.
```

Expected: reports a clean timeout — stop, report the timeout plainly, no
hang, no fabricated URLs.

- [ ] **Step 4: Dogfood the missing-comment and malformed-comment paths**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow only Step 4 ("Extract the URLs") of the instructions in
D:\Workspace\Jazurite\DigiSmith\skills\capture-ephemeral-url\SKILL.md for
these two scenarios (do not run any gh commands — text-only test):

Scenario A: the check passed, but `gh pr view --json comments` returns no
comment authored by "github-actions" at all, even after the skill's
one retry. What does the skill say to report?

Scenario B: the check passed, and a github-actions comment exists, but
its body is:

"Ephemeral deploy finished. See the Shopify admin for details."

— it contains neither a "Preview Theme:" nor a "Customize your Theme:"
line. What does the skill say to report?

Report both answers.
```

Expected: Scenario A → "check passed but comment not found." Scenario B
→ the raw comment body is reported (format drift), not a fabricated URL
and not a silent failure.

- [ ] **Step 5: If any dogfood run in Steps 1–4 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. If any
subagent's behavior diverged from the skill's Error Handling section,
that's a bug in `skills/capture-ephemeral-url/SKILL.md`'s wording — fix
it directly, then re-run the specific dogfood step that failed to confirm
the fix.

- [ ] **Step 6: Commit**

```bash
git add skills/capture-ephemeral-url/SKILL.md
git commit -m "test(qa): verify capture-ephemeral-url edge cases (no-match branch, failure, timeout, missing/malformed comment)"
```

If Step 5 made no changes, this commit will be empty — in that case skip
committing and instead note in your final report that all four edge
cases passed on the first pass with no skill changes needed.

---

### Task 3: Update `docs/history.html` for Map Item M

**Files:**
- Modify: `docs/history.html`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Tasks
  1–2's completed work and the M/I.1 split decided during brainstorming.
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Add map item M and update I's row**

Open `docs/history.html` and, matching its existing structure and visual
style exactly:

- In the map table (`#map`), add a new row for **M** immediately after
  **L**:

```html
<tr><td><strong>M</strong></td><td>Ephemeral deploy capture</td>
  <td>Poll Emma CI/CD's ephemeral-deploy check on an open PR and extract the Shopify Preview + Theme Editor URLs from the bot's PR comment, reported in-session</td>
  <td><span class="status done">Done</span></td></tr>
```

- Update **I**'s row `<td>` content (still `<span class="status
  todo">Not started</span>` — I.1 itself isn't built) to:

```html
<td><strong>I.1</strong> JIRA comment write-back for a captured ephemeral URL (consumes <strong>M</strong>'s output) — no status transition, that stays manual by design · <strong>I.2</strong> end-to-end testing · <strong>I.3</strong> visual regression vs Figma</td>
```

- Add a new descriptive paragraph after the existing E paragraph (matching
  the `<p style="font-size:.88rem; color:var(--muted);">` pattern used for
  A/E):

```html
<p style="font-size:.88rem; color:var(--muted);">
  <strong>M — Ephemeral deploy capture:</strong> <code>capture-ephemeral-url</code> skill —
  <a href="superpowers/specs/2026-08-08-capture-ephemeral-url-design.html">design spec</a> ·
  <a href="superpowers/plans/2026-08-08-capture-ephemeral-url-plan.md">implementation plan</a>
</p>
```

- [ ] **Step 2: Update Build Order Tier 5 and the Progress Overview stats**

In the Build Order table (`#tiers`), update Tier 5's Items cell to:

```html
<td><strong>D</strong> delivery · <strong>F</strong> design review · <strong>M</strong> ephemeral deploy capture <span class="status done">Done</span> · <strong>I.1/I.2/I.3</strong> QA handoff</td>
```

and its Status cell to:

```html
<td><span class="status next">In progress (1/4 — M shipped, pulled forward out of tier order)</span></td>
```

In the Progress Overview (`#overview`) stats, update the shipped-count
tile from `2 / 12` to `3 / 13` (M adds a 13th map item and is the 3rd
done, alongside A and G).

- [ ] **Step 3: Add timeline entries**

Append to the `.timeline` div, after the existing final entry:

```html
<div class="event">
  <div class="date">2026-08-08</div>
  <h4>M split out from I.1, brainstormed, and specced</h4>
  <p>Jack asked to build I.1's ephemeral-URL capture as a normal
  development task, no ticket. During brainstorming, the JIRA piece was
  scoped out entirely — no automated status transition (permanent), no
  JIRA comment write-back (backlogged). What remained had no JIRA
  dependency, so it was split into its own map item, <strong>M</strong>,
  rather than staying a slice of I.1. I.1 now names the separate, later
  JIRA write-back feature that will consume M's output. Design spec
  approved; implementation plan written (3 tasks).</p>
</div>

<div class="event">
  <div class="date">2026-08-08</div>
  <h4>M built — 3 tasks, subagent-driven-development</h4>
  <p><code>skills/capture-ephemeral-url/SKILL.md</code> delivered: Task 1
  built the skill and dogfooded the happy-path decision logic against
  fixtures (ticket-key parsing, poll-to-success branching, URL extraction
  from a real example comment); Task 2 dogfooded four edge cases
  (no-match branch, check failure, timeout, missing/malformed comment).
  Live <code>gh pr view</code>/<code>gh pr checks</code> calls couldn't be
  dogfooded against a real PR — the authenticated <code>gh</code> account
  can't reach DigiSmith's own repo, and creating a scratch PR against a
  real Emma repo would be visible to teammates — so those get their first
  live verification the next time this skill runs for real. Task 3 is
  this history.html update. Map item <strong>M</strong> done.</p>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add docs/history.html
git commit -m "docs: update history — capture-ephemeral-url (M) shipped"
```

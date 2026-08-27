# Depot (V) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `digismith:depot` — DigiSmith's map item **V** — a small
utility skill that provisions and refreshes a local, sparse clone of
DigiSmith's shared `packages/` code at a fixed, machine-wide location
(`~/.digismith/repo`), and wire it into `digismith:bootstrap`/`digismith:adopt`
so every ticket's work starts with that clone guaranteed present.

**Architecture:** One new skill (`skills/depot/SKILL.md`) with two
operations — `ensure` (idempotent clone-if-missing, invoked automatically)
and `refresh` (explicit fetch-and-hard-reset, invoked directly by the
user). The clone is scoped to `packages/` only via git sparse-checkout
(cone mode) combined with a blobless partial clone, so nothing outside
that directory — `backlog/`, `standards/`, `MEMORY.md`, every skill's own
source — is downloaded or materialized on a consumer machine.
`digismith:bootstrap` gets a new Step 0.5 that calls `ensure` right after
Step 0 resolves the profile; `digismith:adopt` picks this up by reference
the same way it already reuses Step 0/2.6, since `~/.digismith/repo` is
machine-wide (unlike `.digismith/profile`, it needs no per-worktree copy
step).

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), plain
git commands (`clone --filter=blob:none --sparse`, `sparse-checkout`,
`fetch`, `reset --hard`). No application code, no test framework —
verification is dogfooding via reasoning through each operation's
command sequence and failure modes, consistent with every prior
DigiSmith skill (`jira-progress-write-back`, `capture-ephemeral-url`,
etc.) having no code-level test suite either.

**Spec:** `.digismith/docs/depot/design.html`
(published: https://claude.ai/code/artifact/ebb0531b-dfc6-4c9e-baae-b879b99a7b3d)

## Global Constraints

- **Fixed location:** `~/.digismith/repo`. Same SSH remote as Jack's own
  dev checkout: `git@github.com:Jazurite/DigiSmith.git`.
- **Sparse scope:** `packages/` only, set once via
  `git sparse-checkout set packages` at clone time — persists across
  every later `reset --hard`, never needs reapplying.
- **Blobless partial clone** (`--filter=blob:none`): content outside the
  sparse scope is never downloaded, not just hidden from the working
  tree.
- **Exactly two operations, nothing else:** `ensure` (idempotent,
  clone-if-missing, no-op if already present) and `refresh` (explicit
  fetch + hard reset to `origin/main`).
- **No auto-refresh on every `ensure` call.** Matches the precedent this
  design is drawn from: clone once, refresh only on explicit request.
- **Credentials are entirely out of scope.** This skill never creates,
  reads, or references `~/.digismith/.env` — that belongs to
  Jira-specific skills only (a separate, already-specced migration).
- **`ensure` failing inside `bootstrap`/`adopt` fails the whole
  ticket-start flow** — report the error, do not proceed further.
- **`digismith:adopt` reuses `digismith:bootstrap`'s Step 0.5 by
  reference**, the same pattern it already uses for Step 0 ("Run
  `digismith:bootstrap`'s Step 0 exactly") — no second implementation.
- **Cross-skill references inside `SKILL.md` content must be
  plugin-qualified:** `digismith:bootstrap`, `digismith:adopt`.
- **Roadmap update:** `MEMORY.md`'s map table and `.digismith/history.html`
  both need a new **V** row — a new letter added directly during this
  brainstorm, pulled forward and built outside any build-order tier, the
  same treatment **O** and **P** already got. See Task 3.

---

### Task 1: `depot` Skill — Write, Read Back, Dogfood

**Files:**
- Create: `skills/depot/SKILL.md`

**Interfaces:**
- Consumes: nothing from an earlier task (first task in this plan).
- Produces: the `digismith:depot` skill, invoked by name
  (`ensure`/`refresh`) from Task 2's `bootstrap`/`adopt` changes, and
  directly by the user at any time.

- [ ] **Step 1: Write `skills/depot/SKILL.md`**

```markdown
---
name: depot
description: Provisions and refreshes a local, sparse clone of DigiSmith's shared packages/ code at a fixed machine-wide location (~/.digismith/repo). Invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work (ensure); invoke directly any time to pull the latest changes (refresh) — e.g. "update my DigiSmith clone".
---

# Depot

## Overview

DigiSmith's map item **V**. A small utility skill maintaining a local,
minimal, refreshable clone of DigiSmith's shared `packages/` code at
`~/.digismith/repo` — a fixed, machine-wide location, independent of any
consumer repo and independent of Jack's own DigiSmith development
checkout. Any consumer repo can run a shared package (e.g. a future
`jira-client`) through this clone without needing to know or maintain a
path to one.

This skill has no awareness of what's inside `packages/` — it clones the
whole directory as one sparse scope. A consumer package names its own
path underneath (e.g. `packages/jira-client/`); adding a new package
later needs no change here.

## Which Operation

- **Invoked by `digismith:bootstrap`/`digismith:adopt`** (by name, as
  part of their own process) → always `ensure`. Neither skill ever asks
  for `refresh`.
- **Invoked directly by the user, not through those two skills** →
  always `refresh`. `ensure` is not something a person would ever ask
  for by hand — it already runs automatically at the start of every
  ticket's work. A direct request ("update my DigiSmith clone", "pull
  the latest depot", "refresh depot") only ever means bringing an
  existing clone up to date.

## Process

### Operation: `ensure` — idempotent, clone-if-missing

```bash
if [ ! -d ~/.digismith/repo/.git ]; then
  mkdir -p ~/.digismith
  git clone --filter=blob:none --no-checkout --sparse \
    git@github.com:Jazurite/DigiSmith.git ~/.digismith/repo
  git -C ~/.digismith/repo sparse-checkout set packages
  git -C ~/.digismith/repo checkout main
fi
```

`~/.digismith/repo/.git` already present → this is a no-op. Nothing
below the existence check runs; no fetch, no reset, no network call at
all.

### Operation: `refresh` — explicit, on demand

If `~/.digismith/repo` doesn't exist yet when `refresh` is invoked
directly, run `ensure`'s sequence above instead of failing — refreshing
something that was never provisioned isn't a real error case, just an
ordering one.

Otherwise:

```bash
git -C ~/.digismith/repo fetch --all --prune --tags -q
git -C ~/.digismith/repo checkout main
git -C ~/.digismith/repo reset --hard origin/main
```

The sparse-checkout pattern set during `ensure`'s initial clone persists
across this `reset --hard` — never reapply it.

## Error Handling

| Case | Disposition |
|---|---|
| No SSH access / key not authorized for `git@github.com:Jazurite/DigiSmith.git` | Report the actual git error plainly. No retry, no fallback to an unauthenticated clone attempt. |
| Network unreachable / GitHub unreachable | Report the actual git error plainly. |
| `ensure` fails when called from `digismith:bootstrap`/`digismith:adopt` | Fail the whole ticket-start flow — report the error, do not proceed to the next step of whichever skill called it. |
| `refresh` invoked directly and it fails | Report the error; leave the existing clone exactly as it was — a failed `fetch` never reaches `reset --hard`, so nothing is left half-updated. |

## Out of Scope

- **Credential management** — entirely outside this skill.
  `~/.digismith/.env` may live in the same parent folder, but this skill
  never creates, reads, or references it. That belongs only to
  Jira-specific skills.
- **Auto-refresh on every `ensure` call** — deliberately not done, to
  avoid a network round-trip at the start of every single ticket.
- **Per-package logic** — this skill has no knowledge of what's inside
  `packages/`, and never will; a consumer's own path underneath is its
  own concern.

## Quick Reference

| Operation | When | Effect |
|---|---|---|
| `ensure` | Called by `bootstrap`/`adopt` | Clone if missing, else no-op |
| `refresh` | User asks directly, any time | Fetch + hard reset to `origin/main` (runs `ensure` first if the clone doesn't exist yet) |
```

- [ ] **Step 2: Dogfood — `ensure` on a machine with no existing clone (reasoning only)**

Walk through the `ensure` command block above against a machine where
`~/.digismith/repo` does not exist at all:

1. `[ ! -d ~/.digismith/repo/.git ]` — true (nothing exists yet) →
   proceed into the `if` body.
2. `mkdir -p ~/.digismith` — creates the parent directory; `-p` makes
   this safe even if it already exists (e.g. `~/.digismith/.env` was
   already written by a Jira-specific skill first).
3. `git clone --filter=blob:none --no-checkout --sparse ...` — clones
   the repo's object data without downloading blobs outside the sparse
   scope and without checking out any files yet (`--no-checkout`,
   deliberate — checking out before the sparse pattern is set would
   briefly materialize the entire working tree).
4. `git -C ~/.digismith/repo sparse-checkout set packages` — sets the
   cone-mode sparse pattern to just `packages/`.
5. `git -C ~/.digismith/repo checkout main` — now checks out `main`,
   materializing only `packages/` on disk per the pattern just set.

Confirm this ordering is load-bearing: swapping steps 3-5 so that
`checkout` runs before `sparse-checkout set` would briefly write the
full tree to disk before narrowing it — defeats the whole point of the
blobless partial clone. The plan's command block above already has the
correct order; this step exists to confirm that ordering is intentional,
not incidental, before moving on.

- [ ] **Step 3: Dogfood — `ensure` when the clone already exists (reasoning only)**

Same command block, `~/.digismith/repo/.git` already present:

`[ ! -d ~/.digismith/repo/.git ]` — false → the `if` body never runs.
No `mkdir`, no `clone`, no `sparse-checkout`, no `checkout`, no network
call of any kind. Confirms `ensure` is genuinely idempotent and cheap to
call on every single ticket start, as `bootstrap`'s new Step 0.5 (Task 2)
will do.

- [ ] **Step 4: Dogfood — `refresh` against an existing clone (reasoning only)**

1. `~/.digismith/repo` exists → skip the "run `ensure` first" fallback.
2. `git fetch --all --prune --tags -q` — updates remote-tracking refs
   quietly; `--prune` drops any refs deleted upstream.
3. `git checkout main` — ensures the clone is on `main` even if a prior
   session somehow left it detached or on another branch.
4. `git reset --hard origin/main` — hard-resets the working tree
   (`packages/` only, per the persisted sparse pattern) to match the
   freshly fetched `origin/main` exactly, discarding any local drift.

Confirm the sparse-checkout scope survives this sequence: `reset --hard`
operates within whatever sparse pattern is already configured on the
repo — it doesn't reset or need to reapply that pattern, since the
pattern is checkout-level configuration, not working-tree state that a
reset would touch.

- [ ] **Step 5: Dogfood — git failure paths (reasoning only)**

- **No SSH access**: step 3 of `ensure`'s clone (or `refresh`'s fetch)
  fails with a non-zero exit and a git-authored error on stderr (e.g.
  `Permission denied (publickey)`). Per the Error Handling table, this
  must be reported plainly, verbatim — not swallowed, not retried with a
  different auth method.
- **Network unreachable**: same disposition — git's own connection-error
  message surfaces as-is.
- **`ensure` called from `bootstrap` Step 0.5, and it fails**: confirm
  the calling skill (Task 2) stops entirely rather than falling through
  to Step 1 — this is `bootstrap`/`adopt`'s responsibility to enforce,
  not something `depot`'s own file can guarantee on its own, so this
  dogfood step is really a check that Task 2's wording makes that
  disposition unambiguous when it's written.

- [ ] **Step 6: If any dogfood run in Steps 2-5 surfaced a real gap, fix it now**

Re-read `skills/depot/SKILL.md` against each scenario walked through
above. If every scenario's actual command sequence and stated
disposition already matches what Steps 2-5 concluded, there is nothing
to fix — record that plainly rather than inventing a change. If a gap
surfaced, edit the file now and re-walk the affected scenario before
moving on.

- [ ] **Step 7: Commit**

```bash
git add skills/depot/SKILL.md
git commit -m "feat(depot): add digismith:depot skill (map item V)"
```

---

### Task 2: Wire `depot` into `bootstrap` and `adopt`

**Files:**
- Modify: `skills/bootstrap/SKILL.md` (new Step 0.5, between the
  existing Step 0 and Step 1; Quick Reference table)
- Modify: `skills/adopt/SKILL.md` (Step 2 addition; Quick Reference
  table)

**Interfaces:**
- Consumes: `digismith:depot`'s `ensure` operation (Task 1).
- Produces: every future `digismith:init` → `bootstrap`/`adopt` run now
  guarantees `~/.digismith/repo` exists before ticket work proceeds.
  Nothing later in this plan depends on this task's output beyond the
  roadmap docs in Task 3.

- [ ] **Step 1: Insert Step 0.5 into `skills/bootstrap/SKILL.md`**

Insert a new section immediately after Step 0 ends and before
`### Step 1: Get a Real Ticket` begins:

```markdown
### Step 0.5: Ensure DigiSmith Runtime Clone

**Only runs when Step 0 falls through to actual ticket work.** If the
user's request was a standalone profile switch and Step 0 already
stopped there (per its own "Switching profiles mid-session" sub-flow),
this step does not run — there is no ticket work to prepare for. Skip
straight past it in that case, same as if it didn't exist.

Otherwise, invoke `digismith:depot`'s `ensure` operation. This is
unrelated to `.digismith/profile` (Step 0) or to the repo currently
being worked in — `depot` always targets the same fixed, machine-wide
`~/.digismith/repo`, regardless of which consumer repo `bootstrap` is
running in.

**Succeeds** (clone already present, or freshly provisioned) → continue
to Step 1.

**Fails** (see `digismith:depot`'s own Error Handling — no SSH access,
network unreachable, or any other git failure) → stop here. Report the
underlying error plainly. Do not create a branch or worktree, do not
proceed to Step 1. A ticket started without this clone would later hit
the same failure inside `jira-progress-write-back` or any other
package-dependent skill, just later and less clearly — surfacing it now,
at ticket-start, is strictly better.

Unlike `.digismith/profile` (Step 2.6) and `.digismith/telemetry-marker`
(Step 2.7), `~/.digismith/repo` needs **no per-worktree copy step**. It
lives outside every repo and worktree entirely, shared machine-wide — once
`ensure` has run successfully anywhere on this machine, every later
worktree (for this ticket or any other) already sees it at the same
fixed path.
```

- [ ] **Step 2: Update `skills/bootstrap/SKILL.md`'s Quick Reference table**

Find the table row for Step 0 (`| 0 | Resolve .digismith/profile ... |`)
and insert a new row immediately after it, before the existing Step 1
row:

```markdown
| 0.5 | Skipped if Step 0 stopped at a standalone profile switch. Otherwise, invoke `digismith:depot`'s `ensure` operation — clone `~/.digismith/repo` if missing, no-op otherwise. Fails the whole flow (stop, report, no branch/worktree) if `ensure` fails |
```

- [ ] **Step 3: Update `skills/adopt/SKILL.md`'s Step 2**

Find `### Step 2: Resolve Profile`, which currently reads:

```
Run `digismith:bootstrap`'s Step 0 exactly, treating the repo currently
being worked in the same way `digismith:bootstrap` would. This resolves
(or, on first use in this repo, picks via the same `AskUserQuestion` flow)
the active profile and ensures `.digismith/profile` exists with the chosen
```

Change the section title and add a second sentence so it also runs
Step 0.5:

```markdown
### Step 2: Resolve Profile and Ensure Runtime Clone

Run `digismith:bootstrap`'s Step 0 exactly, treating the repo currently
being worked in the same way `digismith:bootstrap` would. This resolves
(or, on first use in this repo, picks via the same `AskUserQuestion` flow)
the active profile and ensures `.digismith/profile` exists with the chosen
```

(the rest of the existing paragraph is unchanged — only the heading
gains "and Ensure Runtime Clone"). Immediately after that paragraph
(and before whatever currently follows it as the next paragraph or
step), insert:

```markdown
Then run `digismith:bootstrap`'s Step 0.5 exactly — invoke
`digismith:depot`'s `ensure` operation. Same failure disposition: if it
fails, stop here entirely, report the error, do not proceed to Step 3.
```

- [ ] **Step 4: Update `skills/adopt/SKILL.md`'s Quick Reference table**

Find the table row for Step 2
(`| 2 | Resolve profile — run digismith:bootstrap Step 0 exactly |`) and
change it to:

```markdown
| 2 | Resolve profile and ensure the DigiSmith runtime clone — run `digismith:bootstrap` Step 0, then Step 0.5, exactly |
```

- [ ] **Step 5: Dogfood — `digismith:init` fresh-start flow with Step 0.5 (reasoning only)**

Walk `digismith:init` → `digismith:bootstrap` for a brand-new ticket on a
machine where `~/.digismith/repo` doesn't exist yet:

1. Step 0 resolves/writes `.digismith/profile` as today, unchanged.
2. Step 0.5 (new) invokes `depot`'s `ensure` — per Task 1's Step 2
   dogfood, this clones `~/.digismith/repo` for the first time.
3. Control returns to Step 1 ("Get a Real Ticket") exactly as before —
   confirm nothing in Step 1 onward references or depends on anything
   Step 0.5 produced beyond "the clone now exists somewhere," since no
   later `bootstrap` step actually reads from `~/.digismith/repo` itself
   (that's a future consumer skill's job, not this plan's).

Then walk the failure path: Step 0.5's `ensure` fails (e.g. no SSH key
configured on this machine) → per Step 1's new wording, `bootstrap` stops
immediately, reports the error, never reaches Step 1, never creates a
branch or worktree. Confirm this matches Task 1's Error Handling table
exactly — `bootstrap` doesn't invent its own different disposition.

- [ ] **Step 6: Dogfood — `digismith:adopt` mid-stream flow with the updated Step 2 (reasoning only)**

Walk `digismith:adopt` for a mid-stream ticket (spec/plan already exist
outside DigiSmith):

1. Step 1 confirms ticket key, plan path, spec path — unchanged.
2. Step 2 (renamed) now runs `bootstrap`'s Step 0 *and* Step 0.5 — same
   clone-provisioning effect as the fresh-start path, reached through a
   different entry skill. Confirm this is genuinely "by reference," not
   a second copy of the git commands: `adopt`'s own file only ever says
   "run Step 0.5 exactly," it does not restate `depot`'s bash.
3. Steps 3 onward proceed unchanged — same reasoning as Step 5 above,
   nothing later in `adopt` depends on Step 0.5's output beyond the
   clone existing.

- [ ] **Step 7: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md
git commit -m "feat(depot): wire ensure into bootstrap Step 0.5 and adopt Step 2"
```

---

### Task 3: Update the Roadmap — `MEMORY.md` and `.digismith/history.html`

**Files:**
- Modify: `MEMORY.md`
- Modify: `.digismith/history.html`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 beyond the fact that `depot` now
  exists and is wired in — this task only updates documentation.
- Produces: nothing consumed elsewhere in this plan; this is the closing
  task.

- [ ] **Step 1: Add `V` to `MEMORY.md`'s map table**

In the `## The map` table, insert a new row after the `S` row
(`| **S** | Figma visual regression | ... |`):

```markdown
| **V** | Runtime clone provisioning | Maintains a sparse, refreshable local clone of DigiSmith's shared `packages/` code at a fixed, machine-wide location (`~/.digismith/repo`), so a consumer repo can run a shared package (starting with a forthcoming `jira-client`) without a local DigiSmith development checkout. `bootstrap`/`adopt` invoke it automatically at ticket start; also callable directly to refresh. New letter, added directly during the same brainstorm that surfaced the Jira REST migration — pulled forward and built outside any tier, same as **O** and **P**. Shipped: `digismith:depot` skill |
```

(`T` and `U` stay tentative/uncommitted in this table, per their own
backlog files — this task does not touch them. `V` is committed here
because, unlike `T`/`U`, it has gone through a real brainstorm and spec,
matching the bar `O`/`P` were held to when they were added directly.)

- [ ] **Step 2: Add a `V` line to `MEMORY.md`'s "Shared primitive" note, if applicable**

Check the sentence below the map table beginning "Shared primitive
several stages need: **JIRA write-back**". `depot` is not JIRA-specific
and does not belong in that sentence — confirm it reads correctly
unchanged, do not add `depot` to it. (This step exists to make sure this
is a deliberate check, not an oversight — no edit is expected here.)

- [ ] **Step 3: Add the `V` row to `.digismith/history.html`'s map table**

In the `<table>` inside `<section id="map">`, insert a new row
immediately after the `S` row (`<tr><td><strong>S</strong></td>...`),
matching the existing row markup exactly:

```html
<tr><td><strong>V</strong></td><td>Runtime clone provisioning</td>
  <td>Maintains a sparse, refreshable local clone of DigiSmith's shared <code>packages/</code> code at a fixed, machine-wide location (<code>~/.digismith/repo</code>) — <code>bootstrap</code>/<code>adopt</code> invoke it automatically at ticket start, also callable directly to refresh</td>
  <td><span class="status done">Done</span></td></tr>
```

- [ ] **Step 4: Add a `V` paragraph block after the existing `I.1` paragraph**

Immediately after the existing block:

```html
<p style="font-size:.88rem; color:var(--muted);">
  <strong>I.1 — JIRA progress write-back:</strong> <code>jira-progress-write-back</code> skill —
  <a href="docs/jira-progress-write-back/design.html">design spec</a> ·
  <a href="docs/jira-progress-write-back/plan.md">implementation plan</a>
</p>
```

add:

```html
<p style="font-size:.88rem; color:var(--muted);">
  <strong>V — Runtime clone provisioning:</strong> <code>depot</code> skill —
  <a href="docs/depot/design.html">design spec</a> ·
  <a href="docs/depot/plan.md">implementation plan</a>
</p>
```

- [ ] **Step 5: Update the Progress Overview stats**

Change `<div class="n">8 / 19</div>` to `<div class="n">9 / 20</div>` —
one new map item added (`V`), and it ships within this same task. Leave
the other two stat tiles (`Tier 1` / `E in progress`) unchanged; `V` is
explicitly outside any build-order tier, same as `O`/`P`, so it doesn't
touch tier-completion accounting.

- [ ] **Step 6: Add a note that `V` is outside any tier, same as `O`/`P`**

Immediately after the existing paragraph in `<section id="tiers">`:

```html
<p style="font-size:.85rem; color:var(--muted); margin-top:.8rem;">
  <strong>P — Telemetry</strong> <span class="status done">Done</span> —
  pulled forward and built 2026-08-12, outside any tier (a new map letter
  added directly per Jack's request, same as <strong>O</strong>).
</p>
```

add:

```html
<p style="font-size:.85rem; color:var(--muted); margin-top:.2rem;">
  <strong>V — Runtime clone provisioning</strong> <span class="status done">Done</span> —
  pulled forward and built 2026-08-27, outside any tier, same as
  <strong>O</strong>/<strong>P</strong>.
</p>
```

- [ ] **Step 7: Add a timeline entry**

Immediately before the closing `</div>` of `<div class="timeline">`
(after the existing 2026-08-26 "I split into I.1/I.2..." entry), add:

```html
<div class="event">
  <div class="date">2026-08-27</div>
  <h4>I.1 hit a real live-run bug on EMKT-756; depot (V) brainstormed, specced, and built — 3 tasks, subagent-driven-development</h4>
  <p>I.1's first live run (EMKT-756) found a genuine bug: the Atlassian
  MCP connector's <code>getJiraIssue</code> returns lossy rendered-markdown
  for the <code>description</code> field specifically, despite requesting
  ADF — forcing that write to be skipped. Root-caused and a fix proven
  live (direct Jira REST API v3, personal token, bypassing the connector
  entirely), captured in <code>backlog/jira-rest-graphql-direct-api.md</code>.
  The same session also captured a live-tested Track-section template
  (<code>backlog/track-section-template.md</code>) and a gap around Jack's
  own standing tech-stack defaults not being consulted during brainstorming
  (<code>backlog/opinionated-tech-stack-defaults.md</code>, tentative letter
  <strong>U</strong>). Brainstorming the REST migration surfaced a genuinely
  separate prerequisite: consumer repos need shared TypeScript code
  (starting with a forthcoming <code>jira-client</code> package) without a
  local DigiSmith development checkout. That became <strong>V</strong>,
  its own map letter and its own spec — a sparse, blobless git clone of
  just <code>packages/</code> at a fixed <code>~/.digismith/repo</code>,
  wired into <code>bootstrap</code> Step 0.5 and reused by
  <code>adopt</code>. Task 1 built and dogfooded
  <code>skills/depot/SKILL.md</code> through reasoning against every
  operation and failure path. Task 2 wired its <code>ensure</code>
  operation into both entry-point skills. Task 3 is this
  <code>history.html</code> and <code>MEMORY.md</code> update. The
  Jira REST migration itself (<code>packages/jira-client</code>,
  I.1's fix) is specced in
  <a href="docs/jira-rest-migration/design.html">a separate design doc</a>
  and has its own plan to follow.</p>
</div>
```

- [ ] **Step 8: Commit**

```bash
git add MEMORY.md .digismith/history.html
git commit -m "docs(depot): update roadmap for map item V — depot shipped"
```

---

## Closing Note

This plan covers `digismith:depot` only. The Jira REST migration itself
(`packages/jira-client`, the pnpm workspace, and `jira-progress-write-back`'s
actual step-by-step migration) is a separate, already-written spec at
`.digismith/docs/jira-rest-migration/design.html` — its own plan follows
once this one ships and merges, since that migration's Step 2 assumes
`digismith:depot` already exists to invoke.

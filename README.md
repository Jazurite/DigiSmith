# DigiSmith

Jack's personal SDLC plugin — ticket to delivery, built on top of
[Superpowers](https://github.com/obra/superpowers). See
[`MEMORY.md`](MEMORY.md) for the full philosophy and roadmap,
[`.digismith/history.html`](.digismith/history.html) for a live progress tracker
across every map item, and [`docs/getting-started.md`](docs/getting-started.md)
for the first-run walkthrough in a brand-new repo.

This README covers the one skill you actually invoke to start working:
**`digismith:init`**. It's safe to invoke regardless of whether a ticket's
work is starting fresh or already mid-stream (a ticket ID pulled some other
way, with a spec and plan already written directly by vanilla Superpowers)
— it detects which applies and dispatches to one of two internal-only
workers: `bootstrap` for a fresh ticket, `adopt` for one already mid-stream.
Neither is invoked by name; `init` is the only front door. Everything else
on the roadmap (standards injection, ticket intake, and what's still to
come) is wired in behind it or reachable directly.

Five skills sit outside that front door, because they trigger at
specific points inside the build rather than at the front door itself —
one right before and after the spec and plan themselves get written,
another right after a plan is saved, before any task code is written; the
other three later, once code already exists.

**`enforcer`** (map item **Q**). It fires twice around the
`brainstorming`/`writing-plans` hand-off: right before either one is
invoked, it tells it explicitly to write its output to DigiSmith's
unified docs location (`.digismith/docs/<slug>/design.html`, HTML;
`.digismith/docs/<slug>/plan.md`, Markdown) instead of its own
third-party default — then right after each one reports it's finished,
it verifies the file actually landed there in the right format,
correcting it if not. Once `design.html` is confirmed in place, it also
publishes it via the `Artifact` tool for readability, unless the active
profile has `publish_artifact: false` (`report-implementation` does the
same for `report.html`). See
[`skills/enforcer/SKILL.md`](skills/enforcer/SKILL.md) for the exact
process, or [`.digismith/history.html`](.digismith/history.html) for its
status.

**`subagent-driven-always`** (map item **H**). It intercepts
`superpowers:writing-plans`' Execution Handoff question — "1.
Subagent-Driven (recommended) / 2. Inline Execution" — the moment a plan
is saved and before any of its tasks are implemented. It skips the live
question and defaults straight to `superpowers:subagent-driven-development`,
since `report-implementation` (N) and standards injection (G) both
depend on the per-task ledger only that path produces. It falls back to
`superpowers:executing-plans` only if the user explicitly asked for
inline execution, or if the environment has no subagent-dispatch
capability at all. See
[`skills/subagent-driven-always/SKILL.md`](skills/subagent-driven-always/SKILL.md)
for the exact process, or [`.digismith/history.html`](.digismith/history.html) for
its status.

**`capture-ephemeral-url`** (map item **M**). Once a PR is open in an Emma
Shopify theme repo — typically right after
`superpowers:finishing-a-development-branch`'s "push and create PR"
option — it waits for the ephemeral-deploy CI check and reports the
Shopify Preview Theme and Theme Editor URLs from the bot's PR comment. It
doesn't create the PR and doesn't write to JIRA (that's a separate,
later feature). See
[`skills/capture-ephemeral-url/SKILL.md`](skills/capture-ephemeral-url/SKILL.md)
for the exact process, or [`.digismith/history.html`](.digismith/history.html) for
its status.

**`report-implementation`** (map item **N**). It triggers the moment a
`superpowers:subagent-driven-development` plan's final whole-branch review
comes back clean, and generates that feature's HTML implementation report
— what shipped, the per-task review record, the final-review findings and
how they were resolved, the commit list. Timing is the whole point: it has
to run before that plan's ledger gets deleted, since the ledger is where
all of that detail lives. See
[`skills/report-implementation/SKILL.md`](skills/report-implementation/SKILL.md)
for the exact process, or [`.digismith/history.html`](.digismith/history.html) for
its status.

**`telemetry`** (map item **P**). It triggers right after
`superpowers:finishing-a-development-branch`'s integration decision has
been answered — merge, PR, or keep as-is, all three count as "done for
now." When the active profile has `logging: true`, it copies this
ticket's slice of the live session transcript back into DigiSmith's own
repo and commits it there, using a marker `bootstrap` or `adopt` dropped
before the build began to know where that slice starts. It's raw
capture, not analysis: the point is building the corpus a later pass can
mine for how the process actually behaves. With `logging: false` (or no
profile) it does nothing at all. See
[`skills/telemetry/SKILL.md`](skills/telemetry/SKILL.md)
for the exact process, or [`.digismith/history.html`](.digismith/history.html) for
its status.

## Install

```
/plugin marketplace add Jazurite/DigiSmith
/plugin install digismith@jazurite
```

## Quick Start

Say something like:

> "Start work on EMKT-9001"
> "Begin implementation on this ticket"
> "Let's build this now — [paste ticket or describe the need]"

That's it. `digismith:init` takes it from there. For a fresh ticket, it
gets a real ticket, creates an isolated branch/worktree for it, and hands
off into `superpowers:brainstorming` with the ticket's content already
loaded — no cold start.

Already mid-stream — a ticket ID from your own tooling, a spec and plan
already written directly by vanilla Superpowers, nothing built yet? Say so
the same way: "pick this up in DigiSmith" or "catch this ticket up to
DigiSmith." `init` detects the existing work and adopts it instead of
starting over: backfills the profile/ticket/branch state, relocates the
existing docs into DigiSmith's convention, and hands off straight to the
build stage — brainstorming/writing-plans are skipped since they already
ran.

The first time you run it in a given repo, it asks one extra question
first: which **profile** this repo uses (map item **O**). **Emma** — the
full flow: JIRA ticket, `<Key>__<slug>` branch, standards injection,
ephemeral-URL capture, and session transcripts captured into DigiSmith's
own repo once each build finishes (`logging: true`). **Personal** — the
same brainstorm → spec → plan → build → review core, minus the client
machinery: no ticket (the branch is just `<slug>`), no ephemeral capture,
no standards injected, no transcript capture. **Jazurite** — the same
ticket-less, client-machinery-free core as Personal, but with session
transcript capture turned back on (`logging: true`); for Jack's own
branded projects where the process is worth building a corpus from, not
client work and not throwaway scratch. **DigiSmith** — same fields as
Jazurite (no ticket, no standards, no ephemeral, transcript capture on);
reserved specifically for DigiSmith's own repo working on itself, so its
own dogfooding sessions build the same corpus every other DigiSmith-driven
project does. The answer is
remembered in `.digismith/profile` in that repo, so you're only asked
once. To change it later, just say "switch this repo's profile to
personal" (or "jazurite", or "digismith") — it'll state exactly what
turns on or off and confirm before writing.

If you only want a ticket captured — no branch, no build yet — say so
explicitly (or invoke `digismith:jira-intake` directly) instead.

## What Happens, Step by Step

### 1. Get a real ticket

If this conversation doesn't already have a ticket, `bootstrap`
invokes `digismith:jira-intake` for you:

- **You named an existing ticket** (a key, a URL, or pasted text) → Door
  1. It fetches by key if a JIRA/Atlassian tool is available in the
  session, or asks you to paste the content if not.
- **You described a raw need, no ticket yet** → Door 2. It asks only for
  whatever's missing (title, description, acceptance criteria), drafts
  a ticket, and confirms it with you before writing anything.

Either door writes `.digismith/docs/<slug>/ticket.md` in the repo you're working
in. A Door 2 draft has no ticket key yet — if you try to start real
implementation work on one, `bootstrap` stops and tells you it
needs a real key first (see Edge Cases below).

### 2. Create the branch

Once a real ticket exists, `bootstrap`:

1. Derives the slug from the ticket's own folder name (the same slug
   `jira-intake` already used — never re-derived from the title).
2. Names the branch `<Key>__<slug>` — e.g.
   `EMKT-9001__fix-cart-drawer-padding-mobile`.
3. Checks whether that branch already exists:
   - **A worktree is already attached** (you're resuming work from
     earlier) → switches into it. No duplicate.
   - **The branch exists but has no worktree** (you kept the branch but
     cleaned up its worktree earlier) → attaches a new worktree to the
     existing branch rather than creating one from scratch.
   - **The branch name collides with someone else's unrelated ticket** →
     asks you before touching anything. Never silently reuses a
     stranger's branch.
4. Otherwise, creates a fresh isolated worktree on that branch name
   (preferring a native worktree tool if the session has one, falling
   back to `superpowers:using-git-worktrees`), and double-checks the
   resulting branch name is exactly right — some worktree tools quietly
   rename what you asked for.

### 3. Hand off to brainstorming

From inside that worktree, `bootstrap` invokes `digismith:enforcer`
— which tells `superpowers:brainstorming`/`superpowers:writing-plans`
where and in what format DigiSmith needs their output, then checks it
landed there once each finishes — before invoking
`superpowers:brainstorming` itself with the ticket's title, description,
and acceptance criteria already loaded as seed context. From there,
Superpowers' own chain takes over unmodified — brainstorming →
`writing-plans` → `subagent-driven-development`/`executing-plans` — with
its own approval gates at each stage. `bootstrap`'s job ends at
the hand-off; it never re-invokes or duplicates anything downstream.

Already mid-stream instead? `adopt` reaches the same
`subagent-driven-development` stage directly — see
[`skills/adopt/SKILL.md`](skills/adopt/SKILL.md) for its exact process.

## Edge Cases

| Situation | What happens |
|---|---|
| First run in a repo, and you decline to pick a profile | Stops there and explains a profile is required. No branch or worktree gets created. |
| The repo's profile is `personal` | Step 1's ticket intake is skipped entirely — the slug comes straight from your description and the branch is just `<slug>`. Ephemeral capture, standards injection, and session-transcript capture stay off too. |
| Ticket has no real key yet (an un-upgraded Door 2 draft) | Stops after intake. Explains it needs a real key to name a branch — continue manually, or run intake again later once the ticket has one. |
| A worktree already exists for this ticket | Switches into it. No duplicate ever gets created. |
| A branch exists for this ticket but its worktree was removed | Reattaches a worktree to the existing branch instead of failing. |
| Branch name collides with someone else's unrelated ticket | Asks you via a direct question before doing anything. Never silently reuses it. |
| The current worktree already has `.digismith/profile` | `init` reports "already initialized" and stops — no re-processing, no questions. |
| `jira-intake` itself can't proceed (no JIRA tool and you decline to paste, or pasted content's too sparse) | Stops wherever `jira-intake` stopped — not a new failure mode, just respects its own gate. |

## Current Scope

`digismith:init` and its two workers are map item **E**, amended. The
fresh-start slice (`bootstrap`, unchanged) is intake → branch →
brainstorming hand-off; the mid-stream slice (`adopt`) is scoped to one
recurring case — ticket known, spec written, plan written, nothing built
yet. Joining before a spec/plan exists, or mid-build, is still out of
scope, and full stage-order enforcement across every future stage is still
not built. Check [`.digismith/history.html`](.digismith/history.html) for
what's shipped so far and what's still ahead.

## Full Skill Reference

The exact instructions Claude follows live in
[`skills/init/SKILL.md`](skills/init/SKILL.md),
[`skills/bootstrap/SKILL.md`](skills/bootstrap/SKILL.md),
[`skills/adopt/SKILL.md`](skills/adopt/SKILL.md), and
[`skills/jira-intake/SKILL.md`](skills/jira-intake/SKILL.md) — read
those directly if you want the precise, unabridged process rather than
this summary.

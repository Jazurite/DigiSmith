# DigiSmith — Project Memory

A Claude Code plugin covering the full software development lifecycle,
ticket creation → delivery. This file is the foundational document: the
philosophy every later spec argues from, and the conventions every skill follows.

**Status, 2026-10-11:** ClickUp is the only tracker. The frozen clan-letter map that used to
live here is on ClickUp DGS-356; for what is tracked now, see "Where work is tracked now" below.

## Where work is tracked now

Tickets, not clan letters, are the unit of work (DGS-158, adopted 2026-10-04). ClickUp is the
only tracker: it holds what is active, what is planned and every idea. `backlog/` is gone
(DGS-327). A ticket's working files live in `.digismith/board/<KEY>—<slug>/`; work with no
ticket key stays in `.digismith/docs/<slug>/`; session files live in `.digismith/sessions/`. No
new letter or lineage number gets assigned to anything, ever again.
Shipped work goes to the history page in the depot through hook 03 (`DIGISMITH_HISTORY_DIR`,
DGS-389), not to `.digismith/history.html`. The frozen clan-letter map (the map, its build order
and its open questions) is the attachment `frozen-letter-map.md` on ClickUp DGS-356: read it for
historical context, never extend it.

## Philosophy

**1. It's a personal SDLC, not a framework.** Built for how Jack works.
Generalizing it for other people is a non-goal — where a choice is right
for this user and wrong for a hypothetical other one, it goes this user's
way.

**2. It augments, never replaces.** DigiSmith sits on top of tools already
in use, Superpowers above all. Where Superpowers has a proven primitive
(`brainstorming`, `writing-plans`, `subagent-driven-development`),
DigiSmith calls it rather than growing its own version. It only writes
original content for stages Superpowers leaves empty. Duplicating a
Superpowers capability is a bug, not a feature — with one deliberate,
scoped exception: map item **W** (Primitive ownership), where DigiSmith
vendors and, over time, replaces specific Superpowers primitives outright.
That exception is named and bounded, not a loophole — every other skill
still augments rather than duplicates.

**3. It runs live.** DigiSmith operates *during* the work, in real time.
This is what separates it from Jack's retrospective career-notes pipeline (DGS-398), a
retrospective archivist that runs long after the work is finished. The two
never overlap and never write to each other's storage.

**4. One entry point, two doors.** A ticket already exists → DigiSmith
ingests it. No ticket yet, just a need → DigiSmith helps shape one. Both
converge into the same downstream flow.

**5. Prescriptive — it drives.** DigiSmith owns the flow and enforces
stage order. No skipping spec to jump to code because it felt small. Same
stance `digismith:using-superpowers` takes: if the process applies, it
applies.

**6. But the human holds the terminal gate.** DigiSmith drives *how* work
moves; it never decides *when* a ticket is done. Closure is always the
user's call. Prescriptive about process, deferential about completion.

**7. Full arc, ticket birth → announcement.** Intake/creation → spec →
plan → build → merge → release → post-release announcement. Delivery isn't
merge, and isn't even deploy — it's the moment other people are told.

## Structure

DigiSmith is its own independent git repository — not a subdirectory of
any consuming project's repo. It happens to live on disk inside the
`knowpolis` Obsidian vault (which has its own separate git repo one level
up), but the vault's git history never sees it; `knowpolis`'s root
`CLAUDE.md` `.gitignore`s this folder for exactly that reason. That
independence is what makes it a real plugin rather than vault-local
tooling: any Claude Code session, in any repo, on any machine, can
`/plugin marketplace add` this repo directly and pull in its skills —
usage isn't confined to sessions opened inside this vault.

One plugin, self-hosted marketplace. The repo is both:

```
3. DigiSmith/
├── .claude-plugin/
│   ├── marketplace.json     ← its own marketplace, no upstream owner
│   └── plugin.json
├── profiles/                ← per-repo behavior profiles (map item O)
│   ├── emma.yml
│   ├── personal.yml
│   ├── jazurite.yml
│   └── digismith.yml
└── skills/
    ├── init/
    └── ...
```

Installed via `/plugin marketplace add` against this repo directly, not
through someone else's marketplace. Every skill DigiSmith ships lives
inside the single `digismith` plugin — not separate plugins.
Rationale: the stages depend on each other and the spine routes between
them, so splitting would add coordination cost for no gain, and
`plugin.json` has no dependency field to express the relationships anyway.

## What Superpowers already covers

DigiSmith calls these rather than reimplementing them:

`brainstorming` → spec · `writing-plans` → plan ·
`subagent-driven-development` → build · `requesting-code-review` → review ·
`finishing-a-development-branch` → merge decision

## Relationship to Jack's notes pipeline

Moved to ClickUp DGS-398 (Notes): it is personal and leaves the public repo.

## Conventions

- **Unified docs convention** (adopted 2026-08-08, replacing the two
  conventions below): everywhere DigiSmith writes docs — its own repo or
  any consumer repo — they live together at
  `.digismith/docs/<feature-slug>/{ticket.md, design.html, plan.md,
  report.html}`, one folder per feature, files named by role only (no
  date prefix — the folder name and git history carry that). In
  DigiSmith's own repo, `.digismith/` is git-committed, same as the old
  `docs/` was. In a consumer repo, commit-vs-gitignore is an explicit
  per-repo choice: `jira-intake` asks git itself
  (`git check-ignore -q .digismith/docs/`, exit 0 = ignored, exit 1 = not
  ignored) before writing there for the first time — ignored → write
  gitignored, no question asked; not ignored and nothing tracked under
  `.digismith/docs/` yet → ask once via `AskUserQuestion`, and if
  gitignored is chosen, safely append the entry (its presence becomes the
  remembered answer for every future session; its absence means
  "committed," equally durable). Shipped-work history lives in the
  depot history page (hook 03, DGS-389), not in the repo.
  Any HTML doc in that set — `design.html`, `report.html` — also gets
  published via the `Artifact` tool once written, unless the active
  profile has `publish_artifact: false` (added 2026-08-16), with the
  link reported back when it is; `plan.md` and `ticket.md` stay as plain
  working files, never published (added 2026-08-15 alongside map item
  **Q**).
- Specs are authored in HTML — richer structure and presentation for a
  document a human reviews once. Plans stay Markdown:
  `digismith:subagent-driven-development`'s `task-brief` script parses
  task boundaries by Markdown `### Task N:` headers, so an HTML plan would
  break automatic task dispatch. The standards library itself also stays
  plain Markdown — optimized for compact injection into subagent context,
  not visual review.
- Record decisions in plain, git-committed text — not any single LLM's
  private memory — so any harness opening the project picks up context.
- **DigiSmith's own feature work always happens in an isolated
  worktree/branch**, never directly on `main` — decided 2026-08-08 (a
  reversal of the pattern G, A, and E were built under, all committed
  straight to `main`). Applies to every implementation plan executed
  against this repo, regardless of who's running it.
- **Final-review ledger lines are standardized**: `digismith:subagent-driven-development`'s
  own ledger grammar covers per-task lines (`Task <N>: complete/minor/parked/BLOCKED/fix round`)
  but has no format for the whole-branch final review itself. DigiSmith requires recording it as
  `Final review (base <BASE>..<HEAD>, <model>): <one-line verdict and finding summary>`, with any
  subsequent fix round as `Scoped re-review (fix base <BASE>..<HEAD>, <model>): <verdict>`, and any
  residual as `Final review: parked — <finding> — ruling: <why>` (same shape as a per-task parked
  line). `digismith:report-implementation` depends on this exact grammar to render the Final Review
  & Fix section — a ledger that doesn't follow it will read as "no final review recorded yet."
- **`.digismith/profile` is config, not generated docs output** (map item O). The
  commit-vs-gitignore choice above governs `.digismith/docs/` — the docs DigiSmith *generates*. The
  one-line profile pointer sits beside that folder, not inside it, and is outside that choice
  entirely: it is never `git add -f`'d, so a repo that chose gitignored (or carries a bare
  `.digismith/` line predating this feature, which prefix-matches the profile file too) keeps its
  choice intact. What is guaranteed instead is **physical presence wherever work actually
  happens**: `bootstrap` Step 0 writes it in the original checkout, and Step 2.6 copies it
  into the worktree Step 2 creates or attaches — a worktree checks out only committed files, so
  without that copy it simply wouldn't be there. `digismith:adopt` reuses this exact Step 0/2.6
  logic by reference for the mid-stream case, rather than a second implementation. `inject-standards`,
  `capture-ephemeral-url`, `report-implementation`, and `bootstrap`'s own Step 1.5 (the
  `logging` gate) each read it from that working directory at their own trigger point; a missing
  file reads as "no profile" and silently restores unrestricted, pre-profiling behavior.
- **`.digismith/telemetry-marker` follows the same contract** (map item P). It is config-shaped
  runtime state, not generated docs output: never `git add -f`'d, never committed on purpose, and
  guaranteed only by **physical presence wherever work happens** — `digismith:bootstrap`
  Step 1.5 writes it in the original checkout and Step 2.7 copies it into the worktree, exactly as
  2.6 does for `.digismith/profile`. `digismith:adopt` writes its own equivalent for the
  mid-stream case, mirroring the same unconditional-clear-first behavior. Three skills touch it
  and no others: `digismith:bootstrap` and `digismith:adopt` write it (each unconditionally
  `rm -f`s any prior one at the start of its own run, so a stale marker can never be inherited by
  an unrelated ticket), and `digismith:telemetry` reads it after the build finishes and deletes
  it. Unlike the profile
  pointer, a missing marker is always benign — it means "nothing to capture," which is the correct
  default.
- **Every `subagent-driven-development` plan invokes `digismith:report-implementation`** once its
  final review passes, before the plan's workspace gets deleted (see N's own design/skill for why
  the ordering matters). An `executing-plans`-run (inline-execution) plan invokes it too, right
  before `executing-plans` hands off to `finishing-a-development-branch` (see W.6).
- **Ticket-based board & session convention** (adopted 2026-10-04, DGS-158/DGS-159): tickets are
  the unit of work, not clan letters or lineage numbers. See DGS-158's `design.html`, today at
  `.digismith/docs/E/E.3/worker-maestro-conventions/` (it moves under DGS-164).

## Open questions (current)

Now ClickUp tickets: DGS-167 (design review shape), DGS-168 (shipped-product telemetry),
DGS-399 (`{{MAP_ITEM}}` gap in `report-implementation`).

## Frozen: the clan-letter map (through DGS-157)

Moved to the attachment `frozen-letter-map.md` on ClickUp DGS-356 (the map, build order and its open questions).

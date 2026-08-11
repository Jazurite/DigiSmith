# DigiSmith — Project Memory

A Claude Code plugin covering the full software development lifecycle,
ticket creation → delivery. This file is the foundational document: the
philosophy every later spec argues from, the map of what gets built, and
the order it gets built in.

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
Superpowers capability is a bug, not a feature.

**3. It runs live.** DigiSmith operates *during* the work, in real time.
This is what separates it from `2. Career/`'s ticket-pipeline, a
retrospective archivist that runs long after the work is finished. The two
never overlap and never write to each other's storage.

**4. One entry point, two doors.** A ticket already exists → DigiSmith
ingests it. No ticket yet, just a need → DigiSmith helps shape one. Both
converge into the same downstream flow.

**5. Prescriptive — it drives.** DigiSmith owns the flow and enforces
stage order. No skipping spec to jump to code because it felt small. Same
stance `superpowers:using-superpowers` takes: if the process applies, it
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
│   └── personal.yml
└── skills/
    ├── using-digismith/
    └── ...
```

Installed via `/plugin marketplace add` against this repo directly, not
through someone else's marketplace. Everything on the map below becomes a
skill inside the single `digismith` plugin — not separate plugins.
Rationale: the stages depend on each other and the spine routes between
them, so splitting would add coordination cost for no gain, and
`plugin.json` has no dependency field to express the relationships anyway.

## What Superpowers already covers

DigiSmith calls these rather than reimplementing them:

`brainstorming` → spec · `writing-plans` → plan ·
`subagent-driven-development` → build · `requesting-code-review` → review ·
`finishing-a-development-branch` → merge decision

## The map

Letters are stable identifiers, not an ordering — build order is the
tiering below.

| # | Gap | What it is |
|---|---|---|
| **A** | Intake/creation | Ticket exists → ingest it; doesn't → shape one from a raw need |
| **B** | Spec seam | Carry ticket context *into* `superpowers:brainstorming` so it doesn't start cold |
| **C** | Live work journal | `0. Terminal/Working Notes/<KEY>.md` kept current as work happens — the handoff artifact to `2. Career/` |
| **D** | Delivery | merge → release → verification → announcement |
| **E** | The spine | `using-digismith` — the prescriptive driver that enforces stage order and routes to everything else |
| **F** | Design review | Independent critique of a design, then the jade-and-ink artifact rendering for human approval |
| **G** | Standards injection | Jack's coding standards + style guide carried into every implementer subagent's brief |
| **H** | Subagent-driven always | Kills Superpowers' "1. Subagent-Driven or 2. Inline?" question — there is no option 2 |
| **I** | QA handoff | **I.1** JIRA comment write-back for a captured ephemeral URL (consumes **M**'s output) — no status transition, that stays manual by design · **I.2** end-to-end testing · **I.3** visual regression vs Figma (custom Figma skill) |
| **J** | Estimation | Dual-track: the internal number (real) and the client-facing number (committed). The dilution is deliberate and is the point of the stage |
| **K** | Model tiering | Extend `subagent-driven-development` across a pool spanning frontier → open-weight models, dispatching each agent to the cheapest one that can handle its task |
| **L** | Refinement & exploration | **L.1** connect a new ticket to the established feature network · **L.2** source the codebase and return the actual code list — which files/sections it touches, what assets are needed — deliberately kept separate from **A**, which stops once a well-structured ticket exists |
| **M** | Ephemeral deploy capture | Poll Emma CI/CD's ephemeral-deploy check on an open PR and extract the Shopify Preview + Theme Editor URLs from the bot's PR comment, reported in-session. Split out from **I.1** during brainstorming (2026-08-08) once the JIRA write-back was pushed to its own later feature — this piece has no JIRA dependency at all |
| **N** | Implementation reporting | Formalizes G's hand-written report into a required step: once a `subagent-driven-development` plan's final review passes, generate the HTML implementation report (delivered work, per-task review table, final-review findings, commit list) before the plan's ledger gets deleted |
| **O** | Profiling | A per-repo behavior profile (standards subset, ticket/ephemeral/reporting on-off) that existing stages consult independently at their own trigger point — new letter, added directly per Jack's request during this brainstorm |

Shared primitive several stages need: **JIRA write-back** (posting comments,
driving status transitions).

## Build order

| Tier | Theme | Items |
|---|---|---|
| **1** | The frame | **G** standards injection · **E** spine (first slice — Tier 1 considered satisfied 2026-08-11) · **O** profiling (pulled forward and built 2026-08-11) |
| **2** | The override | **H** subagent-driven always · **K** open-weight model extension |
| **3** | Intake & estimation | **A** intake/creation · **E** spine (remaining scope — decoupled from Tier 1 2026-08-11) · **J** estimation |
| **4** | Process expansion | **L** refinement & exploration · **B** spec seam |
| **5** | Technical expansion | **D** delivery · **F** design review · **M** ephemeral deploy capture (pulled forward and built 2026-08-08) · **N** implementation reporting (pulled forward and built 2026-08-08) · **I.1** JIRA write-back for the captured URL · **I.2** E2E · **I.3** Figma visual regression |
| **6** | Last | **C** live work journal |

The shape of this ordering: Tier 1 establishes *what DigiSmith is* — its
identity (the spine) and its house rules (standards). Tier 2 overrides
*how execution runs* — always subagents, on a wider model pool. Structure
before mechanics. No lifecycle machinery ships until Tier 3, which means
DigiSmith's first release is an opinionated execution layer over
Superpowers, not a ticket tool.

Tier 5 is where the genuinely expensive work lives. **I.2** and **I.3** are
their own projects rather than skills — I.3 especially, since it's a whole
new dependency class (Figma API, image diffing) unlike anything else on
the map, which otherwise just moves text around.

## Relationship to `2. Career/`

`2. Career/Companies/emma/procedures/ticket-pipeline.md` is a separate,
non-overlapping pipeline: a retrospective archivist turning a finished
JIRA ticket into a permanent `board/` career record. DigiSmith is at the
absolute beginning and runs live; ticket-pipeline is the aftermath.

The seam is two-way, and narrow by design:

- **Read** — DigiSmith reads `2. Career/Companies/emma/features/` during
  refinement (L.1) to connect a new ticket to the established feature
  network.
- **Write** — DigiSmith writes `0. Terminal/Working Notes/<KEY>.md` during
  the work (C). ticket-pipeline's Abstraction step (§2.3) already expects
  exactly this file as source material, and deletes it once the ticket
  moves to `board/`.

DigiSmith never writes to `board/`, `pipeline/`, or `pipeline/raw/ledger.md`.
Read-only on the feature map, write-only on the working note.

Because Abstraction is C's consumer, **C should be designed backwards from
Abstraction's fields** (Summary, Idea, Conclusion, Ticket impact, Outcome,
Skills/tags, Follow-up, Brag-doc candidate). Capturing decisions and
outcomes as they happen beats reconstructing them weeks later. Note the
cost of C sitting in Tier 6: until it ships, that handoff stays manual.

## Open questions

- **K's feasibility is unverified.** Claude Code's `Agent` tool takes a
  model parameter, but whether it accepts a non-Anthropic open-weight
  endpoint — natively, via proxy, or not at all — is unknown. Chutes is the
  likely vehicle for the open-weight side (DeepSeek/Qwen/Kimi/GLM). Run a
  feasibility spike before speccing Tier 2, not during.
- **F's shape is undecided.** Whether design review is (a) present-for-human-
  review only, (b) independent agent critique only, or (c) critique then
  present, was raised but never settled. Decide when Tier 5 gets specced.
- **`design.html`/`plan.md` have no enforcement mechanism.** The unified
  docs convention says a new feature's spec and plan belong at
  `.digismith/docs/<feature-slug>/`, but nothing today actually points
  `superpowers:brainstorming` or `superpowers:writing-plans` there — they're
  third-party skills that don't know the convention exists, so a new
  feature's spec/plan still land wherever those skills default to. That's
  exactly how the unified-docs-convention feature's own spec and plan ended
  up at the old `docs/superpowers/` location. `using-digismith`'s hand-off
  to `superpowers:brainstorming` is the natural place to eventually pass
  the target folder explicitly, but that's undesigned. Decide when it's
  actually blocking someone, not preemptively — the final review that
  raised it called it a genuine follow-up feature, not a merge blocker.
- **`{{MAP_ITEM}}` has no derivation rule for a no-map-letter feature.**
  `report-implementation`'s placeholder is defined as "the map-item
  letter/number in `{{FEATURE_TITLE}}`'s own parenthetical" (e.g.
  `Capture Ephemeral URL (M)` → `M`), but a structural feature like the
  unified docs convention itself has no map letter at all. The self-run
  report worked around it by hand with `n/a — structural change, no map
  letter` rather than following a documented rule. Cheap, non-blocking —
  fold a no-map-letter case into that derivation bullet next time
  `report-implementation` is touched, not urgent enough on its own.

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
  "committed," equally durable). `.digismith/history.html` replaces
  `docs/history.html` in DigiSmith's own repo.
- Specs are authored in HTML — richer structure and presentation for a
  document a human reviews once. Plans stay Markdown:
  `superpowers:subagent-driven-development`'s `task-brief` script parses
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
- **Final-review ledger lines are standardized**: `superpowers:subagent-driven-development`'s
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
  happens**: `using-digismith` Step 0 writes it in the original checkout, and Step 2.6 copies it
  into the worktree Step 2 creates or attaches — a worktree checks out only committed files, so
  without that copy it simply wouldn't be there. `inject-standards`,
  `capture-ephemeral-url`, and `report-implementation` each read it from that working directory at
  their own trigger point; a missing file reads as "no profile" and silently restores
  unrestricted, pre-profiling behavior.
- **Every `subagent-driven-development` plan invokes `digismith:report-implementation`** once its
  final review passes, before the plan's workspace gets deleted (see N's own design/skill for why
  the ordering matters).

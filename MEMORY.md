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
| **I** | QA handoff | **I.1** capture Emma CI/CD's ephemeral URL → JIRA comment + status transition · **I.2** end-to-end testing · **I.3** visual regression vs Figma (custom Figma skill) |
| **J** | Estimation | Dual-track: the internal number (real) and the client-facing number (committed). The dilution is deliberate and is the point of the stage |
| **K** | Model tiering | Extend `subagent-driven-development` across a pool spanning frontier → open-weight models, dispatching each agent to the cheapest one that can handle its task |
| **L** | Refinement & exploration | **L.1** connect a new ticket to the established feature network · **L.2** source the codebase and return the actual code list — which files/sections it touches, what assets are needed |

Shared primitive several stages need: **JIRA write-back** (posting comments,
driving status transitions).

## Build order

| Tier | Theme | Items |
|---|---|---|
| **1** | The frame | **G** standards injection · **E** spine |
| **2** | The override | **H** subagent-driven always · **K** open-weight model extension |
| **3** | Intake & estimation | **A** intake/creation · **J** estimation |
| **4** | Process expansion | **L** refinement & exploration · **B** spec seam |
| **5** | Technical expansion | **D** delivery · **F** design review · **I.1** ephemeral URL → JIRA · **I.2** E2E · **I.3** Figma visual regression |
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
- **A and L may be one skill, not two.** "Get the ticket" and "ground it in
  the codebase" are arguably a single continuous act; splitting them means
  designing a handoff between two halves of one thought. Decide when Tier 3
  or 4 gets specced.
- **F's shape is undecided.** Whether design review is (a) present-for-human-
  review only, (b) independent agent critique only, or (c) critique then
  present, was raised but never settled. Decide when Tier 5 gets specced.

## Conventions

- Specs and plans for DigiSmith work live at the knowpolis vault root:
  `Knowpolis/.superpowers/{specs,plans}/`.
- Record decisions in plain, git-committed markdown — not any single LLM's
  private memory — so any harness opening the project picks up context.

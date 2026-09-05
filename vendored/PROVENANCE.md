# Provenance

Source: Superpowers plugin (claude-plugins-official marketplace)
Upstream repository: https://github.com/obra/superpowers
Version: 6.2.0
Plugin cache directory: 44c9b2d6e889
Cloned: 2026-08-20

## Skills vendored (verbatim, byte-identical to source)

- dispatching-parallel-agents
- receiving-code-review
- requesting-code-review
- subagent-driven-development
- systematic-debugging
- test-driven-development
- using-git-worktrees
- using-superpowers
- verification-before-completion
- writing-skills

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
  `MEMORY.md` map item W. **Further diverged by W.6** (2026-09-04): its Execution
  Handoff step now decides inline-vs-subagent-driven by autonomous complexity reasoning instead
  of presenting Superpowers' original live question.
- **executing-plans** — map item **W.6**, activated 2026-09-04. Gained a lightweight ledger
  (`.superpowers/sdd/<plan-basename>/progress.md`, first line `# Inline-execution ledger`) and
  a per-task self-check step it never had before — DigiSmith's `writing-plans` now dispatches
  here directly for low-complexity plans instead of defaulting to
  `subagent-driven-development` unconditionally. See DigiSmith `MEMORY.md` map item W.

## License

MIT (Jesse Vincent, 2025) — see `LICENSE` in this folder.

## Sync policy

Baseline commit (the original clone, before any divergence):
`a6418858b5374c2506d1ff799b2dcb418bff53d1` — 2026-08-20,
"feat(vendor-superpowers-skills): clone all 14 Superpowers skills verbatim".

An on-demand check exists: `node scripts/check_vendored_skills.ts` (map
item **W.2**, revised by **W.2.1** 2026-09-04) 3-way-diffs every vendored skill against this
baseline and a shallow clone of the upstream GitHub repository's current default-branch tip
(no local Superpowers installation required), reporting
upstream drift and local divergence separately so an activated skill's
own edits are never confused with genuine upstream changes. Still
manual-trigger, not automatic-schedule or auto-merge — this is a
read-only report a human reviews and decides from, not a sync/merge
system, consistent with DigiSmith staying a personal tool. Note: this
only detects drift in files that existed at the baseline commit — a
file upstream has added to a skill since then is not detected;
extending coverage to newly-added upstream files is a possible future
enhancement, not built here. See DigiSmith `MEMORY.md` map item W.

## Activation

A vendored skill above is "dormant" until a future brainstorm activates
it — **finishing-a-development-branch** (W.4), **brainstorming**/**writing-plans** (W.5), and
**executing-plans** (W.6) have gone through this, all on 2026-09-04; every
other skill in this file is still an inert,
unused copy that nothing in DigiSmith calls into. Activating one means:

- Editing its `skills/<name>/` copy with the actual content
  changes wanted. (Folders were renamed 2026-09-04, dropping the
  `vendored-` prefix, once live-testing confirmed the clean frontmatter
  `name:` field really does win over the folder name for invocation —
  see the note below.)
- Updating DigiSmith's own internal call sites that reference
  `superpowers:<name>` to reference `digismith:<name>` instead.
- Rewriting any internal `superpowers:<name>` cross-references inside the
  activated skill's own body (e.g. one skill's file telling the reader to
  "use `superpowers:finishing-a-development-branch`") so it points at the
  vendored/activated copy instead of chaining back to the still-live
  upstream skill — covered at a high level by the design spec's Error
  Handling section; noted here explicitly since this is the checklist
  someone actually opens at activation time.
- Deconflicting the `description:` frontmatter field from the
  still-active `superpowers:<name>` original, so automatic skill
  selection can't pick the wrong one once content diverges. Today both
  descriptions are identical and harmless (bodies are identical too, and
  DigiSmith's call sites are always explicitly prefix-qualified), but that
  stops being true the moment a vendored copy's content changes. Do this
  by appending a fork-provenance tag to the end of the existing
  description text: `(DigiSmith fork of Superpowers' <name>)` — e.g.
  `description: Use when implementation is complete... (DigiSmith fork of
  Superpowers' finishing-a-development-branch)`. Visible from a skill
  listing, not just from opening the file.
- Recording the switch in `MEMORY.md`.

**Resolved by the 2026-09-04 rename, not left for `brainstorming`'s
activation as originally planned:** `skills/brainstorming/SKILL.md`
(around line 151) references `skills/brainstorming/visual-companion.md`
— previously stale (the file actually lived at
`skills/vendored-brainstorming/visual-companion.md`), now correct by
coincidence since the folder rename moved the real file to exactly the
path the reference already pointed at.

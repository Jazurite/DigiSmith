# DigiSmith W.1: Vendor Superpowers Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone all 14 Superpowers skills verbatim into DigiSmith's own repo as flat, name-prefixed `skills/vendored-<name>/` folders, establishing the ownership baseline map item W will evolve from.

**Architecture:** Byte-for-byte directory copy from the installed Superpowers plugin cache into `skills/vendored-<name>/` (flat — Claude Code's plugin skill discovery requires exactly one level of nesting under `skills/`, confirmed against its own docs during planning), plus a top-level `vendored/` folder (sibling to `skills/`, not inside it) holding `LICENSE` and `PROVENANCE.md`. No content edits anywhere, no changes to any existing DigiSmith skill file's call sites.

**Tech Stack:** Bash (`cp -r`, `diff -r`), Markdown/YAML frontmatter (untouched, copied as-is), git.

## Global Constraints

- Every copied file must be byte-identical to its source — verified via `diff -r`, zero exceptions.
- Skill folders must be direct children of `skills/`. A skill's invocable name comes from its `SKILL.md` frontmatter `name:` field, not its folder name — verbatim clones keep the original `name:` value, so `skills/vendored-brainstorming/SKILL.md` (frontmatter `name: brainstorming`) resolves to `digismith:brainstorming`, not `digismith:vendored-brainstorming`.
- Zero edits to any existing DigiSmith skill file's call sites in this slice — the 14 clones stay dormant until a future W.2+ brainstorm activates one individually.
- Source directory: `C:\Users\jazurite\.claude\plugins\cache\claude-plugins-official\superpowers\44c9b2d6e889\skills\` — Superpowers plugin version 6.2.0, cache directory `44c9b2d6e889`.
- License: MIT (Jesse Vincent, 2025) — the notice must travel with the clone (`vendored/LICENSE`).
- All commands below assume the working directory is the worktree repo root: `D:\Workspace\Jazurite\DigiSmith-worktree-vendor-superpowers-skills`.

---

### Task 1: Clone all 14 Superpowers skills into flat, name-prefixed folders

**Files:**
- Create: `skills/vendored-brainstorming/` (SKILL.md, scripts/frame-template.html, scripts/helper.js, scripts/server.cjs, scripts/start-server.sh, scripts/stop-server.sh, spec-document-reviewer-prompt.md, visual-companion.md)
- Create: `skills/vendored-dispatching-parallel-agents/` (SKILL.md)
- Create: `skills/vendored-executing-plans/` (SKILL.md)
- Create: `skills/vendored-finishing-a-development-branch/` (SKILL.md)
- Create: `skills/vendored-receiving-code-review/` (SKILL.md)
- Create: `skills/vendored-requesting-code-review/` (SKILL.md, code-reviewer.md)
- Create: `skills/vendored-subagent-driven-development/` (SKILL.md, implementer-prompt.md, re-review-prompt.md, task-reviewer-prompt.md, scripts/review-package, scripts/sdd-workspace, scripts/task-brief)
- Create: `skills/vendored-systematic-debugging/` (SKILL.md, CREATION-LOG.md, condition-based-waiting-example.ts, condition-based-waiting.md, defense-in-depth.md, find-polluter.sh, root-cause-tracing.md, test-academic.md, test-pressure-1.md, test-pressure-2.md, test-pressure-3.md)
- Create: `skills/vendored-test-driven-development/` (SKILL.md, writing-good-tests.md)
- Create: `skills/vendored-using-git-worktrees/` (SKILL.md)
- Create: `skills/vendored-using-superpowers/` (SKILL.md, references/antigravity-tools.md, references/codex-tools.md, references/gemini-tools.md, references/pi-tools.md)
- Create: `skills/vendored-verification-before-completion/` (SKILL.md)
- Create: `skills/vendored-writing-plans/` (SKILL.md, plan-document-reviewer-prompt.md)
- Create: `skills/vendored-writing-skills/` (SKILL.md, anthropic-best-practices.md, examples/CLAUDE_MD_TESTING.md, graphviz-conventions.dot, persuasion-principles.md, render-graphs.js, testing-skills-with-subagents.md)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: 14 folders at `skills/vendored-<name>/`, each a byte-identical copy of `C:\Users\jazurite\.claude\plugins\cache\claude-plugins-official\superpowers\44c9b2d6e889\skills\<name>\`. Task 2 and Task 3 rely on this exact set of 14 names and paths.

- [ ] **Step 1: Copy all 14 skill directories**

Run from the worktree repo root:

```bash
SRC="C:\Users\jazurite\.claude\plugins\cache\claude-plugins-official\superpowers\44c9b2d6e889\skills"
for name in brainstorming dispatching-parallel-agents executing-plans finishing-a-development-branch receiving-code-review requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-git-worktrees using-superpowers verification-before-completion writing-plans writing-skills; do
  mkdir -p "skills/vendored-$name"
  cp -r "$SRC/$name/." "skills/vendored-$name/"
done
```

Expected: no output, 14 new directories under `skills/`.

- [ ] **Step 2: Verify every copy is byte-identical to its source**

```bash
SRC="C:\Users\jazurite\.claude\plugins\cache\claude-plugins-official\superpowers\44c9b2d6e889\skills"
for name in brainstorming dispatching-parallel-agents executing-plans finishing-a-development-branch receiving-code-review requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-git-worktrees using-superpowers verification-before-completion writing-plans writing-skills; do
  diff -rq "$SRC/$name" "skills/vendored-$name"
done
```

Expected: **no output at all**. `diff -rq` only prints when it finds a difference — silence means all 14 clones are byte-identical. If anything prints, stop and fix that specific file before continuing; do not proceed with a partial-success mode (see design spec's Error Handling: either all 14 are clean or the slice isn't done).

- [ ] **Step 3: Confirm nothing outside `skills/vendored-*` changed**

```bash
git status --porcelain
```

Expected: only `??` (untracked, new) lines for the 14 `skills/vendored-<name>/` paths. No `M` (modified) lines anywhere — this task must be purely additive.

- [ ] **Step 4: Commit**

```bash
git add skills/vendored-brainstorming skills/vendored-dispatching-parallel-agents skills/vendored-executing-plans skills/vendored-finishing-a-development-branch skills/vendored-receiving-code-review skills/vendored-requesting-code-review skills/vendored-subagent-driven-development skills/vendored-systematic-debugging skills/vendored-test-driven-development skills/vendored-using-git-worktrees skills/vendored-using-superpowers skills/vendored-verification-before-completion skills/vendored-writing-plans skills/vendored-writing-skills
git commit -m "feat(vendor-superpowers-skills): clone all 14 Superpowers skills verbatim"
```

---

### Task 2: Add license and provenance record

**Files:**
- Create: `vendored/LICENSE`
- Create: `vendored/PROVENANCE.md`

**Interfaces:**
- Consumes: the list of 14 vendored skill names from Task 1 (used verbatim in `PROVENANCE.md`'s list below).
- Produces: `vendored/LICENSE` and `vendored/PROVENANCE.md` at the repo root, sibling to `skills/`. Task 3's verification step checks for their presence.

- [ ] **Step 1: Copy the upstream license**

```bash
mkdir -p vendored
cp "C:\Users\jazurite\.claude\plugins\cache\claude-plugins-official\superpowers\44c9b2d6e889\LICENSE" vendored/LICENSE
diff "C:\Users\jazurite\.claude\plugins\cache\claude-plugins-official\superpowers\44c9b2d6e889\LICENSE" vendored/LICENSE
```

Expected: `diff` prints nothing (byte-identical copy).

- [ ] **Step 2: Write the provenance record**

Create `vendored/PROVENANCE.md` with exactly this content:

```markdown
# Provenance

Source: Superpowers plugin (claude-plugins-official marketplace)
Version: 6.2.0
Plugin cache directory: 44c9b2d6e889
Cloned: 2026-08-20

## Skills vendored (verbatim, byte-identical to source)

- brainstorming
- dispatching-parallel-agents
- executing-plans
- finishing-a-development-branch
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

## License

MIT (Jesse Vincent, 2025) — see `LICENSE` in this folder.

## Sync policy

No automated sync or diff-tracking against upstream exists, by design
(DigiSmith stays a personal tool, not a multi-source merge system). Future
upstream Superpowers improvements are pulled in manually, skill by skill,
only if and when actually wanted. See DigiSmith `MEMORY.md` map item W.

## Activation

A vendored skill above is "dormant" until a future map item W.2+ brainstorm
activates it: edits its `skills/vendored-<name>/` copy, updates DigiSmith's
own internal call sites that reference `superpowers:<name>` to reference
`digismith:<name>` instead, and records the switch in `MEMORY.md`. Until
then, every vendored skill listed above is an inert, unused copy — nothing
in DigiSmith calls into any of them.
```

- [ ] **Step 3: Commit**

```bash
git add vendored/LICENSE vendored/PROVENANCE.md
git commit -m "docs(vendor-superpowers-skills): add license and provenance record"
```

---

### Task 3: Verify the vendored set is complete, isolated, and discoverable

**Files:**
- Modify: none.
- Verify only — no new files created.

**Interfaces:**
- Consumes: the 14 vendored skill folders (Task 1) and `vendored/LICENSE` + `vendored/PROVENANCE.md` (Task 2).
- Produces: nothing consumed by later work — this is the terminal task for W.1.

- [ ] **Step 1: Confirm no pre-existing DigiSmith file was touched**

```bash
git log --stat main..HEAD
```

Expected: every changed/added path across all three tasks' commits falls under `skills/vendored-*/`, `vendored/`, `.digismith/docs/vendor-superpowers-skills/`, `MEMORY.md`, or `backlog/` — nothing under any of DigiSmith's existing `skills/<name>/` folders (the ones without the `vendored-` prefix) or `profiles/`. If anything outside that set shows up, stop — this task must be additive-only per the design spec.

- [ ] **Step 2: Confirm sampled vendored skills are discoverable**

This task is dispatched as its own fresh subagent (per `subagent-driven-development`), so its own available-skills listing is computed at spawn time — after Tasks 1 and 2's files already exist on disk. Check that listing (the system reminder enumerating available skills at the start of this task's context) for both:

- `digismith:brainstorming`
- `digismith:finishing-a-development-branch`

Expected: both appear, alongside the existing `superpowers:brainstorming` and `superpowers:finishing-a-development-branch` (both plugins' versions coexist — different plugin-qualified names, no collision). If this task is instead run via `executing-plans` (inline, same session as Tasks 1–2) rather than a fresh subagent, the skill listing won't have refreshed — note that explicitly in the task's completion report rather than treating it as a failure, and recommend a fresh session/task dispatch to confirm.

- [ ] **Step 3: Report**

Summarize: all 14 skills cloned and verified byte-identical (Task 1), license and provenance recorded (Task 2), no pre-existing file touched, and discoverability confirmed (or the fallback note from Step 2 if run inline). No commit for this task — it's verification-only.

---

## Execution Handoff

Plan complete and saved to `.digismith/docs/vendor-superpowers-skills/plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?

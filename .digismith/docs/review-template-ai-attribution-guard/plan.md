# AI Attribution Guard for Reviews (W.8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI/assistant attribution in a commit message mechanically, deterministically blocked before any review package is written — not left to a reviewer subagent's judgment, which already got it backwards once.

**Architecture:** A new `check-attribution` script inspects a commit range's full messages for three narrow attribution patterns. `review-package` calls it before writing anything, failing loudly with nothing written on a hit. `code-reviewer.md`'s standalone review path (which can't always route through `review-package`) runs the same script directly. The one documented bash-less fallback and the task reviewer's own policy gap get closed too.

**Tech Stack:** Bash (matching every other script in `skills/subagent-driven-development/scripts/`), Markdown/YAML frontmatter for the skill and template edits.

## Global Constraints

- Full spec: `.digismith/docs/review-template-ai-attribution-guard/design.html` — read it if anything below is ambiguous.
- The attribution regex, exactly: `co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖` — case-insensitive. Never a bare `claude`/`anthropic` keyword match; this repo's own commit messages legitimately mention "Claude Code" descriptively.
- `check-attribution`'s exit codes: `0` clean/silent, `1` attribution found (detail on stderr), `2` usage/bad-SHA error — matching `review-package`'s own existing convention exactly.
- Commit messages: title only, no body, no AI references (this repo's own standing convention — the thing this plan enforces mechanically for everyone else applies to this plan's own commits too).
- This is DigiSmith's own self-development. Multiple other Claude Code sessions may be concurrently active on this same repo/checkout — before any file edit that uses an exact "find" substring against a shared doc (`MEMORY.md`, `vendored/PROVENANCE.md`), verify the substring still matches what's actually in the file; if it doesn't, stop and report rather than guessing at a fuzzy replacement.
- Test command for this repo: `pnpm test` (runs `vitest run`) — this plan touches no `.ts` files, so it exists only to confirm zero regression.

---

### Task 1: `check-attribution` script

**Files:**
- Create: `skills/subagent-driven-development/scripts/check-attribution`

**Interfaces:**
- Produces: a CLI, `check-attribution BASE HEAD` — exit 0 silent (clean), exit 1 with commit-by-commit detail on stderr (attribution found), exit 2 on usage/bad-SHA error. Task 2 depends on this exact contract.

- [ ] **Step 1: Write the script**

Create `skills/subagent-driven-development/scripts/check-attribution`:

```bash
#!/usr/bin/env bash
# Mechanical check for AI/assistant attribution in a commit range's messages.
# Deliberately narrow patterns, not a bare "claude"/"anthropic" keyword match —
# this repo's own commit messages legitimately mention "Claude Code" in ordinary
# descriptive ways, and a bare-keyword check would false-positive on those.
#
# Usage: check-attribution BASE HEAD
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: check-attribution BASE HEAD" >&2
  exit 2
fi

base=$1
head=$2

git rev-parse --verify --quiet "$base" >/dev/null || { echo "bad BASE: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$head" >/dev/null || { echo "bad HEAD: $head" >&2; exit 2; }

pattern='co-authored-by:.*claude|co-authored-by:.*anthropic|generated with.*claude|generated with.*anthropic|🤖'

found=0
for sha in $(git log "${base}..${head}" --format=%H); do
  body=$(git show -s --format=%B "$sha")
  match=$(printf '%s\n' "$body" | grep -iE "$pattern" || true)
  if [ -n "$match" ]; then
    echo "AI attribution found in commit $sha:" >&2
    echo "$match" >&2
    found=1
  fi
done

if [ "$found" -eq 1 ]; then
  echo "This repo forbids AI/assistant attribution anywhere — no exceptions." >&2
  exit 1
fi
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x skills/subagent-driven-development/scripts/check-attribution
```

- [ ] **Step 3: Manual smoke test — clean range**

Run from the repo root (this worktree), using the last 3 real commits on this branch (all clean, no attribution):

```bash
skills/subagent-driven-development/scripts/check-attribution HEAD~3 HEAD
echo "exit: $?"
```

Expected: no stderr output, `exit: 0`.

- [ ] **Step 4: Manual smoke test — planted attribution commit**

Create a throwaway commit in a disposable temp git repo to avoid touching this worktree's own history:

```bash
tmpdir=$(mktemp -d)
git init -q "$tmpdir"
git -C "$tmpdir" config user.email "test@example.com"
git -C "$tmpdir" config user.name "Test"
git -C "$tmpdir" commit -q --allow-empty -m "chore: baseline"
base_sha=$(git -C "$tmpdir" rev-parse HEAD)
git -C "$tmpdir" commit -q --allow-empty -m "fix: something

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
head_sha=$(git -C "$tmpdir" rev-parse HEAD)
(cd "$tmpdir" && "$OLDPWD/skills/subagent-driven-development/scripts/check-attribution" "$base_sha" "$head_sha")
echo "exit: $?"
rm -rf "$tmpdir"
```

Expected: stderr prints `AI attribution found in commit <head_sha>:` followed by the matched `Co-Authored-By:` line, then the standing-policy line, `exit: 1`.

- [ ] **Step 5: Manual smoke test — false-positive guard**

Same temp-repo pattern as Step 4, but the second commit's message is `"docs: update Claude Code skill reference"` (mentions "Claude Code" in ordinary prose, no `co-authored-by`/`generated with`/🤖). Expected: exit 0, no stderr — confirms the narrowed regex does not flag this.

- [ ] **Step 6: Commit**

```bash
git add skills/subagent-driven-development/scripts/check-attribution
git commit -m "feat(subagent-driven-development): add check-attribution mechanical guard"
```

---

### Task 2: Wire `check-attribution` into `review-package`

**Files:**
- Modify: `skills/subagent-driven-development/scripts/review-package`

**Interfaces:**
- Consumes: Task 1's `check-attribution BASE HEAD` exit-code contract.
- Produces: no new interface — `review-package`'s own existing CLI contract (`review-package PLAN_FILE BASE HEAD [OUTFILE]`) is unchanged for the clean case; the dirty case now exits 1 with nothing written, a new behavior later tasks don't depend on.

- [ ] **Step 1: Insert the check**

In `skills/subagent-driven-development/scripts/review-package`, find this exact substring:

```bash
git rev-parse --verify --quiet "$base" >/dev/null || { echo "bad BASE: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$head" >/dev/null || { echo "bad HEAD: $head" >&2; exit 2; }

if [ $# -eq 4 ]; then
```

Replace it with:

```bash
git rev-parse --verify --quiet "$base" >/dev/null || { echo "bad BASE: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$head" >/dev/null || { echo "bad HEAD: $head" >&2; exit 2; }

if ! "$(cd "$(dirname "$0")" && pwd)/check-attribution" "$base" "$head"; then
  echo "Review package not written." >&2
  exit 1
fi

if [ $# -eq 4 ]; then
```

- [ ] **Step 2: Manual smoke test — clean range still works**

```bash
skills/subagent-driven-development/scripts/review-package .digismith/docs/review-template-ai-attribution-guard/plan.md HEAD~3 HEAD
```

Expected: identical behavior to before this change — prints `wrote <path>: <N> commit(s), <M> bytes`, and the file exists at the printed path.

- [ ] **Step 3: Manual smoke test — dirty range blocks the write**

Reuse Step 4's temp-repo pattern from Task 1 (planted `Co-Authored-By` commit), but this time call `review-package` instead of `check-attribution` directly. Since `review-package` requires a plan file argument, create a throwaway one:

```bash
tmpdir=$(mktemp -d)
git init -q "$tmpdir"
git -C "$tmpdir" config user.email "test@example.com"
git -C "$tmpdir" config user.name "Test"
git -C "$tmpdir" commit -q --allow-empty -m "chore: baseline"
base_sha=$(git -C "$tmpdir" rev-parse HEAD)
git -C "$tmpdir" commit -q --allow-empty -m "fix: something

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
head_sha=$(git -C "$tmpdir" rev-parse HEAD)
touch "$tmpdir/fake-plan.md"
review_package="$OLDPWD/skills/subagent-driven-development/scripts/review-package"
(cd "$tmpdir" && "$review_package" fake-plan.md "$base_sha" "$head_sha")
echo "exit: $?"
ls "$tmpdir/.superpowers" 2>/dev/null && echo "UNEXPECTED: workspace dir was created" || echo "confirmed: nothing written"
rm -rf "$tmpdir"
```

Expected: the attribution failure detail on stderr, then `Review package not written.`, `exit: 1`, and no `.superpowers/` workspace directory created at all inside the temp repo.

- [ ] **Step 4: Commit**

```bash
git add skills/subagent-driven-development/scripts/review-package
git commit -m "feat(review-package): block writing when a commit carries AI attribution"
```

---

### Task 3: Activate `requesting-code-review`; further diverge `subagent-driven-development`'s own PROVENANCE entry

**Files:**
- Modify: `skills/requesting-code-review/SKILL.md`
- Modify: `skills/requesting-code-review/code-reviewer.md`
- Modify: `vendored/PROVENANCE.md`

**Interfaces:**
- Consumes: Task 1's `check-attribution` CLI contract (referenced by path, not imported).
- Produces: no new interface — this task is prose/frontmatter/doc only.

- [ ] **Step 1: Add the fork-provenance tag to `requesting-code-review`'s frontmatter**

In `skills/requesting-code-review/SKILL.md`, find this exact substring:

```
---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---
```

Replace it with:

```
---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements (DigiSmith fork of Superpowers' requesting-code-review)
---
```

- [ ] **Step 2: Add the mandatory check to `code-reviewer.md`**

In `skills/requesting-code-review/code-reviewer.md`, find this exact substring:

```
    ## Git Range to Review

    **Base:** [BASE_SHA]
    **Head:** [HEAD_SHA]

    ```bash
    git diff --stat [BASE_SHA]..[HEAD_SHA]
    git diff [BASE_SHA]..[HEAD_SHA]
    ```

    ## Read-Only Review
```

Replace it with:

```
    ## Git Range to Review

    **Base:** [BASE_SHA]
    **Head:** [HEAD_SHA]

    ```bash
    git diff --stat [BASE_SHA]..[HEAD_SHA]
    git diff [BASE_SHA]..[HEAD_SHA]
    [CHECK_ATTRIBUTION_PATH] [BASE_SHA] [HEAD_SHA]
    ```

    Run the `check-attribution` command shown above as part of this step, not as an
    afterthought. If it reports a hit, that is an automatic Critical finding — full stop,
    regardless of anything else found in this diff. This project forbids AI/assistant
    attribution anywhere in a commit message or PR description, no exceptions.

    ## Read-Only Review
```

- [ ] **Step 3: Document the new placeholder**

In the same file, find this exact substring:

```
**Placeholders:**
- `[DESCRIPTION]` — brief summary of what was built
- `[PLAN_OR_REQUIREMENTS]` — what it should do (plan file path, task text, or requirements)
- `[BASE_SHA]` — starting commit
- `[HEAD_SHA]` — ending commit
```

Replace it with:

```
**Placeholders:**
- `[DESCRIPTION]` — brief summary of what was built
- `[PLAN_OR_REQUIREMENTS]` — what it should do (plan file path, task text, or requirements)
- `[BASE_SHA]` — starting commit
- `[HEAD_SHA]` — ending commit
- `[CHECK_ATTRIBUTION_PATH]` — REQUIRED: absolute path to
  `skills/subagent-driven-development/scripts/check-attribution`, resolved by the controller
  before dispatching — the reviewer's own working directory is not guaranteed to be any
  particular skill folder, so this must not be a relative path
```

- [ ] **Step 4: Update `vendored/PROVENANCE.md` — move `requesting-code-review` and `subagent-driven-development` from vendored to activated**

`subagent-driven-development` is still listed as "verbatim, byte-identical to source" even though W.7 already diverged it (added the conflict-scan guard paragraph) — this was never corrected when W.7 shipped. Fix both omissions in the same edit, since Task 3 Step 5 backfills a proper activated-entry for it.

Find this exact substring:

```
## Skills vendored (verbatim, byte-identical to source)

- dispatching-parallel-agents
- receiving-code-review
- requesting-code-review
- subagent-driven-development
- systematic-debugging
```

Replace it with:

```
## Skills vendored (verbatim, byte-identical to source)

- dispatching-parallel-agents
- receiving-code-review
- systematic-debugging
```

- [ ] **Step 5: Update `vendored/PROVENANCE.md` — add proper activated-entries for both `subagent-driven-development` (backfilling its never-recorded W.7 activation) and `requesting-code-review` (first activation)**

Find this exact substring (the end of the "Skills activated" list, immediately before the "## License" heading):

```
- **executing-plans** — map item **W.6**, activated 2026-09-04. Gained a lightweight ledger
  (`.superpowers/sdd/<plan-basename>/progress.md`, first line `# Inline-execution ledger`) and
  a per-task self-check step it never had before — DigiSmith's `writing-plans` now dispatches
  here directly for low-complexity plans instead of defaulting to
  `subagent-driven-development` unconditionally. See DigiSmith `MEMORY.md` map item W.

## License
```

Replace it with:

```
- **executing-plans** — map item **W.6**, activated 2026-09-04. Gained a lightweight ledger
  (`.superpowers/sdd/<plan-basename>/progress.md`, first line `# Inline-execution ledger`) and
  a per-task self-check step it never had before — DigiSmith's `writing-plans` now dispatches
  here directly for low-complexity plans instead of defaulting to
  `subagent-driven-development` unconditionally. See DigiSmith `MEMORY.md` map item W.
- **subagent-driven-development** — map item **W.7**, activated 2026-09-05. Gained one guard
  paragraph in its Setup section's pre-flight conflict scan, closing a rationalization loophole
  a live session hit (found a Global Constraint contradicting the actual codebase, reasoned
  "this is just my own wording bug, not a real conflict," and silently fixed it instead of
  asking). See DigiSmith `MEMORY.md` map item W. **Further diverged by W.8** (2026-09-11): a new
  `scripts/check-attribution` is now called by `scripts/review-package` before any review
  package is written, blocking on any AI/assistant attribution found in the commit range's
  messages; `task-reviewer-prompt.md` gained an explicit no-attribution policy line; the Step 3
  manual "without bash" fallback gained the same check inline. See DigiSmith `MEMORY.md` map
  item W.
- **requesting-code-review** — map item **W.8**, activated 2026-09-11. Its shared
  `code-reviewer.md` template (used both as `subagent-driven-development`'s own final
  whole-branch review template and standalone) now runs `scripts/check-attribution` as a
  mandatory step alongside its existing diff commands — a hit is an automatic Critical finding,
  full stop, regardless of the rest of the diff. See DigiSmith `MEMORY.md` map item W.

## License
```

- [ ] **Step 6: Commit**

```bash
git add skills/requesting-code-review/SKILL.md skills/requesting-code-review/code-reviewer.md vendored/PROVENANCE.md
git commit -m "feat(requesting-code-review): activate with mandatory attribution check"
```

---

### Task 4: Close the manual-fallback bypass; fix the task reviewer's root-cause policy gap

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `skills/subagent-driven-development/task-reviewer-prompt.md`
- Modify: `vendored/PROVENANCE.md`

**Interfaces:**
- Consumes: Task 1's `check-attribution` CLI contract (referenced by path, not imported).
- Produces: no new interface — prose only.

- [ ] **Step 1: Close the "without bash" fallback in `SKILL.md`**

In `skills/subagent-driven-development/SKILL.md`, find this exact substring:

```
- Hand the reviewer its diff as a file: run this skill's
  `scripts/review-package PLAN_FILE BASE HEAD` and pass the reviewer the file path
  it prints (or, without bash: `git log --oneline`, `git diff --stat`,
  and `git diff -U10` for the range, redirected to one uniquely named
  file). The output never enters your own context, and the reviewer sees
```

Replace it with:

```
- Hand the reviewer its diff as a file: run this skill's
  `scripts/review-package PLAN_FILE BASE HEAD` and pass the reviewer the file path
  it prints (or, without bash: run `scripts/check-attribution BASE HEAD` first — stop and fix
  the commit if it reports a hit, before doing anything else — then `git log --oneline`,
  `git diff --stat`, and `git diff -U10` for the range, redirected to one uniquely named
  file). The output never enters your own context, and the reviewer sees
```

- [ ] **Step 2: Add the explicit no-attribution policy line to `task-reviewer-prompt.md`**

In `skills/subagent-driven-development/task-reviewer-prompt.md`, find this exact substring:

```
    Warnings or other noise in the implementer's reported test output are
    findings — test output should be pristine.

    ## Part 1: Spec Compliance
```

Replace it with:

```
    Warnings or other noise in the implementer's reported test output are
    findings — test output should be pristine.

    This project forbids AI/assistant attribution anywhere in commit messages or PR
    descriptions — no exceptions. If you see one despite this, it is a real violation, not
    something the project might have wanted.

    ## Part 1: Spec Compliance
```

- [ ] **Step 3: Append this task's own follow-on to `vendored/PROVENANCE.md`**

Task 3 (already complete) deliberately scoped the `subagent-driven-development` PROVENANCE
entry's "Further diverged by W.8" clause to only what it and Task 2 actually shipped
(`check-attribution` + `review-package`'s wiring) — leaving out this task's own work, since it
hadn't happened yet at the time. Now that it has, append to it.

Find this exact substring:

```
  `scripts/check-attribution` is now called by `scripts/review-package` before any review
  package is written, blocking on any AI/assistant attribution found in the commit range's
  messages. See DigiSmith `MEMORY.md` map item W.
- **requesting-code-review** — map item **W.8**, activated 2026-09-11.
```

Replace it with:

```
  `scripts/check-attribution` is now called by `scripts/review-package` before any review
  package is written, blocking on any AI/assistant attribution found in the commit range's
  messages. The same day, `task-reviewer-prompt.md` gained an explicit no-attribution policy
  line and the Step 3 manual "without bash" fallback gained the same check inline. See DigiSmith
  `MEMORY.md` map item W.
- **requesting-code-review** — map item **W.8**, activated 2026-09-11.
```

- [ ] **Step 4: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md skills/subagent-driven-development/task-reviewer-prompt.md vendored/PROVENANCE.md
git commit -m "docs(subagent-driven-development): close attribution-check bypass, state the policy explicitly"
```

---

### Task 5: Record W.8 in `MEMORY.md`

**Files:**
- Modify: `MEMORY.md`

**Interfaces:** None — pure documentation, no code.

- [ ] **Step 1: Add the W.8 entry**

In `MEMORY.md`, find this exact substring inside the **W** row:

```
· **W.8+** further primitive-by-primitive content activation and assimilation of outside methodologies (Hermes agent, spec-driven development) — each its own future brainstorm, undesigned here |
```

Replace it with:

```
· **W.8** built 2026-09-11: closed a confirmed gap where AI/assistant attribution could slip into a commit despite explicit instructions not to, and review templates had no way to catch it — a new `scripts/check-attribution` (`subagent-driven-development`) blocks `review-package` from writing any package when a commit's message contains an attribution trailer/phrase/emoji, checked mechanically rather than left to reviewer judgment; `task-reviewer-prompt.md` gained an explicit no-attribution policy line (the original incident's reviewer had none to check against and defaulted to assuming the trailer was expected); `requesting-code-review` activated for the first time, its shared `code-reviewer.md` template now running the same check as a mandatory step. See `.digismith/docs/review-template-ai-attribution-guard/design.html` · **W.9+** further primitive-by-primitive content activation and assimilation of outside methodologies (Hermes agent, spec-driven development) — each its own future brainstorm, undesigned here |
```

Do not touch any other part of the **W** row.

- [ ] **Step 2: Run the full test suite once more**

Run: `pnpm test`
Expected: PASS — this whole plan touched no `.ts` files, so the count should be unchanged from before this plan started.

- [ ] **Step 3: Commit**

```bash
git add MEMORY.md
git commit -m "docs(MEMORY): record W.8 attribution guard in the W row"
```

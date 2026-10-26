# DGS-499 .gitattributes eol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Git stores and checks out text files as LF on every machine, and the files that are CRLF on purpose stay byte-identical.

**Architecture:** Add one line, `* text=auto eol=lf`, at the top of `.gitattributes`. The existing `-text` lines come after it and win, so they stay the exception list. The index is already LF, so no tracked file changes.

**Tech Stack:** git attributes, a scratch clone for the test.

## Global Constraints

- Rule text: `* text=auto eol=lf`, first line of `.gitattributes`.
- Exception list: the existing 15 `-text` lines (14 `skills/<name>/**` folders and `vendored/*`), unchanged.
- Only `.gitattributes` changes. No tracked file, no file mode, no MEGA setting, no `core.autocrlf`, no CI, no hook.
- The 21 files at mode `100755` today keep `100755`.
- The 4 CRLF files stay CRLF: `skills/brainstorming/scripts/frame-template.html`, `skills/brainstorming/scripts/server.cjs`, `skills/writing-skills/graphviz-conventions.dot`, `vendored/LICENSE`.
- Do the work on the Mac Workbox (source of truth). Commit with a pathspec. Title-only conventional commit, no AI attribution. Push after the commit. pnpm only (not needed here).

---

### Task 1: Add the eol rule and prove it

**Files:**
- Modify: `.gitattributes` (insert line 1)

**Interfaces:**
- Consumes: nothing.
- Produces: the rule on `main`, and the evidence block for the report.

- [ ] **Step 1: Open-branch check (read-only)**

```bash
cd /Users/workbox/Workspace/Jazurite/DigiSmith
git worktree list
git branch --no-merged main
for b in $(git branch --no-merged main --format='%(refname:short)'); do
  echo "$b: $(git grep -lI $'\r' "$b" -- . ':!skills/*/scripts' ':!vendored' 2>/dev/null | wc -l)"
done
git grep -lI $'\r' main -- . ':!skills/*/scripts' ':!vendored' | wc -l
```

Expected: every branch count equals the main count. If a branch has a higher count, it has a CRLF text file outside the exception list: note the branch in the report. That branch runs `git add --renormalize .` once after it merges main. Do not wait and do not block the commit.

- [ ] **Step 2: Record the before state**

```bash
S=/private/tmp/claude-501/dgs-499
mkdir -p $S
git ls-files -s | grep '^100755' | awk '{print $4}' | sort > $S/modes-before.txt
git ls-files --eol | awk '{print $1,$2,$NF}' | sort > $S/eol-before.txt
wc -l $S/modes-before.txt   # expect 21
git ls-files --eol | grep -E '^i/crlf' | awk '{print $NF}'   # expect the 4 files
```

- [ ] **Step 3: Test the rule in a scratch clone (not the main checkout)**

```bash
T=$(mktemp -d /private/tmp/claude-501/dgs-499/rule-test.XXXXXX)
git clone -q /Users/workbox/Workspace/Jazurite/DigiSmith "$T/repo"
cd "$T/repo"
git config core.autocrlf false
sed -i '' '1i\
* text=auto eol=lf
' .gitattributes
head -2 .gitattributes   # expect line 1 the rule, line 2 the first -text line
printf 'a\r\nb\r\n' > scratch-normal.txt
printf 'a\r\nb\r\n' > vendored/scratch-crlf.txt
git add scratch-normal.txt vendored/scratch-crlf.txt .gitattributes
git ls-files --eol scratch-normal.txt vendored/scratch-crlf.txt
```

Expected: `scratch-normal.txt` is `i/lf`; `vendored/scratch-crlf.txt` is `i/crlf`.

Then in the same clone:

```bash
git add --renormalize .
git status --short | grep -v -E 'scratch-|\.gitattributes' ; echo "exit=$?"
```

Expected: no other staged file (grep finds nothing, exit=1). If a file shows, stop and report: the index was not as expected, and the plan's one-line scope is wrong.

- [ ] **Step 4: Edit `.gitattributes` in the main checkout**

Insert `* text=auto eol=lf` as line 1 (same `sed` as step 3, run in `/Users/workbox/Workspace/Jazurite/DigiSmith`). Check:

```bash
git diff --stat -- .gitattributes   # 1 file changed, 1 insertion
git add --renormalize . && git diff --cached --name-only
```

Expected: only `.gitattributes` is listed. If other files are listed, `git restore --staged` them (do not commit them) and report.

- [ ] **Step 5: Verify, commit, push**

```bash
git ls-files --eol | awk '{print $1,$2,$NF}' | sort | diff - /private/tmp/claude-501/dgs-499/eol-before.txt && echo EOL-SAME
git ls-files -s | grep '^100755' | awk '{print $4}' | sort | diff - /private/tmp/claude-501/dgs-499/modes-before.txt && echo MODES-SAME
git diff --summary   # expect empty
git ls-files --eol | grep -E '^i/crlf' | awk '{print $NF}'   # the same 4 files
git commit -m "chore(git): normalize text line endings to LF with .gitattributes" -- .gitattributes
git push
```

Expected: `EOL-SAME`, `MODES-SAME`, empty summary, the 4 files, push ok. Note `git ls-files --eol` shows the `attr/` column change for files the new rule covers; the `awk` keeps only the index and working-tree columns so the diff compares real EOL state.

- [ ] **Step 6: Clean up and report**

Remove the scratch clone and `modes-before.txt` / `eol-before.txt` only if Jack ordered that exact delete; otherwise leave them in the scratchpad and name them in the report. Report: the rule, the branch counts, the before and after lists, the commit hash.

---

## Definition of Ready

Checked 2026-10-26 (UTC+7) against `origin/main` 25aae445 and ClickUp.

| Item | State |
|---|---|
| Spec | `spec.md`, approved by Jack through the conductor, 2026-10-26 |
| Plan | this file, 1 task, 6 steps |
| Milestone | none set on the ticket. Propose **after Dawn**, under ClickUp Synchronization DGS-470 (already linked), because it is low priority and no Dawn work needs it. Jack or the conductor confirms |
| Blockers | none. No dependency on the ticket. Linked tasks: DGS-478 (done, the cause report) and DGS-470 (backlog, the initiative; not a blocker). Open branches are no blocker (spec decision 4) |
| Mode | **Worker** confirmed. One task, one-line diff. The ClickUp `Mode` field is unset on the ticket; the conductor sets it. Reason for the field value: Autonomous fits (objective check, no user-facing effect), so set `Autonomous` |
| Sign-off | **Auto** confirmed. The check is objective: EOL list and mode list identical before and after, rule test passes. The `Sign-off` field is unset; the conductor sets it |
| Risk | Low. Worst case is a revert of one line |

Not done by me: no ClickUp status, field or comment changed. The ticket stays `refinement`.

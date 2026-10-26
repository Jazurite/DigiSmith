# DGS-499 spec: normalize line endings with .gitattributes

Written 2026-10-26 10:5x UTC+7 (03:5x UTC), against `origin/main` 25aae445. Docs only.

## Goal

Make git store and check out text files with LF on every machine, so a machine with a wrong
`core.autocrlf` cannot commit CRLF. Keep the files that are CRLF on purpose.

## What I found (facts on today's main)

- `git ls-files --eol`: 1848 files are LF in the index, 4 are CRLF, 3 are empty or have no line ends, 237 are binary (screenshots).
- The 4 CRLF files are all `-text` on purpose (byte-identity with the vendored source):
  `skills/brainstorming/scripts/frame-template.html`, `skills/brainstorming/scripts/server.cjs`,
  `skills/writing-skills/graphviz-conventions.dot`, `vendored/LICENSE`.
- `.gitattributes` today has only `-text` lines: 14 vendored skill folders (`skills/<name>/**`) and `vendored/*`.
- So there is **no CRLF in the index to renormalize**. The one commit the ticket asks for is only the `.gitattributes` change.
  `git add --renormalize .` will change nothing (the plan checks this and stops if it changes anything).
- The 5 `skills/subagent-driven-development/scripts/*` files named in the ticket are LF in the index now, and 100755. They stay `-text` (covered by the folder rule).
- DGS-478: the CRLF and lost `100755` bits came from a MEGA sync that another machine wrote into the Mac working tree. Git did not do it.
  A `.gitattributes` rule does **not** fix that: it only changes what git stores and what git writes on checkout. MEGA writes files outside git.
  The rule protects the repo (no CRLF commit from any machine). It does not stop working-tree drift.
- `.gitattributes` never changes file modes. The `100755` bits are in the index and a rule cannot touch them.
- The Mac has `core.autocrlf=input` set (global or local). The rule makes the repo correct without needing that setting.
- Mac Workbox is the source of truth: the change is made and verified in the Mac main checkout.

## Decisions (technical, with reasons)

1. **Rule: add `* text=auto eol=lf` as the first line**, above the existing `-text` lines.
   Reason: later lines win in `.gitattributes`, so the 14 skill folders and `vendored/*` stay `-text` with no extra work.
   `text=auto` lets git detect binary files (the 237 PNG screenshots), so no binary list is needed.
2. **Exception list = the existing `-text` lines, unchanged.** Not narrowed to the 4 CRLF files.
   Reason: these folders are vendored from outside; a later re-vendor may bring CRLF back, and `-text` keeps it byte-identical (the DGS-115 / vendor-superpowers-skills rule). Narrowing is a separate decision and gains nothing.
3. **No mass renormalize commit.** Run `git add --renormalize .` and check it stages nothing. If it stages files, the plan commits them with the rule in one commit and reviews the diff with `git diff --cached --ignore-cr-at-eol --stat` (must show 0 insertions, 0 deletions).
   Reason: the index is already LF, so the expected result is an empty renormalize.
4. **Open branches: no wait needed.** Reason: the change touches only `.gitattributes`. Because no tracked file changes, a branch merges cleanly with or without the rule. I checked the 9 unmerged branches: none adds a CRLF file beyond what main has.
   The plan still re-checks at run time (`git worktree list`, `git branch --no-merged main`, `git grep -lI $'\r'` per branch). If a branch has a CRLF text file outside the exception list, that branch runs `git add --renormalize .` once after it merges main. This replaces "renormalize only when no branch is open".
5. **Verify `100755`:** compare `git ls-files -s | grep ^100755` before and after the commit: identical list (21 files today). Also `git diff --summary` after is empty.
6. **No CI check and no hook.** Reason: out of scope (YAGNI). One line in the report notes that DGS-478's real fix (keep git trees out of MEGA two-way sync) is a separate item, not this ticket.
7. **Test of the rule:** in a scratch clone (scratchpad, not the main checkout), write a CRLF text file and a CRLF file under `vendored/`, run `git add`, then `git ls-files --eol`. Expected: the normal file is `i/lf`; the `vendored/` file stays `i/crlf`.

## Scope

In: one line in `.gitattributes`; the checks above; one commit; push.
Out: any change to tracked files, to file modes, to MEGA settings, to `core.autocrlf` on any machine, CI or hooks.

## Risks

- **A 4-file edge:** the 4 CRLF files must stay as they are. The `-text` lines already hold them; the check in decision 7 and a final `git ls-files --eol | grep crlf` (must list the same 4) prove it.
- **Other checkouts** (VPS, Windows) that have CRLF on disk will show no diff after the rule (git normalizes on compare), but a fresh checkout writes LF. No action needed.

## Proposed Sign-off and Mode

- **Sign-off: Auto.** Reason: a one-line config change with an objective check (index EOL and mode lists unchanged), no user-facing effect.
- **Mode: Worker, one task, no reviewer round beyond the whole-branch review.** Reason: the diff is one line.

## Taste questions

None.
